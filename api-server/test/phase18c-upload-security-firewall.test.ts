import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activeContentPatternsFor, detectUploadContentType, uploadContentTypeMatches } from "../src/lib/uploadContentPolicy.ts";
import { LocalStorageProvider } from "../src/lib/storageProvider.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("magic-byte detection rejects executable files renamed as allowed media", () => {
  const executable = Buffer.from("MZThis is not a JPEG even when named photo.jpg");
  assert.equal(detectUploadContentType(executable), null);
  assert.equal(uploadContentTypeMatches("image/jpeg", detectUploadContentType(executable)), false);
});

test("stream policy rejects script/polyglot markers inside image bytes", () => {
  const polyglot = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("harmless metadata <?php system($_GET[x]); ?>")]);
  assert.equal(detectUploadContentType(polyglot), "image/jpeg");
  assert.equal(activeContentPatternsFor("image/jpeg").some((pattern) => pattern.test(polyglot.toString("latin1"))), true);
});

test("active PDF actions are rejected and safe allowed signatures are recognized", () => {
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj << /OpenAction 2 0 R /JavaScript (alert) >>\n%%EOF");
  assert.equal(detectUploadContentType(pdf), "application/pdf");
  assert.equal(activeContentPatternsFor("application/pdf").some((pattern) => pattern.test(pdf.toString("latin1"))), true);
  assert.equal(detectUploadContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(uploadContentTypeMatches("video/x-m4v", "video/mp4"), true);
});

test("ISO base-media detection rejects HEIC, AVIF, audio and 3GP renamed as MP4", () => {
  const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.from(brand), Buffer.alloc(12)]);
  assert.equal(detectUploadContentType(ftyp("mp42")), "video/mp4");
  assert.equal(detectUploadContentType(ftyp("isom")), "video/mp4");
  assert.equal(detectUploadContentType(ftyp("qt  ")), "video/quicktime");
  for (const brand of ["heic", "avif", "M4A ", "3gp4", "mif1", "zzzz"]) {
    assert.equal(detectUploadContentType(ftyp(brand)), null, `${brand} must not be accepted as MP4`);
  }
});

test("database migration and storage routes enforce quarantine before serving", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const migration = read("deploy/migrations/20260801_upload_security_firewall.sql");
  const latest = read("lib/db/src/migrations.ts");
  const route = read("api-server/src/routes/storage.ts");
  const verified = read("api-server/src/lib/verifiedUploads.ts");
  const integrity = read("scripts/src/db-integrity.ts");
  const maintenance = read("api-server/src/lib/uploadSecurityMaintenance.ts");
  const storageSecurity = read("api-server/src/lib/storageSecurity.ts");
  const provider = read("api-server/src/lib/storageProvider.ts");
  const mobile = read("athoo-app/services/storage.ts");

  assert.match(schema, /uploadSecurityRecordsTable/);
  assert.match(migration, /upload_security_status_check/);
  assert.match(migration, /upload_security_distinct_paths_check/);
  assert.match(migration, /upload_security_path_boundaries_check/);
  assert.match(migration, /quarantine_deleted_at/);
  assert.match(migration, /scan_status IN \('pending', 'scanning', 'clean', 'rejected', 'error', 'expired'\)/);
  assert.match(latest, /20260802_athoo_v2_location_pagination_integrity\.sql/);
  assert.match(route, /scanStoredUpload/);
  assert.match(route, /UPLOAD_SCAN_UNAVAILABLE/);
  assert.match(route, /isUploadReadyForServing/);
  assert.match(route, /Direct redirects are disabled for uploaded files/);
  assert.match(verified, /eq\(uploadSecurityRecordsTable\.scanStatus, "clean"\)/);
  assert.match(verified, /!\["production", "staging"\]\.includes\(runtime\)/);
  assert.match(integrity, /clean_uploads_missing_security_evidence/);
  assert.match(integrity, /stale_upload_security_scans/);
  assert.match(integrity, /unsafe_upload_path_boundaries/);
  assert.match(integrity, /expired_upload_quarantine_not_cleaned/);
  assert.match(maintenance, /scanStatus: "expired"/);
  assert.match(maintenance, /provider\.deleteObject\(candidate\.quarantinePath\)/);
  assert.match(maintenance, /provider\.deleteObject\(candidate\.scanPath\)/);
  assert.match(maintenance, /UPLOAD_SECURITY_RECORD_RETENTION_DAYS/);
  assert.match(storageSecurity, /uploads\/quarantine\/incoming/);
  assert.match(storageSecurity, /uploads\/quarantine\/locked/);
  assert.match(provider, /copyObject\(sourceKeyOrObjectPath/);
  assert.match(route, /Snapshot the client-writable object into a server-only path first/);
  assert.match(route, /provider\.copyObject\(record\.quarantinePath/);
  assert.match(route, /provider\.getObject\(record\.scanPath\)/);
  assert.match(route, /provider\.copyObject\(record\.scanPath/);
  assert.ok(route.indexOf("provider.getObject(record.scanPath)") < route.indexOf("const finalized"));
  assert.ok(route.indexOf("provider.copyObject(record.scanPath") < route.indexOf("const finalized"));
  assert.match(mobile, /return confirmed\.objectPath/);
  assert.match(mobile, /cannot use Athoo file security scanning/);
});

test("all current media persistence paths require a clean owner-bound record", () => {
  for (const route of ["account", "auth", "me", "refunds", "payments", "subscriptions", "support", "chat", "bookings", "broadcast"]) {
    const source = read(`api-server/src/routes/${route}.ts`);
    assert.match(source, /isCleanOwnedUploadObjectPath|validateCleanOwnedUploadObjectPaths/, `${route} must verify clean uploads`);
  }
});

test("production configuration fails closed without an authenticated HTTPS scanner", () => {
  const validation = read("scripts/tools/validate-environment.mjs");
  const readiness = read("api-server/src/lib/productionReadiness.ts");
  const example = read(".env.production.example");
  const app = read("api-server/src/app.ts");

  assert.match(validation, /UPLOAD_SCAN_MODE=required is mandatory/);
  assert.match(validation, /UPLOAD_SCANNER_URL must be an HTTPS URL/);
  assert.match(validation, /UPLOAD_LEGACY_READ_POLICY=deny is mandatory/);
  assert.match(readiness, /Malware scanning is not production-ready/);
  assert.match(example, /UPLOAD_SCAN_MODE=required/);
  assert.match(example, /UPLOAD_LEGACY_READ_POLICY=deny/);
  assert.match(app, /sensitiveAccountKey\("upload-security", req\)/);
  const blueprint = read("render.yaml");
  assert.match(blueprint, /startCommand: pnpm env:validate -- --process && pnpm db:migrate/);
  assert.match(blueprint, /healthCheckPath: \/api\/healthz\/deep/);
  for (const key of ["UPLOAD_SCAN_MODE", "UPLOAD_SCANNER_URL", "UPLOAD_SCANNER_TOKEN", "UPLOAD_LEGACY_READ_POLICY"]) {
    assert.match(blueprint, new RegExp(`key: ${key}`));
  }
});

test("connected scanner certification requires a clean probe pass and EICAR rejection", () => {
  const scanner = read("api-server/src/lib/uploadScanner.ts");
  const admin = read("api-server/src/routes/admin.ts");
  const verifier = read("scripts/tools/connected-runtime-verify.mjs");
  assert.match(scanner, /testConfiguredUploadScanner/);
  assert.match(scanner, /EICAR-/);
  assert.match(scanner, /STANDARD-ANTIVIRUS-TEST-FILE/);
  assert.match(scanner, /String\.fromCharCode\(92\)/);
  assert.match(scanner, /cleanProbeAccepted/);
  assert.match(scanner, /eicarProbeRejected/);
  assert.match(admin, /settings\/integrations\/upload-scanner\/test/);
  assert.match(verifier, /cleanProbeAccepted === true/);
  assert.match(verifier, /eicarProbeRejected === true/);
});

test("local provider keeps locked snapshots private, blocks traversal, and deletes sidecar metadata", async () => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "athoo-upload-security-"));
  const previousRoot = process.env.LOCAL_STORAGE_DIR;
  const previousRuntime = process.env.NODE_ENV;
  process.env.LOCAL_STORAGE_DIR = rootPath;
  process.env.NODE_ENV = "test";
  try {
    const provider = new LocalStorageProvider();
    const incomingKey = "uploads/quarantine/incoming/user-1/2026-08-01/id-photo.jpg";
    const scanKey = "uploads/quarantine/locked/user-1/2026-08-01/id-photo.jpg";
    await provider.uploadFile({ key: incomingKey, body: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), contentType: "image/jpeg" });
    const locked = await provider.copyObject(incomingKey, { key: scanKey, contentType: "image/jpeg" });
    assert.equal((await provider.statObject(locked.objectPath)).contentLength, 4);
    await provider.deleteObject(locked.objectPath);
    assert.equal(fs.existsSync(path.join(rootPath, `${scanKey}.meta.json`)), false);
    await assert.rejects(
      provider.uploadFile({ key: "uploads/quarantine/incoming/user-1/../../../../../../escape.jpg", body: Buffer.from("unsafe") }),
      /Invalid storage path/,
    );
  } finally {
    if (previousRoot === undefined) delete process.env.LOCAL_STORAGE_DIR;
    else process.env.LOCAL_STORAGE_DIR = previousRoot;
    if (previousRuntime === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousRuntime;
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});

test("shared upload reads require entity authorization instead of URL possession", () => {
  const route = read("api-server/src/routes/storage.ts");
  const authorization = read("api-server/src/lib/storageObjectAuthorization.ts");
  assert.match(route, /canReadStoredUploadObject/);
  assert.doesNotMatch(route, /canReadStorageKey/);
  assert.match(authorization, /Unknown shared upload references fail closed/);
  assert.match(authorization, /securityRecord\.ownerId === user\.userId/);
  assert.match(authorization, /securityRecord\.scope !== "shared"/);
  assert.match(authorization, /bookingsTable\.customerId/);
  assert.match(authorization, /chatsTable\.participant1Id/);
  assert.match(authorization, /negotiationMessagesContainPath/);
  assert.match(authorization, /return false;\s*\n}/);
});
