import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const LATEST = "20260712_release_performance_scalability.sql";

type Check = { name: string; value: number | string | null; ok: boolean; detail?: string };

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const checks: Check[] = [];
  try {
    const latest = await client.query<{ migration_id: string }>(
      "SELECT migration_id FROM athoo_schema_migrations ORDER BY migration_id DESC LIMIT 1",
    );
    const latestApplied = latest.rows[0]?.migration_id ?? null;
    checks.push({ name: "latest_migration", value: latestApplied, ok: latestApplied === LATEST, detail: `expected ${LATEST}` });

    const scalarChecks: Array<[string, string]> = [
      ["orphan_negotiation_users", `SELECT count(*)::int AS count FROM negotiations n WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=n.customer_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=n.provider_id)`],
      ["orphan_chat_users", `SELECT count(*)::int AS count FROM chats c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.participant1_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.participant2_id)`],
      ["orphan_messages", `SELECT count(*)::int AS count FROM messages m WHERE NOT EXISTS (SELECT 1 FROM chats c WHERE c.id=m.chat_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=m.sender_id)`],
      ["orphan_calls", `SELECT count(*)::int AS count FROM calls c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.caller_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.receiver_id)`],
      ["duplicate_refund_request_ids", `SELECT count(*)::int AS count FROM (SELECT customer_id, client_request_id FROM refund_requests WHERE client_request_id IS NOT NULL GROUP BY customer_id, client_request_id HAVING count(*) > 1) d`],
      ["multiple_pending_refunds", `SELECT count(*)::int AS count FROM (SELECT booking_id FROM refund_requests WHERE status='pending' GROUP BY booking_id HAVING count(*) > 1) d`],
      ["invalid_finance_ledger_types", `SELECT count(*)::int AS count FROM finance_ledger WHERE entry_type NOT IN ('commission_received','provider_withdrawal','customer_refund','subscription_received')`],
      ["stale_processing_jobs", `SELECT count(*)::int AS count FROM background_jobs WHERE status='processing' AND locked_at < now() - interval '15 minutes'`],
    ];
    for (const [name, sql] of scalarChecks) {
      const result = await client.query<{ count: number }>(sql);
      const value = Number(result.rows[0]?.count ?? 0);
      checks.push({ name, value, ok: value === 0 });
    }

    const constraints = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM pg_constraint
      WHERE conname IN (
        'negotiations_customer_id_fkey','negotiations_provider_id_fkey','negotiations_booking_id_fkey',
        'chats_participant1_id_fkey','chats_participant2_id_fkey','chats_booking_id_fkey',
        'messages_chat_id_fkey','messages_sender_id_fkey','calls_caller_id_fkey','calls_receiver_id_fkey'
      ) AND convalidated = false
    `);
    const unvalidated = Number(constraints.rows[0]?.count ?? 0);
    checks.push({ name: "unvalidated_core_foreign_keys", value: unvalidated, ok: unvalidated === 0 });

    const failed = checks.filter((check) => !check.ok);
    console.log(JSON.stringify({ ok: failed.length === 0, checkedAt: new Date().toISOString(), checks }, null, 2));
    if (failed.length) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
