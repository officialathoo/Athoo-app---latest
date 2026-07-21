import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("incoming calls use realtime delivery with a conservative recovery poll", () => {
  const calls = read("athoo-app/context/CallContext.tsx");
  const api = read("athoo-app/services/api.ts");
  assert.match(calls, /message\.type === "call:incoming"/);
  assert.match(calls, /message\.type === "call:accepted"/);
  assert.match(calls, /setInterval\(checkIncoming, 30_000\)/);
  assert.doesNotMatch(calls, /setInterval\(checkIncoming, 2000\)/);
  assert.match(api, /\| "call:incoming"/);
});

test("chat polling pauses in background and prevents overlapping requests", () => {
  const chat = read("athoo-app/context/ChatContext.tsx");
  assert.match(chat, /AppState\.addEventListener\("change"/);
  assert.match(chat, /appStateRef\.current !== "active"/);
  assert.match(chat, /chatsInFlightRef/);
  assert.match(chat, /messagesInFlightRef/);
});

test("dark theme preserves semantic white branding text", () => {
  const theme = read("athoo-app/context/ThemeContext.tsx");
  assert.match(theme, /Colors\.white = theme\.colors\.white/);
  assert.doesNotMatch(theme, /Colors\.white = theme\.colors\.surface/);
});

test("authentication failures are converted to user-safe messages", () => {
  const auth = read("athoo-app/context/AuthContext.tsx");
  assert.match(auth, /apiErrorToMessage/);
  assert.match(auth, /We could not send the verification code/);
  assert.doesNotMatch(auth, /error: \(e as Error\)\?\.message \|\| "Failed to send OTP"/);
});

test("mobile query cache is offline-first and mutations do not retry blindly", () => {
  const layout = read("athoo-app/app/_layout.tsx");
  assert.match(layout, /networkMode: "offlineFirst"/);
  assert.match(layout, /mutations:[\s\S]*networkMode: "online"/);
  assert.match(layout, /retry: 0/);
});
