import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("customer completed booking exposes after-service actions", () => {
  const screen = read("athoo-app/app/(customer)/booking-detail.tsx");
  const component = read("athoo-app/components/design/PostServiceCare.tsx");
  assert.match(screen, /PostServiceCare/);
  assert.match(component, /customer-post-service-care/);
  assert.match(component, /View invoice/);
  assert.match(component, /Book again/);
  assert.match(component, /Get support/);
});

test("provider completed job shows outcome and review readiness", () => {
  const screen = read("athoo-app/app/(provider)/job-detail.tsx");
  const component = read("athoo-app/components/design/ProviderCompletionSummary.tsx");
  assert.match(screen, /ProviderCompletionSummary/);
  assert.match(component, /provider-completion-summary/);
  assert.match(component, /Awaiting review/);
});

test("admin support cases require booking context awareness", () => {
  const page = read("admin-panel/src/pages/ComplaintsPage.tsx");
  assert.match(page, /admin-support-booking-context/);
  assert.match(page, /admin-support-no-booking-context/);
  assert.match(page, /booking timeline, chat history, payment state/);
});
