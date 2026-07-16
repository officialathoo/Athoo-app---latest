# Athoo RC2 Final Connected Deployment

Use the latest Phase 5 source package as the only baseline. Do not merge files from older ZIPs.

## 1. Local source gates

From the monorepo root:

```powershell
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm rc2:source-verify
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
```

Stop when any command fails. Do not build an APK from a partially verified folder.

## 2. Commit exact release identity

```powershell
git status --short
git add .
git commit -m "Athoo RC2 Phase 5 release candidate"
git push origin main
git rev-parse HEAD
```

Record the full commit SHA. Render, Vercel, EAS and the connected verifier must point to this same source.

## 3. Render configuration

Set all secrets in Render, never in GitHub, Expo public values, the admin bundle, or the mobile application.

### Release identity

```env
DEPLOYMENT_ENVIRONMENT=production
RELEASE_SERVICE_NAME=athoo-api
RELEASE_VERSION=rc2-candidate
```

`RELEASE_COMMIT_SHA` and `RELEASE_BUILD_ID` may be explicit, but the API also supports trusted host-provided release metadata.

### Phone OTP delivery

Athoo phone registration requires at least one phone-bound channel:

```env
OTP_DELIVERY_CHANNELS=whatsapp_cloud,email
OTP_DELIVERY_MODE=first_success
```

Configure either WhatsApp Cloud:

```env
WHATSAPP_GRAPH_BASE_URL=https://graph.facebook.com
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_ACCESS_TOKEN=<render-secret>
WHATSAPP_PHONE_NUMBER_ID=<render-secret>
WHATSAPP_OTP_TEMPLATE_NAME=otp_verification
WHATSAPP_OTP_TEMPLATE_LANGUAGE=en
```

or the portable HTTPS SMS adapter:

```env
OTP_DELIVERY_CHANNELS=http_sms,email
SMS_PROVIDER=http_json
SMS_HTTP_ENDPOINT=https://<provider-endpoint>
SMS_HTTP_METHOD=POST
SMS_HTTP_AUTH_HEADER=Authorization
SMS_HTTP_AUTH_VALUE=<render-secret>
SMS_HTTP_PHONE_FIELD=to
SMS_HTTP_MESSAGE_FIELD=message
SMS_HTTP_SENDER_FIELD=sender
SMS_HTTP_SENDER_VALUE=<approved-sender>
```

SMTP alone provides verified-email login/recovery fallback but does not prove possession of a phone number for phone registration.

### Transactional email

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.zoho.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_TLS_REJECT_UNAUTHORIZED=true
SMTP_USER=<zoho-mailbox>
SMTP_PASS=<zoho-app-password>
EMAIL_FROM_NAME=Athoo
EMAIL_FROM_ADDRESS=<verified-sender>
EMAIL_REPLY_TO=<support-address>
EMAIL_SUPPORT_ADDRESS=<support-address>
EMAIL_MARKETING_ENABLED=false
```

Keep marketing disabled until consent, unsubscribe, provider limits and a controlled campaign are verified.

### Maps

Recommended beta configuration:

```env
MAP_PROVIDER=mapbox
MAP_TILE_PROVIDER=mapbox
MAP_SEARCH_PROVIDER=photon
MAP_REVERSE_PROVIDER=photon
MAP_DIRECTIONS_PROVIDER=mapbox
MAP_PROVIDER_FALLBACK_ENABLED=false
MAPBOX_ACCESS_TOKEN=<render-secret>
MAPBOX_STYLE_OWNER=mapbox
MAPBOX_STYLE_ID=streets-v12
MAPBOX_TILE_SIZE=512
MAP_TILE_RESPECT_UPSTREAM_CACHE=true
```

Mapbox credentials remain on Render. The mobile app uses only the Athoo API tile/search/directions contracts.

### Other required providers

Configure Neon, Cloudflare R2/S3-compatible storage, Expo push, CORS, JWT/session secrets and all values documented in `.env.production.example`.

Production validation must reject:

```env
ALLOW_DEV_OTP_RESPONSE=true
STORAGE_PROVIDER=local
QUEUE_PROVIDER!=postgres
```

## 4. Neon migration order

Before starting the updated API against production data:

```powershell
pnpm db:migrate
pnpm db:verify
pnpm db:integrity
```

The cumulative package includes the prior portable-email migration. Phase 5 adds no new migration.

## 5. Confirm deployed commit

Open:

```text
https://athoo-api.onrender.com/api/healthz
https://athoo-api.onrender.com/api/healthz/deep
```

Confirm the reported release version and commit SHA match the exact Git commit. Deep health must report database, migrations, maps, storage, email and phone-registration OTP readiness.

## 6. Run connected verification

```powershell
$env:CONNECTED_API_BASE_URL="https://athoo-api.onrender.com"
$env:CONNECTED_ADMIN_ORIGIN="https://<your-vercel-admin-domain>"
$env:CONNECTED_EXPECTED_RELEASE_VERSION="rc2-candidate"
$env:CONNECTED_EXPECTED_COMMIT_SHA="<exact-git-commit-sha>"
$env:CONNECTED_CUSTOMER_IDENTIFIER="<controlled-test-customer>"
$env:CONNECTED_CUSTOMER_PASSWORD="<test-password>"
$env:CONNECTED_CUSTOMER_ROLE="customer"
$env:CONNECTED_ADMIN_IDENTIFIER="<controlled-test-admin>"
$env:CONNECTED_ADMIN_PASSWORD="<test-password>"
$env:CONNECTED_OTP_TEST_PHONE="<registered-controlled-test-phone>"
$env:CONNECTED_OTP_TEST_ROLE="customer"
$env:CONNECTED_EMAIL_TEST_TO="<controlled-test-email>"
$env:CONNECTED_STRICT="true"
pnpm rc2:connected-verify
```

This generates redacted evidence under `release-evidence/`. The directory is ignored and must not be packaged publicly.

## 7. Vercel admin

Confirm Vercel deployed the same Git SHA. Verify admin login, Email Center, maps/configuration, CORS and all live counts against the deployed API.

## 8. EAS preview builds

Run from `athoo-app`:

```powershell
eas whoami
eas project:info
eas build --platform android --profile preview --clear-cache
eas build --platform ios --profile preview --clear-cache
```

A new native build is required for splash, notification channel and sound changes.

## 9. Device evidence and decision

From the monorepo root:

```powershell
Copy-Item device-acceptance-evidence-template.json device-acceptance-evidence.json
pnpm device:evidence:validate

Copy-Item rc2-evidence-template.json rc2-evidence.json
pnpm rc2:decision
```

Do not launch until the decision is `GO` and both P0 and P1 defect counts are zero.
