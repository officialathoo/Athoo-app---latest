import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const adminSource = path.join(projectRoot, "admin-panel", "src");

async function collectTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(fullPath);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [fullPath] : [];
  }));
  return files.flat();
}

test("Vite admin source does not contain Next.js-only use client directives", async () => {
  const sourceFiles = await collectTsxFiles(adminSource);
  const offenders: string[] = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    if (/^[\s]*(?:"use client"|'use client');?/m.test(source)) {
      offenders.push(path.relative(projectRoot, file));
    }
  }

  assert.deepEqual(offenders, [], `Remove Next.js-only directives from: ${offenders.join(", ")}`);
});
