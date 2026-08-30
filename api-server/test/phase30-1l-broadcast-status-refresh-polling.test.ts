import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1L bounds broadcast polling to the focused open request", () => {
  const screen = read("athoo-app/app/(customer)/broadcast-status.tsx");

  assert.match(screen, /const requestInFlightRef = useRef\(false\)/);
  assert.match(screen, /const requestLoadedRef = useRef\(false\)/);
  assert.match(screen, /const requestStatusRef = useRef<string \| null>\(null\)/);
  assert.match(screen, /if \(!requestId \|\| requestInFlightRef\.current\) return/);
  assert.match(screen, /mode: "initial" \| "refresh" \| "silent"/);
  assert.match(screen, /requestStatusRef\.current === "open"/);
  assert.match(screen, /setInterval\(\(\) => \{/);
  assert.match(screen, /\}, 5000\)/);
  assert.match(screen, /clearInterval\(pollRef\.current\)/);
  assert.match(screen, /pollRef\.current = null/);
  assert.doesNotMatch(screen, /useEffect\(\(\) => \{\s*pollRef\.current = setInterval/);
});

test("Phase 30.1L separates load failures from genuine request-not-found", () => {
  const screen = read("athoo-app/app/(customer)/broadcast-status.tsx");

  assert.match(screen, /const \[loadError, setLoadError\] = useState\(""\)/);
  assert.match(screen, /Unable to load broadcast/);
  assert.match(screen, /broadcast-status-load-retry/);
  assert.match(screen, /void load\("refresh"\)/);
  assert.match(screen, /"Request not found"/);
});

test("Phase 30.1L preserves realtime, selection and cancellation workflows", () => {
  const screen = read("athoo-app/app/(customer)/broadcast-status.tsx");

  assert.match(screen, /realtime\.on/);
  assert.match(screen, /broadcast:response/);
  assert.match(screen, /broadcast:accepted/);
  assert.match(screen, /broadcast:cancelled/);
  assert.match(screen, /void load\("silent"\)/);
  assert.match(screen, /api\.selectBroadcastResponse/);
  assert.match(screen, /api\.cancelBroadcastRequest/);
  assert.match(screen, /requestStatusRef\.current = "accepted"/);
  assert.match(screen, /requestStatusRef\.current = "cancelled"/);
  assert.match(screen, /RefreshControl/);
});