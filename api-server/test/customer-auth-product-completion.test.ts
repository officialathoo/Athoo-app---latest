import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("production OTP delivery does not require the development code in the response", () => {
  const context = read("athoo-app/context/AuthContext.tsx");
  const login = read("athoo-app/app/auth/login.tsx");
  const register = read("athoo-app/app/auth/register.tsx");
  const providerRegister = read("athoo-app/app/auth/provider-register.tsx");
  const api = read("athoo-app/services/api.ts");

  assert.match(api, /code\?: string/);
  assert.doesNotMatch(context, /OTP code was not returned by the server/);
  assert.doesNotMatch(login, /!res\.code/);
  assert.doesNotMatch(register, /!res\.code/);
  assert.doesNotMatch(providerRegister, /!res\.code/);
  assert.match(login, /__DEV__ && res\.code/);
});

test("keep-me-signed-in controls both access and refresh credential persistence", () => {
  const api = read("athoo-app/services/api.ts");
  const context = read("athoo-app/context/AuthContext.tsx");

  assert.match(api, /setRefreshToken\(token: string \| null, remember = true\)/);
  assert.match(api, /if \(remember\) await setSecureItem\(TOKEN_KEY, token\)/);
  assert.match(api, /if \(remember\) await setSecureItem\(REFRESH_TOKEN_KEY, token\)/);
  assert.match(context, /setRefreshToken\(res\.refreshToken \|\| null, remember\)/);
});

test("forgot-password request does not reveal whether an account exists", () => {
  const authRoute = read("api-server/src/routes/auth.ts");
  assert.doesNotMatch(authRoute, /No account found with this email address/);
  assert.doesNotMatch(authRoute, /No account found with this phone number/);
  assert.match(authRoute, /If an account matches those details, a reset OTP has been sent/);
});
