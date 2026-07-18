import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const financeRoutes = [
  "athoo-app/app/(customer)/invoices.tsx",
  "athoo-app/app/(customer)/refund-requests.tsx",
  "athoo-app/app/(customer)/subscription.tsx",
  "athoo-app/app/(provider)/invoices.tsx",
  "athoo-app/app/(provider)/pay-commission.tsx",
  "athoo-app/app/(provider)/withdrawal-requests.tsx",
  "athoo-app/app/(provider)/subscription.tsx",
];

function pngDimensions(file: string) {
  const buffer = fs.readFileSync(path.join(root, file));
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("phase 8B3B finance routes use runtime theme language responsive widths and safe errors", () => {
  for (const file of financeRoutes) {
    const source = read(file);
    assert.match(source, /useTheme/);
    assert.match(source, /useLang/);
    assert.match(source, /maxWidth: 760/);
    assert.match(source, /apiErrorToMessage/);
    assert.doesNotMatch(source, /@\/constants\/colors/);
    assert.doesNotMatch(source, /\bColors\./);
    assert.doesNotMatch(source, /(?:e|err|error)\?\.message\s*\|\|/);
  }
});

test("finance evidence offers both camera and gallery without mandatory crop", () => {
  const mediaFiles = [
    "athoo-app/app/(customer)/refund-requests.tsx",
    "athoo-app/app/(customer)/subscription.tsx",
    "athoo-app/app/(provider)/pay-commission.tsx",
    "athoo-app/app/(provider)/subscription.tsx",
  ];
  for (const file of mediaFiles) {
    const source = read(file);
    assert.match(source, /pickImageWithSourceChoice/);
    assert.match(source, /camera: tr\("Camera"\)/);
    assert.match(source, /gallery: tr\("Gallery"\)/);
    assert.match(source, /allowsEditing: false/);
  }
  const helper = read("athoo-app/utils/mediaPicker.ts");
  assert.match(helper, /pickFromCamera\(options\)/);
  assert.match(helper, /pickFromGallery\(options\)/);
});

test("subscription payment details are API-backed rather than hardcoded", () => {
  for (const file of [
    "athoo-app/app/(customer)/subscription.tsx",
    "athoo-app/app/(provider)/subscription.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /api\.getPaymentAccounts\(\)/);
    assert.match(source, /paymentAccounts\.map/);
    assert.match(source, /paymentAccountReady/);
    assert.match(source, /No Athoo payment account is available right now/);
    assert.doesNotMatch(source, /0300-1234567/);
  }
});

test("commission payment requires a reference owned screenshot and user-safe upload errors", () => {
  const source = read("athoo-app/app/(provider)/pay-commission.tsx");
  assert.match(source, /Reference Required/);
  assert.match(source, /Screenshot Required/);
  assert.match(source, /screenshotUrl: screenshot/);
  assert.match(source, /apiErrorToMessage\(e, tr\("We couldn't upload the screenshot/);
  assert.match(source, /Payment Screenshot/);
});

test("invoice documents escape dynamic content and use localized dates and currency", () => {
  for (const file of [
    "athoo-app/app/(customer)/invoices.tsx",
    "athoo-app/app/(provider)/invoices.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /function escapeHtml/);
    assert.match(source, /formatLocalizedDate/);
    assert.match(source, /formatCurrency/);
    assert.match(source, /html dir="\$\{direction\}"/);
    assert.match(source, /Unable to create invoice/);
  }
});

test("technical errors are converted to customer-safe messages", () => {
  const source = read("athoo-app/lib/apiError.ts");
  for (const protectedPattern of [
    "stack traces",
    "sqlstate",
    "cloudflare",
    "credential",
    "requestid",
    "node_modules",
    "typeerror",
  ]) {
    assert.match(source.toLowerCase(), new RegExp(protectedPattern));
  }
  assert.match(source, /No internet connection\. Please check your network and try again\./);
  assert.match(source, /Athoo is temporarily unavailable\. Please try again shortly\./);
});

test("approved app icon splash and adaptive icon are configurable and centered", () => {
  const config = read("athoo-app/app.config.js");
  assert.match(config, /APP_ICON_PATH/);
  assert.match(config, /SPLASH_IMAGE_PATH/);
  assert.match(config, /ADAPTIVE_ICON_PATH/);
  assert.match(config, /NOTIFICATION_ICON_PATH/);
  assert.match(config, /icon:\s*appIconPath/);
  assert.match(config, /image:\s*splashImagePath/);
  assert.match(config, /foregroundImage:\s*adaptiveIconPath/);
  assert.match(config, /icon:\s*notificationIconPath/);
  assert.match(config, /backgroundColor:\s*adaptiveIconBackground/);
  assert.match(config, /backgroundColor:\s*splashBackgroundLight/);
  assert.match(config, /backgroundColor:\s*splashBackgroundDark/);

  assert.deepEqual(pngDimensions("athoo-app/assets/images/icon.png"), { width: 1024, height: 1024 });
  assert.deepEqual(pngDimensions("athoo-app/assets/images/adaptive-icon.png"), { width: 1024, height: 1024 });
  assert.deepEqual(pngDimensions("athoo-app/assets/images/splash.png"), { width: 1024, height: 1024 });
  assert.deepEqual(pngDimensions("athoo-app/assets/images/favicon.png"), { width: 196, height: 196 });
  assert.deepEqual(pngDimensions("athoo-app/assets/images/notification-icon.png"), { width: 192, height: 192 });

  const audit = JSON.parse(read("docs/archive/development-history/RC2_PHASE_8B3B_UI_AUDIT.json"));
  for (const name of ["icon.png", "adaptive-icon.png", "splash.png", "favicon.png", "notification-icon.png"]) {
    const [x, y] = audit.assetAudit[name].centerOffset;
    assert.ok(Math.abs(x) <= 1, `${name} horizontal offset must be <= 1px`);
    assert.ok(Math.abs(y) <= 1, `${name} vertical offset must be <= 1px`);
  }
  assert.equal(audit.assetAudit["icon.png"].background, "white");
  assert.equal(audit.assetAudit["adaptive-icon.png"].background, "white");
  assert.equal(audit.assetAudit["splash.png"].background, "white");
});

test("Urdu dictionary covers finance payment accounts and professional states", () => {
  const source = read("athoo-app/context/LanguageContext.tsx");
  assert.match(source, /"Athoo Payment Accounts": "اتھو ادائیگی اکاؤنٹس"/);
  assert.match(source, /"Transaction Reference \/ TID": "ٹرانزیکشن ریفرنس \/ TID"/);
  assert.match(source, /"No payment is required for this plan\.": "اس پلان کے لیے ادائیگی ضروری نہیں۔"/);
  assert.match(source, /"Provider Earnings Statement": "سروس فراہم کنندہ کی آمدنی کا بیان"/);
});

test("phase audit records completed scope and remaining work honestly", () => {
  const audit = JSON.parse(read("docs/archive/development-history/RC2_PHASE_8B3B_UI_AUDIT.json"));
  assert.equal(audit.scopeComplete, true);
  assert.equal(audit.fullApplicationUiCertificationComplete, false);
  assert.equal(audit.financeRoutesMigrated.length, 7);
  assert.equal(audit.migratedFilesLegacyColorReferences, 0);
  assert.equal(audit.migratedFilesRawDeveloperErrorReferences, 0);
  assert.ok(audit.remainingAppWideRawErrorUsagesForPhase8B4Audit > 0);
});
