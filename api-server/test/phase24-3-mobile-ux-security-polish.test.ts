import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("biometric preference requires account confirmation and is persisted securely", () => {
  const auth = readRepo("api-server/src/routes/auth.ts");
  const biometric = readRepo("athoo-app/services/biometric.ts");
  const context = readRepo("athoo-app/context/AuthContext.tsx");

  assert.match(auth, /router\.post\("\/biometric-preference"/);
  assert.match(auth, /bcrypt\.compare\(password, user\.password\)/);
  assert.match(auth, /biometricEnabled: enabled/);
  assert.doesNotMatch(readRepo("api-server/src/routes/account.ts"), /typeof body\.biometricEnabled/);
  assert.match(context, /configureBiometricLogin/);
  assert.match(context, /setToken\(token, true\)/);
  assert.match(context, /setRefreshToken\(refreshToken, true\)/);
  assert.match(biometric, /setSecureItem\(BIOMETRIC_KEY/);
  assert.doesNotMatch(biometric, /from "@react-native-async-storage\/async-storage"/);
});

test("customer and provider security settings always expose the biometric control", () => {
  const customer = readRepo("athoo-app/app/(customer)/(tabs)/profile.tsx");
  const provider = readRepo("athoo-app/app/(provider)/(tabs)/profile.tsx");
  const setting = readRepo("athoo-app/components/security/BiometricLoginSetting.tsx");

  assert.match(customer, /<BiometricLoginSetting \/>/);
  assert.match(provider, /<BiometricLoginSetting \/>/);
  assert.doesNotMatch(customer, /biometricAvail\s*&&/);
  assert.doesNotMatch(provider, /biometricAvail\s*&&/);
  assert.match(setting, /Open Settings/);
  assert.match(setting, /Current password/);
});

test("password changes invalidate biometric login on the server", () => {
  const auth = readRepo("api-server/src/routes/auth.ts");
  const account = readRepo("api-server/src/routes/account.ts");

  assert.ok((auth.match(/password: hashed, biometricEnabled: false/g) || []).length >= 2);
  assert.ok((auth.match(/expoPushToken: null, biometricEnabled: false/g) || []).length >= 2);
  assert.match(account, /password: hashed, biometricEnabled: false/);
});

test("availability time selection uses a modal and rejects overlapping ranges", () => {
  const availability = readRepo("athoo-app/app/(provider)/availability.tsx");

  assert.match(availability, /<Modal/);
  assert.match(availability, /minutesFromMidnight\(day\.endTime\) <= minutesFromMidnight\(day\.startTime\)/);
  assert.match(availability, /selectorColumn: \{ flex: 1, minWidth: 0 \}/);
  assert.doesNotMatch(availability, /timeDropdown/);
});

test("bottom tabs reserve content height in addition to the device safe area", () => {
  for (const file of [
    "athoo-app/app/(customer)/(tabs)/_layout.tsx",
    "athoo-app/app/(provider)/(tabs)/_layout.tsx",
  ]) {
    const layout = readRepo(file);
    assert.match(layout, /Math\.max\(insets\.bottom/);
    assert.match(layout, /64 \+ safeBottom/);
    assert.match(layout, /tabBarItemStyle/);
    assert.match(layout, /minHeight: 54/);
  }
});

test("provider availability has responsive feedback and invoices contain no tax line", () => {
  const profile = readRepo("athoo-app/app/(provider)/(tabs)/profile.tsx");
  const invoice = readRepo("athoo-app/app/(customer)/invoices.tsx");

  assert.match(profile, /Animated\.spring\(availabilityProgress/);
  assert.match(profile, /styles\.availPulse/);
  assert.doesNotMatch(invoice, /Tax \(0%\)|GST|VAT/);
});
