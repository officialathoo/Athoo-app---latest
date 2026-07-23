import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1K adds truthful verification loading and retry feedback", () => {
  const screen = read("athoo-app/app/(provider)/verification-documents.tsx");

  assert.match(screen, /useCallback, useMemo, useRef, useState/);
  assert.match(screen, /const \[loadError, setLoadError\] = useState\(""\)/);
  assert.match(screen, /Loading verification documents and review status/);
  assert.match(screen, /provider-verification-load-retry/);
  assert.match(screen, /loadError && !documentsLoadedRef\.current/);
  assert.match(screen, /loadError && documentsLoadedRef\.current/);
});

test("Phase 30.1K deduplicates verification focus refreshes", () => {
  const screen = read("athoo-app/app/(provider)/verification-documents.tsx");

  assert.match(
    screen,
    /const VERIFICATION_DOCUMENTS_BACKGROUND_REFRESH_MS = 60_000/,
  );
  assert.match(screen, /const loadRequestInFlightRef = useRef\(false\)/);
  assert.match(screen, /const documentsLoadedRef = useRef\(false\)/);
  assert.match(screen, /const documentsLastLoadedAtRef = useRef\(0\)/);
  assert.match(screen, /if \(loadRequestInFlightRef\.current\) return/);
  assert.match(
    screen,
    /mode: "initial" \| "refresh" \| "background" \| "mutation"/,
  );
  assert.match(
    screen,
    /Date\.now\(\) - documentsLastLoadedAtRef\.current >=/,
  );
  assert.match(screen, /void load\("initial"\)/);
  assert.match(screen, /void load\("background"\)/);
  assert.match(screen, /void load\("refresh"\)/);
  assert.match(screen, /await load\("mutation"\)/);
  assert.doesNotMatch(screen, /\bload\(\)/);
});

test("Phase 30.1K preserves verification media and renewal workflows", () => {
  const screen = read("athoo-app/app/(provider)/verification-documents.tsx");

  assert.match(screen, /requestCameraPermissionsAsync/);
  assert.match(screen, /requestMediaLibraryPermissionsAsync/);
  assert.match(screen, /launchCameraAsync/);
  assert.match(screen, /launchImageLibraryAsync/);
  assert.match(screen, /uploadPickedImage/);
  assert.match(screen, /api\.createDocumentRenewal/);
  assert.match(screen, /api\.postDocument/);
  assert.match(screen, /api\.cancelDocumentRenewal/);
  assert.match(screen, /refreshUser\(\)\.catch/);
});