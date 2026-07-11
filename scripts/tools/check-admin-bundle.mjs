import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const assetsDir = path.join(repoRoot, 'admin-panel', 'dist', 'public', 'assets');
const maxChunkBytes = Number(process.env.ADMIN_MAX_JS_CHUNK_BYTES || 500_000);
const maxEntryBytes = Number(process.env.ADMIN_MAX_ENTRY_BYTES || 400_000);
const files = (await readdir(assetsDir)).filter((name) => name.endsWith('.js'));
if (!files.length) throw new Error(`No admin JavaScript assets found in ${assetsDir}`);

const sizes = await Promise.all(files.map(async (name) => ({ name, bytes: (await stat(path.join(assetsDir, name))).size })));
const oversized = sizes.filter((file) => file.bytes > maxChunkBytes);
const entry = sizes.find((file) => /^index-.*\.js$/.test(file.name));
if (!entry) throw new Error('Admin entry bundle was not found');
if (entry.bytes > maxEntryBytes) throw new Error(`Admin entry bundle ${entry.name} is ${entry.bytes} bytes; budget is ${maxEntryBytes}`);
if (oversized.length) throw new Error(`Admin chunks exceed ${maxChunkBytes} bytes: ${oversized.map((f) => `${f.name} (${f.bytes})`).join(', ')}`);
console.log(`Admin bundle budget passed: entry ${entry.bytes} bytes; largest chunk ${Math.max(...sizes.map((f) => f.bytes))} bytes.`);
