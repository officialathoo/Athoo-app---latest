import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyRefreshResponse, isAuthoritativeRefreshFailure } from "../../athoo-app/services/sessionRefreshPolicy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("only explicit refresh rejection invalidates a persisted session", () => {
  assert.equal(classifyRefreshResponse(200, true, true), "renewed");
  assert.equal(classifyRefreshResponse(200, true, false), "unavailable");
  assert.equal(classifyRefreshResponse(401, false, false), "rejected");
  assert.equal(classifyRefreshResponse(403, false, false), "rejected");
  assert.equal(classifyRefreshResponse(429, false, false), "unavailable");
  assert.equal(classifyRefreshResponse(503, false, false), "unavailable");
  assert.equal(isAuthoritativeRefreshFailure({ status: "rejected" }), true);
  assert.equal(isAuthoritativeRefreshFailure({ status: "missing" }), true);
  assert.equal(isAuthoritativeRefreshFailure({ status: "unavailable" }), false);
});

test("startup and biometric unlock can restore from the encrypted refresh credential", () => {
  const context = read("athoo-app/context/AuthContext.tsx");
  const api = read("athoo-app/services/api.ts");
  assert.match(context, /getRefreshToken\(\)/);
  assert.match(context, /restoreAccessToken\(\)/);
  assert.match(context, /restored\.status === "unavailable"/);
  assert.match(context, /SESSION_USER_CACHE_KEY/);
  assert.match(context, /await setSecureItem\(SESSION_USER_CACHE_KEY, JSON\.stringify\(hydrated\)\)/);
  assert.match(api, /code: "SESSION_REFRESH_UNAVAILABLE"/);
  assert.doesNotMatch(api, /catch \{\s*return null;\s*\}/);
});

test("login remains remembered by default without weakening explicit sign-out", () => {
  const login = read("athoo-app/app/auth/login.tsx");
  const context = read("athoo-app/context/AuthContext.tsx");
  assert.match(login, /useState\(true\)/);
  assert.match(context, /clearLocalSession\(true\)/);
  assert.match(context, /clearToken\(\)/);
});
