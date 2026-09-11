import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1M bounds provider broadcast polling to focused screen", () => {
  const screen = read("athoo-app/app/(provider)/broadcast-jobs.tsx");

  assert.match(screen, /const loadRequestInFlightRef = useRef\(false\)/);
  assert.match(screen, /const requestsLoadedRef = useRef\(false\)/);
  assert.match(screen, /if \(loadRequestInFlightRef\.current\) return/);
  assert.match(
    screen,
    /mode: "initial" \| "refresh" \| "silent" \| "mutation"/,
  );
  assert.match(screen, /useFocusEffect\(useCallback\(\(\) => \{/);
  assert.match(screen, /pollRef\.current = setInterval/);
  assert.match(screen, /\}, 5000\)/);
  assert.match(screen, /clearInterval\(pollRef\.current\)/);
  assert.match(screen, /pollRef\.current = null/);
  assert.doesNotMatch(
    screen,
    /useEffect\(\(\) => \{\s*pollRef\.current = setInterval/,
  );
});

test("Phase 30.1M keeps load failures distinct from no-open-jobs state", () => {
  const screen = read("athoo-app/app/(provider)/broadcast-jobs.tsx");

  assert.match(screen, /const \[loadError, setLoadError\] = useState\(""\)/);
  assert.match(screen, /Unable to load broadcast jobs/);
  assert.match(screen, /provider-broadcast-jobs-load-retry/);
  assert.match(screen, /requests\.length === 0 && !loadError/);
  assert.match(screen, /Refresh Failed/);
  assert.match(screen, /void load\("refresh"\)/);
});

test("Phase 30.1M preserves realtime and provider response workflows", () => {
  const screen = read("athoo-app/app/(provider)/broadcast-jobs.tsx");

  assert.match(screen, /realtime\.on/);
  assert.match(screen, /broadcast:new/);
  assert.match(screen, /broadcast:cancelled/);
  assert.match(screen, /broadcast:accepted/);
  assert.match(screen, /void load\("silent"\)/);
  assert.match(screen, /api\.respondToBroadcast/);
  assert.match(screen, /api\.withdrawBroadcastResponse/);
  assert.match(screen, /void load\("mutation"\)/);
  assert.match(screen, /RefreshControl/);
  assert.match(screen, /VideoPlayer/);
});