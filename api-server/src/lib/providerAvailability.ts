import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type DaySchedule = { enabled: boolean; startTime: string; endTime: string };
export type WeeklySchedule = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DaySchedule>;

export const DEFAULT_PROVIDER_SCHEDULE: WeeklySchedule = {
  mon: { enabled: true, startTime: "09:00", endTime: "18:00" },
  tue: { enabled: true, startTime: "09:00", endTime: "18:00" },
  wed: { enabled: true, startTime: "09:00", endTime: "18:00" },
  thu: { enabled: true, startTime: "09:00", endTime: "18:00" },
  fri: { enabled: true, startTime: "09:00", endTime: "18:00" },
  sat: { enabled: true, startTime: "09:00", endTime: "17:00" },
  sun: { enabled: false, startTime: "10:00", endTime: "16:00" },
};

export const providerScheduleKey = (providerId: string) => `schedule:${providerId}`;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIME_RE = /^(?:[01]\d|2[0-3]):(?:00|30)$/;

export function validateProviderSchedule(value: unknown): { schedule?: WeeklySchedule; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "A complete weekly schedule is required" };
  const input = value as Record<string, unknown>;
  const schedule = {} as WeeklySchedule;
  for (const day of DAYS) {
    const row = input[day] as Partial<DaySchedule> | undefined;
    if (!row || typeof row !== "object") return { error: `Schedule for ${day} is required` };
    const startTime = String(row.startTime || "");
    const endTime = String(row.endTime || "");
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { error: `${day} times must use 30-minute HH:MM slots` };
    if (row.enabled && startTime >= endTime) return { error: `${day} end time must be after start time` };
    schedule[day] = { enabled: Boolean(row.enabled), startTime, endTime };
  }
  if (!DAYS.some((day) => schedule[day].enabled)) return { error: "At least one availability day must be enabled" };
  return { schedule };
}

export async function getProviderSchedule(providerId: string): Promise<WeeklySchedule> {
  const row = await db.query.appSettingsTable.findFirst({ where: eq(appSettingsTable.key, providerScheduleKey(providerId)) });
  const checked = validateProviderSchedule(row?.value);
  return checked.schedule || DEFAULT_PROVIDER_SCHEDULE;
}

export async function saveProviderSchedule(providerId: string, schedule: WeeklySchedule): Promise<void> {
  await db.insert(appSettingsTable).values({ key: providerScheduleKey(providerId), value: schedule, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: schedule, updatedAt: new Date() } });
}

function weekdayKey(date: string): keyof WeeklySchedule | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00+05:00`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[parsed.getUTCDay()];
}

function normalizedTime(value: string): string | null {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ap = String(match[3] || "").toUpperCase();
  if (ap === "PM" && hour < 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || ![0, 30].includes(minute)) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export async function providerScheduleAllows(providerId: string, date: string, time: string): Promise<boolean> {
  const day = weekdayKey(date);
  const normalized = normalizedTime(time);
  if (!day || !normalized) return false;
  const schedule = await getProviderSchedule(providerId);
  const row = schedule[day];
  return row.enabled && normalized >= row.startTime && normalized < row.endTime;
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function validateTravelRadius(value: unknown): number | null {
  const radius = Number(value);
  return Number.isInteger(radius) && radius >= 1 && radius <= 100 ? radius : null;
}

export function providerWithinRadius(provider: { latitude?: string | null; longitude?: string | null; maxTravelDistanceKm?: number | null }, customerLat: number, customerLng: number): { allowed: boolean; distanceKm?: number; radiusKm?: number } {
  const providerLat = Number(provider.latitude);
  const providerLng = Number(provider.longitude);
  const radiusKm = validateTravelRadius(provider.maxTravelDistanceKm) || 15;
  if (!Number.isFinite(providerLat) || !Number.isFinite(providerLng)) return { allowed: false, radiusKm };
  const distance = distanceKm(customerLat, customerLng, providerLat, providerLng);
  return { allowed: distance <= radiusKm, distanceKm: Math.round(distance * 10) / 10, radiusKm };
}
