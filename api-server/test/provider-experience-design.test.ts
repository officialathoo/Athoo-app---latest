import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("provider jobs use theme-aware metric cards", () => {
  const jobs = read("athoo-app/app/(provider)/(tabs)/jobs.tsx");
  assert.match(jobs, /ProviderMetricCard/);
  assert.match(jobs, /useTheme/);
  assert.match(jobs, /provider-jobs-completed/);
});

test("provider jobs show progressive loading instead of a blank list", () => {
  const jobs = read("athoo-app/app/(provider)/(tabs)/jobs.tsx");
  const skeleton = read("athoo-app/components/design/ProviderJobsSkeleton.tsx");
  assert.match(jobs, /ProviderJobsSkeleton/);
  assert.match(skeleton, /accessibilityRole="progressbar"/);
  assert.match(skeleton, /AppCard/);
});

test("provider job empty states use the shared design system", () => {
  const jobs = read("athoo-app/app/(provider)/(tabs)/jobs.tsx");
  assert.match(jobs, /EmptyView/);
  assert.doesNotMatch(jobs, /<View style=\{styles\.empty\}>/);
});
