/**
 * Let's Encrypt certificate provisioning with Cloudflare DNS-01 challenges.
 *
 * Issues TLS certificates via the ACME protocol, provisioning `_acme-challenge`
 * TXT records on Cloudflare through its API instead of relying on busy-waiting
 * public DNS resolvers. After issuance, writes cert materials to a configured
 * vault so downstream models can consume them via `vault.get(vaultName, key)`.
 *
 * @module
 */

import { z } from "npm:zod@4";
import {
  createHash,
  createPrivateKey,
  createSign,
  generateKeyPairSync,
  KeyObject,
} from "node:crypto";
import forge from "npm:node-forge@1.3.1";

const ACME_STAGING = "https://acme-staging-v02.api.letsencrypt.org/directory";
const ACME_PRODUCTION = "https://acme-v02.api.letsencrypt.org/directory";

// -----------------------------------------------------------------------------
// Cloudflare DNS helpers — tightly coupled for challenge provisioning.
// -----------------------------------------------------------------------------

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface CFResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
}

interface CFRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

interface DnsClient {
  listTxtRecords(name: string): Promise<CFRecord[]>;
  createTxtRecord(name: string, content: string): Promise<string>;
  deleteRecord(id: string): Promise<void>;
}

function createCfDnsClient(
  apiToken: string,
  zoneId: string,
): DnsClient {
  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(`${CF_API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as CFResponse<T>;
    if (!data.success) {
      throw new Error(
        `Cloudflare API error: ${data.errors.map((e) => e.message).join(", ")}`,
      );
    }
    return data.result;
  }

  return {
    async listTxtRecords(name: string) {
      const params = new URLSearchParams({ type: "TXT", name });
      return await call<CFRecord[]>(
        "GET",
        `/zones/${zoneId}/dns_records?${params}`,
      );
    },
    async createTxtRecord(name: string, content: string) {
      const record = await call<CFRecord>(
        "POST",
        `/zones/${zoneId}/dns_records`,
        { type: "TXT", name, content, ttl: 120 },
      );
      return record.id;
    },
    async deleteRecord(id: string) {
      await call<CFRecord>("DELETE", `/zones/${zoneId}/dns_records/${id}`);
    },
  };
}

/**
 * Poll the authoritative Cloudflare API for record visibility. Cloudflare
 * returns the record immediately after its own edge has it, so this typically
 * completes in <5s rather than waiting up to minutes for recursive resolvers.
 */
async function waitUntilCfHasRecord(
  dns: DnsClient,
  name: string,
  expectedContentSubstring: string,
  timeoutMs = 120_000,
  pollIntervalMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const records = await dns.listTxtRecords(name);
    if (
      records.some((r) => r.content.includes(expectedContentSubstring))
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `Timed out waiting for Cloudflare to propagate TXT record at ${name}`,
  );
}

/**
 * Check if the TXT record is visible via public DNS resolver. Let's Encrypt
 * queries public DNS, so we need to wait until the record has propagated
 * beyond just Cloudflare's authoritative API.
 */
async function checkPublicDnsVisibility(
  name: string,
  expectedContent: string,
): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(name, "TXT");
    // TXT records come back as arrays of strings (multiple TXT records)
    return records.some((record) =>
      // Join multi-part TXT records and check if expected content is present
      record.join("").includes(expectedContent)
    );
  } catch (_error) {
    // DNS resolution failed - record not visible yet
    return false;
  }
}

/**
 * Wait until the TXT record is visible in public DNS resolvers that Let's
 * Encrypt uses to validate. This polls using the system DNS resolver.
 */
async function waitUntilPublicDnsHasRecord(
  name: string,
  expectedContent: string,
  timeoutMs = 300_000,
  pollIntervalMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const visible = await checkPublicDnsVisibility(name, expectedContent);
    if (visible) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `Timed out waiting for public DNS to propagate TXT record at ${name}`,
  );
}

// -----------------------------------------------------------------------------
// ACME protocol — JWS signing, directory, nonce, order, finalize.
// -----------------------------------------------------------------------------

interface AcmeDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  revokeCert: string;
  keyChange?: string;
}

interface AcmeOrderResponse {
  status: string;
  authorizations: string[];
  finalize: string;
  certificate?: string;
  error?: unknown;
}

interface AcmeAuthorizationResponse {
  status: string;
  identifier: { type: string; value: string };
  challenges: Array<{
    type: string;
    status: string;
    url: string;
    token: string;
  }>;
}

function base64url(input: Buffer | Uint8Array | string): string {
  const buf = typeof input === "string"
    ? Buffer.from(input)
    : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function jwkThumbprint(accountKey: KeyObject): string {
  const jwk = accountKey.export({ format: "jwk" });
  const canonical = JSON.stringify({
    e: jwk.e,
    kty: jwk.kty,
    n: jwk.n,
  });
  return base64url(createHash("sha256").update(canonical).digest());
}

function signJws(
  accountKey: KeyObject,
  payload: string | null,
  protectedFields: Record<string, unknown>,
): string {
  const protectedHeader = base64url(JSON.stringify(protectedFields));
  const payloadSegment = payload === null ? "" : base64url(payload);
  const signingInput = `${protectedHeader}.${payloadSegment}`;

  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(accountKey));

  return JSON.stringify({
    protected: protectedHeader,
    payload: payloadSegment,
    signature,
  });
}

class AcmeClient {
  private directory: AcmeDirectory;
  private nonce: string;

  constructor(directory: AcmeDirectory, initialNonce: string) {
    this.directory = directory;
    this.nonce = initialNonce;
  }

  static async create(directoryUrl: string): Promise<AcmeClient> {
    const directoryResp = await fetch(directoryUrl);
    const directory = (await directoryResp.json()) as AcmeDirectory;

    const nonceResp = await fetch(directory.newNonce, { method: "HEAD" });
    const nonce = nonceResp.headers.get("replay-nonce");
    if (!nonce) throw new Error("Could not fetch initial ACME nonce");

    return new AcmeClient(directory, nonce);
  }

  async post(
    url: string,
    accountKey: KeyObject,
    payload: unknown,
    options: { kid?: string; jwk?: boolean } = {},
  ): Promise<{ data: unknown; nonce: string; location?: string }> {
    const protectedFields: Record<string, unknown> = {
      alg: "RS256",
      nonce: this.nonce,
      url,
    };
    if (options.kid) protectedFields.kid = options.kid;
    if (options.jwk) {
      const fullJwk = accountKey.export({ format: "jwk" }) as Record<
        string,
        string
      >;
      protectedFields.jwk = {
        kty: fullJwk.kty,
        n: fullJwk.n,
        e: fullJwk.e,
      };
    }

    const body = signJws(
      accountKey,
      payload === null ? null : JSON.stringify(payload),
      protectedFields,
    );

    if (url.includes("new-acct")) {
      const parsed = JSON.parse(body);
      const protectedDecoded = JSON.parse(
        Buffer.from(parsed.protected, "base64url").toString(),
      );
      console.log("Protected header:", JSON.stringify(protectedDecoded));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/jose+json",
        Accept: "application/json",
      },
      body,
    });

    if (url.includes("new-acct")) {
      console.log("ACME newAccount status:", response.status);
      const headers: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headers[key] = val;
      });
      console.log("Headers:", JSON.stringify(headers));
    }

    const newNonce = response.headers.get("replay-nonce");
    if (!newNonce) throw new Error("Response missing replay-nonce");
    this.nonce = newNonce;

    const text = await response.text();
    if (url.includes("new-acct")) {
      console.log("Response body:", text);
    }
    const data = text ? JSON.parse(text) : null;
    return {
      data,
      nonce: this.nonce,
      location: response.headers.get("location") ?? undefined,
    };
  }

  newDirectory(): AcmeDirectory {
    return this.directory;
  }

  async registerAccount(
    accountKey: KeyObject,
    email: string,
  ): Promise<{ accountUrl: string }> {
    const { location } = await this.post(
      this.directory.newAccount,
      accountKey,
      {
        termsOfServiceAgreed: true,
        contact: [`mailto:${email}`],
      },
      { jwk: true },
    );
    if (!location) throw new Error("ACME did not return account URL");
    return { accountUrl: location };
  }

  async createOrder(
    accountKey: KeyObject,
    accountUrl: string,
    domains: string[],
  ): Promise<{ orderUrl: string; order: AcmeOrderResponse }> {
    const { data, location } = await this.post(
      this.directory.newOrder,
      accountKey,
      {
        identifiers: domains.map((d) => ({ type: "dns", value: d })),
      },
      { kid: accountUrl },
    );
    console.log("Order location:", location);
    console.log("Order data:", JSON.stringify(data));
    if (!location) {
      throw new Error(`ACME did not return order URL. Location: ${location}`);
    }
    return { orderUrl: location, order: data as AcmeOrderResponse };
  }

  async getAuthorization(
    accountKey: KeyObject,
    accountUrl: string,
    url: string,
  ): Promise<AcmeAuthorizationResponse> {
    const { data } = await this.post(url, accountKey, null, {
      kid: accountUrl,
    });
    return data as AcmeAuthorizationResponse;
  }

  async postChallenge(
    accountKey: KeyObject,
    accountUrl: string,
    url: string,
  ): Promise<{ status: string }> {
    const { data } = await this.post(url, accountKey, {}, {
      kid: accountUrl,
    });
    return data as { status: string };
  }

  async finalize(
    accountKey: KeyObject,
    accountUrl: string,
    finalizeUrl: string,
    csrDer: Buffer,
  ): Promise<AcmeOrderResponse> {
    const { data } = await this.post(
      finalizeUrl,
      accountKey,
      { csr: base64url(csrDer) },
      { kid: accountUrl },
    );
    return data as AcmeOrderResponse;
  }

  async downloadCert(
    accountKey: KeyObject,
    accountUrl: string,
    certUrl: string,
  ): Promise<string> {
    const protectedFields: Record<string, unknown> = {
      alg: "RS256",
      nonce: this.nonce,
      url: certUrl,
      kid: accountUrl,
    };
    const body = signJws(accountKey, null, protectedFields);

    const response = await fetch(certUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/jose+json",
        Accept: "application/pem-certificate-chain",
      },
      body,
    });

    const newNonce = response.headers.get("replay-nonce");
    if (newNonce) this.nonce = newNonce;

    return response.text();
  }

  async revoke(
    accountKey: KeyObject,
    accountUrl: string,
    certDer: Buffer,
  ): Promise<void> {
    await this.post(
      this.directory.revokeCert,
      accountKey,
      { certificate: base64url(certDer) },
      { kid: accountUrl },
    );
  }
}

async function pollUntil<T>(
  fetch: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs: number,
  description: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fetch();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

// -----------------------------------------------------------------------------
// CSR generation (DER-encoded PKCS#10).
// -----------------------------------------------------------------------------

function buildCsrDer(
  domain: string,
  altNames: string[],
  privateKeyPem: string,
): Buffer {
  const allNames = [domain, ...altNames];
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e);
  csr.setSubject([{ name: "commonName", value: domain }]);

  csr.setAttributes([{
    name: "extensionRequest",
    extensions: [{
      name: "subjectAltName",
      altNames: allNames.map((name) => ({ type: 2, value: name })),
    }],
  }]);

  csr.sign(privateKey, forge.md.sha256.create());

  const asn1 = forge.pki.certificationRequestToAsn1(csr);
  const der = forge.asn1.toDer(asn1).getBytes();
  return Buffer.from(der, "binary");
}

// -----------------------------------------------------------------------------
// Certificate chain parsing.
// -----------------------------------------------------------------------------

interface SplitCert {
  leaf: string;
  chain: string;
  expiry: Date;
}

function splitChain(pem: string): SplitCert {
  const certs: string[] = [];
  const re = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pem)) !== null) {
    certs.push(match[0].trim() + "\n");
  }
  if (certs.length === 0) {
    throw new Error("No certificates found in response");
  }

  const leaf = certs[0];
  const chain = certs.slice(1).join("");

  const cert = forge.pki.certificateFromPem(leaf);
  const expiry = cert.validity.notAfter;

  return { leaf, chain, expiry };
}

// -----------------------------------------------------------------------------
// Vault writes via subprocess — the only way to get explicit per-instance
// control over vault name and key names from within a model method. The
// automatic `sensitive` field mechanism uses static metadata, so it can't
// key off global args like the domain.
// -----------------------------------------------------------------------------

async function writeVault(
  vaultName: string,
  key: string,
  value: string,
  logger: {
    info: (msg: string, params?: Record<string, unknown>) => void;
    warn: (msg: string, params?: Record<string, unknown>) => void;
  },
): Promise<void> {
  logger.info("Writing vault key {key} in vault {vault}", {
    key,
    vault: vaultName,
  });

  const shortValue = value.length > 80 ? `${value.slice(0, 80)}…` : value;
  void shortValue; // kept for potential log verbosity

  const proc = new Deno.Command("swamp", {
    args: ["vault", "put", vaultName, key],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = proc.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(value));
  await writer.close();

  const output = await child.output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(
      `swamp vault put ${vaultName} ${key} failed: ${stderr}`,
    );
  }
}

async function deleteVaultKey(
  vaultName: string,
  key: string,
  logger: {
    info: (msg: string, params?: Record<string, unknown>) => void;
    warn: (msg: string, params?: Record<string, unknown>) => void;
  },
): Promise<void> {
  try {
    const proc = new Deno.Command("swamp", {
      args: ["vault", "delete", vaultName, key],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await proc.output();
    if (!output.success) {
      logger.warn("vault delete {key} failed (may not exist yet)", { key });
    }
  } catch (err) {
    logger.warn("vault delete threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// -----------------------------------------------------------------------------
// Model definition.
// -----------------------------------------------------------------------------

const GlobalArgsSchema = z.object({
  domain: z.string().describe("Primary domain to issue the certificate for"),
  altNames: z.array(z.string()).default([]).describe(
    "Additional Subject Alternative Names",
  ),
  email: z.string().describe("ACME account contact email"),
  cloudflareApiToken: z.string().meta({ sensitive: true }).describe(
    "Cloudflare API token with DNS:Edit permission for the zone",
  ),
  cloudflareZoneId: z.string().describe(
    "Cloudflare zone ID that contains the target domain",
  ),
  vaultName: z.string().describe(
    "Swamp vault name to write cert/privkey/chain into",
  ),
  vaultKeyPrivkey: z.string().describe(
    "Vault key name for the private key (PEM)",
  ),
  vaultKeyCert: z.string().describe("Vault key name for the leaf cert (PEM)"),
  vaultKeyChain: z.string().describe(
    "Vault key name for the intermediate chain (PEM)",
  ),
  vaultKeyFullchain: z.string().describe(
    "Vault key name for cert+chain concatenated (PEM)",
  ),
  staging: z.boolean().default(false).describe(
    "Use Let's Encrypt staging endpoint (false = production)",
  ),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const AccountResourceSchema = z.object({
  accountUrl: z.string(),
  accountKey: z.string(),
});

const CertificateResourceSchema = z.object({
  domain: z.string(),
  certificate: z.string(),
  chain: z.string(),
  privateKey: z.string(),
  expiry: z.iso.datetime(),
  issuedAt: z.iso.datetime(),
  vaultName: z.string(),
  vaultKeyPrivkey: z.string(),
  vaultKeyCert: z.string(),
  vaultKeyChain: z.string(),
  vaultKeyFullchain: z.string(),
});

interface Logger {
  info: (msg: string, params?: Record<string, unknown>) => void;
  warn: (msg: string, params?: Record<string, unknown>) => void;
}

interface MethodContext {
  globalArgs: GlobalArgs;
  logger: Logger;
  writeResource: (
    spec: string,
    instance: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  readResource?: (spec: string) => Promise<unknown | null>;
  dataRepository: {
    getContent: (
      modelType: string,
      modelId: string,
      spec: string,
    ) => Promise<Uint8Array | null>;
  };
  modelType: string;
  modelId: string;
}

interface ChallengeRecord {
  domain: string;
  txtValue: string;
  recordId: string | null;
}

async function issueCertificate(
  accountKey: KeyObject,
  accountUrl: string,
  ctx: MethodContext,
  challengeLedger: ChallengeRecord[],
): Promise<{
  certPem: string;
  chainPem: string;
  fullchainPem: string;
  certPrivKeyPem: string;
  expiry: Date;
}> {
  const { domain, altNames, cloudflareApiToken, cloudflareZoneId, staging } =
    ctx.globalArgs;
  const logger = ctx.logger;
  const directoryUrl = staging ? ACME_STAGING : ACME_PRODUCTION;

  const acme = await AcmeClient.create(directoryUrl);
  const dns = createCfDnsClient(cloudflareApiToken, cloudflareZoneId);

  // 1. Create the order up front.
  const { orderUrl, order } = await acme.createOrder(
    accountKey,
    accountUrl,
    [domain, ...altNames],
  );
  logger.info("Created ACME order {url}", { url: orderUrl });

  const thumbprint = jwkThumbprint(accountKey);

  // 2. Provision challenge TXT records for each authorization.
  for (const authzUrl of order.authorizations) {
    const authz = await acme.getAuthorization(accountKey, accountUrl, authzUrl);
    logger.info("Authorization response: {authz}", {
      authz: JSON.stringify(authz),
    });
    if (authz.status === "valid") {
      logger.info("Authorization already valid for {domain}", {
        domain: authz.identifier.value,
      });
      continue;
    }

    const dns01 = authz.challenges.find((c) => c.type === "dns-01");
    if (!dns01) {
      throw new Error(
        `No DNS-01 challenge offered for ${authz.identifier.value}`,
      );
    }
    if (dns01.status === "valid") continue;

    const keyAuth = `${dns01.token}.${thumbprint}`;
    const txtValue = base64url(
      createHash("sha256").update(keyAuth).digest(),
    );
    const challengeName = `_acme-challenge.${authz.identifier.value}`;

    // Clean up any stale TXT records at the challenge name so LE doesn't
    // see a stale token on first validation attempt.
    const existing = await dns.listTxtRecords(challengeName);
    for (const record of existing) {
      logger.info(
        "Deleting stale challenge record {id} at {name}",
        { id: record.id, name: challengeName },
      );
      await dns.deleteRecord(record.id);
    }

    const recordId = await dns.createTxtRecord(challengeName, `"${txtValue}"`);
    challengeLedger.push({ domain: challengeName, txtValue, recordId });

    logger.info(
      'Created TXT record {name} → "{value}"',
      { name: challengeName, value: txtValue },
    );

    // Wait until Cloudflare's authoritative API acknowledges the record.
    await waitUntilCfHasRecord(dns, challengeName, `"${txtValue}"`);
    logger.info("TXT record {name} is live in Cloudflare", {
      name: challengeName,
    });

    // Wait until the record is visible in public DNS (Let's Encrypt queries
    // public resolvers, not Cloudflare's authoritative API).
    logger.info(
      "Waiting for TXT record to propagate to public DNS resolvers...",
    );
    await waitUntilPublicDnsHasRecord(challengeName, txtValue);
    logger.info("TXT record {name} is visible in public DNS", {
      name: challengeName,
    });

    // Tell ACME to validate now that the record is live.
    logger.info("Submitting challenge for validation");
    const challengeResp = await acme.postChallenge(
      accountKey,
      accountUrl,
      dns01.url,
    );
    logger.info("Challenge status after submission: {status}", {
      status: challengeResp.status,
    });
  }

  // 3. Wait for the order to become ready.
  logger.info("Waiting for order to become ready...");
  const readyOrder = await pollUntil(
    async () => {
      const resp = await acme.post(orderUrl, accountKey, null, {
        kid: accountUrl,
      });
      const order = resp.data as AcmeOrderResponse;
      logger.info("Order status: {status}", { status: order.status });
      return order;
    },
    (o) => o.status === "ready",
    60_000,
    2_000,
    "ACME order ready status",
  );
  logger.info("Order is ready!");

  // 4. Generate a fresh cert key pair and CSR, finalize the order.
  logger.info("Generating certificate private key and CSR");
  const certKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const certPrivKeyPem = certKeyPair.privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;

  const csrDer = buildCsrDer(domain, altNames, certPrivKeyPem);
  await acme.finalize(accountKey, accountUrl, readyOrder.finalize, csrDer);

  // 5. Poll for the certificate URL.
  const issuedOrder = await pollUntil(
    () =>
      acme.post(orderUrl, accountKey, null, { kid: accountUrl }).then(
        (r) => r.data as AcmeOrderResponse,
      ),
    (o) => o.status === "valid" && typeof o.certificate === "string",
    60_000,
    2_000,
    "certificate issuance",
  );

  if (issuedOrder.status !== "valid" || !issuedOrder.certificate) {
    throw new Error(
      `Order finalized but status=${issuedOrder.status} (expected 'valid')`,
    );
  }

  // 6. Download the certificate chain.
  const pemChain = await acme.downloadCert(
    accountKey,
    accountUrl,
    issuedOrder.certificate,
  );
  const parsed = splitChain(pemChain);
  logger.info("Issued certificate for {domain} expiring {expiry}", {
    domain,
    expiry: parsed.expiry.toISOString(),
  });

  return {
    certPem: parsed.leaf,
    chainPem: parsed.chain,
    fullchainPem: `${parsed.leaf}${parsed.chain}`,
    certPrivKeyPem,
    expiry: parsed.expiry,
  };
}

async function ensureAccount(
  ctx: MethodContext,
): Promise<{ accountKey: KeyObject; accountUrl: string }> {
  const stored = await ctx.dataRepository.getContent(
    ctx.modelType,
    ctx.modelId,
    "account",
  );

  if (stored) {
    const data = JSON.parse(new TextDecoder().decode(stored));
    return {
      accountKey: createPrivateKey(data.accountKey),
      accountUrl: data.accountUrl,
    };
  }

  ctx.logger.info("Generating new ACME account key");
  const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const accountKey = keyPair.privateKey;
  const accountKeyPem = accountKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;

  ctx.logger.info("Registering ACME account for {email}", {
    email: ctx.globalArgs.email,
  });

  const acme = await AcmeClient.create(
    ctx.globalArgs.staging ? ACME_STAGING : ACME_PRODUCTION,
  );
  const { accountUrl } = await acme.registerAccount(
    accountKey,
    ctx.globalArgs.email,
  );

  await ctx.writeResource("account", "account", {
    accountUrl,
    accountKey: accountKeyPem,
  });

  return { accountKey, accountUrl };
}

/**
 * Model: `@shelson/letsencrypt-cloudflare-dns`.
 *
 * Issues a TLS certificate via ACME DNS-01 challenges, provisioning the
 * required TXT records directly on Cloudflare through the DNS API instead of
 * busy-waiting public resolvers. Writes cert materials into a named vault
 * with keys derived from global args so downstream models can discover them.
 */
export const model = {
  type: "@shelson/letsencrypt-cloudflare-dns",
  version: "2026.07.01.1",
  globalArguments: GlobalArgsSchema,

  resources: {
    account: {
      description: "ACME account URL and private key",
      schema: AccountResourceSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    certificate: {
      description: "TLS certificate, chain, and private key",
      schema: CertificateResourceSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
  },

  methods: {
    create: {
      description:
        "Issue a certificate (idempotent: skips if cert is >30 days from expiry)",
      arguments: z.object({}),
      // deno-lint-ignore no-explicit-any
      execute: async (_args: unknown, context: any) => {
        const ctx = context as MethodContext;
        const logger = ctx.logger;
        const {
          vaultName,
          vaultKeyPrivkey,
          vaultKeyCert,
          vaultKeyChain,
          vaultKeyFullchain,
        } = ctx.globalArgs;

        // Idempotency: if we already have a fresh cert, skip.
        const existingCert = await ctx.dataRepository.getContent(
          ctx.modelType,
          ctx.modelId,
          "certificate",
        );
        if (existingCert) {
          const certData = JSON.parse(new TextDecoder().decode(existingCert));
          const expiry = new Date(certData.expiry);
          const daysLeft = Math.floor(
            (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );
          if (daysLeft >= 30) {
            logger.info(
              "Certificate still valid for {days} days — nothing to do",
              { days: daysLeft },
            );
            return { dataHandles: [] };
          }
          logger.info("Certificate expires in {days} days — renewing", {
            days: daysLeft,
          });
        }

        const { accountKey, accountUrl } = await ensureAccount(ctx);
        const ledger: ChallengeRecord[] = [];

        try {
          const issued = await issueCertificate(
            accountKey,
            accountUrl,
            ctx,
            ledger,
          );

          // Write all four materials to the configured vault.
          await writeVault(
            vaultName,
            vaultKeyPrivkey,
            issued.certPrivKeyPem,
            logger,
          );
          await writeVault(vaultName, vaultKeyCert, issued.certPem, logger);
          await writeVault(vaultName, vaultKeyChain, issued.chainPem, logger);
          await writeVault(
            vaultName,
            vaultKeyFullchain,
            issued.fullchainPem,
            logger,
          );

          const handle = await ctx.writeResource(
            "certificate",
            "certificate",
            {
              domain: ctx.globalArgs.domain,
              certificate: issued.certPem,
              chain: issued.chainPem,
              privateKey: issued.certPrivKeyPem,
              expiry: issued.expiry.toISOString(),
              issuedAt: new Date().toISOString(),
              vaultName,
              vaultKeyPrivkey,
              vaultKeyCert,
              vaultKeyChain,
              vaultKeyFullchain,
            },
          );

          logger.info("Certificate issued and written to vault {vault}", {
            vault: vaultName,
          });

          return { dataHandles: [handle] };
        } finally {
          // Always clean up challenge records, even on error.
          const dns = createCfDnsClient(
            ctx.globalArgs.cloudflareApiToken,
            ctx.globalArgs.cloudflareZoneId,
          );
          for (const entry of ledger) {
            if (!entry.recordId) continue;
            try {
              await dns.deleteRecord(entry.recordId);
              logger.info("Cleaned up challenge record {id} at {name}", {
                id: entry.recordId,
                name: entry.domain,
              });
            } catch (err) {
              logger.warn("Failed to delete challenge record {id}", {
                id: entry.recordId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      },
    },

    status: {
      description: "Check certificate expiry and renewal status",
      arguments: z.object({}),
      // deno-lint-ignore no-explicit-any
      execute: async (_args: unknown, context: any) => {
        const ctx = context as MethodContext;
        const logger = ctx.logger;

        const content = await ctx.dataRepository.getContent(
          ctx.modelType,
          ctx.modelId,
          "certificate",
        );

        if (!content) {
          logger.info("No certificate found — run `create` first", {});
          return { dataHandles: [] };
        }

        const certData = JSON.parse(new TextDecoder().decode(content));
        const expiry = new Date(certData.expiry);
        const daysRemaining = Math.floor(
          (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        logger.info("Certificate for {domain}", {
          domain: certData.domain,
        });
        logger.info("Expiry: {expiry}", { expiry: certData.expiry });
        logger.info("Days remaining: {days}", { days: daysRemaining });
        logger.info("Needs renewal: {needs}", { needs: daysRemaining < 30 });
        logger.info("Vault: {vault}", { vault: certData.vaultName });

        return { dataHandles: [] };
      },
    },

    renew: {
      description: "Force-renew the certificate regardless of expiry",
      arguments: z.object({}),
      // deno-lint-ignore no-explicit-any
      execute: async (_args: unknown, context: any) => {
        const ctx = context as MethodContext;
        const logger = ctx.logger;
        const {
          vaultName,
          vaultKeyPrivkey,
          vaultKeyCert,
          vaultKeyChain,
          vaultKeyFullchain,
        } = ctx.globalArgs;

        const { accountKey, accountUrl } = await ensureAccount(ctx);
        const ledger: ChallengeRecord[] = [];

        try {
          const issued = await issueCertificate(
            accountKey,
            accountUrl,
            ctx,
            ledger,
          );

          await writeVault(
            vaultName,
            vaultKeyPrivkey,
            issued.certPrivKeyPem,
            logger,
          );
          await writeVault(
            vaultName,
            vaultKeyCert,
            issued.certPem,
            logger,
          );
          await writeVault(
            vaultName,
            vaultKeyChain,
            issued.chainPem,
            logger,
          );
          await writeVault(
            vaultName,
            vaultKeyFullchain,
            issued.fullchainPem,
            logger,
          );

          const handle = await ctx.writeResource(
            "certificate",
            "certificate",
            {
              domain: ctx.globalArgs.domain,
              certificate: issued.certPem,
              chain: issued.chainPem,
              privateKey: issued.certPrivKeyPem,
              expiry: issued.expiry.toISOString(),
              issuedAt: new Date().toISOString(),
              vaultName,
              vaultKeyPrivkey,
              vaultKeyCert,
              vaultKeyChain,
              vaultKeyFullchain,
            },
          );

          logger.info("Certificate renewed and written to vault {vault}", {
            vault: vaultName,
          });
          return { dataHandles: [handle] };
        } finally {
          const dns = createCfDnsClient(
            ctx.globalArgs.cloudflareApiToken,
            ctx.globalArgs.cloudflareZoneId,
          );
          for (const entry of ledger) {
            if (!entry.recordId) continue;
            try {
              await dns.deleteRecord(entry.recordId);
            } catch (err) {
              logger.warn("Failed to delete challenge record {id}", {
                id: entry.recordId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      },
    },

    revoke: {
      description: "Revoke the current certificate and clean up vault keys",
      arguments: z.object({}),
      // deno-lint-ignore no-explicit-any
      execute: async (_args: unknown, context: any) => {
        const ctx = context as MethodContext;
        const logger = ctx.logger;
        const {
          vaultName,
          vaultKeyPrivkey,
          vaultKeyCert,
          vaultKeyChain,
          vaultKeyFullchain,
        } = ctx.globalArgs;

        const accountContent = await ctx.dataRepository.getContent(
          ctx.modelType,
          ctx.modelId,
          "account",
        );
        const certContent = await ctx.dataRepository.getContent(
          ctx.modelType,
          ctx.modelId,
          "certificate",
        );

        if (!accountContent || !certContent) {
          throw new Error(
            "Need both an account and a certificate to revoke — run `create` first",
          );
        }

        const accountData = JSON.parse(
          new TextDecoder().decode(accountContent),
        );
        const certData = JSON.parse(new TextDecoder().decode(certContent));
        const accountKey = createPrivateKey(accountData.accountKey);

        const acme = await AcmeClient.create(
          ctx.globalArgs.staging ? ACME_STAGING : ACME_PRODUCTION,
        );

        // Convert cert PEM → DER for revocation payload.
        const b64 = certData.certificate
          .replace(/-----BEGIN CERTIFICATE-----/g, "")
          .replace(/-----END CERTIFICATE-----/g, "")
          .replace(/\s+/g, "");
        const certDer = Buffer.from(b64, "base64");

        logger.info("Revoking certificate for {domain}", {
          domain: certData.domain,
        });
        await acme.revoke(accountKey, accountData.accountUrl, certDer);

        // Clean up vault keys so downstream models can't find a stale cert.
        await deleteVaultKey(vaultName, vaultKeyPrivkey, logger);
        await deleteVaultKey(vaultName, vaultKeyCert, logger);
        await deleteVaultKey(vaultName, vaultKeyChain, logger);
        await deleteVaultKey(vaultName, vaultKeyFullchain, logger);

        logger.info("Certificate revoked and vault keys cleaned up", {});
        return { dataHandles: [] };
      },
    },
  },
};
