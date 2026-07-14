import { run } from "./db-common.mjs";

const commands = ["pg_dump", "pg_restore", "psql", "createdb", "dropdb"];
const results = [];
for (const command of commands) {
  try {
    const { stdout } = await run(command, ["--version"], { capture: true });
    results.push({ command, ok: true, version: stdout.trim() });
  } catch (error) {
    results.push({ command, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
if (failed.length) process.exitCode = 2;
