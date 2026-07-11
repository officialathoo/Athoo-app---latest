import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("mobile design tokens define consistent semantic scales", () => {
  const tokens = read("athoo-app/design/tokens.ts");
  assert.match(tokens, /export const spacing/);
  assert.match(tokens, /export const radius/);
  assert.match(tokens, /export const typography/);
  assert.match(tokens, /export const shadows/);
  assert.match(tokens, /export const motion/);
});

test("mobile theme includes light and dark semantic palettes", () => {
  const theme = read("athoo-app/design/theme.ts");
  assert.match(theme, /export const lightTheme/);
  assert.match(theme, /export const darkTheme/);
  assert.match(theme, /background:/);
  assert.match(theme, /surface:/);
  assert.match(theme, /textSecondary:/);
  assert.match(theme, /successSoft:/);
});

test("root layout wires the theme provider before application content", () => {
  const root = read("athoo-app/app/_layout.tsx");
  assert.match(root, /<ThemeProvider>/);
  assert.match(root, /<ApiConfigurationScreen \/>/);
});

test("shared design components and themed button remain reusable", () => {
  const barrel = read("athoo-app/components/design/index.ts");
  const button = read("athoo-app/components/ui/Button.tsx");
  assert.match(barrel, /AppCard/);
  assert.match(barrel, /AppInput/);
  assert.match(barrel, /AppText/);
  assert.match(barrel, /Skeleton/);
  assert.match(button, /useTheme/);
  assert.match(button, /accessibilityState/);
});
