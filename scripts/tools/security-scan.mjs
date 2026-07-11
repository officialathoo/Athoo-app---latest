import { promises as fs } from "node:fs";
import path from "node:path";
const root = process.cwd();
const skip = new Set(["node_modules", ".git", "dist", ".expo", "coverage"]);
const findings = [];
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["hard-coded JWT secret", /JWT_SECRET\s*=\s*["'][^"']{16,}["']/],
  ["long-lived access token in URL", /[?&]token=\$\{encodeURIComponent\((?:getToken\(\)|accessToken)\)\}/],
];
async function walk(dir) { for (const ent of await fs.readdir(dir, { withFileTypes: true })) { if (skip.has(ent.name)) continue; const p = path.join(dir, ent.name); if (ent.isDirectory()) await walk(p); else if (/\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|env|md)$/.test(ent.name) && !p.endsWith("security-scan.mjs")) { const text = await fs.readFile(p, "utf8").catch(() => ""); for (const [name, re] of patterns) if (re.test(text)) findings.push(`${name}: ${path.relative(root,p)}`); } } }
await walk(root);
if (findings.length) { console.error(findings.join("\n")); process.exit(1); }
console.log("Security scan passed");
