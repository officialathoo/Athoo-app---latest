import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("self-service profile routes reject role, services, rate, availability and identity bypasses", () => {
  const auth = read("api-server/src/routes/auth.ts");
  const me = read("api-server/src/routes/me.ts");
  const account = read("api-server/src/routes/account.ts");
  for (const source of [auth, me, account]) {
    assert.match(source, /Profile field changes require the approved workflow/);
    assert.match(source, /services/);
    assert.match(source, /ratePerHour/);
    assert.match(source, /isAvailable/);
  }
  assert.match(auth, /"role"/);
  assert.match(account, /"cnicNumber"/);
});

test("rate changes are provider-owned, single-pending and applied only by audited admin approval", () => {
  const route = read("api-server/src/routes/rate-requests.ts");
  assert.match(route, /Only active, approved providers can request rate changes/);
  assert.match(route, /A rate change request is already pending/);
  assert.match(route, /minHourlyRate/);
  assert.match(route, /ratePerHour: request\.requestedRate/);
  assert.match(route, /provider_rate\.\$\{status\}/);
  assert.match(route, /requirePermission\("providers\.write"\)/);
});

test("service additions use category slugs and require permissioned audited review", () => {
  const route = read("api-server/src/routes/account.ts");
  assert.match(route, /Service-request documents must be uploaded through your private Athoo storage/);
  assert.match(route, /isOwnedUploadObjectPath\(url, req\.user!\.userId, \["private"\]\)/);
  assert.match(route, /Service is already approved on your profile/);
  assert.match(route, /category\.slug/);
  assert.match(route, /provider_service\.approved/);
  assert.match(route, /provider_service\.rejected/);
  assert.match(route, /requirePermission\("providers\.write"\)/);
});

test("provider edit screen submits approval requests instead of mutating protected fields", () => {
  const screen = read("athoo-app/app/(provider)/edit-profile.tsx");
  assert.match(screen, /api\.requestServiceAdd/);
  assert.match(screen, /api\.requestRateChange/);
  assert.match(screen, /New services and hourly-rate changes require Athoo approval/);
  assert.doesNotMatch(screen, /data\.services\s*=/);
  assert.doesNotMatch(screen, /data\.ratePerHour\s*=/);
});

test("provider deletion UI describes the seven-day grace period", () => {
  const profile = read("athoo-app/app/(provider)/(tabs)/profile.tsx");
  assert.match(profile, /scheduled for deletion after 7 days/);
  assert.match(profile, /requestAccountDeletion/);
  assert.match(profile, /Schedule Account Deletion/);
});
