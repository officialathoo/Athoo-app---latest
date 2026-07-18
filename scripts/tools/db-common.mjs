import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export function databaseName(databaseUrl) {
  const url = new URL(databaseUrl);

  return decodeURIComponent(
    url.pathname.replace(/^\//, ""),
  );
}

export function databaseFingerprint(databaseUrl) {
  const url = new URL(databaseUrl);

  return (
    `${url.protocol}//${url.hostname}:` +
    `${url.port || "5432"}/` +
    databaseName(databaseUrl)
  );
}

export function withDatabase(databaseUrl, name) {
  const url = new URL(databaseUrl);

  url.pathname = `/${encodeURIComponent(name)}`;

  return url.toString();
}

export function safeDatabaseName(
  prefix = "athoo_restore_rehearsal",
) {
  const suffix =
    `${Date.now()}_${randomBytes(4).toString("hex")}`;

  return `${prefix}_${suffix}`
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 63);
}

/**
 * Determine whether a command requires the Windows command shell.
 *
 * Node.js cannot reliably execute Windows .cmd and .bat command
 * shims directly on every supported Node.js version. Package-manager
 * launchers such as pnpm.cmd are therefore started using the Windows
 * shell, while native executables continue to run directly.
 *
 * @param {string} command
 * @returns {boolean}
 */
function requiresWindowsShell(command) {
  if (process.platform !== "win32") {
    return false;
  }

  const normalized = command
    .trim()
    .toLowerCase();

  return (
    normalized === "pnpm" ||
    normalized === "pnpm.cmd" ||
    normalized === "npm" ||
    normalized === "npm.cmd" ||
    normalized === "npx" ||
    normalized === "npx.cmd" ||
    normalized === "yarn" ||
    normalized === "yarn.cmd" ||
    normalized.endsWith(".cmd") ||
    normalized.endsWith(".bat")
  );
}

/**
 * Run a subprocess and reject when it fails.
 *
 * Native executables such as node.exe, psql, pg_restore, createdb
 * and dropdb run directly without a shell.
 *
 * On Windows, .cmd and .bat package-manager launchers run through
 * the system shell because Node.js cannot consistently spawn those
 * shims directly.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{
 *   capture?: boolean,
 *   env?: NodeJS.ProcessEnv,
 *   cwd?: string
 * }} options
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function run(
  command,
  args = [],
  options = {},
) {
  if (
    typeof command !== "string" ||
    command.trim().length === 0
  ) {
    throw new TypeError(
      "run() requires a non-empty command",
    );
  }

  if (!Array.isArray(args)) {
    throw new TypeError(
      "run() arguments must be an array",
    );
  }

  const capture = options.capture === true;
  const executableArgs = args.map(
    (argument) => String(argument),
  );

  /*
   * Use the shell only for Windows command shims such as pnpm.cmd.
   * Native PostgreSQL and Node executables remain shell-free.
   */
  const useShell = requiresWindowsShell(command);

  return await new Promise((resolve, reject) => {
    let settled = false;

    const child = spawn(
      command,
      executableArgs,
      {
        env: options.env || process.env,
        cwd: options.cwd || process.cwd(),
        stdio: capture
          ? ["ignore", "pipe", "pipe"]
          : "inherit",
        shell: useShell,
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.once("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;

      reject(
        new Error(
          `Failed to start ${command}: ${error.message}`,
          {
            cause: error,
          },
        ),
      );
    });

    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;

      if (code === 0) {
        resolve({
          stdout,
          stderr,
        });

        return;
      }

      const exitDescription =
        signal !== null
          ? `terminated by signal ${signal}`
          : `exited with code ${code}`;

      const errorOutput = stderr.trim();

      reject(
        new Error(
          `${command} ${exitDescription}` +
          (errorOutput
            ? `: ${errorOutput}`
            : ""),
        ),
      );
    });
  });
}

export async function sha256File(file) {
  const hash = createHash("sha256");

  await new Promise((resolve, reject) => {
    const input = createReadStream(file);

    input.on("data", (chunk) => {
      hash.update(chunk);
    });

    input.on("end", resolve);
    input.on("error", reject);
  });

  return hash.digest("hex");
}

export async function verifyBackupSet(file) {
  const resolved = path.resolve(file);
  const manifestPath =
    `${resolved}.manifest.json`;
  const checksumPath =
    `${resolved}.sha256`;

  const [
    manifestRaw,
    checksumRaw,
    fileInfo,
  ] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(checksumPath, "utf8"),
    stat(resolved),
  ]);

  let manifest;

  try {
    manifest = JSON.parse(manifestRaw);
  } catch (error) {
    throw new Error(
      `Backup manifest is not valid JSON: ${manifestPath}`,
      {
        cause: error,
      },
    );
  }

  const expectedChecksum = checksumRaw
    .trim()
    .split(/\s+/)[0];

  const actualChecksum =
    await sha256File(resolved);

  if (
    !expectedChecksum ||
    actualChecksum !== expectedChecksum ||
    manifest.sha256 !== actualChecksum
  ) {
    throw new Error(
      "Backup checksum verification failed",
    );
  }

  if (
    Number(manifest.bytes) !== fileInfo.size
  ) {
    throw new Error(
      "Backup size does not match its manifest",
    );
  }

  await run(
    "pg_restore",
    [
      "--list",
      resolved,
    ],
    {
      capture: true,
    },
  );

  return {
    file: resolved,
    manifestPath,
    checksumPath,
    manifest,
    sha256: actualChecksum,
  };
}

export async function secureFile(file) {
  await chmod(file, 0o600);
}