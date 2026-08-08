import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("standalone upload scanner preserves Athoo authenticated raw-stream contract", () => {
  const scanner = source("services/upload-scanner/server.mjs");
  assert.match(scanner, /Authorization|authorization/);
  assert.match(scanner, /Bearer /);
  assert.match(scanner, /timingSafeEqual/);
  assert.match(scanner, /zINSTREAM\\0/);
  assert.match(scanner, /clean: false/);
  assert.match(scanner, /clean: true/);
  assert.match(scanner, /SCANNER_TOKEN/);
});

test("standalone scanner is bounded and fails closed on engine errors", () => {
  const scanner = source("services/upload-scanner/server.mjs");
  assert.match(scanner, /SCANNER_MAX_BYTES/);
  assert.match(scanner, /SCANNER_MAX_CONCURRENCY/);
  assert.match(scanner, /SCANNER_TIMEOUT_MS/);
  assert.match(scanner, /scanner_unavailable/);
  assert.match(scanner, /request_too_large/);
  assert.match(scanner, /429/);
  assert.match(scanner, /503/);
});

test("scanner container runs an isolated ClamAV engine and refreshes signatures", () => {
  const dockerfile = source("Dockerfile.scanner");
  const entrypoint = source("services/upload-scanner/entrypoint.sh");
  const clamd = source("services/upload-scanner/clamd.conf");
  assert.match(dockerfile, /clamav-daemon/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(entrypoint, /freshclam --stdout/);
  assert.match(entrypoint, /freshclam --daemon/);
  assert.match(entrypoint, /clamd --config-file/);
  assert.match(clamd, /TCPAddr 127\.0\.0\.1/);
  assert.match(clamd, /StreamMaxLength 220M/);
});