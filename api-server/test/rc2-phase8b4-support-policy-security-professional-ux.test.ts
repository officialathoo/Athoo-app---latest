import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const sharedScreens = [
  "athoo-app/components/screens/ContactSupportScreen.tsx",
  "athoo-app/components/screens/SupportTicketsScreen.tsx",
  "athoo-app/components/screens/NotificationsScreen.tsx",
  "athoo-app/components/screens/ChangePasswordScreen.tsx",
  "athoo-app/components/screens/HelpScreen.tsx",
  "athoo-app/components/screens/PrivacySecurityScreen.tsx",
  "athoo-app/components/screens/AboutScreen.tsx",
  "athoo-app/components/screens/LegalDocumentScreen.tsx",
];

const routePairs: Array<[string, string]> = [
  ["athoo-app/app/(customer)/contact-support.tsx", "ContactSupportScreen role=\"customer\""],
  ["athoo-app/app/(provider)/contact-support.tsx", "ContactSupportScreen role=\"provider\""],
  ["athoo-app/app/(customer)/support-tickets.tsx", "SupportTicketsScreen role=\"customer\""],
  ["athoo-app/app/(provider)/support-tickets.tsx", "SupportTicketsScreen role=\"provider\""],
  ["athoo-app/app/(customer)/notifications.tsx", "NotificationsScreen role=\"customer\""],
  ["athoo-app/app/(provider)/notifications.tsx", "NotificationsScreen role=\"provider\""],
  ["athoo-app/app/(customer)/help.tsx", "HelpScreen role=\"customer\""],
  ["athoo-app/app/(provider)/help.tsx", "HelpScreen role=\"provider\""],
  ["athoo-app/app/(customer)/privacy.tsx", "PrivacySecurityScreen role=\"customer\""],
  ["athoo-app/app/(provider)/privacy.tsx", "PrivacySecurityScreen role=\"provider\""],
  ["athoo-app/app/(customer)/about.tsx", "AboutScreen role=\"customer\""],
  ["athoo-app/app/(provider)/about.tsx", "AboutScreen role=\"provider\""],
];

test("phase 8B4 shared support policy security screens use runtime theme localization and responsive content", () => {
  for (const file of sharedScreens) {
    const source = read(file);
    assert.match(source, /useTheme/);
    assert.match(source, /useLang/);
    assert.match(source, /responsiveContent/);
    assert.doesNotMatch(source, /@\/constants\/colors/);
    assert.doesNotMatch(source, /\bColors\./);
  }
});

test("customer and provider routes share one implementation instead of drifting copies", () => {
  for (const [file, expected] of routePairs) {
    const source = read(file).replace(/[<>]/g, "");
    assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(read("athoo-app/app/(customer)/change-password.tsx"), /ChangePasswordScreen/);
  assert.match(read("athoo-app/app/(provider)/change-password.tsx"), /ChangePasswordScreen/);
});

test("support requests offer camera and gallery with optional crop and bounded evidence", () => {
  const source = read("athoo-app/components/screens/ContactSupportScreen.tsx");
  assert.match(source, /pickImageWithSourceChoice/);
  assert.match(source, /camera: tr\("Camera"\)/);
  assert.match(source, /gallery: tr\("Gallery"\)/);
  assert.match(source, /allowsEditing: false/);
  assert.match(source, /media\.length >= 5/);
  assert.match(source, /next\.slice\(0, 5\)/);
  assert.match(source, /maxLength=\{500\}/);
  assert.match(source, /apiErrorToMessage/);
});

test("help articles are admin managed with cached API data and no hardcoded FAQ display list", () => {
  const source = read("athoo-app/components/screens/HelpScreen.tsx");
  assert.match(source, /api\.getFaqs\(role\)/);
  assert.match(source, /AsyncStorage\.getItem\(cacheKey\)/);
  assert.match(source, /AsyncStorage\.setItem\(cacheKey/);
  assert.doesNotMatch(source, /const\s+(?:FAQS|faqs)\s*=\s*\[/);
  assert.match(source, /Showing saved help articles/);
});

test("notification centre prevents dismiss taps from opening cards and supports safe bulk actions", () => {
  const source = read("athoo-app/components/screens/NotificationsScreen.tsx");
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /markAllRead/);
  assert.match(source, /confirmClear/);
  assert.match(source, /Alert\.alert/);
  assert.match(source, /handleNotificationPress/);
});

test("security settings use strong password validation and double-confirmed account deletion", () => {
  const password = read("athoo-app/components/screens/ChangePasswordScreen.tsx");
  assert.match(password, /apiErrorToMessage/);
  assert.match(password, /Password must be at least 8 characters/);
  assert.match(password, /Passwords do not match/);
  assert.match(password, /Choose a different password/);

  const privacy = read("athoo-app/components/screens/PrivacySecurityScreen.tsx");
  assert.match(privacy, /const deleteAccount/);
  assert.ok((privacy.match(/Alert\.alert/g) || []).length >= 3, "account deletion should require layered confirmation");
  assert.match(privacy, /apiErrorToMessage/);
  assert.match(privacy, /api\.deleteMe\(\)/);
});

test("about and legal content use dynamic platform settings and bilingual versioned documents", () => {
  const about = read("athoo-app/components/screens/AboutScreen.tsx");
  assert.match(about, /useSettings/);
  assert.match(about, /settings\.supportPhone/);
  assert.match(about, /settings\.supportEmail/);
  assert.match(about, /Constants\.expoConfig\?\.version/);

  const legal = read("athoo-app/components/screens/LegalDocumentScreen.tsx");
  assert.match(legal, /LEGAL_VERSION/);
  assert.match(legal, /urTitle/);
  assert.match(legal, /urBody/);
  assert.match(legal, /پاکستان/);
  assert.match(read("athoo-app/app/legal/privacy.tsx"), /LegalDocumentScreen kind="privacy"/);
  assert.match(read("athoo-app/app/legal/terms.tsx"), /LegalDocumentScreen kind="terms"/);
});

test("app-wide user-facing failures are sanitized rather than showing raw developer errors", () => {
  const friendly = read("athoo-app/lib/userFriendlyError.ts");
  assert.match(friendly, /apiErrorToMessage/);
  assert.doesNotMatch(friendly, /return raw\s*;/);

  const roots = ["athoo-app/app", "athoo-app/components", "athoo-app/utils"];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative);
    }
  };
  for (const directory of roots) visit(directory);

  const unsafePatterns = [
    /Alert\.alert\([^\n]*\b(?:error|err|caught|e)\?*\.message/,
    /set[A-Za-z]*Error\(\s*(?:error|err|caught|e)\?*\.message\s*\|\|/,
    /showError\([^\n]*\b(?:error|err|caught|e)\?*\.message/,
  ];

  const violations: string[] = [];
  for (const file of files) {
    const source = read(file);
    for (const pattern of unsafePatterns) {
      if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("responsive header uses safe areas and professional touch targets", () => {
  const source = read("athoo-app/components/design/ScreenHeader.tsx");
  assert.match(source, /useSafeAreaInsets/);
  assert.match(source, /width: 44, height: 44/);
  assert.match(source, /maxWidth: 760/);
  assert.match(source, /maxWidth: 900/);
});
