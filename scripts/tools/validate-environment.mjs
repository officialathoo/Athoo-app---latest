import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const envPath = path.resolve(process.argv[2] || ".env");
const text = await fs.readFile(envPath, "utf8").catch(() => { throw new Error(`Environment file not found: ${envPath}`); });
const values = new Map();
const duplicates = new Set();
for (const [index, raw] of text.split(/\r?\n/).entries()) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) throw new Error(`Invalid environment line ${index + 1}: ${raw}`);
  if (values.has(match[1])) duplicates.add(match[1]);
  values.set(match[1], match[2].trim().replace(/^['"]|['"]$/g, ""));
}

const errors = [];
const warnings = [];
const required = [
  "NODE_ENV", "DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET", "SESSION_SECRET",
  "API_BASE_URL", "ADMIN_BASE_URL", "CORS_ORIGINS", "STORAGE_PROVIDER", "QUEUE_PROVIDER", "CACHE_PROVIDER", "JWT_ISSUER", "JWT_AUDIENCE", "TRUST_PROXY",
];
for (const key of required) if (!values.get(key)) errors.push(`${key} is required`);
for (const key of duplicates) errors.push(`${key} is defined more than once`);
for (const key of ["JWT_SECRET", "REFRESH_TOKEN_SECRET", "SESSION_SECRET"]) {
  const value = values.get(key) || "";
  if (value.length < 32 || /CHANGE_ME|example|password/i.test(value)) errors.push(`${key} must be a non-placeholder secret of at least 32 characters`);
}
if (values.get("NODE_ENV") !== "production" && values.get("NODE_ENV") !== "staging") errors.push("NODE_ENV must be production or staging for deployment validation");
for (const key of ["API_BASE_URL", "ADMIN_BASE_URL"]) {
  const value = values.get(key) || "";
  if (!value.startsWith("https://")) errors.push(`${key} must use HTTPS`);
}
if ((values.get("CORS_ORIGINS") || "").includes("*")) errors.push("CORS_ORIGINS must not contain wildcard origins");
const storageProviderAliases = new Map([
  ["r2", "r2"], ["cloudflare-r2", "r2"], ["cloudflare_r2", "r2"],
  ["s3", "s3"], ["aws", "s3"], ["aws-s3", "s3"], ["aws_s3", "s3"],
  ["minio", "minio"], ["wasabi", "wasabi"],
  ["b2", "backblaze_b2"], ["backblaze", "backblaze_b2"], ["backblaze-b2", "backblaze_b2"], ["backblaze_b2", "backblaze_b2"],
  ["spaces", "digitalocean_spaces"], ["digitalocean-spaces", "digitalocean_spaces"], ["digitalocean_spaces", "digitalocean_spaces"],
  ["custom", "custom_s3"], ["custom-s3", "custom_s3"], ["custom_s3", "custom_s3"],
  ["gcs", "gcs"], ["google", "gcs"], ["google-cloud-storage", "gcs"], ["google_cloud_storage", "gcs"],
  ["local", "local"], ["dev", "local"], ["filesystem", "local"],
]);
const storageProviderRaw = (values.get("STORAGE_PROVIDER") || "").trim().toLowerCase();
const storageProvider = storageProviderAliases.get(storageProviderRaw);
if (!storageProvider) errors.push("STORAGE_PROVIDER must be r2, s3, minio, wasabi, backblaze_b2, digitalocean_spaces, custom_s3, gcs, or local");
if (storageProvider === "local") errors.push("STORAGE_PROVIDER=local is not allowed for staging or production");

const firstStorageValue = (...keys) => keys.map((key) => values.get(key) || "").find(Boolean) || "";
if (storageProvider === "gcs") {
  if (!firstStorageValue("GCS_BUCKET", "STORAGE_GCS_BUCKET")) errors.push("STORAGE_PROVIDER=gcs requires GCS_BUCKET");
  const gcsCredentials = firstStorageValue("GCS_CREDENTIALS_JSON", "GOOGLE_CREDENTIALS_JSON", "GCS_KEY_FILE", "GOOGLE_APPLICATION_CREDENTIALS");
  const gcsPair = Boolean(values.get("GCS_CLIENT_EMAIL") && values.get("GCS_PRIVATE_KEY"));
  if (!gcsCredentials && !gcsPair) warnings.push("GCS credentials are not explicit; deployment must provide application-default credentials");
  const gcsJson = values.get("GCS_CREDENTIALS_JSON") || values.get("GOOGLE_CREDENTIALS_JSON");
  if (gcsJson) { try { JSON.parse(gcsJson); } catch { errors.push("GCS_CREDENTIALS_JSON must contain valid JSON"); } }
} else if (storageProvider && storageProvider !== "local") {
  const endpoint = firstStorageValue("STORAGE_S3_ENDPOINT", "S3_ENDPOINT");
  const region = firstStorageValue("STORAGE_S3_REGION", "S3_REGION", "AWS_REGION", "AWS_DEFAULT_REGION");
  const accessKey = firstStorageValue("STORAGE_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretKey = firstStorageValue("STORAGE_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const useDefaultCredentials = (values.get("STORAGE_S3_USE_DEFAULT_CREDENTIALS") || "false").toLowerCase() === "true";
  const bucket = firstStorageValue("STORAGE_S3_BUCKET", "S3_BUCKET", "CLOUDFLARE_R2_BUCKET");
  const r2AccountId = values.get("CLOUDFLARE_R2_ACCOUNT_ID") || "";
  const derivedEndpoint = storageProvider === "r2" && r2AccountId
    ? `https://${r2AccountId}.r2.cloudflarestorage.com`
    : storageProvider === "wasabi" && region
      ? `https://s3.${region}.wasabisys.com`
      : storageProvider === "digitalocean_spaces" && region
        ? `https://${region}.digitaloceanspaces.com`
        : "";
  const effectiveEndpoint = endpoint || derivedEndpoint;
  if (storageProvider !== "s3" && !effectiveEndpoint) errors.push(`${storageProvider} storage requires STORAGE_S3_ENDPOINT or compatible provider-specific endpoint settings`);
  if (effectiveEndpoint && !effectiveEndpoint.startsWith("https://")) errors.push("Storage endpoint must use HTTPS in staging or production");
  if (useDefaultCredentials && storageProvider !== "s3") errors.push("STORAGE_S3_USE_DEFAULT_CREDENTIALS=true is supported only with STORAGE_PROVIDER=s3");
  if (!useDefaultCredentials && !accessKey) errors.push("S3-compatible storage requires STORAGE_S3_ACCESS_KEY_ID or STORAGE_S3_USE_DEFAULT_CREDENTIALS=true for AWS S3");
  if (!useDefaultCredentials && !secretKey) errors.push("S3-compatible storage requires STORAGE_S3_SECRET_ACCESS_KEY or STORAGE_S3_USE_DEFAULT_CREDENTIALS=true for AWS S3");
  if (!bucket) errors.push("S3-compatible storage requires STORAGE_S3_BUCKET or a compatible legacy bucket setting");
  if (r2AccountId && !/^[a-f0-9]{32}$/i.test(r2AccountId)) errors.push("CLOUDFLARE_R2_ACCOUNT_ID must be a 32-character account identifier");
  if (bucket && !/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/i.test(bucket)) errors.push("Storage bucket name is invalid");
}
if (values.get("QUEUE_PROVIDER") !== "postgres") errors.push("QUEUE_PROVIDER must be postgres for the current Athoo release");
const cacheProvider = (values.get("CACHE_PROVIDER") || "memory").trim().toLowerCase();
if (!new Set(["memory", "disabled"]).has(cacheProvider)) {
  errors.push("CACHE_PROVIDER must be memory or disabled; redis remains reserved until the shared adapter migration is complete");
}
if (cacheProvider === "memory") warnings.push("CACHE_PROVIDER=memory is certified for one API instance only");
if (!values.get("METRICS_TOKEN")) warnings.push("METRICS_TOKEN is not set; protected operational metrics will be unavailable");
if (!values.get("SENTRY_DSN") && !values.get("ERROR_TRACKING_DSN")) warnings.push("No error-tracking DSN is configured");
const emailProviderLabel = (values.get("EMAIL_PROVIDER") || "smtp").trim().toLowerCase();
if (!/^[a-z0-9._-]{2,64}$/.test(emailProviderLabel)) errors.push("EMAIL_PROVIDER contains unsupported characters");
const emailDisabled = ["disabled", "off", "none"].includes(emailProviderLabel);
const emailConsole = emailProviderLabel === "console";
const emailHttp = ["http", "http_json", "api", "webhook"].includes(emailProviderLabel);
const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
const emailFromRaw = values.get("EMAIL_FROM_ADDRESS") || values.get("SMTP_FROM") || values.get("EMAIL_FROM") || "";
const emailFromMatch = emailFromRaw.match(/<([^<>]+)>\s*$/);
const emailFromAddress = (emailFromMatch?.[1] || emailFromRaw).trim();
const smtpConfigured = smtpKeys.every((key) => Boolean(values.get(key))) && Boolean(emailFromAddress);
const emailHttpEndpoint = values.get("EMAIL_HTTP_ENDPOINT") || "";
const emailHttpConfigured = Boolean(emailHttpEndpoint && emailFromAddress);
const emailConfigured = emailDisabled ? false : emailHttp ? emailHttpConfigured : smtpConfigured;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const boolValues = new Set(["true", "false"]);

if (emailConsole) errors.push("EMAIL_PROVIDER=console is not allowed in staging or production");
if (!emailDisabled && !emailConsole && !emailHttp && !smtpConfigured) {
  errors.push("EMAIL_PROVIDER uses the SMTP adapter, so SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM_ADDRESS (or EMAIL_FROM) are required");
}
if (emailHttp && !emailHttpConfigured) errors.push("EMAIL_PROVIDER=http_json requires EMAIL_HTTP_ENDPOINT and EMAIL_FROM_ADDRESS (or EMAIL_FROM)");
if (emailHttpEndpoint && !emailHttpEndpoint.startsWith("https://")) errors.push("EMAIL_HTTP_ENDPOINT must use HTTPS");
if (values.get("EMAIL_HTTP_HEALTHCHECK_URL") && !values.get("EMAIL_HTTP_HEALTHCHECK_URL").startsWith("https://")) errors.push("EMAIL_HTTP_HEALTHCHECK_URL must use HTTPS");
if (emailHttp && values.get("EMAIL_HTTP_METHOD") && !new Set(["POST", "PUT", "PATCH"]).has(values.get("EMAIL_HTTP_METHOD").toUpperCase())) errors.push("EMAIL_HTTP_METHOD must be POST, PUT, or PATCH");
for (const key of ["EMAIL_HTTP_HEADERS_JSON", "EMAIL_HTTP_BODY_TEMPLATE_JSON"]) {
  const raw = values.get(key);
  if (raw) { try { JSON.parse(raw); } catch { errors.push(`${key} must contain valid JSON`); } }
}
if (emailDisabled) warnings.push("Email delivery is disabled; email verification, email OTP, recovery email, and security email features will be unavailable");
if (!emailDisabled && emailFromAddress && !emailPattern.test(emailFromAddress)) {
  errors.push("EMAIL_FROM_ADDRESS/EMAIL_FROM must contain a valid email address");
}
if (values.get("EMAIL_REPLY_TO") && !emailPattern.test(values.get("EMAIL_REPLY_TO"))) errors.push("EMAIL_REPLY_TO must be a valid email address");
if (values.get("EMAIL_SUPPORT_ADDRESS") && !emailPattern.test(values.get("EMAIL_SUPPORT_ADDRESS"))) errors.push("EMAIL_SUPPORT_ADDRESS must be a valid email address");
if (values.get("EMAIL_BRAND_COLOR") && !/^#[0-9a-f]{6}$/i.test(values.get("EMAIL_BRAND_COLOR"))) errors.push("EMAIL_BRAND_COLOR must be a 6-digit HEX color");

const smtpPort = Number(values.get("SMTP_PORT") || 587);
if (!emailDisabled && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) errors.push("SMTP_PORT must be an integer from 1 to 65535");
for (const key of ["SMTP_SECURE", "SMTP_REQUIRE_TLS", "SMTP_TLS_REJECT_UNAUTHORIZED", "SMTP_POOL", "EMAIL_NEW_DEVICE_ALERTS_ENABLED", "EMAIL_MARKETING_ENABLED"]) {
  const value = values.get(key);
  if (value && !boolValues.has(value.toLowerCase())) errors.push(`${key} must be true or false`);
}
if (smtpPort === 465 && values.get("SMTP_SECURE") !== "true") errors.push("SMTP_PORT=465 requires SMTP_SECURE=true");
if (smtpPort === 587 && values.get("SMTP_SECURE") === "true") errors.push("SMTP_PORT=587 must use SMTP_SECURE=false so STARTTLS can be negotiated");
if (!emailDisabled && !emailHttp && values.get("SMTP_TLS_REJECT_UNAUTHORIZED") === "false") errors.push("SMTP_TLS_REJECT_UNAUTHORIZED=false is not allowed in staging or production");

function validateBoundedInteger(key, fallback, min, max) {
  const raw = values.get(key);
  const parsed = Number(raw || fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) errors.push(`${key} must be an integer from ${min} to ${max}`);
}
for (const key of ["ENABLE_LIVE_TRACKING"]) {
  const value = values.get(key);
  if (value && !boolValues.has(value.toLowerCase())) errors.push(`${key} must be true or false`);
}
if (values.get("BODY_LIMIT") && !/^\d+(?:kb|mb)$/i.test(values.get("BODY_LIMIT"))) errors.push("BODY_LIMIT must use a bounded size such as 512kb or 2mb");
validateBoundedInteger("MAX_JSON_DEPTH", 12, 4, 32);
validateBoundedInteger("MAX_STRING_FIELD_LENGTH", 1200000, 10000, 5000000);
validateBoundedInteger("GLOBAL_RATE_LIMIT_WINDOW_MS", 60000, 1000, 3600000);
validateBoundedInteger("GLOBAL_RATE_LIMIT_MAX", 600, 10, 10000);
validateBoundedInteger("UPLOAD_URL_RATE_LIMIT_MAX", 120, 1, 2000);
validateBoundedInteger("SLOW_REQUEST_MS", 1000, 100, 60000);
validateBoundedInteger("DB_POOL_MAX", 20, 1, 100);
validateBoundedInteger("DB_POOL_IDLE_MS", 30000, 1000, 600000);
validateBoundedInteger("DB_POOL_CONNECT_TIMEOUT_MS", 10000, 1000, 120000);
validateBoundedInteger("MAX_UPLOAD_BYTES", 209715200, 1048576, 524288000);
validateBoundedInteger("SIGNED_UPLOAD_TTL_SECONDS", 900, 60, 3600);
validateBoundedInteger("SIGNED_READ_TTL_SECONDS", 900, 60, 3600);
validateBoundedInteger("QUEUE_POLL_MS", 1000, 250, 60000);
validateBoundedInteger("QUEUE_CONCURRENCY", 4, 1, 20);
validateBoundedInteger("QUEUE_STALE_LOCK_MINUTES", 15, 1, 120);
validateBoundedInteger("QUEUE_COMPLETED_RETENTION_DAYS", 14, 1, 365);
validateBoundedInteger("QUEUE_RETRY_BASE_MS", 500, 100, 60000);
validateBoundedInteger("BROADCAST_DELIVERY_CONCURRENCY", 10, 1, 50);
validateBoundedInteger("MICRO_CACHE_TTL_MS", 2500, 0, 60000);
validateBoundedInteger("MICRO_CACHE_MAX_ITEMS", 500, 10, 10000);
validateBoundedInteger("MAX_CALL_AUDIO_CHUNK_B64", 900000, 10000, 2000000);
validateBoundedInteger("EMAIL_OTP_TTL_SECONDS", 600, 120, 1800);
validateBoundedInteger("EMAIL_OTP_RESEND_COOLDOWN_SECONDS", 45, 20, 300);
validateBoundedInteger("EMAIL_OTP_MAX_ATTEMPTS", 5, 3, 10);
validateBoundedInteger("EMAIL_VERIFICATION_RATE_LIMIT_MAX", 10, 1, 100);
validateBoundedInteger("EMAIL_VERIFICATION_ATTEMPT_RATE_LIMIT_MAX", 20, 1, 200);
validateBoundedInteger("EMAIL_CHANGE_RATE_LIMIT_MAX", 10, 1, 100);
validateBoundedInteger("EMAIL_CHANGE_VERIFY_RATE_LIMIT_MAX", 20, 1, 200);
validateBoundedInteger("EMAIL_ADMIN_TEST_RATE_LIMIT_MAX", 10, 1, 100);
validateBoundedInteger("EMAIL_QUEUE_MAX_ATTEMPTS", 4, 1, 10);
validateBoundedInteger("EMAIL_CHALLENGE_RETENTION_DAYS", 7, 1, 90);
validateBoundedInteger("EMAIL_DELIVERY_RETENTION_DAYS", 180, 30, 730);
validateBoundedInteger("EMAIL_MAINTENANCE_INTERVAL_MS", 21600000, 900000, 86400000);
validateBoundedInteger("EMAIL_MARKETING_MAX_RECIPIENTS", 500, 1, 10000);
validateBoundedInteger("SMTP_MAX_CONNECTIONS", 3, 1, 20);
validateBoundedInteger("SMTP_MAX_MESSAGES_PER_CONNECTION", 100, 1, 1000);
validateBoundedInteger("SMTP_CONNECTION_TIMEOUT_MS", 10000, 1000, 120000);
validateBoundedInteger("SMTP_GREETING_TIMEOUT_MS", 10000, 1000, 120000);
validateBoundedInteger("SMTP_SOCKET_TIMEOUT_MS", 20000, 1000, 180000);
validateBoundedInteger("EMAIL_HTTP_TIMEOUT_MS", 10000, 1000, 120000);

const marketingEnabled = (values.get("EMAIL_MARKETING_ENABLED") || "false").toLowerCase() === "true";
if (marketingEnabled && !emailConfigured) errors.push("EMAIL_MARKETING_ENABLED=true requires a configured email provider");
if (marketingEnabled) {
  const publicUrl = values.get("API_PUBLIC_URL") || values.get("API_BASE_URL") || "";
  if (!publicUrl.startsWith("https://")) errors.push("Marketing email requires API_PUBLIC_URL or API_BASE_URL to use HTTPS for unsubscribe links");
}
if (!values.get("EMAIL_OTP_HASH_SECRET") && !values.get("OTP_HASH_SECRET")) warnings.push("Email OTP hashing will fall back to JWT_SECRET; a separate EMAIL_OTP_HASH_SECRET is recommended");

const otpChannelAliases = new Map([
  ["whatsapp", "whatsapp_cloud"], ["whatsapp_cloud", "whatsapp_cloud"], ["meta_whatsapp", "whatsapp_cloud"],
  ["email", "email"], ["smtp", "email"],
  ["sms", "http_sms"], ["http_sms", "http_sms"], ["custom_sms", "http_sms"],
]);
const rawOtpChannels = (values.get("OTP_DELIVERY_CHANNELS") || "whatsapp_cloud,email")
  .split(",")
  .map((value) => value.trim().toLowerCase().replaceAll("-", "_"))
  .filter(Boolean);
const unknownOtpChannels = rawOtpChannels.filter((value) => !otpChannelAliases.has(value));
if (unknownOtpChannels.length) errors.push(`OTP_DELIVERY_CHANNELS contains unsupported channels: ${[...new Set(unknownOtpChannels)].join(", ")}`);
const otpChannels = [...new Set(rawOtpChannels.map((value) => otpChannelAliases.get(value)).filter(Boolean))];
if (!otpChannels.length) errors.push("OTP_DELIVERY_CHANNELS must include at least one supported delivery channel");
const otpDeliveryMode = (values.get("OTP_DELIVERY_MODE") || "first_success").toLowerCase();
if (!new Set(["all", "first_success"]).has(otpDeliveryMode)) errors.push("OTP_DELIVERY_MODE must be all or first_success");

const whatsappConfigured = Boolean(values.get("WHATSAPP_ACCESS_TOKEN") && values.get("WHATSAPP_PHONE_NUMBER_ID"));
const whatsappBaseUrl = values.get("WHATSAPP_GRAPH_BASE_URL") || "https://graph.facebook.com";
if (otpChannels.includes("whatsapp_cloud")) {
  if (!whatsappConfigured) warnings.push("OTP delivery requests include whatsapp_cloud, but its credentials are not configured; the adapter will skip this channel");
  if (!whatsappBaseUrl.startsWith("https://")) errors.push("WHATSAPP_GRAPH_BASE_URL must use HTTPS");
  if (values.get("WHATSAPP_GRAPH_API_VERSION") && !/^v\d+\.\d+$/.test(values.get("WHATSAPP_GRAPH_API_VERSION"))) errors.push("WHATSAPP_GRAPH_API_VERSION must use a value such as v25.0");
  if (values.get("WHATSAPP_OTP_TEMPLATE_NAME") && !/^[a-z0-9_]{1,512}$/.test(values.get("WHATSAPP_OTP_TEMPLATE_NAME"))) errors.push("WHATSAPP_OTP_TEMPLATE_NAME contains unsupported characters");
  if (values.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE") && !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(values.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE"))) errors.push("WHATSAPP_OTP_TEMPLATE_LANGUAGE must be a valid language code");
}
if (otpChannels.includes("email") && !emailConfigured) warnings.push("OTP delivery requests include email, but the selected email adapter is not configured; the adapter will skip this channel");
const smsProvider = (values.get("SMS_PROVIDER") || "disabled").toLowerCase();
if (otpChannels.includes("http_sms")) {
  if (smsProvider !== "http_json") warnings.push("OTP delivery requests include http_sms, but SMS_PROVIDER is not http_json; the adapter will skip this channel");
  const endpoint = values.get("SMS_HTTP_ENDPOINT") || "";
  if (smsProvider === "http_json" && !endpoint.startsWith("https://")) errors.push("SMS_HTTP_ENDPOINT must use HTTPS when the http_json provider is configured");
  for (const key of ["SMS_HTTP_PHONE_FIELD", "SMS_HTTP_MESSAGE_FIELD", "SMS_HTTP_SENDER_FIELD"]) {
    const value = values.get(key);
    if (value && !/^[a-zA-Z0-9_.-]{1,100}$/.test(value)) errors.push(`${key} contains unsupported characters`);
  }
  if (!values.get("SMS_HTTP_AUTH_VALUE")) warnings.push("http_sms delivery has no SMS_HTTP_AUTH_VALUE; confirm the provider intentionally allows unauthenticated requests");
}
const configuredOtpChannels = otpChannels.filter((channel) =>
  (channel === "whatsapp_cloud" && whatsappConfigured)
  || (channel === "email" && smtpConfigured)
  || (channel === "http_sms" && smsProvider === "http_json" && Boolean(values.get("SMS_HTTP_ENDPOINT"))),
);
if (!configuredOtpChannels.length) errors.push("No configured production OTP delivery channel is available; authentication OTP requests would return 503");
const configuredPhoneOtpChannels = configuredOtpChannels.filter((channel) => channel === "whatsapp_cloud" || channel === "http_sms");
if (!configuredPhoneOtpChannels.length) errors.push("No phone-bound OTP channel is configured; phone-number registration requires WhatsApp Cloud or the portable HTTP SMS adapter");
validateBoundedInteger("WHATSAPP_TIMEOUT_MS", 10000, 1000, 60000);
validateBoundedInteger("SMS_HTTP_TIMEOUT_MS", 10000, 1000, 60000);
if (values.get("ALLOW_DEV_OTP_RESPONSE") === "true") {
  errors.push("ALLOW_DEV_OTP_RESPONSE must not be true in staging or production");
}

const callProvider = (values.get("CALL_PROVIDER") || "webrtc").trim().toLowerCase();
if (!new Set(["webrtc", "webrtc-turn", "webrtc-stun", "cloudflare-turn", "audio-fallback"]).has(callProvider)) {
  errors.push("CALL_PROVIDER must be webrtc, webrtc-turn, webrtc-stun, cloudflare-turn, or audio-fallback");
}
const parseCsvValues = (...keys) => [...new Set(keys
  .flatMap((key) => String(values.get(key) || "").split(","))
  .map((value) => value.trim())
  .filter(Boolean))];
const stunUrls = parseCsvValues("STUN_URLS", "STUN_URL");
const turnUrls = parseCsvValues("TURN_URLS", "TURN_URL");
for (const url of stunUrls) if (!/^stuns?:/i.test(url)) errors.push(`Invalid STUN URL scheme: ${url}`);
for (const url of turnUrls) if (!/^turns?:/i.test(url)) errors.push(`Invalid TURN URL scheme: ${url}`);
const turnUsername = values.get("TURN_USERNAME") || "";
const turnCredential = values.get("TURN_CREDENTIAL") || "";
if (Boolean(turnUsername) !== Boolean(turnCredential)) errors.push("TURN_USERNAME and TURN_CREDENTIAL must be configured together");
const cloudflareTurnKeyId = values.get("CLOUDFLARE_TURN_KEY_ID") || "";
const cloudflareTurnApiToken = values.get("CLOUDFLARE_TURN_API_TOKEN") || "";
if (Boolean(cloudflareTurnKeyId) !== Boolean(cloudflareTurnApiToken)) {
  errors.push("CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN must be configured together");
}
const staticTurnReady = turnUrls.length > 0 && Boolean(turnUsername && turnCredential);
const cloudflareTurnReady = Boolean(cloudflareTurnKeyId && cloudflareTurnApiToken);
if (values.get("NODE_ENV") === "production" && !staticTurnReady && !cloudflareTurnReady) {
  errors.push("Production voice calling requires Cloudflare TURN credentials or static TURN_URLS, TURN_USERNAME, and TURN_CREDENTIAL");
}
validateBoundedInteger("CLOUDFLARE_TURN_TTL_SECONDS", 7200, 300, 172800);
validateBoundedInteger("CLOUDFLARE_TURN_TIMEOUT_MS", 6000, 1000, 20000);
validateBoundedInteger("CLOUDFLARE_TURN_CACHE_MAX_USERS", 2000, 100, 20000);
validateBoundedInteger("CALL_FALLBACK_CHUNK_MS", 400, 250, 2000);
validateBoundedInteger("INACTIVITY_SWEEP_MIN_INTERVAL_MS", 21600000, 900000, 86400000);
validateBoundedInteger("USER_ACTIVITY_WRITE_INTERVAL_MS", 600000, 60000, 86400000);
validateBoundedInteger("BOOKING_SWEEP_INTERVAL_MS", 60000, 10000, 3600000);

const releaseVersion = values.get("RELEASE_VERSION") || "";
const releaseCommit = values.get("RELEASE_COMMIT_SHA") || "";
const releaseBuildId = values.get("RELEASE_BUILD_ID") || "";
if (!releaseVersion) warnings.push("RELEASE_VERSION is not set; deployment health will report an unversioned release");
if (/REPLACE_WITH|CHANGE_ME|example/i.test(releaseVersion)) errors.push("RELEASE_VERSION must be replaced with the actual release identity");
if (releaseVersion && !/^[a-zA-Z0-9._+-]{1,80}$/.test(releaseVersion)) errors.push("RELEASE_VERSION contains unsupported characters");
if (releaseCommit && !/^[a-f0-9]{7,64}$/i.test(releaseCommit)) errors.push("RELEASE_COMMIT_SHA must contain 7 to 64 hexadecimal characters");
if (releaseBuildId && !/^[a-zA-Z0-9._:@+-]{1,160}$/.test(releaseBuildId)) errors.push("RELEASE_BUILD_ID contains unsupported characters");

const pushProvider = (values.get("PUSH_PROVIDER") || "expo").toLowerCase();
const normalizedPushProvider = ["disabled", "off", "none"].includes(pushProvider)
  ? "disabled"
  : ["http", "http_json", "api", "webhook"].includes(pushProvider) ? "http_json" : pushProvider;
if (!new Set(["expo", "http_json", "disabled"]).has(normalizedPushProvider)) errors.push("PUSH_PROVIDER must be expo, http_json, or disabled");
const pushEndpoint = values.get("PUSH_PROVIDER_ENDPOINT") || "";
if (normalizedPushProvider === "expo" && pushEndpoint && !pushEndpoint.startsWith("https://")) {
  errors.push("PUSH_PROVIDER_ENDPOINT must use HTTPS");
}
const pushReceiptEndpoint = values.get("PUSH_RECEIPT_ENDPOINT") || "https://exp.host/--/api/v2/push/getReceipts";
if (normalizedPushProvider === "expo" && !pushReceiptEndpoint.startsWith("https://")) {
  errors.push("PUSH_RECEIPT_ENDPOINT must use HTTPS");
}
const pushHttpEndpoint = values.get("PUSH_HTTP_ENDPOINT") || "";
if (normalizedPushProvider === "http_json" && !pushHttpEndpoint) errors.push("PUSH_PROVIDER=http_json requires PUSH_HTTP_ENDPOINT");
if (pushHttpEndpoint && !pushHttpEndpoint.startsWith("https://")) errors.push("PUSH_HTTP_ENDPOINT must use HTTPS");
if (values.get("PUSH_HTTP_METHOD") && !new Set(["POST", "PUT", "PATCH"]).has(values.get("PUSH_HTTP_METHOD").toUpperCase())) errors.push("PUSH_HTTP_METHOD must be POST, PUT, or PATCH");
for (const key of ["PUSH_HTTP_HEADERS_JSON", "PUSH_HTTP_MESSAGE_TEMPLATE_JSON", "PUSH_HTTP_BODY_TEMPLATE_JSON"]) {
  const raw = values.get(key);
  if (raw) { try { JSON.parse(raw); } catch { errors.push(`${key} must contain valid JSON`); } }
}
validateBoundedInteger("PUSH_TIMEOUT_MS", 10000, 1000, 60000);
validateBoundedInteger("PUSH_RECEIPT_TIMEOUT_MS", 10000, 1000, 60000);
validateBoundedInteger("PUSH_RECEIPT_DELAY_MS", 20000, 5000, 300000);
validateBoundedInteger("PUSH_RECEIPT_MAX_ATTEMPTS", 5, 1, 10);
validateBoundedInteger("EXPO_PUSH_BATCH_SIZE", 100, 1, 100);
validateBoundedInteger("PUSH_MAX_ATTEMPTS", 3, 1, 5);
validateBoundedInteger("PUSH_HTTP_TIMEOUT_MS", 10000, 1000, 60000);
validateBoundedInteger("PUSH_HTTP_BATCH_SIZE", 100, 1, 500);
const notificationChannelKeys = [
  "NOTIFICATION_JOB_CHANNEL_ID",
  "NOTIFICATION_MESSAGE_CHANNEL_ID",
  "NOTIFICATION_GENERAL_CHANNEL_ID",
  "NOTIFICATION_CALL_CHANNEL_ID",
];
const configuredChannelIds = notificationChannelKeys
  .map((key) => values.get(key))
  .filter(Boolean);
if (new Set(configuredChannelIds).size !== configuredChannelIds.length) {
  errors.push("Notification channel IDs must be unique");
}
for (const key of notificationChannelKeys) {
  const value = values.get(key);
  if (value && !/^[a-z0-9._-]{1,100}$/i.test(value)) errors.push(`${key} contains unsupported characters`);
}
const channelVersion = values.get("NOTIFICATION_CHANNEL_VERSION") || "4";
if (!/^[a-z0-9._-]{1,20}$/i.test(channelVersion)) errors.push("NOTIFICATION_CHANNEL_VERSION contains unsupported characters");
const conventionalChannelPrefixes = new Map([
  ["NOTIFICATION_JOB_CHANNEL_ID", "jobs"],
  ["NOTIFICATION_MESSAGE_CHANNEL_ID", "messages"],
  ["NOTIFICATION_GENERAL_CHANNEL_ID", "general"],
  ["NOTIFICATION_CALL_CHANNEL_ID", "calls"],
]);
for (const [key, prefix] of conventionalChannelPrefixes) {
  const value = values.get(key);
  if (value && value.startsWith(`${prefix}-v`) && value !== `${prefix}-v${channelVersion}`) {
    errors.push(`${key} must match NOTIFICATION_CHANNEL_VERSION (${prefix}-v${channelVersion})`);
  }
}
for (const key of [
  "NOTIFICATION_JOB_SOUND",
  "NOTIFICATION_MESSAGE_SOUND",
  "NOTIFICATION_GENERAL_SOUND",
  "NOTIFICATION_CALL_SOUND",
]) {
  const value = values.get(key);
  if (value && !/^[a-z0-9._-]+\.(wav|mp3|caf)$/i.test(value)) errors.push(`${key} must be a bundled notification sound filename`);
}

const mapProvider = (values.get("MAP_PROVIDER") || "open").toLowerCase();
const mapDefaults = mapProvider === "mapbox"
  ? { tile: "mapbox", search: "mapbox", reverse: "mapbox", directions: "mapbox" }
  : mapProvider === "tomtom"
    ? { tile: "tomtom", search: "tomtom", reverse: "tomtom", directions: "tomtom" }
    : mapProvider === "disabled"
      ? { tile: "disabled", search: "disabled", reverse: "disabled", directions: "disabled" }
      : ["open", "openstreetmap", "osm"].includes(mapProvider)
        ? { tile: "openstreetmap", search: "photon", reverse: "photon", directions: "osrm" }
        : { tile: "custom", search: "custom", reverse: "custom", directions: "custom" };
const mapTileProvider = (values.get("MAP_TILE_PROVIDER") || mapDefaults.tile).toLowerCase();
const mapSearchProvider = (values.get("MAP_SEARCH_PROVIDER") || mapDefaults.search).toLowerCase();
const mapReverseProvider = (values.get("MAP_REVERSE_PROVIDER") || mapDefaults.reverse).toLowerCase();
const mapDirectionsProvider = (values.get("MAP_DIRECTIONS_PROVIDER") || mapDefaults.directions).toLowerCase();
const fallbackEnabled = (values.get("MAP_PROVIDER_FALLBACK_ENABLED") || "false").toLowerCase() === "true";
const mapSearchFallbackProvider = (values.get("MAP_SEARCH_FALLBACK_PROVIDER") || (fallbackEnabled ? "photon" : "disabled")).toLowerCase();
const mapReverseFallbackProvider = (values.get("MAP_REVERSE_FALLBACK_PROVIDER") || (fallbackEnabled ? "photon" : "disabled")).toLowerCase();
const mapDirectionsFallbackProvider = (values.get("MAP_DIRECTIONS_FALLBACK_PROVIDER") || (fallbackEnabled && mapDirectionsProvider !== "osrm" ? "osrm" : "disabled")).toLowerCase();
const allowedTileProviders = new Set(["custom", "mapbox", "tomtom", "openstreetmap", "disabled"]);
const allowedSearchProviders = new Set(["photon", "nominatim", "mapbox", "tomtom", "custom", "disabled"]);
const allowedDirectionsProviders = new Set(["osrm", "mapbox", "tomtom", "custom", "disabled"]);
if (!/^[a-z0-9._-]{2,64}$/.test(mapProvider)) errors.push("MAP_PROVIDER contains unsupported characters");
if (!allowedTileProviders.has(mapTileProvider)) errors.push("MAP_TILE_PROVIDER must be custom, mapbox, tomtom, openstreetmap, or disabled");
if (!allowedSearchProviders.has(mapSearchProvider)) errors.push("MAP_SEARCH_PROVIDER must be photon, nominatim, mapbox, tomtom, custom, or disabled");
if (!allowedSearchProviders.has(mapReverseProvider)) errors.push("MAP_REVERSE_PROVIDER must be photon, nominatim, mapbox, tomtom, custom, or disabled");
if (!allowedDirectionsProviders.has(mapDirectionsProvider)) errors.push("MAP_DIRECTIONS_PROVIDER must be osrm, mapbox, tomtom, custom, or disabled");
if (!allowedSearchProviders.has(mapSearchFallbackProvider)) errors.push("MAP_SEARCH_FALLBACK_PROVIDER is unsupported");
if (!allowedSearchProviders.has(mapReverseFallbackProvider)) errors.push("MAP_REVERSE_FALLBACK_PROVIDER is unsupported");
if (!allowedDirectionsProviders.has(mapDirectionsFallbackProvider)) errors.push("MAP_DIRECTIONS_FALLBACK_PROVIDER is unsupported");
for (const key of [
  "MAP_PROVIDER_FALLBACK_ENABLED",
  "MAPBOX_GEOCODING_PERMANENT",
  "MAP_CUSTOM_GEOCODING_CACHEABLE",
  "MAP_TILE_ALLOW_OSM_DEVELOPMENT",
  "NOMINATIM_SEARCH_FALLBACK",
  "TOMTOM_TRAFFIC_ENABLED",
]) {
  const value = values.get(key);
  if (value && !boolValues.has(value.toLowerCase())) errors.push(`${key} must be true or false`);
}
const selectedMapProviders = [
  mapTileProvider,
  mapSearchProvider,
  mapReverseProvider,
  mapDirectionsProvider,
  ...(fallbackEnabled ? [mapSearchFallbackProvider, mapReverseFallbackProvider, mapDirectionsFallbackProvider] : []),
];
const mapboxRequested = selectedMapProviders.includes("mapbox");
const tomtomRequested = selectedMapProviders.includes("tomtom");
const mapboxGeocodingRequested = [mapSearchProvider, mapReverseProvider].includes("mapbox");
if (mapboxRequested && !values.get("MAPBOX_ACCESS_TOKEN")) errors.push("MAPBOX_ACCESS_TOKEN is required when any map service uses Mapbox");
if (tomtomRequested && !values.get("TOMTOM_API_KEY")) errors.push("TOMTOM_API_KEY is required when any map service uses TomTom");

const customTileTemplate = values.get("MAP_TILE_UPSTREAM_URL") || values.get("MAP_CUSTOM_TILE_URL_TEMPLATE") || "";
if (mapTileProvider === "custom") {
  if (!customTileTemplate) errors.push("MAP_CUSTOM_TILE_URL_TEMPLATE or MAP_TILE_UPSTREAM_URL is required when MAP_TILE_PROVIDER=custom");
  if (customTileTemplate && (!customTileTemplate.includes("{z}") || !customTileTemplate.includes("{x}") || !customTileTemplate.includes("{y}"))) {
    errors.push("The custom tile URL template must contain {z}, {x}, and {y}");
  }
  if (customTileTemplate && !customTileTemplate.startsWith("https://")) errors.push("The custom tile URL template must use HTTPS");
  if (customTileTemplate.includes("{apiKey}") && !values.get("MAP_TILE_API_KEY") && !values.get("MAP_CUSTOM_API_KEY")) {
    errors.push("MAP_TILE_API_KEY or MAP_CUSTOM_API_KEY is required by the custom tile URL template");
  }
}
if (mapSearchProvider === "custom" && !values.get("MAP_CUSTOM_SEARCH_URL_TEMPLATE")) errors.push("MAP_CUSTOM_SEARCH_URL_TEMPLATE is required when custom search is selected");
if (mapReverseProvider === "custom" && !values.get("MAP_CUSTOM_REVERSE_URL_TEMPLATE")) errors.push("MAP_CUSTOM_REVERSE_URL_TEMPLATE is required when custom reverse geocoding is selected");
if (mapDirectionsProvider === "custom" && !values.get("MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE")) errors.push("MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE is required when custom directions are selected");
if (fallbackEnabled && mapSearchFallbackProvider === "custom" && !values.get("MAP_CUSTOM_SEARCH_URL_TEMPLATE")) errors.push("Custom search fallback requires MAP_CUSTOM_SEARCH_URL_TEMPLATE");
if (fallbackEnabled && mapReverseFallbackProvider === "custom" && !values.get("MAP_CUSTOM_REVERSE_URL_TEMPLATE")) errors.push("Custom reverse fallback requires MAP_CUSTOM_REVERSE_URL_TEMPLATE");
if (fallbackEnabled && mapDirectionsFallbackProvider === "custom" && !values.get("MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE")) errors.push("Custom directions fallback requires MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE");

if (mapTileProvider === "openstreetmap" && values.get("NODE_ENV") === "production") {
  errors.push("MAP_TILE_PROVIDER=openstreetmap is development-only; use tomtom, mapbox, or a custom production tile provider");
}
for (const key of [
  "MAPBOX_GEOCODING_BASE_URL",
  "MAPBOX_DIRECTIONS_BASE_URL",
  "TOMTOM_BASE_URL",
  "PHOTON_BASE_URL",
  "NOMINATIM_BASE_URL",
  "OSRM_BASE_URL",
  "MAP_CUSTOM_TILE_URL_TEMPLATE",
  "MAP_CUSTOM_SEARCH_URL_TEMPLATE",
  "MAP_CUSTOM_REVERSE_URL_TEMPLATE",
  "MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE",
]) {
  const value = values.get(key);
  if (value && !value.startsWith("https://")) errors.push(`${key} must use HTTPS`);
}
const customHeadersJson = values.get("MAP_CUSTOM_HEADERS_JSON");
if (customHeadersJson) {
  try {
    const parsed = JSON.parse(customHeadersJson);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") errors.push("MAP_CUSTOM_HEADERS_JSON must contain a JSON object");
  } catch {
    errors.push("MAP_CUSTOM_HEADERS_JSON must contain valid JSON");
  }
}
const mapboxTileSize = Number(values.get("MAPBOX_TILE_SIZE") || 512);
if (![256, 512].includes(mapboxTileSize)) errors.push("MAPBOX_TILE_SIZE must be 256 or 512");
const tomtomTileSize = Number(values.get("TOMTOM_TILE_SIZE") || 256);
if (![256, 512].includes(tomtomTileSize)) errors.push("TOMTOM_TILE_SIZE must be 256 or 512");
const customTileSize = Number(values.get("MAP_CUSTOM_TILE_SIZE") || 256);
if (![256, 512].includes(customTileSize)) errors.push("MAP_CUSTOM_TILE_SIZE must be 256 or 512");
const mapboxTileScale = values.get("MAPBOX_TILE_SCALE") || "";
if (mapboxTileScale && mapboxTileScale !== "@2x") errors.push("MAPBOX_TILE_SCALE must be empty or @2x");
validateBoundedInteger("MAP_TILE_MAX_ZOOM", 20, 1, 22);
validateBoundedInteger("GEO_RATE_LIMIT_WINDOW_MS", 60000, 1000, 3600000);
validateBoundedInteger("GEO_SEARCH_RATE_LIMIT_MAX", 60, 1, 10000);
validateBoundedInteger("GEO_REVERSE_RATE_LIMIT_MAX", 60, 1, 10000);
validateBoundedInteger("GEO_DIRECTIONS_RATE_LIMIT_MAX", 60, 1, 10000);
const respectUpstreamCache = values.get("MAP_TILE_RESPECT_UPSTREAM_CACHE");
if (respectUpstreamCache && !boolValues.has(respectUpstreamCache.toLowerCase())) errors.push("MAP_TILE_RESPECT_UPSTREAM_CACHE must be true or false");
const publicTileSizeRaw = values.get("EXPO_PUBLIC_MAP_TILE_SIZE");
if (publicTileSizeRaw) {
  const publicTileSize = Number(publicTileSizeRaw);
  if (![256, 512].includes(publicTileSize)) errors.push("EXPO_PUBLIC_MAP_TILE_SIZE must be 256 or 512");
}
if (values.get("MAPBOX_GEOCODING_PERMANENT") !== "true" && mapboxGeocodingRequested) {
  warnings.push("Mapbox geocoding is temporary; Athoo will not persist Mapbox search or reverse-geocoding results");
}
if ([mapSearchProvider, mapReverseProvider].includes("custom") && values.get("MAP_CUSTOM_GEOCODING_CACHEABLE") !== "true") {
  warnings.push("Custom geocoding is non-cacheable until MAP_CUSTOM_GEOCODING_CACHEABLE=true is explicitly approved");
}

if (errors.length) {
  console.error(JSON.stringify({ valid: false, file: envPath, errors, warnings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, file: envPath, warnings }, null, 2));

