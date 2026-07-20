import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("Phase 27 uses Cloudflare TURN short-lived credentials without exposing the master token", () => {
  const configuration = readRepo("api-server/src/lib/callConfiguration.ts");
  const calls = readRepo("api-server/src/routes/calls.ts");
  const mobile = readRepo("athoo-app/context/CallContext.tsx");
  const env = readRepo(".env.production.example");

  assert.match(configuration, /CLOUDFLARE_TURN_KEY_ID/);
  assert.match(configuration, /CLOUDFLARE_TURN_API_TOKEN/);
  assert.match(configuration, /credentials\/generate-ice-servers/);
  assert.match(configuration, /Authorization: `Bearer \$\{settings\.apiToken\}`/);
  assert.match(configuration, /credentialMode: "short-lived"/);
  assert.match(configuration, /cloudflareCredentialCache/);
  assert.match(configuration, /filter\(\(url\) => !\/:53/);
  assert.match(calls, /getRuntimeCallConfiguration\(req\.user!\.userId\)/);
  assert.match(mobile, /refreshCallConfiguration/);
  assert.match(mobile, /pcRef\.current\.setConfiguration/);
  assert.match(mobile, /await refreshCallConfiguration\(\)/);
  assert.match(env, /CALL_PROVIDER=cloudflare-turn/);
  assert.doesNotMatch(mobile, /CLOUDFLARE_TURN_API_TOKEN|CLOUDFLARE_TURN_KEY_ID/);
  assert.doesNotMatch(readRepo("athoo-app/app.config.js"), /CLOUDFLARE_TURN_API_TOKEN/);
});

test("Phase 27 preserves portable static TURN fallback and production validation", () => {
  const configuration = readRepo("api-server/src/lib/callConfiguration.ts");
  const validator = readRepo("scripts/tools/validate-environment.mjs");
  const render = readRepo("render.yaml");

  assert.match(configuration, /TURN_URLS/);
  assert.match(configuration, /TURN_USERNAME/);
  assert.match(configuration, /TURN_CREDENTIAL/);
  assert.match(configuration, /staticCallConfiguration/);
  assert.match(validator, /cloudflareTurnReady/);
  assert.match(validator, /staticTurnReady/);
  assert.match(render, /- key: CLOUDFLARE_TURN_KEY_ID/);
  assert.match(render, /- key: CLOUDFLARE_TURN_API_TOKEN/);
});
