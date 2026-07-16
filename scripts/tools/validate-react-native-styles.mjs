#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const appRoot = path.join(root, "athoo-app");
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoredDirectories = new Set(["node_modules", ".expo", "dist", "dist-export", "dist-web"]);

// React Native style keys are case-sensitive. These common lowercase variants
// compile as unknown properties and have repeatedly caused release failures.
const invalidKeys = [
  "backgroundcolor",
  "shadowcolor",
  "bordercolor",
  "borderradius",
  "borderwidth",
  "fontsize",
  "fontweight",
  "fontfamily",
  "fontstyle",
  "lineheight",
  "letterspacing",
  "textalign",
  "textalignvertical",
  "textdecorationline",
  "tintcolor",
  "overlaycolor",
  "paddinghorizontal",
  "paddingvertical",
  "marginhorizontal",
  "marginvertical",
  "minheight",
  "maxheight",
  "minwidth",
  "maxwidth",
  "alignitems",
  "alignself",
  "justifycontent",
  "flexdirection",
  "flexwrap",
  "overflowhidden",
];
const pattern = new RegExp(`\\b(${invalidKeys.join("|")})\\s*:`, "g");

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...(await walk(path.join(directory, entry.name))));
      continue;
    }
    if (extensions.has(path.extname(entry.name))) files.push(path.join(directory, entry.name));
  }
  return files;
}

const failures = [];
for (const file of await walk(appRoot)) {
  const source = await fs.readFile(file, "utf8");
  for (const match of source.matchAll(pattern)) {
    const before = source.slice(0, match.index);
    const line = before.split(/\r?\n/).length;
    failures.push(`${path.relative(root, file)}:${line}: invalid React Native style key '${match[1]}'`);
  }
}

if (failures.length) {
  console.error("React Native style-key validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("React Native style-key validation passed.");
