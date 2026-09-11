import "dotenv/config";
import pg from "pg";
import { LATEST_DATABASE_MIGRATION } from "@workspace/db/migrations";

const { Client } = pg;

type Check = { name: string; value: number | string | null; ok: boolean; detail?: string };

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const checks: Check[] = [];
  try {
    const latest = await client.query<{ migration_id: string }>(
      "SELECT migration_id FROM public.athoo_schema_migrations ORDER BY migration_id DESC LIMIT 1",
    );
    const latestApplied = latest.rows[0]?.migration_id ?? null;
    checks.push({ name: "latest_migration", value: latestApplied, ok: latestApplied === LATEST_DATABASE_MIGRATION, detail: `expected ${LATEST_DATABASE_MIGRATION}` });

    const scalarChecks: Array<[string, string]> = [
      ["orphan_negotiation_users", `SELECT count(*)::int AS count FROM negotiations n WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=n.customer_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=n.provider_id)`],
      ["orphan_chat_users", `SELECT count(*)::int AS count FROM chats c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.participant1_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.participant2_id)`],
      ["orphan_messages", `SELECT count(*)::int AS count FROM messages m WHERE NOT EXISTS (SELECT 1 FROM chats c WHERE c.id=m.chat_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=m.sender_id)`],
      ["orphan_calls", `SELECT count(*)::int AS count FROM calls c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.caller_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=c.receiver_id)`],
      ["duplicate_refund_request_ids", `SELECT count(*)::int AS count FROM (SELECT customer_id, client_request_id FROM refund_requests WHERE client_request_id IS NOT NULL GROUP BY customer_id, client_request_id HAVING count(*) > 1) d`],
      ["multiple_unresolved_refunds", `SELECT count(*)::int AS count FROM (SELECT booking_id FROM refund_requests WHERE status IN ('pending','approved') GROUP BY booking_id HAVING count(*) > 1) d`],
      ["duplicate_broadcast_provider_responses", `SELECT count(*)::int AS count FROM (SELECT request_id, provider_id FROM broadcast_responses GROUP BY request_id, provider_id HAVING count(*) > 1) d`],
      ["duplicate_broadcast_booking_links", `SELECT count(*)::int AS count FROM (SELECT booking_id FROM broadcast_requests WHERE booking_id IS NOT NULL GROUP BY booking_id HAVING count(*) > 1) d`],
      ["orphan_broadcast_responses", `SELECT count(*)::int AS count FROM broadcast_responses r WHERE NOT EXISTS (SELECT 1 FROM broadcast_requests b WHERE b.id=r.request_id) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.provider_id)`],
      ["inconsistent_accepted_broadcasts", `SELECT count(*)::int AS count FROM broadcast_requests r LEFT JOIN broadcast_responses response ON response.id=r.accepted_response_id AND response.request_id=r.id LEFT JOIN bookings booking ON booking.id=r.booking_id WHERE r.status='accepted' AND (r.accepted_response_id IS NULL OR r.booking_id IS NULL OR response.id IS NULL OR response.status <> 'accepted_by_customer' OR booking.id IS NULL OR booking.customer_id <> r.customer_id OR booking.provider_id <> response.provider_id OR booking.status NOT IN ('accepted','in_progress','completed','cancelled'))`],
      ["open_broadcasts_with_booking", `SELECT count(*)::int AS count FROM broadcast_requests WHERE status='open' AND (booking_id IS NOT NULL OR accepted_response_id IS NOT NULL)`],
      ["clean_uploads_missing_security_evidence", `SELECT count(*)::int AS count FROM upload_security_records WHERE scan_status='clean' AND (sha256 IS NULL OR detected_content_type IS NULL OR actual_size IS NULL OR scanner IS NULL OR scanned_at IS NULL)`],
      ["unsafe_upload_path_boundaries", `SELECT count(*)::int AS count FROM upload_security_records WHERE object_path = quarantine_path OR object_path = scan_path OR quarantine_path = scan_path OR object_path NOT LIKE ('/objects/uploads/' || scope || '/' || owner_id || '/%') OR quarantine_path NOT LIKE ('/objects/uploads/quarantine/incoming/' || owner_id || '/%') OR scan_path NOT LIKE ('/objects/uploads/quarantine/locked/' || owner_id || '/%')`],
      ["stale_upload_security_scans", `SELECT count(*)::int AS count FROM upload_security_records WHERE scan_status='scanning' AND scan_started_at < now() - interval '30 minutes'`],
      ["expired_pending_upload_grants", `SELECT count(*)::int AS count FROM upload_security_records WHERE scan_status='pending' AND expires_at < now() - interval '24 hours'`],
      ["expired_upload_quarantine_not_cleaned", `SELECT count(*)::int AS count FROM upload_security_records WHERE scan_status IN ('clean','rejected','expired') AND expires_at < now() - interval '24 hours' AND quarantine_deleted_at IS NULL`],
      ["invalid_finance_ledger_types", `SELECT count(*)::int AS count FROM finance_ledger WHERE entry_type NOT IN ('commission_received','provider_withdrawal','customer_refund','subscription_received')`],
      ["stale_processing_jobs", `SELECT count(*)::int AS count FROM background_jobs WHERE status='processing' AND locked_at < now() - interval '15 minutes'`],
      ["missing_user_public_ids", `SELECT count(*)::int AS count FROM users WHERE public_id IS NULL OR btrim(public_id) = ''`],
      ["duplicate_user_public_ids", `SELECT count(*)::int AS count FROM (SELECT public_id FROM users GROUP BY public_id HAVING count(*) > 1) d`],
      ["missing_chat_pair_keys", `SELECT count(*)::int AS count FROM chats WHERE pair_key IS NULL OR btrim(pair_key) = ''`],
      ["noncanonical_chat_pair_keys", `SELECT count(*)::int AS count FROM chats WHERE pair_key <> LEAST(participant1_id, participant2_id) || ':' || GREATEST(participant1_id, participant2_id)`],
      ["duplicate_chat_pairs", `SELECT count(*)::int AS count FROM (SELECT pair_key FROM chats GROUP BY pair_key HAVING count(*) > 1) d`],
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
        'messages_chat_id_fkey','messages_sender_id_fkey','calls_caller_id_fkey','calls_receiver_id_fkey',
        'broadcast_requests_booking_id_fkey','broadcast_requests_accepted_response_id_fkey'
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
