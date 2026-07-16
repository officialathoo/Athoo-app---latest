import { queueStats } from "./queue";
import { getMapConfigurationStatus } from "./mapConfiguration";
import { getCallConfigurationStatus } from "./callConfiguration";

export type ReadinessIssue = { area: string; severity: "critical" | "high" | "medium"; message: string; fix: string };

export function productionReadinessSnapshot() {
  const issues: ReadinessIssue[] = [];
  const required = ["DATABASE_URL", "JWT_SECRET", "CORS_ORIGIN"];
  for (const key of required) {
    if (!process.env[key]) issues.push({ area: "environment", severity: "critical", message: `${key} is missing`, fix: `Set ${key} in production environment.` });
  }
  const jwtSecret = String(process.env.JWT_SECRET || "");
  if (jwtSecret && jwtSecret.length < 32) issues.push({ area: "security", severity: "critical", message: "JWT_SECRET is too short", fix: "Use a cryptographically random secret of at least 32 characters." });
  if (process.env.NODE_ENV === "production" && String(process.env.CORS_ORIGIN || "").trim() === "*") issues.push({ area: "security", severity: "critical", message: "CORS_ORIGIN cannot be wildcard in production", fix: "Set an explicit comma-separated admin/app origin allowlist." });
  if (process.env.NODE_ENV === "production" && ["local", "dev", "filesystem"].includes(String(process.env.STORAGE_PROVIDER || "").toLowerCase())) issues.push({ area: "storage", severity: "critical", message: "Local storage is not allowed in production", fix: "Configure Cloudflare R2 or another S3-compatible private object store." });
  if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS) issues.push({ area: "storage", severity: "medium", message: "Public object prefix is using the default", fix: "Set PUBLIC_OBJECT_SEARCH_PATHS to explicit public-only prefixes." });
  if (String(process.env.QUEUE_PROVIDER || "postgres").toLowerCase() !== "postgres") issues.push({ area: "scaling", severity: "high", message: "Unsupported queue provider configured", fix: "Use QUEUE_PROVIDER=postgres for the built-in durable queue." });
  const callStatus = getCallConfigurationStatus();
  if (!callStatus.productionReady) issues.push({ area: "calls", severity: "high", message: callStatus.warning || "Production voice calling is not ready", fix: "Set valid TURN_URLS (or legacy TURN_URL), TURN_USERNAME, and TURN_CREDENTIAL for reliable calls." });
  if (!process.env.SENTRY_DSN && !process.env.ERROR_TRACKING_DSN) issues.push({ area: "monitoring", severity: "medium", message: "Error tracking is not configured", fix: "Add Sentry or equivalent DSN for crash/error tracking." });
  if (process.env.NODE_ENV === "production" && !process.env.INCIDENT_COMMANDER_CONTACT) issues.push({ area: "operations", severity: "high", message: "Incident commander contact is not configured", fix: "Set INCIDENT_COMMANDER_CONTACT for production escalation." });
  if (process.env.NODE_ENV === "production" && !process.env.SUPPORT_ESCALATION_EMAIL) issues.push({ area: "operations", severity: "high", message: "Support escalation email is not configured", fix: "Set SUPPORT_ESCALATION_EMAIL for beta and production escalation." });
  if (process.env.NODE_ENV === "production" && !process.env.STATUS_PAGE_URL) issues.push({ area: "operations", severity: "medium", message: "Status page is not configured", fix: "Set an HTTPS STATUS_PAGE_URL for customer-facing incident communication." });
  const mapStatus = getMapConfigurationStatus();
  if (process.env.NODE_ENV === "production" && !mapStatus.configured) {
    issues.push({
      area: "maps",
      severity: "high",
      message: mapStatus.error || "Production map services are not configured",
      fix: "Select MAP_PROVIDER/MAP_*_PROVIDER values and configure the selected provider credentials or custom tile URL.",
    });
  }
  if (process.env.NODE_ENV === "production" && mapStatus.searchProvider === "disabled") {
    issues.push({ area: "maps", severity: "high", message: "Location search is disabled", fix: "Set MAP_SEARCH_PROVIDER to mapbox, photon, or nominatim." });
  }
  if (process.env.NODE_ENV === "production" && mapStatus.reverseProvider === "disabled") {
    issues.push({ area: "maps", severity: "high", message: "Reverse geocoding is disabled", fix: "Set MAP_REVERSE_PROVIDER to mapbox, photon, or nominatim." });
  }
  if (process.env.NODE_ENV === "production" && mapStatus.directionsProvider === "disabled") {
    issues.push({ area: "maps", severity: "high", message: "Road directions are disabled", fix: "Set MAP_DIRECTIONS_PROVIDER to mapbox or osrm." });
  }
  return {
    status: issues.some(i => i.severity === "critical") ? "not_ready" : issues.length ? "ready_with_warnings" : "ready",
    generatedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    queue: queueStats(),
    issues,
  };
}
