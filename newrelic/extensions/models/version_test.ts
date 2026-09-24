/**
 * Guards the `version` literal inside each `export const model` block against
 * drift from the manifest version. The swamp-club catalog reads that version
 * statically, so the two must stay in sync.
 *
 * @module
 */
import { assertEquals } from "@std/assert";
import { model as account } from "./account.ts";
import { model as alertCondition } from "./alert_condition.ts";
import { model as alertPolicy } from "./alert_policy.ts";
import { model as dashboard } from "./dashboard.ts";
import { model as mutingRule } from "./muting_rule.ts";
import { model as notificationChannel } from "./notification_channel.ts";
import { model as notificationDestination } from "./notification_destination.ts";
import { model as privateLocation } from "./private_location.ts";
import { model as syntheticMonitor } from "./synthetic_monitor.ts";
import { model as workflow } from "./workflow.ts";

const manifest = await Deno.readTextFile(
  new URL("../../manifest.yaml", import.meta.url),
);
const manifestVersion = manifest.match(/^version:\s*"([^"]+)"/m)?.[1];

const models = [
  account,
  alertCondition,
  alertPolicy,
  dashboard,
  mutingRule,
  notificationChannel,
  notificationDestination,
  privateLocation,
  syntheticMonitor,
  workflow,
];

Deno.test("manifest.yaml declares a version", () => {
  if (!manifestVersion) throw new Error("no version in manifest.yaml");
});

Deno.test("every model version matches the manifest version", () => {
  for (const model of models) {
    assertEquals(model.version, manifestVersion, `${model.type} version`);
  }
});
