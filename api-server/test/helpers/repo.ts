import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function readRepo(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}
