import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

test("RC2 design foundation keeps shared controls theme-driven", () => {
  const input = read("athoo-app/components/design/AppInput.tsx");
  const button = read("athoo-app/components/ui/Button.tsx");
  const uiState = read("athoo-app/components/ui/UiState.tsx");
  assert.match(input, /theme\.colors\.input/);
  assert.match(input, /theme\.spacing\.lg/);
  assert.match(button, /theme\.typography\.label/);
  assert.match(uiState, /<Button title="Try Again"/);
});

test("customer and provider tabs use the active theme", () => {
  const customer = read("athoo-app/app/(customer)/(tabs)/_layout.tsx");
  const provider = read("athoo-app/app/(provider)/(tabs)/_layout.tsx");
  for (const source of [customer, provider]) {
    assert.match(source, /useTheme/);
    assert.match(source, /theme\.colors\.surface/);
    assert.match(source, /theme\.colors\.divider/);
    assert.doesNotMatch(source, /Colors\.white/);
  }
});

test("design tokens expose standardized icon sizes", () => {
  const tokens = read("athoo-app/design/tokens.ts");
  const theme = read("athoo-app/design/theme.ts");
  assert.match(tokens, /export const iconSize/);
  assert.match(theme, /iconSize: typeof iconSize/);
});
