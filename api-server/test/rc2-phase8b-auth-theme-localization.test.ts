import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const authScreens = [
  "athoo-app/app/auth/login.tsx",
  "athoo-app/app/auth/register.tsx",
  "athoo-app/app/auth/forgot-password.tsx",
  "athoo-app/app/auth/provider-register.tsx",
];

test("all authentication screens use the active theme and language context", () => {
  for (const file of authScreens) {
    const source = read(file);
    assert.match(source, /useTheme/);
    assert.match(source, /useLang/);
    assert.doesNotMatch(source, /@\/constants\/colors/);
    assert.doesNotMatch(source, /\bColors\./);
  }
});

test("auth screens use semantic theme colors instead of fixed light surfaces", () => {
  const login = read(authScreens[0]);
  const register = read(authScreens[1]);
  const forgot = read(authScreens[2]);
  const provider = read(authScreens[3]);
  for (const source of [login, register, forgot, provider]) {
    assert.match(source, /theme\.colors\.background/);
    assert.match(source, /theme\.colors\.surface/);
    assert.match(source, /localizedText/);
  }
  assert.match(provider, /theme\.colors\.warningSoft/);
  assert.match(provider, /theme\.colors\.infoSoft/);
});

test("incremental translation helper supports Urdu parameters and safe English fallback", () => {
  const source = read("athoo-app/context/LanguageContext.tsx");
  assert.match(source, /translate: \(message: string/);
  assert.match(source, /UR_MESSAGES\[message\] \?\? message/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call/);
  assert.match(source, /"Provider Registration": "فراہم کنندہ رجسٹریشن"/);
  assert.match(source, /"OTP code: \{\{code\}\}": "OTP کوڈ: \{\{code\}\}"/);
});

test("provider onboarding keeps canonical document labels for persisted records", () => {
  const source = read("athoo-app/app/auth/provider-register.tsx");
  assert.match(source, /cnic_front: "CNIC Front"/);
  assert.match(source, /police: "Police Verification Letter"/);
  assert.match(source, /docItems = useMemo/);
  assert.match(source, /label: tr\(item\.label\)/);
});

test("auth stack and provider tabs follow theme and localized navigation", () => {
  const authLayout = read("athoo-app/app/auth/_layout.tsx");
  const providerTabs = read("athoo-app/app/(provider)/(tabs)/_layout.tsx");
  assert.match(authLayout, /contentStyle: \{ backgroundColor: theme\.colors\.background \}/);
  assert.match(providerTabs, /title: t\.earnings/);
  assert.doesNotMatch(providerTabs, /title: "Earnings"/);
});
