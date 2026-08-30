import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30 recovers the complete previous backlog without false release claims", () => {
  const tracker = JSON.parse(
    read("docs/qa/phase30-backlog-tracker.json"),
  );

  const audit = read(
    "docs/archive/development-history/ATHOO_PHASE30_BACKLOG_RECOVERY_AUDIT.md",
  );

  assert.equal(tracker.schemaVersion, 1);
  assert.equal(tracker.phase, "30");

  assert.equal(
    tracker.baseline.commit,
    "a5d60bc566f3870dada8b9d4c7e6fe440d9835f9",
  );

  assert.equal(tracker.baseline.nativeRuntime, "1.1.0");
  assert.equal(tracker.baseline.legacyRuntime, "1.0.0");
  assert.equal(tracker.policies.payments, "manual-only");

  assert.match(
    tracker.launchDecision,
    /^NO-GO-/,
  );

  assert.equal(
    tracker.nextAction,
    "phase30-1-performance-loading-and-shared-design-audit",
  );

  const workstreams = new Map(
    tracker.workstreams.map(
      (item: { id: string; status: string }) => [item.id, item.status],
    ),
  );

  assert.equal(
    workstreams.get("P30-02"),
    "source-implemented-device-verification-pending",
  );

  assert.equal(
    workstreams.get("P30-03"),
    "source-implemented-new-native-build-and-device-verification-pending",
  );

  assert.equal(
    workstreams.get("P30-13"),
    "new-builds-and-device-evidence-pending",
  );

  assert.match(audit, /Payment policy: manual only/);
  assert.match(audit, /No live payment gateway is approved/);
  assert.match(audit, /Performance, loading feedback and shared design foundation/);
  assert.match(audit, /Android\/iPhone builds and physical certification/);
  assert.match(audit, /NO-GO-PENDING-PRODUCT-CONNECTED-AND-DEVICE-CERTIFICATION/);
  assert.doesNotMatch(audit, /production[- ]ready|fully certified|launch approved/i);
});