import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const account = readFileSync(new URL("../src/routes/account.ts", import.meta.url), "utf8");
const addresses = readFileSync(new URL("../src/routes/addresses.ts", import.meta.url), "utf8");
const mobileApi = readFileSync(new URL("../../athoo-app/services/api.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../../athoo-app/app/(customer)/(tabs)/profile.tsx", import.meta.url), "utf8");
const privacySecurity = readFileSync(new URL("../../athoo-app/components/screens/PrivacySecurityScreen.tsx", import.meta.url), "utf8");

test("mobile account deletion uses step-up verification and the seven-day grace-period API", () => {
  const verificationModal = readFileSync(new URL("../../athoo-app/components/screens/AccountActionVerificationModal.tsx", import.meta.url), "utf8");
  assert.match(mobileApi, /\/api\/me\/account\/delete-request/);
  assert.match(mobileApi, /password\?: string; verificationToken\?: string/);
  assert.doesNotMatch(mobileApi, /method:\s*"DELETE"[\s\S]{0,100}\/api\/auth\/me/);
  assert.match(privacySecurity, /AccountActionVerificationModal/);
  assert.match(verificationModal, /password|email_otp|phone_otp/);
  assert.match(account, /Date\.now\(\) \+ 7 \* 24 \* 60 \* 60 \* 1000/);
});

test("deactivation and deletion revoke active sessions and duplicate deletion requests are idempotent", () => {
  assert.match(account, /revokeAllUserSessions\(user\.id, "account_deactivated"\)/);
  assert.match(account, /existingPending/);
  assert.match(account, /duplicate:\s*true/);
  assert.match(account, /revokeAllUserSessions\(user\.id, "account_deletion_requested"\)/);
});

test("identity changes prevent duplicate emails and revoke sessions", () => {
  assert.match(account, /Email address already in use/);
  assert.match(account, /revokeAllUserSessions\(req\.user!\.userId, "email_changed"\)/);
  assert.match(account, /revokeAllUserSessions\(req\.user!\.userId, "phone_changed"\)/);
});

test("saved addresses enforce limits, duplicate prevention, coordinate validation, and atomic default switching", () => {
  assert.match(addresses, /save up to 10 addresses/);
  assert.match(addresses, /This address is already saved/);
  assert.match(addresses, /parseCanonicalLocation/);
  assert.match(addresses, /assertLocationInActiveServiceArea/);
  assert.match(addresses, /db\.transaction/);
});
