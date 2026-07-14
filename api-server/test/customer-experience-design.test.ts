import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("customer home uses a non-blocking skeleton instead of a full-screen loading overlay", () => {
  const home = read("athoo-app/app/(customer)/(tabs)/home.tsx");
  assert.match(home, /CustomerHomeSkeleton/);
  assert.doesNotMatch(home, /position:\s*["']absolute["'][\s\S]{0,180}homeLoading/);
});

test("service cards use the shared design system and accessibility labels", () => {
  const card = read("athoo-app/components/ui/ServiceCard.tsx");
  assert.match(card, /useTheme/);
  assert.match(card, /AppText/);
  assert.match(card, /accessibilityLabel/);
  assert.match(card, /accessibilityHint/);
});

test("shared customer states use theme-aware design components", () => {
  const states = read("athoo-app/components/ui/UiState.tsx");
  assert.match(states, /AppCard/);
  assert.match(states, /AppText/);
  assert.match(states, /useTheme/);
});
