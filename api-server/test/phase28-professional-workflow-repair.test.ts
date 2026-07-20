import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

const migrationName = "20260720_release_phase28_professional_workflow_integrity.sql";

test("Phase 28 adds stable public account IDs and a professional indexed operations model", () => {
  const migration = readRepo(`deploy/migrations/${migrationName}`);
  const schema = readRepo("lib/db/src/schema/index.ts");
  const migrations = readRepo("lib/db/src/migrations.ts");
  const publicIds = readRepo("api-server/src/lib/publicIds.ts");
  const bootstrap = readRepo("scripts/src/bootstrap-admin.ts");
  const seed = readRepo("scripts/src/seed.ts");
  const integrity = readRepo("scripts/src/db-integrity.ts");

  assert.match(migrations, new RegExp(migrationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id text/);
  assert.match(migration, /upper\(substr\(md5\(COALESCE\(role, 'customer'\) \|\| ':' \|\| id\), 1, 16\)\)/);
  assert.match(migration, /users_public_id_uidx/);
  assert.match(migration, /users_joined_at_idx/);
  assert.match(migration, /support_tickets_status_priority_created_idx/);
  assert.match(migration, /negotiations_status_expires_idx/);
  assert.match(migration, /admin_notifications_target_created_idx/);
  assert.match(schema, /publicId: text\("public_id"\)\.notNull\(\)\.unique\(\)/);
  assert.match(publicIds, /createHash\("sha256"\)/);
  assert.match(publicIds, /publicUserId/);
  assert.match(bootstrap, /id, public_id, name, phone, email/);
  assert.match(bootstrap, /createHash\("sha256"\)/);
  assert.match(seed, /publicId: publicUserId\("admin", "user-admin-001"\)/);
  assert.match(seed, /publicId: publicUserId\("customer", "user-customer-001"\)/);
  assert.match(seed, /publicId: publicUserId\("provider", "user-provider-001"\)/);
  assert.match(integrity, /missing_user_public_ids/);
  assert.match(integrity, /duplicate_user_public_ids/);
});

test("Phase 28 guarantees one canonical chat per participant pair", () => {
  const migration = readRepo(`deploy/migrations/${migrationName}`);
  const schema = readRepo("lib/db/src/schema/index.ts");
  const route = readRepo("api-server/src/routes/chat.ts");
  const context = readRepo("athoo-app/context/ChatContext.tsx");
  const detail = readRepo("athoo-app/app/(customer)/booking-detail.tsx");
  const integrity = readRepo("scripts/src/db-integrity.ts");

  assert.match(migration, /ALTER TABLE chats ADD COLUMN IF NOT EXISTS pair_key text/);
  assert.match(migration, /phase28_chat_merge_map/);
  assert.match(migration, /UPDATE messages AS message[\s\S]*SET chat_id = mapping\.canonical_id/);
  assert.match(migration, /chats_pair_key_uidx/);
  assert.match(schema, /pairKey: text\("pair_key"\)\.notNull\(\)\.unique\(\)/);
  assert.match(route, /const pairKey = chatPairKey\(userId, otherUserId\)/);
  assert.match(route, /onConflictDoNothing\(\{ target: chatsTable\.pairKey \}\)/);
  assert.match(context, /withoutDuplicatePair/);
  assert.match(detail, /import \{[\s\S]*Alert,[\s\S]*\} from "react-native"/);
  assert.match(detail, /Alert\.alert\("Chat unavailable"/);
  assert.match(detail, /chatId: chat\.id/);
  assert.match(integrity, /duplicate_chat_pairs/);
  assert.match(integrity, /noncanonical_chat_pair_keys/);
});

test("Phase 28 repairs refund submission with private evidence and server-side eligibility", () => {
  const mobile = readRepo("athoo-app/app/(customer)/refund-requests.tsx");
  const api = readRepo("api-server/src/routes/refunds.ts");
  const service = readRepo("athoo-app/services/api.ts");

  assert.match(mobile, /base64: false/);
  assert.match(mobile, /uploadPickedImage\([\s\S]*"private"\)/);
  assert.match(mobile, /\["completed", "cancelled"\]/);
  assert.match(mobile, /\["paid", "received"\]/);
  assert.match(service, /clientRequestId: string/);
  assert.match(api, /isOwnedUploadObjectPath\(evidenceUrl, userId, \["private"\]\)/);
  assert.match(api, /Refunds can only be requested on completed or cancelled bookings/);
  assert.match(api, /payment has been recorded/);
  assert.match(api, /clientRequestId/);
});

test("Phase 28 fixes time selection visibility and document renewal navigation", () => {
  const picker = readRepo("athoo-app/components/ui/TimePicker.tsx");
  const routing = readRepo("athoo-app/services/notificationRouting.ts");
  const providerProfile = readRepo("athoo-app/app/(provider)/(tabs)/profile.tsx");

  assert.match(picker, /selectionFrame:[\s\S]*backgroundColor: "transparent"/);
  assert.match(picker, /selectionFrame:[\s\S]*zIndex: 0/);
  assert.match(picker, /scrollLayer:[\s\S]*zIndex: 1/);
  assert.match(routing, /\/provider\/verification-documents/);
  assert.match(routing, /\/\(provider\)\/verification-documents/);
  assert.match(providerProfile, /Verification documents & validity/);
  assert.match(providerProfile, /user\?\.publicId/);
});

test("Phase 28 keeps TURN primary but activates audio fallback only when remote media is absent", () => {
  const mobile = readRepo("athoo-app/context/CallContext.tsx");
  const calls = readRepo("api-server/src/routes/calls.ts");
  const env = readRepo(".env.production.example");
  const render = readRepo("render.yaml");

  assert.match(mobile, /DEFAULT_FALLBACK_ACTIVATION_MS = 3_000/);
  assert.match(mobile, /remoteTrackReceivedRef/);
  assert.match(mobile, /inboundAudioBytesRef/);
  assert.match(mobile, /getStats/);
  assert.match(mobile, /inbound WebRTC audio packets confirmed/);
  assert.match(mobile, /iceTransportPolicy/);
  assert.match(mobile, /WebRTC carried no inbound audio; activating authenticated audio fallback/);
  assert.match(mobile, /scheduleRtcMediaWatchdog\(callId, 1_500\)/);
  assert.match(mobile, /event\.track\.enabled = true/);
  assert.match(calls, /CALL_FALLBACK_ACTIVATION_MS, 3_000, 3_000, 15_000/);
  assert.match(env, /CALL_PROVIDER=cloudflare-turn/);
  assert.match(env, /CALL_FALLBACK_ACTIVATION_MS=3000/);
  assert.match(env, /CALL_ICE_TRANSPORT_POLICY=relay/);
  assert.match(render, /CALL_FALLBACK_ACTIVATION_MS[\s\S]*value: "3000"/);
});

test("Phase 28 makes first-run authentication role selection explicit", () => {
  const welcome = readRepo("athoo-app/app/auth/welcome.tsx");
  const chooser = readRepo("athoo-app/app/auth/choose-role.tsx");

  assert.match(welcome, /testID="welcome-sign-in"/);
  assert.match(welcome, /testID="welcome-sign-up"/);
  assert.match(welcome, /\/auth\/choose-role\?mode=signin/);
  assert.match(welcome, /\/auth\/choose-role\?mode=signup/);
  assert.match(chooser, /auth-\$\{mode\}-customer/);
  assert.match(chooser, /auth-\$\{mode\}-provider/);
  assert.match(chooser, /\/auth\/provider-register/);
  assert.match(chooser, /\/auth\/register\?role=customer/);
});

test("Phase 28 introduces one permission-aware operations inbox with seen state and deep links", () => {
  const migration = readRepo(`deploy/migrations/${migrationName}`);
  const route = readRepo("api-server/src/routes/admin.ts");
  const page = readRepo("admin-panel/src/pages/OperationsInboxPage.tsx");
  const app = readRepo("admin-panel/src/App.tsx");
  const sidebar = readRepo("admin-panel/src/components/layout/Sidebar.tsx");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS admin_work_item_views/);
  assert.match(route, /router\.get\("\/operations-inbox"/);
  assert.match(route, /router\.post\("\/operations-inbox\/seen"/);
  for (const type of ["provider_verification", "document_renewal", "refund", "withdrawal", "support_ticket", "reported_issue", "overdue_negotiation"]) {
    assert.match(route, new RegExp(type));
  }
  assert.match(route, /hasAdminPermission/);
  assert.match(route, /includeType/);
  assert.match(page, /Search name, Athoo ID, request or description/);
  assert.match(page, /type="date"/);
  assert.match(page, /Mark visible seen/);
  assert.match(page, /payload\.slice\(index, index \+ 200\)/);
  assert.match(page, /to=\{item\.href\}/);
  assert.match(app, /path="\/operations-inbox"/);
  assert.match(sidebar, /Operations Inbox/);
});

test("Phase 28 expands admin identification and date filtering on core operational queues", () => {
  const admin = readRepo("api-server/src/routes/admin.ts");
  const refunds = readRepo("api-server/src/routes/refunds.ts");
  const usersPage = readRepo("admin-panel/src/pages/UsersPage.tsx");
  const providersPage = readRepo("admin-panel/src/pages/ProvidersPage.tsx");
  const complaintsPage = readRepo("admin-panel/src/pages/ComplaintsPage.tsx");
  const refundsPage = readRepo("admin-panel/src/pages/RefundsPage.tsx");

  assert.match(admin, /ilike\(usersTable\.publicId/);
  assert.match(admin, /gte\(usersTable\.joinedAt, from\)/);
  assert.match(admin, /lte\(usersTable\.joinedAt, to\)/);
  assert.match(admin, /userPublicId/);
  assert.match(refunds, /customer: \{ id: usersTable\.id, publicId: usersTable\.publicId/);
  for (const page of [usersPage, providersPage, complaintsPage, refundsPage]) {
    assert.match(page, /type="date"/);
  }
  assert.match(usersPage, /Athoo ID/);
  assert.match(providersPage, /Athoo ID/);
  assert.match(complaintsPage, /userPublicId/);
  assert.match(refundsPage, /customer\.publicId/);
});
