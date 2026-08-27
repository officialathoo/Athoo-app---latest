import crypto from "crypto";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db/schema";
import { logger } from "./logger";

export type UserAuditEvent = {
  /** Authenticated user who performed the action. */
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  target?: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * Persist a user-initiated event into the shared audit_log so admins can trace
 * important account activity that has no dedicated table (role switches,
 * credential changes, booking lifecycle actions, profile edits, ...).
 *
 * Follows the existing `account.self_*` convention where the acting user is
 * recorded in the admin identity columns. Audit writes must never break the
 * user-facing request, so failures are logged and swallowed.
 */
export async function recordUserEvent(event: UserAuditEvent): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      id: crypto.randomUUID(),
      adminId: event.actorId,
      adminName: event.actorName?.trim() || "user",
      adminRole: event.actorRole ?? null,
      action: event.action,
      target: event.target || "user",
      targetId: event.targetId || event.actorId,
      details: (event.details ?? null) as never,
      ip: event.ip ?? null,
    });
  } catch (error) {
    logger.warn(
      { err: error, action: event.action, actorId: event.actorId },
      "user audit event write failed",
    );
  }
}
