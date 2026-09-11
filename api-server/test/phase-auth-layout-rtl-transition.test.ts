import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("auth layout mirrors stack transition direction for RTL", () => {
  const layout = readRepo("athoo-app/app/auth/_layout.tsx");

  assert.match(layout, /useLang/);
  assert.match(layout, /direction === "rtl"/);
  assert.match(layout, /animation: isRtl \? "slide_from_left" : "slide_from_right"/);
});
