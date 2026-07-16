#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../..");
const appDir = path.join(rootDir, "athoo-app");
const appPackagePath = path.join(appDir, "package.json");
const workspacePath = path.join(rootDir, "pnpm-workspace.yaml");
const npmrcPath = path.join(rootDir, ".npmrc");

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function quoteShell(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@./:=+~^-]+$/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function runPnpm(args, options = {}) {
  const command = ["pnpm", ...args].map(quoteShell).join(" ");
  const result = spawnSync(command, {
    cwd: rootDir,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: true,
  });

  if (result.error) fail(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    fail(`Command failed (${result.status}): ${command}`);
  }
  return options.capture ? String(result.stdout ?? "").trim() : "";
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureWorkspaceConfig() {
  const npmrc = [
    "auto-install-peers=false",
    "strict-peer-dependencies=false",
    "",
  ].join("\n");
  writeFileSync(npmrcPath, npmrc, "utf8");

  let workspace = readFileSync(workspacePath, "utf8");
  workspace = workspace
    .split(/\r?\n/)
    .filter((line) => !/^\s*nodeLinker\s*:/.test(line))
    .filter((line) => !/^\s*['\"]?@esbuild-kit\/esm-loader['\"]?\s*:/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  const lines = workspace.split("\n");
  const ageIndex = lines.findIndex((line) => /^minimumReleaseAge\s*:/.test(line));
  if (ageIndex >= 0) lines.splice(ageIndex + 1, 0, "nodeLinker: isolated");
  else lines.unshift("nodeLinker: isolated");
  writeFileSync(workspacePath, `${lines.join("\n")}\n`, "utf8");
}

function updateAppManifestBeforeInstall() {
  const pkg = readJson(appPackagePath);
  pkg.devDependencies ??= {};

  // Expo ships its own matching CLI. A separately pinned @expo/cli creates
  // duplicate toolchains and can load a Metro version from the wrong location.
  delete pkg.devDependencies["@expo/cli"];

  const doctor = pkg.devDependencies["expo-doctor"];
  if (typeof doctor === "string" && /^\d/.test(doctor)) {
    pkg.devDependencies["expo-doctor"] = `^${doctor}`;
  }

  writeJson(appPackagePath, pkg);
}

function removeDependencyInstallations() {
  const paths = [
    path.join(rootDir, "node_modules"),
    path.join(rootDir, ".pnpm-store"),
    path.join(appDir, "node_modules"),
    path.join(appDir, ".expo"),
    path.join(appDir, "dist-export"),
    path.join(rootDir, "api-server", "node_modules"),
    path.join(rootDir, "admin-panel", "node_modules"),
    path.join(rootDir, "scripts", "node_modules"),
  ];

  for (const target of paths) {
    if (!existsSync(target)) continue;
    console.log(`Removing ${path.relative(rootDir, target)} ...`);
    rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 400,
    });
  }
}

function temporarilyDisableReleaseAge() {
  const original = readFileSync(workspacePath, "utf8");
  const relaxed = /^minimumReleaseAge\s*:/m.test(original)
    ? original.replace(/^minimumReleaseAge\s*:\s*\d+\s*$/m, "minimumReleaseAge: 0")
    : `minimumReleaseAge: 0\n${original}`;
  writeFileSync(workspacePath, relaxed, "utf8");
  return () => writeFileSync(workspacePath, original, "utf8");
}

function parseVersion(value) {
  const match = String(value).match(/(\d+)\.(\d+)\.(\d+)/);
  return match
    ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
    : null;
}

function compareVersionsDesc(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av || !bv) return 0;
  return bv.major - av.major || bv.minor - av.minor || bv.patch - av.patch;
}

function peerRangeAllowsMajor(range, major) {
  const text = String(range ?? "").trim();
  if (!text || text === "*" || text.toLowerCase() === "latest") return true;
  return text.split("||").some((part) => {
    const p = part.trim();
    const exactCaret = p.match(/\^(\d+)/);
    if (exactCaret) return Number(exactCaret[1]) === major;
    const exactTilde = p.match(/~(\d+)/);
    if (exactTilde) return Number(exactTilde[1]) === major;
    const exact = p.match(/^(\d+)(?:\.\d+)?(?:\.\d+)?$/);
    if (exact) return Number(exact[1]) === major;
    const lower = p.match(/>=\s*(\d+)/);
    const upper = p.match(/<\s*(\d+)/);
    if (lower && major < Number(lower[1])) return false;
    if (upper && major >= Number(upper[1])) return false;
    if (lower || upper) return true;
    return p.includes(String(major));
  });
}

function resolveCompatibleWebRtcPlugin(expoMajor) {
  console.log(`Resolving react-native-webrtc config plugin for Expo SDK ${expoMajor} ...`);
  const versionsRaw = runPnpm(
    ["view", "@config-plugins/react-native-webrtc", "versions", "--json"],
    { capture: true },
  );
  let versions;
  try {
    versions = JSON.parse(versionsRaw);
  } catch {
    fail("Unable to parse config-plugin versions returned by the registry.");
  }

  const stable = (Array.isArray(versions) ? versions : [])
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    .sort(compareVersionsDesc);

  for (const version of stable) {
    const peerRaw = runPnpm(
      [
        "view",
        `@config-plugins/react-native-webrtc@${version}`,
        "peerDependencies.expo",
        "--json",
      ],
      { capture: true },
    );
    let peer = peerRaw;
    try {
      peer = JSON.parse(peerRaw);
    } catch {
      // pnpm may return an unquoted scalar in some versions.
    }
    if (peerRangeAllowsMajor(peer, expoMajor)) return version;
  }

  fail(`No react-native-webrtc config plugin declares compatibility with Expo ${expoMajor}.`);
}

function getInstalledExpoMajor() {
  const pkg = readJson(appPackagePath);
  const version = pkg.dependencies?.expo;
  const parsed = parseVersion(version);
  if (!parsed) fail(`Unable to determine Expo SDK from dependency: ${version}`);
  return parsed.major;
}

console.log("Repairing Athoo Expo/pnpm workspace ...");
ensureWorkspaceConfig();
updateAppManifestBeforeInstall();
removeDependencyInstallations();

// First installation updates the lockfile after removing the redundant direct CLI.
runPnpm(["install", "--no-frozen-lockfile"]);

const restoreReleaseAge = temporarilyDisableReleaseAge();
try {
  // Expo chooses compatible patch versions for the current SDK; no patch version
  // is hardcoded in this maintenance command.
  runPnpm(["--filter", "@workspace/athoo-app", "exec", "expo", "install", "--fix"]);

  const expoMajor = getInstalledExpoMajor();
  const pluginVersion = resolveCompatibleWebRtcPlugin(expoMajor);
  console.log(`Using compatible WebRTC config plugin range ^${pluginVersion}.`);
  runPnpm([
    "--filter",
    "@workspace/athoo-app",
    "add",
    `@config-plugins/react-native-webrtc@^${pluginVersion}`,
  ]);
} finally {
  restoreReleaseAge();
}

runPnpm(["install", "--frozen-lockfile"]);
runPnpm(["mobile:workspace:validate"]);
runPnpm(["mobile:metro:validate"]);
runPnpm(["mobile:doctor"]);

console.log("\nExpo/pnpm workspace repair passed.");
console.log("Run: pnpm rc2:source-verify && pnpm mobile:export");
