# @shelson/letsencrypt-cloudflare-dns

A [swamp](https://github.com/swamp-club/swamp) extension model that issues
Let's Encrypt TLS certificates via ACME DNS-01 challenges, provisioning the
challenge TXT records on Cloudflare through its DNS API.

Unlike typical ACME integrations that log the required TXT record and
busy-wait public DNS resolvers until the record propagates, this model:

1. Computes the challenge value immediately when the ACME server returns the
   authorization.
2. Writes the TXT record to Cloudflare via its API — not via shell scripts
   or out-of-band DNS providers.
3. Polls **Cloudflare's authoritative API** (not recursive resolvers) for
   record visibility, typically confirming in <5s rather than waiting up to
   10 minutes.
4. Cleans up the `_acme-challenge.<domain>` TXT records after every
   issuance.
5. Writes the issued certificate, private key, chain, and full chain into
   a named vault so downstream models can consume them via
   `vault.get(vaultName, key)`.

## Prerequisites

- swamp installed and authenticated (`swamp auth login`)
- A Cloudflare zone with API token permissions for `DNS:Edit`
- A swamp vault to store the Cloudflare API token and issued certificates

## Setup

1. Create a vault for the Cloudflare API token (if one does not already exist):

   ```bash
   swamp vault create local_encryption homelabvault
   ```

2. Store the Cloudflare API token:

   ```bash
   echo "$CLOUDFLARE_API_TOKEN" | swamp vault put homelabvault CF_API_TOKEN
   ```

3. Pull the extension:

   ```bash
   swamp extension pull @shelson/letsencrypt-cloudflare-dns
   ```

4. Create a model instance:

   ```bash
   swamp model create @shelson/letsencrypt-cloudflare-dns my-cert
   ```

5. Edit the generated input YAML (`swamp model edit my-cert`):

   ```yaml
   globalArguments:
     domain: "example.com"
     altNames: []
     email: "admin@example.com"
     cloudflareApiToken: ${{ vault.get("homelabvault", "CF_API_TOKEN") }}
     cloudflareZoneId: "<cf-zone-id>"
     vaultName: "homelabvault"
     vaultKeyPrivkey: "example.com:tls:privkey"
     vaultKeyCert: "example.com:tls:cert"
     vaultKeyChain: "example.com:tls:chain"
     vaultKeyFullchain: "example.com:tls:fullchain"
   methods:
     create: { arguments: {} }
     renew: { arguments: {} }
     status: { arguments: {} }
     revoke: { arguments: {} }
   ```

## Usage

```bash
# Issue a certificate (idempotent: skips if cert is fresh)
swamp model method run my-cert create --verbose

# Force reissue regardless of expiry
swamp model method run my-cert renew --verbose

# Check certificate status
swamp model method run my-cert status --verbose

# Revoke the certificate and clean up vault keys + TXT records
swamp model method run my-cert revoke --verbose
```

Once issued, downstream models read the certificate through vault lookups:

```yaml
globalArguments:
  tlsCert: ${{ vault.get("homelabvault", "example.com:tls:cert") }}
  tlsKey:  ${{ vault.get("homelabvault", "example.com:tls:privkey") }}
```

## Global Arguments

| Argument              | Required | Description                                                        |
|-----------------------|:--------:|--------------------------------------------------------------------|
| `domain`              | yes      | Primary domain for the certificate                                 |
| `altNames`            | no       | Additional Subject Alternative Names (default: `[]`)               |
| `email`               | yes      | Contact email for the ACME account                                 |
| `cloudflareApiToken`  | yes      | Cloudflare API token with DNS edit permission                      |
| `cloudflareZoneId`    | yes      | Cloudflare zone ID that owns the domain                            |
| `vaultName`           | yes      | Name of the vault to write cert materials into                     |
| `vaultKeyPrivkey`     | yes      | Vault key name for the private key                                 |
| `vaultKeyCert`        | yes      | Vault key name for the leaf certificate                            |
| `vaultKeyChain`       | yes      | Vault key name for the intermediate chain                          |
| `vaultKeyFullchain`   | yes      | Vault key name for cert + chain concatenated                       |

## Stored Resources

| Resource      | Fields                                                                              |
|---------------|-------------------------------------------------------------------------------------|
| `account`     | `accountUrl`, `accountKey` (sensitive)                                              |
| `certificate` | `domain`, `certificate`, `chain`, `privateKey` (sensitive), `expiry`, `issuedAt`    |

## License

MIT
