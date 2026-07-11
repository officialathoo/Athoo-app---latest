import crypto from "crypto";
import { db } from "@workspace/db";
import { appSettingsTable, usersTable, type User } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "platform";

// ─── In-process settings cache ────────────────────────────────────────────────
// getPlatformSettings is called on every booking, broadcast, and dashboard
// request. Without a cache, each request hits the DB unnecessarily.
// Cache is busted immediately when savePlatformSettings() is called.
let _settingsCache: { value: PlatformSettings; fetchedAt: number } | null = null;
const SETTINGS_CACHE_TTL_MS = 60_000; // 60 seconds

export function bustSettingsCache(): void {
  _settingsCache = null;
}

export type PlatformSettings = {
  commissionRate: number;
  defaultCommissionLimit: number;
  platformName: string;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultVisitCharge: number;
  maxBookingsPerDay: number;
  appVersion: string;
  minBookingNoticeHours: number;
  allowGuestBrowsing: boolean;
  providerAutoApprove: boolean;
  bookingCancellationWindowHours: number;
  // Broadcast
  broadcastTTLMinutes: number;
  broadcastInitialRadiusKm: number;
  broadcastExpansionRadiusKm: number;
  broadcastExpandAfterMinutes: number;
  // Negotiation
  maxNegotiationRounds: number;
  // Premium
  premiumCommissionDiscountPercent: number;
  premiumPriorityBoost: boolean;
  premiumProfileBadgeEnabled: boolean;
  // Service area
  defaultServiceRadiusKm: number;
  // Cancellation fees
  customerCancellationFee: number;
  providerCancellationPenalty: number;
};

export function generateId(): string {
  return crypto.randomUUID();
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  commissionRate: 10,
  defaultCommissionLimit: 5000,
  platformName: "Athoo",
  supportPhone: "+92 339 0051068",
  supportEmail: "support@athoo.pk",
  maintenanceMode: false,
  defaultVisitCharge: 200,
  maxBookingsPerDay: 10,
  appVersion: "1.0.0",
  minBookingNoticeHours: 1,
  allowGuestBrowsing: true,
  providerAutoApprove: false,
  bookingCancellationWindowHours: 1,
  broadcastTTLMinutes: 3,
  broadcastInitialRadiusKm: 30,
  broadcastExpansionRadiusKm: 50,
  broadcastExpandAfterMinutes: 5,
  maxNegotiationRounds: 3,
  premiumCommissionDiscountPercent: 0,
  premiumPriorityBoost: true,
  premiumProfileBadgeEnabled: true,
  defaultServiceRadiusKm: 25,
  customerCancellationFee: 0,
  providerCancellationPenalty: 0,
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  // Return cached value if fresh
  if (_settingsCache && Date.now() - _settingsCache.fetchedAt < SETTINGS_CACHE_TTL_MS) {
    return _settingsCache.value;
  }

  const row = await db.query.appSettingsTable.findFirst({
    where: eq(appSettingsTable.key, SETTINGS_KEY),
  });

  if (!row || typeof row.value !== "object" || row.value === null) {
    await db.insert(appSettingsTable).values({
      key: SETTINGS_KEY,
      value: DEFAULT_PLATFORM_SETTINGS,
      updatedAt: new Date(),
    }).onConflictDoNothing();
    _settingsCache = { value: DEFAULT_PLATFORM_SETTINGS, fetchedAt: Date.now() };
    return DEFAULT_PLATFORM_SETTINGS;
  }

  const v = row.value as Record<string, unknown>;

  function num(key: string, def: number): number {
    const n = Number(v[key]);
    return Number.isFinite(n) ? n : def;
  }
  function bool(key: string, def: boolean): boolean {
    return v[key] !== undefined ? Boolean(v[key]) : def;
  }
  function str(key: string, def: string): string {
    return String(v[key] || def);
  }

  const computed: PlatformSettings = {
    commissionRate: num("commissionRate", DEFAULT_PLATFORM_SETTINGS.commissionRate),
    defaultCommissionLimit: num("defaultCommissionLimit", DEFAULT_PLATFORM_SETTINGS.defaultCommissionLimit),
    platformName: str("platformName", DEFAULT_PLATFORM_SETTINGS.platformName),
    supportPhone: str("supportPhone", DEFAULT_PLATFORM_SETTINGS.supportPhone),
    supportEmail: str("supportEmail", DEFAULT_PLATFORM_SETTINGS.supportEmail),
    maintenanceMode: bool("maintenanceMode", DEFAULT_PLATFORM_SETTINGS.maintenanceMode),
    defaultVisitCharge: num("defaultVisitCharge", DEFAULT_PLATFORM_SETTINGS.defaultVisitCharge),
    maxBookingsPerDay: num("maxBookingsPerDay", DEFAULT_PLATFORM_SETTINGS.maxBookingsPerDay),
    appVersion: str("appVersion", DEFAULT_PLATFORM_SETTINGS.appVersion),
    minBookingNoticeHours: num("minBookingNoticeHours", DEFAULT_PLATFORM_SETTINGS.minBookingNoticeHours),
    allowGuestBrowsing: bool("allowGuestBrowsing", DEFAULT_PLATFORM_SETTINGS.allowGuestBrowsing),
    providerAutoApprove: bool("providerAutoApprove", DEFAULT_PLATFORM_SETTINGS.providerAutoApprove),
    bookingCancellationWindowHours: num("bookingCancellationWindowHours", DEFAULT_PLATFORM_SETTINGS.bookingCancellationWindowHours),
    broadcastTTLMinutes: num("broadcastTTLMinutes", DEFAULT_PLATFORM_SETTINGS.broadcastTTLMinutes),
    broadcastInitialRadiusKm: num("broadcastInitialRadiusKm", DEFAULT_PLATFORM_SETTINGS.broadcastInitialRadiusKm),
    broadcastExpansionRadiusKm: num("broadcastExpansionRadiusKm", DEFAULT_PLATFORM_SETTINGS.broadcastExpansionRadiusKm),
    broadcastExpandAfterMinutes: num("broadcastExpandAfterMinutes", DEFAULT_PLATFORM_SETTINGS.broadcastExpandAfterMinutes),
    maxNegotiationRounds: num("maxNegotiationRounds", DEFAULT_PLATFORM_SETTINGS.maxNegotiationRounds),
    premiumCommissionDiscountPercent: num("premiumCommissionDiscountPercent", DEFAULT_PLATFORM_SETTINGS.premiumCommissionDiscountPercent),
    premiumPriorityBoost: bool("premiumPriorityBoost", DEFAULT_PLATFORM_SETTINGS.premiumPriorityBoost),
    premiumProfileBadgeEnabled: bool("premiumProfileBadgeEnabled", DEFAULT_PLATFORM_SETTINGS.premiumProfileBadgeEnabled),
    defaultServiceRadiusKm: num("defaultServiceRadiusKm", DEFAULT_PLATFORM_SETTINGS.defaultServiceRadiusKm),
    customerCancellationFee: num("customerCancellationFee", DEFAULT_PLATFORM_SETTINGS.customerCancellationFee),
    providerCancellationPenalty: num("providerCancellationPenalty", DEFAULT_PLATFORM_SETTINGS.providerCancellationPenalty),
  };
  _settingsCache = { value: computed, fetchedAt: Date.now() };
  return computed;
}


export class PlatformSettingsValidationError extends Error {}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new PlatformSettingsValidationError(`${name} must be between ${min} and ${max}`);
  }
}

function validatePlatformSettings(settings: PlatformSettings): void {
  assertRange("commissionRate", settings.commissionRate, 0, 50);
  assertRange("defaultCommissionLimit", settings.defaultCommissionLimit, 100, 10_000_000);
  assertRange("defaultVisitCharge", settings.defaultVisitCharge, 0, 100_000);
  assertRange("maxBookingsPerDay", settings.maxBookingsPerDay, 1, 100);
  assertRange("minBookingNoticeHours", settings.minBookingNoticeHours, 0, 168);
  assertRange("bookingCancellationWindowHours", settings.bookingCancellationWindowHours, 0, 168);
  assertRange("broadcastTTLMinutes", settings.broadcastTTLMinutes, 1, 60);
  assertRange("broadcastInitialRadiusKm", settings.broadcastInitialRadiusKm, 1, 100);
  assertRange("broadcastExpansionRadiusKm", settings.broadcastExpansionRadiusKm, 1, 200);
  if (settings.broadcastExpansionRadiusKm < settings.broadcastInitialRadiusKm) {
    throw new PlatformSettingsValidationError("broadcastExpansionRadiusKm cannot be smaller than broadcastInitialRadiusKm");
  }
  assertRange("broadcastExpandAfterMinutes", settings.broadcastExpandAfterMinutes, 1, 60);
  assertRange("maxNegotiationRounds", settings.maxNegotiationRounds, 1, 10);
  assertRange("premiumCommissionDiscountPercent", settings.premiumCommissionDiscountPercent, 0, 100);
  assertRange("defaultServiceRadiusKm", settings.defaultServiceRadiusKm, 1, 100);
  assertRange("customerCancellationFee", settings.customerCancellationFee, 0, 100_000);
  assertRange("providerCancellationPenalty", settings.providerCancellationPenalty, 0, 100_000);
  if (!settings.platformName.trim() || settings.platformName.length > 80) throw new PlatformSettingsValidationError("platformName must be 1-80 characters");
  if (!/^\S+@\S+\.\S+$/.test(settings.supportEmail)) throw new PlatformSettingsValidationError("supportEmail must be valid");
  if (settings.supportPhone.length > 30) throw new PlatformSettingsValidationError("supportPhone is too long");
  if (!/^\d+\.\d+\.\d+([+-][A-Za-z0-9.-]+)?$/.test(settings.appVersion)) throw new PlatformSettingsValidationError("appVersion must be a semantic version such as 1.0.0");
}

export async function savePlatformSettings(input: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const current = await getPlatformSettings();

  function takeNum(key: keyof PlatformSettings): number {
    const v = input[key];
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? n : (current[key] as number);
  }
  function takeBool(key: keyof PlatformSettings): boolean {
    return input[key] !== undefined ? Boolean(input[key]) : (current[key] as boolean);
  }
  function takeStr(key: keyof PlatformSettings): string {
    return input[key] !== undefined ? String(input[key]) : (current[key] as string);
  }

  const next: PlatformSettings = {
    commissionRate: takeNum("commissionRate"),
    defaultCommissionLimit: takeNum("defaultCommissionLimit"),
    platformName: takeStr("platformName"),
    supportPhone: takeStr("supportPhone"),
    supportEmail: takeStr("supportEmail"),
    maintenanceMode: takeBool("maintenanceMode"),
    defaultVisitCharge: takeNum("defaultVisitCharge"),
    maxBookingsPerDay: takeNum("maxBookingsPerDay"),
    appVersion: takeStr("appVersion"),
    minBookingNoticeHours: takeNum("minBookingNoticeHours"),
    allowGuestBrowsing: takeBool("allowGuestBrowsing"),
    providerAutoApprove: takeBool("providerAutoApprove"),
    bookingCancellationWindowHours: takeNum("bookingCancellationWindowHours"),
    broadcastTTLMinutes: takeNum("broadcastTTLMinutes"),
    broadcastInitialRadiusKm: takeNum("broadcastInitialRadiusKm"),
    broadcastExpansionRadiusKm: takeNum("broadcastExpansionRadiusKm"),
    broadcastExpandAfterMinutes: takeNum("broadcastExpandAfterMinutes"),
    maxNegotiationRounds: takeNum("maxNegotiationRounds"),
    premiumCommissionDiscountPercent: takeNum("premiumCommissionDiscountPercent"),
    premiumPriorityBoost: takeBool("premiumPriorityBoost"),
    premiumProfileBadgeEnabled: takeBool("premiumProfileBadgeEnabled"),
    defaultServiceRadiusKm: takeNum("defaultServiceRadiusKm"),
    customerCancellationFee: takeNum("customerCancellationFee"),
    providerCancellationPenalty: takeNum("providerCancellationPenalty"),
  };

  validatePlatformSettings(next);

  await db.insert(appSettingsTable).values({
    key: SETTINGS_KEY,
    value: next,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: appSettingsTable.key,
    set: { value: next, updatedAt: new Date() },
  });

  // Immediately populate cache with new value so the next read doesn't hit DB.
  _settingsCache = { value: next, fetchedAt: Date.now() };
  return next;
}

export function toPublicProvider(user: User | null | undefined) {
  if (!user) return null;
  // IMPORTANT: Financial fields (pendingCommission, totalCommission, commissionLimit)
  // and block status must NOT be exposed to customers or other providers —
  // only the provider themselves and admins should see them.
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage,
    profileColor: user.profileColor,
    bio: user.bio,
    experience: user.experience,
    services: user.services,
    location: user.location,
    isVerified: user.isVerified,
    isAvailable: user.isAvailable,
    rating: user.rating,
    ratingCount: user.ratingCount,
    totalJobs: user.totalJobs,
    ratePerHour: user.ratePerHour,
    joinedAt: user.joinedAt,
  };
}

export function toSafeUser<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

