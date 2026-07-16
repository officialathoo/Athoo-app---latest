import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set(["node_modules", ".git", "dist", ".expo", "coverage", ".next", "build"]);
const findings = [];
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["hard-coded JWT secret", /JWT_SECRET\s*=\s*["'][^"']{16,}["']/],
  ["long-lived access token in URL", /[?&]token=\$\{encodeURIComponent\((?:getToken\(\)|accessToken)\)\}/],
  ["unsafe user row JSON projection", /row_to_json\(\s*u\s*\)/i],
  ["dynamic code execution", /\b(?:eval|Function)\s*\(/],
];

async function walk(dir) {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (skip.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(p);
    } else if (/\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|env)$/.test(ent.name) && !p.endsWith("security-scan.mjs")) {
      const text = await fs.readFile(p, "utf8").catch(() => "");
      for (const [name, re] of patterns) {
        if (re.test(text)) findings.push(`${name}: ${path.relative(root, p)}`);
      }
    }
  }
}

await walk(root);

const easFiles = ["eas.json", "athoo-app/eas.json"];
for (const file of easFiles) {
  const text = await fs.readFile(path.join(root, file), "utf8");
  if (/athoo-api\.onrender\.com|EXPO_PUBLIC_API_BASE_URL|EXPO_PUBLIC_MAP_PROVIDER|EAS_PROJECT_ID/.test(text)) {
    findings.push(`deployment-specific mobile configuration committed in ${file}`);
  }
}

const mobileApi = await fs.readFile(path.join(root, "athoo-app/services/api.ts"), "utf8");
if (/JSON\.stringify\(data\).*throw|responseDetails|raw response/i.test(mobileApi)) {
  findings.push("mobile API may expose raw server response details");
}

const productionRoute = path.join(root, "api-server/src/routes/production.ts");
if (await fs.stat(productionRoute).then(() => true).catch(() => false)) {
  findings.push("deprecated broad production data route still exists");
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("Security scan passed");
