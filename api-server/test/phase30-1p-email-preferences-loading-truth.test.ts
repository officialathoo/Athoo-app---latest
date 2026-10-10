import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1P hides default email preferences until the real settings load", () => {
  const screen = read("athoo-app/app/email-preferences.tsx");

  assert.match(screen, /const \[loaded, setLoaded\] = useState\(false\)/);
  assert.match(screen, /const \[loadError, setLoadError\] = useState\(""\)/);
  assert.match(screen, /setLoaded\(true\)/);
  assert.match(screen, /loading && !loaded/);
  assert.match(screen, /email-preferences-loading/);
  assert.match(screen, /loaded \? \(/);
  assert.match(screen, /<View style=\{styles\.listCard\}>/);
});

test("Phase 30.1P provides truthful retry recovery for email preference load failures", () => {
  const screen = read("athoo-app/app/email-preferences.tsx");

  assert.match(screen, /setLoadError\(/);
  assert.match(screen, /Could not load settings/);
  assert.match(screen, /email-preferences-load-retry/);
  assert.match(screen, /onPress=\{\(\) => void load\(\)\}/);
  assert.doesNotMatch(
    screen,
    /Alert\.alert\(tr\("Could not load settings"\)/,
  );
});

test("Phase 30.1P preserves optimistic preference saving and email verification navigation", () => {
  const screen = read("athoo-app/app/email-preferences.tsx");

  assert.match(screen, /api\.updateEmailPreferences/);
  assert.match(screen, /setPreferences\(previous\)/);
  assert.match(screen, /savingKey === row\.key/);
  assert.match(screen, /\/auth\/email-verification/);
  assert.match(screen, /user\?\.emailVerified/);
  assert.match(screen, /OTP codes, password changes, suspicious sign-ins/);
});