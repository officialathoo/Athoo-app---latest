import "dotenv/config";
import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";
import * as bcrypt from "bcryptjs";

const { Client } = pg;
const LOCK_KEY = 2_184_600_202;
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const phonePattern = /^\+?[0-9]{10,15}$/;

function required(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const name = required("BOOTSTRAP_ADMIN_NAME");
  const phone = required("BOOTSTRAP_ADMIN_PHONE").replace(/[\s-]/g, "");
  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");
  const confirmation = required("BOOTSTRAP_ADMIN_CONFIRM");

  if (confirmation !== "CREATE_FIRST_ADMIN") {
    throw new Error("BOOTSTRAP_ADMIN_CONFIRM must equal CREATE_FIRST_ADMIN");
  }
  if (!phonePattern.test(phone)) throw new Error("BOOTSTRAP_ADMIN_PHONE must contain 10-15 digits and may start with +");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address");
  if (!strongPassword.test(password)) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and include upper, lower, number, and symbol");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query("BEGIN");

    const schemaReady = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.users') IS NOT NULL AS exists",
    );
    if (!schemaReady.rows[0]?.exists) {
      throw new Error("Database schema is not ready. Run pnpm db:migrate first.");
    }

    const adminCount = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'",
    );
    if (Number(adminCount.rows[0]?.count || 0) > 0) {
      throw new Error("An administrator already exists. Use the Admin Panel to create additional administrators.");
    }

    const duplicate = await client.query(
      "SELECT 1 FROM users WHERE phone = $1 OR LOWER(email) = $2 LIMIT 1",
      [phone, email],
    );
    if (duplicate.rowCount) throw new Error("The bootstrap phone or email is already registered.");

    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (
        id, name, phone, email, role, password, admin_role, admin_permissions,
        is_verified, verification_status, account_status, joined_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'admin', $5, 'super_admin', $6::jsonb,
        TRUE, 'approved', 'active', NOW(), NOW())`,
      [crypto.randomUUID(), name, phone, email, passwordHash, JSON.stringify(["*"])],
    );

    await client.query("COMMIT");
    console.log(`First Super Admin created securely for ${email}.`);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* transaction may not have started */ }
    throw error;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]); } catch { /* ignore disconnect */ }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
