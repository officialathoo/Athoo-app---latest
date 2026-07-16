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
  "API_BASE_URL", "ADMIN_BASE_URL", "CORS_ORIGINS", "STORAGE_PROVIDER", "QUEUE_PROVIDER", "JWT_ISSUER", "JWT_AUDIENCE", "TRUST_PROXY",
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
if (values.get("STORAGE_PROVIDER") === "local") errors.push("STORAGE_PROVIDER=local is not allowed for staging or production");
if (values.get("QUEUE_PROVIDER") !== "postgres") errors.push("QUEUE_PROVIDER must be postgres for the current Athoo release");
if (!values.get("METRICS_TOKEN")) warnings.push("METRICS_TOKEN is not set; protected operational metrics will be unavailable");
if (!values.get("SENTRY_DSN") && !values.get("ERROR_TRACKING_DSN")) warnings.push("No error-tracking DSN is configured");
const emailProviderLabel = (values.get("EMAIL_PROVIDER") || "smtp").trim().toLowerCase();
if (!/^[a-z0-9._-]{2,64}$/.test(emailProviderLabel)) errors.push("EMAIL_PROVIDER contains unsupported characters");
const emailDisabled = ["disabled", "off", "none"].includes(emailProviderLabel);
const emailConsole = emailProviderLabel === "console";
const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM_ADDRESS"];
const smtpConfigured = smtpKeys.every((key) => Boolean(values.get(key)));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const boolValues = new Set(["true", "false"]);

if (emailConsole) errors.push("EMAIL_PROVIDER=console is not allowed in staging or production");
if (!emailDisabled && !emailConsole && !smtpConfigured) {
  errors.push("EMAIL_PROVIDER enables SMTP delivery, so SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM_ADDRESS are required");
}
if (emailDisabled) warnings.push("Email delivery is disabled; email verification, email OTP, recovery email, and security email features will be unavailable");
if (!emailDisabled && values.get("EMAIL_FROM_ADDRESS") && !emailPattern.test(values.get("EMAIL_FROM_ADDRESS"))) {
  errors.push("EMAIL_FROM_ADDRESS must be a valid email address");
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
if (!emailDisabled && values.get("SMTP_TLS_REJECT_UNAUTHORIZED") === "false") errors.push("SMTP_TLS_REJECT_UNAUTHORIZED=false is not allowed in staging or production");

function validateBoundedInteger(key, fallback, min, max) {
  const raw = values.get(key);
  const parsed = Number(raw || fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) errors.push(`${key} must be an integer from ${min} to ${max}`);
}
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

const marketingEnabled = (values.get("EMAIL_MARKETING_ENABLED") || "false").toLowerCase() === "true";
if (marketingEnabled && (emailDisabled || !smtpConfigured)) errors.push("EMAIL_MARKETING_ENABLED=true requires a configured SMTP email provider");
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
if (otpChannels.includes("email") && !smtpConfigured) warnings.push("OTP delivery requests include email, but SMTP is not configured; the adapter will skip this channel");
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

const releaseVersion = values.get("RELEASE_VERSION") || "";
const releaseCommit = values.get("RELEASE_COMMIT_SHA") || "";
const releaseBuildId = values.get("RELEASE_BUILD_ID") || "";
if (!releaseVersion) warnings.push("RELEASE_VERSION is not set; deployment health will report an unversioned release");
if (releaseVersion && !/^[a-zA-Z0-9._+-]{1,80}$/.test(releaseVersion)) errors.push("RELEASE_VERSION contains unsupported characters");
if (releaseCommit && !/^[a-f0-9]{7,64}$/i.test(releaseCommit)) errors.push("RELEASE_COMMIT_SHA must contain 7 to 64 hexadecimal characters");
if (releaseBuildId && !/^[a-zA-Z0-9._:@+-]{1,160}$/.test(releaseBuildId)) errors.push("RELEASE_BUILD_ID contains unsupported characters");

const pushProvider = (values.get("PUSH_PROVIDER") || "expo").toLowerCase();
const pushEndpoint = values.get("PUSH_PROVIDER_ENDPOINT") || "";
if (pushProvider === "expo" && pushEndpoint && !pushEndpoint.startsWith("https://")) {
  errors.push("PUSH_PROVIDER_ENDPOINT must use HTTPS");
}
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
const mapTileProvider = (values.get("MAP_TILE_PROVIDER") || (mapProvider === "mapbox" ? "mapbox" : "openstreetmap")).toLowerCase();
const mapSearchProvider = (values.get("MAP_SEARCH_PROVIDER") || (mapProvider === "mapbox" ? "mapbox" : "photon")).toLowerCase();
const mapReverseProvider = (values.get("MAP_REVERSE_PROVIDER") || mapSearchProvider).toLowerCase();
const mapDirectionsProvider = (values.get("MAP_DIRECTIONS_PROVIDER") || (mapProvider === "mapbox" ? "mapbox" : "osrm")).toLowerCase();
const allowedTileProviders = new Set(["custom", "mapbox", "openstreetmap", "disabled"]);
const allowedSearchProviders = new Set(["photon", "nominatim", "mapbox", "disabled"]);
const allowedDirectionsProviders = new Set(["osrm", "mapbox", "disabled"]);
if (!/^[a-z0-9._-]{2,64}$/.test(mapProvider)) errors.push("MAP_PROVIDER contains unsupported characters");
if (!allowedTileProviders.has(mapTileProvider)) errors.push("MAP_TILE_PROVIDER must be custom, mapbox, openstreetmap, or disabled");
if (!allowedSearchProviders.has(mapSearchProvider)) errors.push("MAP_SEARCH_PROVIDER must be photon, nominatim, mapbox, or disabled");
if (!allowedSearchProviders.has(mapReverseProvider)) errors.push("MAP_REVERSE_PROVIDER must be photon, nominatim, mapbox, or disabled");
if (!allowedDirectionsProviders.has(mapDirectionsProvider)) errors.push("MAP_DIRECTIONS_PROVIDER must be osrm, mapbox, or disabled");
for (const key of ["MAP_PROVIDER_FALLBACK_ENABLED", "MAPBOX_GEOCODING_PERMANENT", "MAP_TILE_ALLOW_OSM_DEVELOPMENT", "NOMINATIM_SEARCH_FALLBACK"]) {
  const value = values.get(key);
  if (value && !boolValues.has(value.toLowerCase())) errors.push(`${key} must be true or false`);
}
const mapboxRequested = [mapTileProvider, mapSearchProvider, mapReverseProvider, mapDirectionsProvider].includes("mapbox");
const mapboxGeocodingRequested = [mapSearchProvider, mapReverseProvider].includes("mapbox");
if (mapboxRequested && !values.get("MAPBOX_ACCESS_TOKEN")) errors.push("MAPBOX_ACCESS_TOKEN is required when any map service uses Mapbox");
if (mapTileProvider === "custom") {
  const template = values.get("MAP_TILE_UPSTREAM_URL") || "";
  if (!template) errors.push("MAP_TILE_UPSTREAM_URL is required when MAP_TILE_PROVIDER=custom");
  if (template && (!template.includes("{z}") || !template.includes("{x}") || !template.includes("{y}"))) {
    errors.push("MAP_TILE_UPSTREAM_URL must contain {z}, {x}, and {y}");
  }
  if (template && !template.startsWith("https://")) errors.push("MAP_TILE_UPSTREAM_URL must use HTTPS");
  if (template.includes("{apiKey}") && !values.get("MAP_TILE_API_KEY")) errors.push("MAP_TILE_API_KEY is required by MAP_TILE_UPSTREAM_URL");
}
if (mapTileProvider === "openstreetmap" && values.get("NODE_ENV") === "production") {
  errors.push("MAP_TILE_PROVIDER=openstreetmap is development-only; use mapbox or a custom production tile provider");
}
for (const key of ["MAPBOX_GEOCODING_BASE_URL", "MAPBOX_DIRECTIONS_BASE_URL", "PHOTON_BASE_URL", "NOMINATIM_BASE_URL", "OSRM_BASE_URL"]) {
  const value = values.get(key);
  if (value && !value.startsWith("https://")) errors.push(`${key} must use HTTPS`);
}
const mapboxTileSize = Number(values.get("MAPBOX_TILE_SIZE") || 512);
if (![256, 512].includes(mapboxTileSize)) errors.push("MAPBOX_TILE_SIZE must be 256 or 512");
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
  if (mapTileProvider === "mapbox" && publicTileSize !== mapboxTileSize) {
    errors.push("EXPO_PUBLIC_MAP_TILE_SIZE must match MAPBOX_TILE_SIZE when Mapbox tiles are selected");
  }
}
if (values.get("MAPBOX_GEOCODING_PERMANENT") !== "true" && mapboxGeocodingRequested) {
  warnings.push("Mapbox geocoding is temporary; Athoo will not persist Mapbox search or reverse-geocoding results");
}

if (errors.length) {
  console.error(JSON.stringify({ valid: false, file: envPath, errors, warnings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, file: envPath, warnings }, null, 2));

