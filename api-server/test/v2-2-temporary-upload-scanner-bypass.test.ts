import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveUploadScannerMode,
  uploadScannerTemporaryBypassEnabled,
} from "../src/lib/uploadScannerMode.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

const read = (relative: string) =>
  fs.readFileSync(
    path.join(root, relative),
    "utf8",
  );

test(
  "temporary scanner bypass is explicit and reversible",
  () => {
    const secureProduction = {
      NODE_ENV: "production",
      UPLOAD_SCAN_MODE: "required",
    } as NodeJS.ProcessEnv;

    assert.equal(
      uploadScannerTemporaryBypassEnabled(
        secureProduction,
      ),
      false,
    );

    assert.equal(
      resolveUploadScannerMode(secureProduction),
      "required",
    );

    const temporaryBypass = {
      ...secureProduction,
      UPLOAD_SCANNER_TEMPORARY_BYPASS: "true",
    } as NodeJS.ProcessEnv;

    assert.equal(
      uploadScannerTemporaryBypassEnabled(
        temporaryBypass,
      ),
      true,
    );

    assert.equal(
      resolveUploadScannerMode(temporaryBypass),
      "signature-only",
    );

    const restored = {
      ...secureProduction,
      UPLOAD_SCANNER_TEMPORARY_BYPASS: "false",
    } as NodeJS.ProcessEnv;

    assert.equal(
      resolveUploadScannerMode(restored),
      "required",
    );

    assert.equal(
      resolveUploadScannerMode({
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv),
      "signature-only",
    );
  },
);

test(
  "temporary bypass remains visible and certification-blocking",
  () => {
    const helper = read(
      "api-server/src/lib/uploadScannerMode.ts",
    );

    const scanner = read(
      "api-server/src/lib/uploadScanner.ts",
    );

    const validation = read(
      "scripts/tools/validate-environment.mjs",
    );

    const example = read(
      ".env.production.example",
    );

    const blueprint = read(
      "render.yaml",
    );

    assert.match(
      helper,
      /UPLOAD_SCANNER_TEMPORARY_BYPASS/,
    );

    assert.match(
      helper,
      /return "signature-only"/,
    );

    assert.match(
      scanner,
      /resolveUploadScannerMode/,
    );

    assert.match(
      scanner,
      /signature-only-v1/,
    );

    assert.match(
      scanner,
      /productionSafe:[\s\S]*!temporaryBypass/,
    );

    assert.match(
      validation,
      /external malware scanning is temporarily disabled; production certification remains blocked/,
    );

    assert.match(
      example,
      /UPLOAD_SCANNER_TEMPORARY_BYPASS=false/,
    );

    assert.match(
      blueprint,
      /key: UPLOAD_SCANNER_TEMPORARY_BYPASS[\s\S]*value: "false"/,
    );
  },
);
