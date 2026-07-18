import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderJsonTemplate, readPath } from "../src/integrations/httpJsonAdapter.ts";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("generic HTTP JSON templates preserve strings and raw provider payloads", () => {
  const rendered = renderJsonTemplate(
    {
      to: "{to}",
      payload: "__ATHOO_DATA__",
      nested: [{ subject: "{subject}" }],
    },
    { to: "user@example.com", subject: "Hello" },
    { __ATHOO_DATA__: { bookingId: "booking-1" } },
  );
  assert.deepEqual(rendered, {
    to: "user@example.com",
    payload: { bookingId: "booking-1" },
    nested: [{ subject: "Hello" }],
  });
  assert.equal(readPath({ data: { items: [{ id: "ticket-1" }] } }, "data.items.0.id"), "ticket-1");
});

test("platform settings support secret-free runtime communication provider selection", () => {
  const admin = read("api-server/src/lib/admin.ts");
  const runtime = read("api-server/src/lib/communicationRuntime.ts");
  for (const field of ["communicationRuntimeConfigurationEnabled", "emailProvider", "pushProvider"]) {
    assert.match(admin, new RegExp(field));
  }
  assert.match(admin, /emailProvider[\s\S]{0,200}\["environment", "smtp", "http_json", "disabled"\]/);
  assert.match(admin, /pushProvider[\s\S]{0,200}\["environment", "expo", "http_json", "disabled"\]/);
  assert.match(runtime, /getPlatformSettings/);
  assert.match(runtime, /runtime communication settings unavailable; using deployment environment/);
  assert.doesNotMatch(admin, /EMAIL_HTTP_AUTH_VALUE|PUSH_HTTP_AUTH_VALUE/);
});

test("email supports SMTP-compatible and declarative HTTP providers without route changes", () => {
  const email = read("api-server/src/lib/email.ts");
  assert.match(email, /"smtp" \| "http_json" \| "console" \| "disabled"/);
  assert.match(email, /resolveEmailProvider/);
  assert.match(email, /EMAIL_HTTP_BODY_TEMPLATE_JSON/);
  assert.match(email, /__ATHOO_EMAIL_HEADERS__/);
  assert.match(email, /getRuntimeCommunicationOverrides/);
  assert.match(email, /sendHttpJsonEmail/);
  assert.doesNotMatch(email, /api\.sendgrid\.com|api\.mailgun\.net|api\.postmarkapp\.com/i);
});

test("push keeps Expo receipts and adds a declarative HTTP provider adapter", () => {
  const push = read("api-server/src/lib/push.ts");
  assert.match(push, /type PushProviderKind = "expo" \| "http_json" \| "disabled"/);
  assert.match(push, /PUSH_HTTP_MESSAGE_TEMPLATE_JSON/);
  assert.match(push, /__ATHOO_MESSAGES__/);
  assert.match(push, /sendHttpPushBatch/);
  assert.match(push, /provider === "expo" \? await sendExpoBatch\(batch\) : await sendHttpPushBatch\(batch\)/);
  assert.match(push, /provider === "expo" \? await queueExpoReceiptCheck/);
  assert.match(push, /expo_push_receipts/);
});

test("admin exposes provider status without exposing secrets", () => {
  const adminRoutes = read("api-server/src/routes/admin.ts");
  const settingsPage = read("admin-panel/src/pages/SettingsPage.tsx");
  assert.match(adminRoutes, /\/settings\/integrations\/status/);
  assert.match(adminRoutes, /runtimeSwitchable/);
  assert.match(adminRoutes, /restartRequired/);
  assert.doesNotMatch(adminRoutes, /EMAIL_HTTP_AUTH_VALUE[^\n]*res\.json|PUSH_HTTP_AUTH_VALUE[^\n]*res\.json/);
  assert.match(settingsPage, /Communication & External Providers/);
  assert.match(settingsPage, /Runtime Provider Control/);
  assert.match(settingsPage, /Refresh Provider Status/);
  assert.match(settingsPage, /credentials stay in Render or your deployment secret manager/i);
});

test("deployment templates and validator cover both portable communication adapters", () => {
  const envExample = read(".env.production.example");
  const render = read("render.yaml");
  const validator = read("scripts/tools/validate-environment.mjs");
  for (const key of [
    "EMAIL_HTTP_ENDPOINT",
    "EMAIL_HTTP_BODY_TEMPLATE_JSON",
    "PUSH_HTTP_ENDPOINT",
    "PUSH_HTTP_MESSAGE_TEMPLATE_JSON",
    "PUSH_HTTP_BODY_TEMPLATE_JSON",
  ]) {
    assert.match(envExample, new RegExp(`${key}=`));
    assert.match(render, new RegExp(`key: ${key}`));
    assert.match(validator, new RegExp(key));
  }
  assert.match(validator, /PUSH_PROVIDER must be expo, http_json, or disabled/);
  assert.match(validator, /EMAIL_PROVIDER=http_json requires EMAIL_HTTP_ENDPOINT/);
  assert.match(validator, /EMAIL_FROM_ADDRESS[\s\S]{0,120}SMTP_FROM[\s\S]{0,120}EMAIL_FROM/);
});
