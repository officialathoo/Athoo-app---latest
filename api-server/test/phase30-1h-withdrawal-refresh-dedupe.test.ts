import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1H deduplicates withdrawal screen focus refreshes", () => {
  const screen = read("athoo-app/app/(provider)/withdrawal-requests.tsx");

  assert.match(
    screen,
    /const WITHDRAWALS_BACKGROUND_REFRESH_MS = 60_000/,
  );
  assert.match(screen, /const loadRequestInFlightRef = useRef\(false\)/);
  assert.match(screen, /const withdrawalsLoadedRef = useRef\(false\)/);
  assert.match(screen, /const withdrawalsLastLoadedAtRef = useRef\(0\)/);
  assert.match(screen, /if \(loadRequestInFlightRef\.current\) return/);
  assert.match(
    screen,
    /mode: "initial" \| "refresh" \| "retry" \| "background" \| "mutation"/,
  );
  assert.match(
    screen,
    /Date\.now\(\) - withdrawalsLastLoadedAtRef\.current >=/,
  );
  assert.match(screen, /void load\("background"\)/);
  assert.match(screen, /onRefresh=\{\(\) => void load\("refresh"\)\}/);
  assert.match(screen, /onPress=\{\(\) => void load\("retry"\)\}/);
  assert.match(screen, /void load\("mutation"\)/);
  assert.doesNotMatch(screen, /\bload\(\)/);
});

test("Phase 30.1H preserves withdrawal validation and idempotency", () => {
  const screen = read("athoo-app/app/(provider)/withdrawal-requests.tsx");

  assert.match(screen, /Minimum withdrawal amount is Rs\. 500/);
  assert.match(screen, /accountTitle\.trim\(\)/);
  assert.match(screen, /accountNumber\.trim\(\)/);
  assert.match(screen, /clientRequestId: requestIdRef\.current/);
  assert.match(screen, /api\.requestWithdrawal/);
  assert.match(screen, /api\.getMyWithdrawals/);
  assert.match(screen, /RefreshControl/);
  assert.match(screen, /Loading withdrawals/);
  assert.match(screen, /Retry/);
  assert.match(screen, /hasPending/);
});