import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const mainTabs = [
  "athoo-app/app/(customer)/(tabs)/home.tsx",
  "athoo-app/app/(customer)/(tabs)/search.tsx",
  "athoo-app/app/(customer)/(tabs)/bookings.tsx",
  "athoo-app/app/(customer)/(tabs)/chat.tsx",
  "athoo-app/app/(customer)/(tabs)/profile.tsx",
  "athoo-app/app/(provider)/(tabs)/dashboard.tsx",
  "athoo-app/app/(provider)/(tabs)/jobs.tsx",
  "athoo-app/app/(provider)/(tabs)/earnings.tsx",
  "athoo-app/app/(provider)/(tabs)/chat.tsx",
  "athoo-app/app/(provider)/(tabs)/profile.tsx",
];

test("all customer and provider primary tabs consume theme and language contexts", () => {
  for (const file of mainTabs) {
    const source = read(file);
    assert.match(source, /useTheme/);
    assert.match(source, /useLang/);
    assert.doesNotMatch(source, /backgroundColor:\s*Colors\.white/);
  }
});

test("customer and provider chat lists are fully semantic and localized", () => {
  for (const file of [mainTabs[3], mainTabs[8]]) {
    const source = read(file);
    assert.doesNotMatch(source, /@\/constants\/colors/);
    assert.doesNotMatch(source, /\bColors\./);
    assert.match(source, /theme\.colors\.background/);
    assert.match(source, /theme\.colors\.surface/);
    assert.match(source, /translate: tr/);
    assert.match(source, /writingDirection/);
    assert.match(source, /accessibilityLabel/);
  }
});

test("customer discovery and booking tabs localize primary actions without changing sentinels", () => {
  const search = read(mainTabs[1]);
  const bookings = read(mainTabs[2]);
  assert.match(search, /const DEFAULT_CITIES = \["All Areas"\]/);
  assert.match(search, /c === "All Areas" \? t\.allAreas : c/);
  assert.match(search, /placeholder=\{t\.searchPlaceholder\}/);
  assert.match(search, /theme\.colors\.input/);
  assert.match(bookings, /formatCurrency/);
  assert.match(bookings, /tr\("No price offers yet"\)/);
  assert.match(bookings, /theme\.colors\.background/);
});

test("provider main tabs localize jobs, earnings and dashboard actions", () => {
  const dashboard = read(mainTabs[5]);
  const jobs = read(mainTabs[6]);
  const earnings = read(mainTabs[7]);
  assert.match(dashboard, /tr\("New Broadcast Job!"\)/);
  assert.match(dashboard, /formatCurrency/);
  assert.match(jobs, /const filters = FILTERS\.map/);
  assert.match(jobs, /t\.myJobs/);
  assert.match(earnings, /t\.earningsHistory/);
  assert.match(earnings, /tr\("Commission Overview"\)/);
  assert.match(earnings, /labels=\{dayLabels\}/);
});

test("incremental Urdu dictionary covers the new main-tab states", () => {
  const source = read("athoo-app/context/LanguageContext.tsx");
  assert.match(source, /"Messages": "پیغامات"/);
  assert.match(source, /"Delete Chat": "چیٹ حذف کریں"/);
  assert.match(source, /"New Broadcast Job!": "نیا براڈکاسٹ کام!"/);
  assert.match(source, /"Commission Overview": "کمیشن کا خلاصہ"/);
  assert.match(source, /"No live jobs": "کوئی جاری کام نہیں"/);
});

test("phase audit explicitly records remaining nested-card migration", () => {
  const audit = JSON.parse(read("docs/archive/development-history/RC2_PHASE_8B2_UI_AUDIT.json"));
  assert.equal(audit.routesAudited, 10);
  assert.equal(audit.allUseTheme, true);
  assert.equal(audit.allUseLanguage, true);
  assert.equal(audit.fixedWhiteSurfacesRemaining, 0);
  assert.ok(audit.legacyColorReferencesRemaining > 0);
});
