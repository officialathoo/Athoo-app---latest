import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export function databaseName(databaseUrl) {
  const url = new URL(databaseUrl);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

export function databaseFingerprint(databaseUrl) {
  const url = new URL(databaseUrl);
  return `${url.protocol}//${url.hostname}:${url.port || "5432"}/${databaseName(databaseUrl)}`;
}

export function withDatabase(databaseUrl, name) {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(name)}`;
  return url.toString();
}

export function safeDatabaseName(prefix = "athoo_restore_rehearsal") {
  const suffix = `${Date.now()}_${randomBytes(4).toString("hex")}`;
  return `${prefix}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 63);
}

export async function run(command, args, options = {}) {
  const capture = options.capture === true;
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      cwd: options.cwd || process.cwd(),
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = createReadStream(file);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", resolve);
    input.on("error", reject);
  });
  return hash.digest("hex");
}

export async function verifyBackupSet(file) {
  const resolved = path.resolve(file);
  const manifestPath = `${resolved}.manifest.json`;
  const checksumPath = `${resolved}.sha256`;
  const [manifestRaw, checksumRaw, fileInfo] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(checksumPath, "utf8"),
    stat(resolved),
  ]);
  const manifest = JSON.parse(manifestRaw);
  const expected = checksumRaw.trim().split(/\s+/)[0];
  const actual = await sha256File(resolved);
  if (!expected || actual !== expected || manifest.sha256 !== actual) {
    throw new Error("Backup checksum verification failed");
  }
  if (Number(manifest.bytes) !== fileInfo.size) {
    throw new Error("Backup size does not match its manifest");
  }
  await run("pg_restore", ["--list", resolved], { capture: true });
  return { file: resolved, manifestPath, checksumPath, manifest, sha256: actual };
}

export async function secureFile(file) {
  await chmod(file, 0o600);
}
