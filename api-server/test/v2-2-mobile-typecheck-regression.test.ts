import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("broadcast API contract accepts the canonical verified location snapshot", () => {
  const api = read("athoo-app/services/api.ts");
  const start = api.indexOf("createBroadcastRequest(payload:");
  const end = api.indexOf("async uploadVideo", start);
  assert.ok(start >= 0 && end > start);
  const contract = api.slice(start, end);
  for (const field of [
    "locationCity: string",
    "locationArea: string",
    "locationCountryCode: string",
    "locationSource: string",
    "locationConfirmedAt: string",
  ]) {
    assert.match(contract, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("negotiation travelling-charge guidance has a declared React Native style", () => {
  const negotiation = read("athoo-app/app/(customer)/negotiate.tsx");
  assert.match(negotiation, /style=\{styles\.helperText\}/);
  assert.match(negotiation, /helperText:\s*\{/);
});

test("saved and recent location metadata are narrowed without optional-property union errors", () => {
  const picker = read("athoo-app/components/maps/LocationSearchPicker.tsx");
  assert.match(picker, /const savedSource = isSaved \? source as SavedLocationOption : null/);
  assert.match(picker, /const recentSource = isSaved \? null : source as RecentLocation/);
  assert.match(picker, /savedSource\?\.locationCity \|\| recentSource\?\.city/);
  assert.match(picker, /savedSource\?\.locationConfirmedAt \|\| recentSource\?\.confirmedAt/);
});
