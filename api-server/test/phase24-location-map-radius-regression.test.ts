import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("public settings expose the credential-free map tile proxy", () => {
  const settingsRoute = read("api-server/src/routes/index.ts");
  const mobileSettings = read("athoo-app/context/SettingsContext.tsx");
  assert.match(settingsRoute, /tileUrl: mapStatus\.configured \? `\/api\/geo\/tiles\/\{z\}\/\{x\}\/\{y\}\.png\?v=\$\{publicMapTileVersion\}`/);
  assert.match(mobileSettings, /candidate\.startsWith\("\/"\) && api\.baseUrl/);
});

test("provider foreground location is persisted through a dedicated API workflow", () => {
  const providers = read("api-server/src/routes/providers.ts");
  const mobileApi = read("athoo-app/services/api.ts");
  const auth = read("athoo-app/context/AuthContext.tsx");
  assert.match(providers, /router\.patch\("\/location"/);
  assert.match(providers, /latitude: String\(latitude\)/);
  assert.match(mobileApi, /updateProviderLocation/);
  assert.match(auth, /syncProviderLocation/);
  assert.match(auth, /state !== "active"/);
});

test("provider service radius uses a persisted provider endpoint instead of forbidden profile mutation", () => {
  const providers = read("api-server/src/routes/providers.ts");
  const radiusScreen = read("athoo-app/app/(provider)/service-radius.tsx");
  assert.match(providers, /router\.patch\("\/service-radius"/);
  assert.match(providers, /validateTravelRadius/);
  assert.match(radiusScreen, /api\.getServiceRadius\(\)/);
  assert.match(radiusScreen, /api\.updateServiceRadius\(selected\)/);
  assert.doesNotMatch(radiusScreen, /updateUser\(\{ maxTravelDistanceKm/);
});
