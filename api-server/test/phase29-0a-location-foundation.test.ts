import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 29.0A location foundation uses stable navigation GPS without H-8 or coordinate mixing", () => {
  const location = read("athoo-app/services/location.ts");
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");
  const fallback = read("athoo-app/components/maps/AthooMapFallback.tsx");

  assert.match(location, /Location\.Accuracy\.BestForNavigation/);
  assert.match(location, /minimumFreshSamples\?: number/);
  assert.match(location, /maximumAcceptedAccuracy\?: number/);
  assert.match(location, /acceptableSamples >= minimumFreshSamples/);
  assert.match(search, /freshAccuracy: "navigation"/);
  assert.match(search, /preferFresh: true/);
  assert.match(search, /requireFresh: true/);
  assert.match(search, /minimumFreshSamples: 2/);
  assert.match(search, /maximumAcceptedAccuracy: 80/);
  assert.match(search, /finally \{\s*setLocating\(false\)/);
  assert.match(search, /setLocationAccuracyMeters\(result\.location\.accuracy\)/);
  assert.doesNotMatch(search, /33\.6844|73\.0479|H-?8/i);

  const focusProvider = search.match(/const focusProvider =[\s\S]*?\n  };/)?.[0] || "";
  assert.doesNotMatch(focusProvider, /setPickedLocation/);
  assert.match(fallback, /markers=\{coordinate \? \[/);
});
test("Phase 29.0A uses authoritative current chat identities", () => {
  const eventBus = read("api-server/src/lib/eventBus.ts");
  const route = read("api-server/src/routes/chat.ts");
  const context = read("athoo-app/context/ChatContext.tsx");
  const admin = read("api-server/src/routes/admin.ts");

  assert.match(eventBus, /\| "profile:updated"/);
  assert.match(route, /async function hydrateChatParticipants/);
  assert.match(route, /const hydratedChats = await hydrateChatParticipants\(visibleChats\)/);
  assert.match(route, /const \[currentSender\] = await db/);
  assert.match(route, /participant1Name: senderName/);
  assert.match(route, /participant2Name: senderName/);
  assert.match(context, /msg\.type === "profile:updated"/);
  assert.match(context, /participant1Name: profile\.name/);
  assert.match(context, /participant2Name: profile\.name/);
  assert.match(admin, /async function propagateChatProfileIdentity/);
  assert.match(admin, /emitToUsers\(\[\.\.\.recipients\], "profile:updated"/);
  assert.match(admin, /propagateChatProfileIdentity\(customer\.id, name\)/);
  assert.match(admin, /propagateChatProfileIdentity\(providerId, updated\.name\)/);
  assert.match(admin, /\.limit\(5_000\)/);
});
