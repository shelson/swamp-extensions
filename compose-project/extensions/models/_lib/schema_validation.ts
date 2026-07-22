/**
 * Validates project/service/volume/network fields against a compose-spec
 * JSON Schema document (https://github.com/compose-spec/compose-go).
 *
 * A field is validated only if the schema explicitly defines it — vendor
 * extension keys (the compose-spec `x-` prefix) and any field the *active*
 * schema doesn't yet know about are passed through untouched. That keeps a
 * stale bundled/cached schema from blocking legitimate newer compose fields
 * outright; it just means the caller should run `updateSchema` and retry.
 *
 * @module
 */
import { Ajv2020 } from "npm:ajv@8.17.1/dist/2020.js";
import type { ErrorObject } from "npm:ajv@8.17.1";

export class ComposeSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposeSchemaValidationError";
  }
}

export type ComposeDefName = "service" | "volume" | "network";

function isExtensionKey(key: string): boolean {
  return key.startsWith("x-");
}

function compileRef(
  schemaDoc: Record<string, unknown>,
  jsonPointer: string,
) {
  const id = (schemaDoc["$id"] as string | undefined) ?? "compose-spec";
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addSchema(schemaDoc, id);
  return ajv.compile({ $ref: `${id}#${jsonPointer}` });
}

function lookupPropertySchema(
  schemaDoc: Record<string, unknown>,
  defName: ComposeDefName | null,
  key: string,
): { pointer: string } | null {
  const defs = schemaDoc["$defs"] as Record<string, unknown> | undefined;
  const container = defName
    ? (defs?.[defName] as { properties?: Record<string, unknown> } | undefined)
    : (schemaDoc as { properties?: Record<string, unknown> });
  const properties = container?.properties;
  if (!properties || !(key in properties)) return null;
  const pointer = defName
    ? `/$defs/${defName}/properties/${key}`
    : `/properties/${key}`;
  return { pointer };
}

/**
 * Validate a single field's value against the schema definition for
 * `defName` (or the document root when `defName` is null, for top-level
 * project fields). Throws {@link ComposeSchemaValidationError} when the
 * schema defines the field and the value doesn't match it. Unknown fields
 * (including `x-*` vendor extensions) are silently allowed.
 */
export function validateField(
  schemaDoc: Record<string, unknown>,
  defName: ComposeDefName | null,
  key: string,
  value: unknown,
): void {
  if (isExtensionKey(key)) return;

  const found = lookupPropertySchema(schemaDoc, defName, key);
  if (!found) {
    const scope = defName ? `a ${defName}` : "a top-level compose document";
    throw new ComposeSchemaValidationError(
      `'${key}' is not a recognized field for ${scope} in the active compose-spec schema. ` +
        `If this is a newer compose field, run the updateSchema method and try again.`,
    );
  }

  const validate = compileRef(schemaDoc, found.pointer);
  if (!validate(value)) {
    const details = (validate.errors ?? [])
      .map((e: ErrorObject) => `${e.instancePath || "value"} ${e.message}`)
      .join("; ");
    throw new ComposeSchemaValidationError(
      `Invalid value for '${key}': ${details}`,
    );
  }
}

/** Validate every entry of an options bag (volume/network options) in one call. */
export function validateOptions(
  schemaDoc: Record<string, unknown>,
  defName: ComposeDefName,
  options: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(options)) {
    validateField(schemaDoc, defName, key, value);
  }
}

/**
 * Validate a whole parsed compose document (as imported from a
 * compose.yaml/docker-compose.yml file) against the full schema in one
 * pass, surfacing every error rather than stopping at the first.
 */
export function validateDocument(
  schemaDoc: Record<string, unknown>,
  doc: unknown,
): void {
  const id = (schemaDoc["$id"] as string | undefined) ?? "compose-spec";
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addSchema(schemaDoc, id);
  const validate = ajv.getSchema(id)!;
  if (!validate(doc)) {
    const details = (validate.errors ?? [])
      .map((e: ErrorObject) => `${e.instancePath || "document"} ${e.message}`)
      .join("; ");
    throw new ComposeSchemaValidationError(
      `Compose document failed schema validation: ${details}`,
    );
  }
}
