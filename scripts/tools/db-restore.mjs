import "dotenv/config";
import process from "node:process";
import { databaseFingerprint, databaseName, run, verifyBackupSet } from "./db-common.mjs";

const [fileArg, ...args] = process.argv.slice(2);
const targetUrl = process.env.RESTORE_DATABASE_URL;
if (!targetUrl) throw new Error("RESTORE_DATABASE_URL is required; DATABASE_URL is never used as the implicit restore target");
if (!fileArg) throw new Error("Usage: pnpm db:restore <backup.dump> --confirm-database=<target_database>");

const targetName = databaseName(targetUrl);
const confirmation = args.find((arg) => arg.startsWith("--confirm-database="))?.split("=").slice(1).join("=");
if (confirmation !== targetName) throw new Error(`Destructive restore confirmation must exactly match target database '${targetName}'`);

const sourceUrl = process.env.DATABASE_URL;
if (sourceUrl && databaseFingerprint(sourceUrl) === databaseFingerprint(targetUrl) && !args.includes("--allow-source-overwrite")) {
  throw new Error("Refusing to restore over DATABASE_URL. Use a separate RESTORE_DATABASE_URL or explicitly add --allow-source-overwrite.");
}

const verified = await verifyBackupSet(fileArg);
await run("pg_restore", [
  "--exit-on-error", "--single-transaction", "--clean", "--if-exists",
  "--no-owner", "--no-privileges", "--dbname", targetUrl, verified.file,
]);
console.log(JSON.stringify({ restored: verified.file, target: databaseFingerprint(targetUrl), sha256: verified.sha256, latestMigration: verified.manifest.latestMigration }, null, 2));
