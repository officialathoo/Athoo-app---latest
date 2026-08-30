import { db } from "@workspace/db";
import { notificationTemplatesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

// Admin-authored notification templates (notification_templates table) were
// historically CRUD-only: editing a template never changed what users actually
// received. This renderer closes that loop — notifyUser()/notifyUsers() consult
// it right before delivery, so an active template whose key matches the
// notification type overrides the hardcoded title/body.
//
// Matching rules (first hit wins):
//   1. data.templateKey — explicit per-call override
//   2. key === notification type (e.g. "booking", "message", "account")
// Placeholders: {{variable}} resolved from data + extras (userName, appName).
// Unmatched placeholders are stripped. Failures degrade silently to the
// built-in copy — templating must never break delivery.

type PushTemplateRow = { key: string; subject: string | null; body: string };
type TemplateOverride = { title: string; body: string };

const TEMPLATE_CACHE_TTL_MS = 30_000;
let templateCache: { rows: PushTemplateRow[]; fetchedAt: number } | null = null;
let templateCacheInflight: Promise<PushTemplateRow[]> | null = null;

function configuredAppName(): string {
  return String(process.env.APP_DISPLAY_NAME || process.env.BRAND_DISPLAY_NAME || "Athoo").trim() || "Athoo";
}

async function loadActivePushTemplates(): Promise<PushTemplateRow[]> {
  const now = Date.now();
  if (templateCache && now - templateCache.fetchedAt < TEMPLATE_CACHE_TTL_MS) {
    return templateCache.rows;
  }
  if (templateCacheInflight) return templateCacheInflight;

  templateCacheInflight = db
    .select({ key: notificationTemplatesTable.key, subject: notificationTemplatesTable.subject, body: notificationTemplatesTable.body })
    .from(notificationTemplatesTable)
    .where(and(eq(notificationTemplatesTable.channel, "push"), eq(notificationTemplatesTable.isActive, true)))
    .limit(500)
    .then((rows) => {
      templateCache = { rows, fetchedAt: Date.now() };
      return rows;
    })
    .finally(() => {
      templateCacheInflight = null;
    });
  return templateCacheInflight;
}

export function invalidateNotificationTemplateCache(): void {
  templateCache = null;
}

export function renderNotificationText(text: string, variables: Record<string, unknown>): string {
  const rendered = String(text || "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, rawKey: string) => {
    const value = variables[rawKey] ?? variables[rawKey.toLowerCase()];
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
  return rendered.replace(/[ \t]{2,}/g, " ").trim();
}

export async function resolvePushTemplateOverride(
  type: string,
  data?: Record<string, unknown> | null,
  extras?: Record<string, unknown>,
): Promise<TemplateOverride | null> {
  try {
    const normalizedType = String(type || "").trim();
    if (!normalizedType) return null;
    const rows = await loadActivePushTemplates();
    if (!rows.length) return null;

    const explicitKey = data && typeof (data as any).templateKey === "string" ? String((data as any).templateKey).trim() : "";
    const template = (explicitKey && rows.find((row) => row.key === explicitKey))
      || rows.find((row) => row.key === normalizedType);
    if (!template) return null;

    const variables: Record<string, unknown> = {
      ...(data || {}),
      ...(extras || {}),
      type: normalizedType,
      appName: configuredAppName(),
    };
    // templateKey is routing metadata, not copy material.
    delete (variables as any).templateKey;

    const title = template.subject ? renderNotificationText(template.subject, variables) : "";
    const body = renderNotificationText(template.body, variables);
    if (!body) return null;
    return { title: title || "", body };
  } catch (error) {
    logger.warn({ err: error, type }, "notification template override resolution failed");
    return null;
  }
}
