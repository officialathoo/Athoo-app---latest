import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1F adds truthful approval loading and retry feedback", () => {
  const screen = read("athoo-app/app/(provider)/edit-profile.tsx");

  assert.match(screen, /useCallback, useEffect, useMemo, useRef, useState/);
  assert.match(screen, /ActivityIndicator/);
  assert.match(screen, /const \[approvalLoading, setApprovalLoading\] = useState\(true\)/);
  assert.match(screen, /const \[approvalError, setApprovalError\] = useState\(""\)/);
  assert.match(screen, /const approvalRequestInFlightRef = useRef\(false\)/);
  assert.match(screen, /if \(approvalRequestInFlightRef\.current\) return/);
  assert.match(screen, /mode: "initial" \| "refresh" \| "event"/);
  assert.match(screen, /loadApprovalStatus\("initial"\)/);
  assert.match(screen, /loadApprovalStatus\("event"\)/);
  assert.match(screen, /loadApprovalStatus\("refresh"\)/);
  assert.match(screen, /provider-profile-approval-retry/);
  assert.match(screen, /Loading pending service and rate requests/);
});

test("Phase 30.1F prevents unsafe saves while approval state is unknown", () => {
  const screen = read("athoo-app/app/(provider)/edit-profile.tsx");

  assert.match(
    screen,
    /const approvalUnavailable = approvalLoading \|\| Boolean\(approvalError\)/,
  );
  assert.match(screen, /disabled=\{saving \|\| approvalUnavailable\}/);
  assert.match(
    screen,
    /accessibilityState=\{\{ disabled: saving \|\| approvalUnavailable, busy: saving \|\| approvalLoading \}\}/,
  );
  assert.match(
    screen,
    /approvalLoading \? "Loading\.\.\." : saving \? "Saving\.\.\." : "Save"/,
  );
});

test("Phase 30.1F preserves provider profile update and approval workflows", () => {
  const screen = read("athoo-app/app/(provider)/edit-profile.tsx");

  assert.match(screen, /api\.getMyServiceRequests\(\)/);
  assert.match(screen, /api\.getMyRateRequests\(\)/);
  assert.match(screen, /api\.updateMe\(direct\)/);
  assert.match(screen, /api\.requestServiceAdd/);
  assert.match(screen, /api\.requestRateChange/);
  assert.match(screen, /await refreshUser\(\)/);
});