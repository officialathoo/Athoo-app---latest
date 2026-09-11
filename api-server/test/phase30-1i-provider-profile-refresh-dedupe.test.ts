import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1I deduplicates provider profile focus refreshes", () => {
  const screen = read("athoo-app/app/(provider)/(tabs)/profile.tsx");

  assert.match(
    screen,
    /const PROVIDER_PROFILE_BACKGROUND_REFRESH_MS = 60_000/,
  );
  assert.match(screen, /const profileRefreshInFlightRef = useRef\(false\)/);
  assert.match(screen, /const profileLoadedRef = useRef\(false\)/);
  assert.match(screen, /const profileLastLoadedAtRef = useRef\(0\)/);
  assert.match(screen, /if \(profileRefreshInFlightRef\.current\) return/);
  assert.match(
    screen,
    /mode: "initial" \| "background" \| "event"/,
  );
  assert.match(
    screen,
    /Date\.now\(\) - profileLastLoadedAtRef\.current >=/,
  );
  assert.match(screen, /void refreshProfile\("initial"\)/);
  assert.match(screen, /void refreshProfile\("background"\)/);
  assert.doesNotMatch(
    screen,
    /refreshUser\(\)\.catch\(\(\) => \{\}\)/,
  );
});

test("Phase 30.1I preserves provider profile mutations and verified account actions", () => {
  const screen = read("athoo-app/app/(provider)/(tabs)/profile.tsx");
  const privacy = read("athoo-app/components/screens/PrivacySecurityScreen.tsx");
  const api = read("athoo-app/services/api.ts");

  assert.match(screen, /api\.updateAvailability\(val\)/);
  assert.match(screen, /updateUser\(\{ isAvailable: next \}\)/);
  assert.match(screen, /pickFromCamera/);
  assert.match(screen, /pickFromGallery/);
  assert.match(screen, /uploadPickedImage/);
  assert.match(screen, /updateUser\(\{ profileImage: objectPath \}\)/);
  assert.match(screen, /router\.push\("\/\(provider\)\/privacy"/);
  assert.match(privacy, /AccountActionVerificationModal/);
  assert.match(privacy, /api\.deactivateAccount\(credential\)/);
  assert.match(privacy, /api\.requestAccountDeletion\(credential\)/);
  assert.match(api, /deactivateAccount\(payload:/);
  assert.match(api, /requestAccountDeletion\(payload:/);
});