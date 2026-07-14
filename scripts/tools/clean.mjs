import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const removable = new Set(["dist", "build", ".expo", ".turbo", ".cache", "coverage"]);
let removed = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && removable.has(entry.name)) {
      fs.rmSync(full, { recursive: true, force: true }); removed++; continue;
    }
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".tsbuildinfo")) { fs.rmSync(full, { force: true }); removed++; }
  }
}
walk(root);
console.log(`Clean complete. Removed ${removed} generated item(s).`);
