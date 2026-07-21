import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("Phase 28.3 synchronizes caller and receiver call timing from the server", () => {
  const calls = readRepo("athoo-app/context/CallContext.tsx");
  const backend = readRepo("api-server/src/routes/calls.ts");

  assert.match(backend, /status: "active"[\s\S]{0,100}startedAt/);
  assert.match(backend, /emitToUser\(updatedCall\.callerId, "call:accepted"/);
  assert.match(calls, /message\.type === "call:accepted"/);
  assert.match(calls, /callStartedAtMs\(callData\.startedAt/);
  assert.match(calls, /Date\.now\(\) - startedAt/);
  assert.match(calls, /}, 1_000\);/);
});

test("Phase 28.3 proves secure transport in the live call UI", () => {
  const context = readRepo("athoo-app/context/CallContext.tsx");
  const screen = readRepo("athoo-app/app/call.tsx");

  assert.match(context, /configuredCallProviderRef\.current === "cloudflare-turn"/);
  assert.match(context, /Cloudflare TURN ready/);
  assert.match(context, /Cloudflare TURN relay verified/);
  assert.match(context, /iceTransportPolicy/);
  assert.match(screen, /mediaState/);
  assert.match(screen, /transportLabel/);
  assert.match(screen, /Preparing secure audio/);
});

test("Phase 28.3 uses one curved logo surface and compact professional auth choices", () => {
  const welcome = readRepo("athoo-app/app/auth/welcome.tsx");
  const chooser = readRepo("athoo-app/app/auth/choose-role.tsx");
  const loader = readRepo("athoo-app/components/ui/AthooLoader.tsx");

  assert.match(welcome, /resizeMode="cover"/);
  assert.match(welcome, /logoImage: \{ width: "100%", height: "100%", borderRadius: 29 \}/);
  assert.match(welcome, /primaryAction:[\s\S]*minHeight: 62/);
  assert.match(chooser, /roleCard:[\s\S]*minHeight: 94/);
  assert.match(chooser, /numberOfLines=\{1\}>Service Provider/);
  assert.doesNotMatch(chooser, /borderColor: theme\.colors\.secondary \}, pressed/);
  assert.match(loader, /resizeMode="cover"/);
  assert.match(loader, /logo: \{ width: "100%", height: "100%", borderRadius: 27 \}/);
});
