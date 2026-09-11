import { db } from "@workspace/db";
import { notificationPreferencesTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

export type NotificationCategoryKey = "jobs" | "messages" | "calls" | "general";

type PreferenceRow = {
  userId: string;
  jobsEnabled: boolean;
  messagesEnabled: boolean;
  callsEnabled: boolean;
  generalEnabled: boolean;
};

const COLUMN_BY_CATEGORY: Record<NotificationCategoryKey, keyof Omit<PreferenceRow, "userId">> = {
  jobs: "jobsEnabled",
  messages: "messagesEnabled",
  calls: "callsEnabled",
  general: "generalEnabled",
};

export async function ensureNotificationPreferences(userId: string): Promise<PreferenceRow> {
  const inserted = await db
    .insert(notificationPreferencesTable)
    .values({ userId })
    .onConflictDoNothing({ target: notificationPreferencesTable.userId })
    .returning();
  if (inserted.length > 0) return inserted[0] as PreferenceRow;

  const existing = await db.query.notificationPreferencesTable.findFirst({
    where: eq(notificationPreferencesTable.userId, userId),
  });
  return existing as PreferenceRow;
}

export function categoryAllowed(row: PreferenceRow | null | undefined, category: NotificationCategoryKey): boolean {
  if (!row) return true;
  const flag = row[COLUMN_BY_CATEGORY[category]];
  return flag !== false;
}

export type UserCategoryAllowance = Map<string, Set<NotificationCategoryKey>>;

export async function getCategoryAllowances(userIds: string[]): Promise<UserCategoryAllowance> {
  const ids = [...new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const allowance: UserCategoryAllowance = new Map();
  if (ids.length === 0) return allowance;

  const rows = await db
    .select()
    .from(notificationPreferencesTable)
    .where(inArray(notificationPreferencesTable.userId, ids));

  const allCategories = Object.keys(COLUMN_BY_CATEGORY) as NotificationCategoryKey[];
  for (const id of ids) allowance.set(id, new Set(allCategories));
  for (const row of rows as PreferenceRow[]) {
    const allowed = allowance.get(row.userId);
    if (!allowed) continue;
    for (const category of allCategories) {
      if (!categoryAllowed(row, category)) allowed.delete(category);
    }
  }
  return allowance;
}
