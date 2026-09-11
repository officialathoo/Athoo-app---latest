import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("deactivation and deletion cannot bypass fresh credential verification", () => {
  const route = read("api-server/src/routes/account.ts");
  assert.doesNotMatch(route, /user\.password\s*&&\s*password\s*!==\s*undefined/);
  assert.match(route, /requireAccountActionCredential\(req, res, user, "deactivate"\)/);
  assert.match(route, /requireAccountActionCredential\(req, res, user, "delete"\)/);
  assert.match(route, /STEP_UP_REQUIRED/);
  assert.match(route, /PASSWORD_INCORRECT/);
  assert.doesNotMatch(route, /Password is incorrect[^\n]+status\(401\)/);
});

test("OTP proof is action, account, role, session and device bound", () => {
  const route = read("api-server/src/routes/account.ts");
  assert.match(route, /stepUpTokenPurpose\(action\)/);
  assert.match(route, /decoded\.userId === user\.id/);
  assert.match(route, /decoded\.role === user\.role/);
  assert.match(route, /decoded\.sessionId === req\.user!\.sessionId/);
  assert.match(route, /decoded\.deviceId \|\| null\) === currentDeviceId/);
  assert.match(route, /signPurposeToken/);
  assert.match(route, /}, "5m"\)/);
});

test("account OTP challenges use HMAC storage, six digits, bounded attempts and atomic one-time consumption", () => {
  const helper = read("api-server/src/lib/accountStepUp.ts");
  assert.match(helper, /createHmac\("sha256"/);
  assert.match(helper, /randomInt\(100000, 1_000_000\)/);
  assert.match(helper, /ACCOUNT_STEP_UP_MAX_ATTEMPTS/);
  assert.match(helper, /attempts = attempts \+ 1/);
  assert.match(helper, /WHERE id = \$1 AND used = false AND expires_at > now\(\)/);
  assert.match(helper, /deliveryChannels: \["whatsapp_cloud", "http_sms"\]/);
  assert.match(helper, /code: hashPhoneCode\(phone, purpose, code\)/);
});

test("email challenges distinguish deactivation from permanent deletion", () => {
  const auth = read("api-server/src/lib/emailAuth.ts");
  const templates = read("api-server/src/lib/emailTemplates.ts");
  assert.match(auth, /"account_deactivate"/);
  assert.match(auth, /"account_delete"/);
  assert.match(auth, /account_action_otp/);
  assert.match(templates, /works only for this specific action/);
  assert.match(templates, /Never share this code/);
});

test("pending deletion requests are race-proof and auditable without secret material", () => {
  const route = read("api-server/src/routes/account.ts");
  const migration = read("deploy/migrations/20260801_account_action_step_up_verification.sql");
  assert.match(route, /onConflictDoNothing\(\)/);
  assert.match(route, /account\.self_deletion_requested/);
  assert.match(route, /hasReason: Boolean\(cleanReason\)/);
  assert.doesNotMatch(route, /details:\s*\{[^}]*password/s);
  assert.match(migration, /row_number\(\) OVER/);
  assert.match(migration, /account_deletion_one_pending_uidx/);
  assert.match(migration, /WHERE status = 'pending'/);
});

test("mobile verification modal is keyboard-safe and does not persist OTP secrets", () => {
  const modal = read("athoo-app/components/screens/AccountActionVerificationModal.tsx");
  const privacy = read("athoo-app/components/screens/PrivacySecurityScreen.tsx");
  assert.match(modal, /KeyboardAvoidingView/);
  assert.match(modal, /keyboardShouldPersistTaps="handled"/);
  assert.match(modal, /textContentType="oneTimeCode"/);
  assert.match(modal, /keyboardType="number-pad"/);
  assert.match(modal, /verifyAccountStepUpCode/);
  assert.doesNotMatch(modal, /AsyncStorage|SecureStore/);
  assert.match(privacy, /api\.deactivateAccount\(credential\)/);
  assert.match(privacy, /api\.requestAccountDeletion\(credential\)/);
});

test("profile danger-zone entry points use the centralized verified account controls", () => {
  const customer = read("athoo-app/app/(customer)/(tabs)/profile.tsx");
  const provider = read("athoo-app/app/(provider)/(tabs)/profile.tsx");
  assert.match(customer, /router\.push\("\/\(customer\)\/privacy"/);
  assert.match(provider, /router\.push\("\/\(provider\)\/privacy"/);
  assert.doesNotMatch(customer, /deactivateAccount\(\)/);
  assert.doesNotMatch(provider, /deactivateMe\(\)/);
});

test("sensitive account actions have token-and-IP-derived rate limits and deployment settings", () => {
  const app = read("api-server/src/app.ts");
  const env = read(".env.production.example");
  const blueprint = read("render.yaml");
  assert.match(app, /sensitiveAccountKey/);
  assert.match(app, /createHash\("sha256"\)/);
  assert.match(app, /ACCOUNT_STEP_UP_REQUEST_RATE_LIMIT_MAX/);
  assert.match(app, /ACCOUNT_STEP_UP_VERIFY_RATE_LIMIT_MAX/);
  assert.match(app, /ACCOUNT_ACTION_RATE_LIMIT_MAX/);
  for (const key of ["ACCOUNT_STEP_UP_REQUEST_RATE_LIMIT_MAX", "ACCOUNT_STEP_UP_VERIFY_RATE_LIMIT_MAX", "ACCOUNT_ACTION_RATE_LIMIT_MAX"]) {
    assert.match(env, new RegExp(`${key}=`));
    assert.match(blueprint, new RegExp(`key: ${key}`));
  }
});

test("legacy auth account-action endpoints cannot bypass step-up verification", () => {
  const auth = read("api-server/src/routes/auth.ts");
  assert.match(auth, /router\.delete\("\/me"[\s\S]+status\(410\)[\s\S]+STEP_UP_REQUIRED/);
  assert.match(auth, /router\.post\("\/deactivate"[\s\S]+status\(410\)[\s\S]+STEP_UP_REQUIRED/);
  assert.doesNotMatch(auth, /router\.delete\("\/me"[\s\S]{0,500}db\.delete\(usersTable\)/);
  assert.doesNotMatch(auth, /router\.post\("\/deactivate"[\s\S]{0,500}isDeactivated:\s*true/);
});
