# RC1 Device Fix 01

Fixes verified from Android screenshots:
- stale notification cold-start redirects are ignored/cleared;
- Home no longer re-renders full skeleton blocks on every tab focus;
- repeating announcements no longer open a blocking dark modal;
- service cards use professional white surfaces in light mode;
- Invite Friends spacing is increased and wraps safely;
- broadcast creation has a stable client request ID and notification failures cannot turn a successful insert into HTTP 500;
- adds migration `20260713_broadcast_request_idempotency.sql`.

Infrastructure: the shown upload error is caused by an invalid Cloudflare R2 access-key value. Replace `CLOUDFLARE_R2_ACCESS_KEY_ID`/`S3_ACCESS_KEY_ID` in Render with the exact current R2 API token access key, then redeploy.
