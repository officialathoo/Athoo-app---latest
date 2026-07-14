import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const migratedFiles = [
  "athoo-app/components/ui/BookingCard.tsx",
  "athoo-app/components/ui/OtpModal.tsx",
  "athoo-app/components/ui/SuccessModal.tsx",
  "athoo-app/app/(customer)/billing.tsx",
  "athoo-app/app/(provider)/wallet.tsx",
  "athoo-app/app/(provider)/earnings.tsx",
];

test("phase 8B3A migrated files use runtime theme and language without legacy colors", () => {
  for (const file of migratedFiles) {
    const source = read(file);
    assert.match(source, /useTheme/);
    assert.match(source, /useLang/);
    assert.doesNotMatch(source, /@\/constants\/colors/);
    assert.doesNotMatch(source, /\bColors\./);
  }
});

test("booking card exposes semantic status styling and accessible actions", () => {
  const source = read(migratedFiles[0]);
  assert.match(source, /getStatusConfig\(theme, tr\)/);
  assert.match(source, /formatCurrency/);
  assert.match(source, /accessibilityHint=\{tr\("Opens booking details"\)\}/);
  assert.match(source, /Contact \{\{role\}\}/);
  assert.match(source, /minHeight: 44/);
});

test("OTP modal supports autofill paste resend and accessibility state", () => {
  const source = read(migratedFiles[1]);
  assert.match(source, /onResend\?:/);
  assert.match(source, /digits\.length > 1/);
  assert.match(source, /textContentType=\{index === 0 \? "oneTimeCode"/);
  assert.match(source, /autoComplete=\{index === 0 \? "one-time-code"/);
  assert.match(source, /accessibilityState=\{\{ disabled: resendDisabled, busy: resending \}\}/);
  assert.match(source, /accessibilityViewIsModal/);
});

test("success modal follows theme and exposes dialog actions", () => {
  const source = read(migratedFiles[2]);
  assert.match(source, /theme\.colors\.elevated/);
  assert.match(source, /theme\.colors\.successSoft/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /accessibilityViewIsModal/);
});

test("customer billing uses stable filter values with localized presentation", () => {
  const source = read(migratedFiles[3]);
  assert.match(source, /type BillingFilter = "all" \| "completed" \| "pending"/);
  assert.match(source, /formatCurrency/);
  assert.match(source, /formatDate/);
  assert.match(source, /accessibilityRole="tab"/);
  assert.match(source, /Payments are made directly to the provider in cash/);
});

test("provider wallet adds error recovery and accessible commission progress", () => {
  const source = read(migratedFiles[4]);
  assert.match(source, /setError\(loadError\?\.message/);
  assert.match(source, /accessibilityRole="progressbar"/);
  assert.match(source, /Math\.max\(0, commissionLimit - pendingDues\)/);
  assert.match(source, /WalletAction/);
  assert.match(source, /formatCurrency/);
});

test("provider earnings localizes periods and exposes accessible chart data", () => {
  const source = read(migratedFiles[5]);
  assert.match(source, /type Period = "week" \| "month" \| "all"/);
  assert.match(source, /accessibilityRole="image"/);
  assert.match(source, /accessibilityRole="tab"/);
  assert.match(source, /Earnings chart for \{\{period\}\}/);
  assert.match(source, /formatCurrency/);
});

test("private images can carry accessibility labels without changing object path behavior", () => {
  const source = read("athoo-app/services/storage.ts");
  assert.match(source, /accessibilityLabel\?: string/);
  assert.match(source, /accessibilityRole: accessibilityLabel \? "image" : undefined/);
  assert.match(source, /getPrivateFileUrl\(objectPath\)/);
});

test("Urdu dictionary covers phase 8B3A finance and modal states", () => {
  const source = read("athoo-app/context/LanguageContext.tsx");
  assert.match(source, /"Billing & History": "بلنگ اور تاریخ"/);
  assert.match(source, /"My Wallet": "میرا والٹ"/);
  assert.match(source, /"Net Earnings": "خالص آمدنی"/);
  assert.match(source, /"Enter the 4-digit OTP": "چار ہندسوں والا OTP درج کریں"/);
  assert.match(source, /"Pay Commission Dues": "کمیشن واجبات ادا کریں"/);
});

test("phase audit records completed and remaining scope honestly", () => {
  const audit = JSON.parse(read("docs/RC2_PHASE_8B3_UI_AUDIT.json"));
  assert.equal(audit.scopeComplete, true);
  assert.equal(audit.fullPhase8B3Complete, false);
  assert.equal(audit.migratedFilesLegacyColorImports, 0);
  assert.equal(audit.remainingTransactionRoutes, 7);
});
