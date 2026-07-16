import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

function walkSource(directory: string): string[] {
  const absolute = path.join(root, directory);
  const result: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkSource(relative));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(relative);
  }
  return result;
}

test("Phase 3D mobile feature screens no longer depend on legacy or literal UI colors", () => {
  const files = walkSource("athoo-app/app");
  const offenders: string[] = [];

  for (const file of files) {
    const source = read(file);
    const withoutHtmlEntities = source.replace(/&#\d+;/g, "");
    if (/from\s+["'][^"']*constants\/colors["']/.test(source)) offenders.push(`${file}: legacy color import`);
    if (/\bColors\./.test(source)) offenders.push(`${file}: legacy Colors reference`);
    if (/#[0-9A-Fa-f]{3,8}\b/.test(withoutHtmlEntities)) offenders.push(`${file}: direct HEX color`);
  }

  assert.deepEqual(offenders, []);
});

test("high-density status screens derive status colors from the active semantic theme", () => {
  const customerBooking = read("athoo-app/app/(customer)/booking-detail.tsx");
  const refundRequests = read("athoo-app/app/(customer)/refund-requests.tsx");
  const withdrawals = read("athoo-app/app/(provider)/withdrawal-requests.tsx");
  const providerJob = read("athoo-app/app/(provider)/job-detail.tsx");

  assert.match(customerBooking, /function getStatusConfig\(theme: AthooTheme\)/);
  assert.match(customerBooking, /theme\.colors\.accentSoft/);
  assert.match(refundRequests, /function getStatusConfig\(theme: AthooTheme\)/);
  assert.match(withdrawals, /function getStatusConfig\(theme: AthooTheme\)/);
  assert.match(providerJob, /theme\.colors\.premiumSoft/);
});

test("feature screens use configurable backend and external-map abstractions", () => {
  const customerBooking = read("athoo-app/app/(customer)/booking-detail.tsx");
  const providerJob = read("athoo-app/app/(provider)/job-detail.tsx");
  const externalMaps = read("athoo-app/services/externalMaps.ts");
  const runtime = read("athoo-app/config/runtime.ts");

  for (const source of [customerBooking, providerJob]) {
    assert.doesNotMatch(source, /router\.project-osrm|openstreetmap\.org|maps\.apple\.com|api\.mapbox|maptiler/i);
  }
  assert.match(customerBooking, /getDirections/);
  assert.match(customerBooking, /openExternalMap/);
  assert.match(providerJob, /openExternalMapSearch/);
  assert.match(externalMaps, /runtimeConfig\.maps/);
  assert.match(runtime, /EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_URL_TEMPLATE/);
  assert.match(runtime, /EXPO_PUBLIC_MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE/);
});

test("invoice branding and support destinations are centralized and portable", () => {
  const customerInvoice = read("athoo-app/app/(customer)/invoices.tsx");
  const providerInvoice = read("athoo-app/app/(provider)/invoices.tsx");
  const bookingPdf = read("athoo-app/utils/bookingInvoicePdf.ts");
  const invoiceConfig = read("athoo-app/config/invoice.ts");
  const settings = read("athoo-app/context/SettingsContext.tsx");
  const profile = read("athoo-app/app/(customer)/(tabs)/profile.tsx");

  for (const source of [customerInvoice, providerInvoice, bookingPdf]) {
    assert.match(source, /invoiceConfig/);
    assert.doesNotMatch(source, /support@athoo|@athoo_services|\+92\s*339/i);
  }
  assert.match(invoiceConfig, /brandConfig\.displayName/);
  assert.match(invoiceConfig, /runtimeConfig\.support/);
  assert.match(settings, /platformName: brandConfig\.displayName/);
  assert.match(settings, /supportEmail: runtimeConfig\.support\.email/);
  assert.match(profile, /runtimeConfig\.app\.downloadUrl/);
  assert.doesNotMatch(profile, /https:\/\/athoo\./i);
});

test("semantic theme exposes soft, contrast, and shadow tokens required by migrated screens", () => {
  const theme = read("athoo-app/design/theme.ts");
  for (const token of ["onBrand", "onDanger", "onSuccess", "onLight", "shadow", "neutralSoft", "accentSoft", "premiumSoft"]) {
    assert.match(theme, new RegExp(`\\b${token}:`));
  }
});


test("admin-managed category colors are normalized through one contrast-safe appearance helper", () => {
  const helper = read("athoo-app/utils/categoryAppearance.ts");
  const serviceCard = read("athoo-app/components/ui/ServiceCard.tsx");
  const booking = read("athoo-app/app/(customer)/book-service.tsx");
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");
  const providerRegistration = read("athoo-app/app/auth/provider-register.tsx");

  assert.match(helper, /contrastRatio/);
  assert.match(helper, /theme\.dark/);
  assert.match(helper, /selectedBackground/);
  for (const source of [serviceCard, booking, search, providerRegistration]) {
    assert.match(source, /getCategoryAppearance/);
    assert.doesNotMatch(source, /\.bgColor\b/);
  }
});

test("theme-aware helper components own their theme scope", () => {
  const providerTabs = read("athoo-app/app/(provider)/(tabs)/_layout.tsx");
  const editProfile = read("athoo-app/app/(provider)/edit-profile.tsx");

  assert.match(providerTabs, /function BroadcastBadge[\s\S]*?const \{ theme \} = useTheme\(\)/);
  assert.match(editProfile, /function Field[\s\S]*?const \{ theme \} = useTheme\(\)/);
  assert.doesNotMatch(editProfile, /function Field[\s\S]*?style=\{styles\.field\}/);
});
