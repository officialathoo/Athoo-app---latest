import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1G deduplicates commission screen focus refreshes", () => {
  const screen = read("athoo-app/app/(provider)/pay-commission.tsx");

  assert.match(
    screen,
    /const COMMISSION_DETAILS_BACKGROUND_REFRESH_MS = 60_000/,
  );
  assert.match(screen, /const loadRequestInFlightRef = useRef\(false\)/);
  assert.match(screen, /const detailsLoadedRef = useRef\(false\)/);
  assert.match(screen, /const detailsLastLoadedAtRef = useRef\(0\)/);
  assert.match(screen, /if \(loadRequestInFlightRef\.current\) return/);
  assert.match(
    screen,
    /mode: "initial" \| "refresh" \| "background" \| "mutation"/,
  );
  assert.match(
    screen,
    /Date\.now\(\) - detailsLastLoadedAtRef\.current >=/,
  );
  assert.match(screen, /void load\("background"\)/);
  assert.match(screen, /onRefresh=\{\(\) => void load\("refresh"\)\}/);
  assert.match(screen, /onPress=\{\(\) => void load\("refresh"\)\}/);
  assert.match(screen, /void load\("mutation"\)/);
  assert.doesNotMatch(screen, /load\((?:true|false)?\)/);
});

test("Phase 30.1G preserves commission evidence and submission workflow", () => {
  const screen = read("athoo-app/app/(provider)/pay-commission.tsx");

  assert.match(screen, /api\.getPaymentAccounts\(\)/);
  assert.match(screen, /api\.getMyPayments\(\)/);
  assert.match(screen, /uploadPickedImage/);
  assert.match(screen, /pickImageWithSourceChoice/);
  assert.match(screen, /screenshotUrl: screenshot/);
  assert.match(screen, /clientRequestId: requestIdRef\.current/);
  assert.match(screen, /api\.submitCommissionPayment/);
  assert.match(screen, /RefreshControl/);
  assert.match(screen, /Payment details unavailable/);
  assert.match(screen, /Retry/);
});