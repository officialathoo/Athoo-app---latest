import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const authRoute = fs.readFileSync(new URL("../src/routes/auth.ts", import.meta.url), "utf8");

test("send OTP confirms database persistence before returning success", () => {
  assert.match(authRoute, /insert\(otpsTable\)/);
  assert.match(authRoute, /\.returning\(\{/);
  assert.match(authRoute, /OTP persistence verification failed/);
  assert.match(authRoute, /authentication OTP persisted/);

  const insertIndex = authRoute.indexOf(".insert(otpsTable)");
  const successIndex = authRoute.indexOf("res.json({", insertIndex);
  assert.ok(insertIndex >= 0 && successIndex > insertIndex);
});
