import Constants from "expo-constants";

export type NotificationCategory = "job" | "message" | "general" | "call";

export type NotificationPolicy = {
  category: NotificationCategory;
  channelId: string;
  channelName: string;
  sound: string;
  importance: "max" | "high";
  vibrationPattern: number[];
  lightColor: string;
};

type RawPolicy = Partial<Omit<NotificationPolicy, "category">>;

type RawNotificationConfig = {
  cleanupDeprecatedChannels?: boolean;
  deprecatedChannelIds?: string[] | string;
  policies?: Partial<Record<NotificationCategory, RawPolicy>>;
};

const DEFAULT_POLICIES: Record<NotificationCategory, NotificationPolicy> = {
  job: {
    category: "job",
    channelId: "jobs-v3",
    channelName: "Jobs and Booking Alerts",
    sound: "athoo_job.wav",
    importance: "max",
    vibrationPattern: [0, 500, 180, 500, 180, 500],
    lightColor: "#F97316",
  },
  message: {
    category: "message",
    channelId: "messages-v3",
    channelName: "Chat Messages",
    sound: "athoo_message.wav",
    importance: "high",
    vibrationPattern: [0, 220, 120, 220],
    lightColor: "#8B5CF6",
  },
  general: {
    category: "general",
    channelId: "general-v3",
    channelName: "General Updates",
    sound: "athoo_general.wav",
    importance: "high",
    vibrationPattern: [0, 300, 120, 300],
    lightColor: "#1A6EE0",
  },
  call: {
    category: "call",
    channelId: "calls-v3",
    channelName: "Incoming Calls",
    sound: "athoo_call.wav",
    importance: "max",
    vibrationPattern: [0, 700, 250, 700, 250, 700],
    lightColor: "#22C55E",
  },
};

function nonEmptyString(value: unknown, fallback: string): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function validChannelId(value: unknown, fallback: string): string {
  const normalized = nonEmptyString(value, fallback);
  return /^[a-z0-9._-]{1,100}$/i.test(normalized) ? normalized : fallback;
}

function validSoundName(value: unknown, fallback: string): string {
  const normalized = nonEmptyString(value, fallback);
  return /^[a-z0-9._-]+\.(wav|mp3|caf)$/i.test(normalized) ? normalized : fallback;
}

function validColor(value: unknown, fallback: string): string {
  const normalized = nonEmptyString(value, fallback);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function vibration(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 10_000)
    .slice(0, 12);
  return cleaned.length >= 2 ? cleaned : fallback;
}

function buildPolicy(category: NotificationCategory, raw: RawPolicy | undefined): NotificationPolicy {
  const fallback = DEFAULT_POLICIES[category];
  return {
    category,
    channelId: validChannelId(raw?.channelId, fallback.channelId),
    channelName: nonEmptyString(raw?.channelName, fallback.channelName),
    sound: validSoundName(raw?.sound, fallback.sound),
    importance: raw?.importance === "max" ? "max" : raw?.importance === "high" ? "high" : fallback.importance,
    vibrationPattern: vibration(raw?.vibrationPattern, fallback.vibrationPattern),
    lightColor: validColor(raw?.lightColor, fallback.lightColor),
  };
}

const extra = (Constants.expoConfig?.extra || {}) as Record<string, unknown>;
const rawConfig = (extra.NOTIFICATION_CONFIG || {}) as RawNotificationConfig;

export const notificationPolicies: Record<NotificationCategory, NotificationPolicy> = {
  job: buildPolicy("job", rawConfig.policies?.job),
  message: buildPolicy("message", rawConfig.policies?.message),
  general: buildPolicy("general", rawConfig.policies?.general),
  call: buildPolicy("call", rawConfig.policies?.call),
};

const rawDeprecated = rawConfig.deprecatedChannelIds;
export const deprecatedNotificationChannelIds = Array.from(
  new Set(
    (Array.isArray(rawDeprecated)
      ? rawDeprecated
      : String(rawDeprecated || "jobs-v2,messages-v2,general-v2,calls-v2").split(","))
      .map((item) => String(item || "").trim())
      .filter((item) => /^[a-z0-9._-]{1,100}$/i.test(item))
      .filter((item) => !Object.values(notificationPolicies).some((policy) => policy.channelId === item)),
  ),
);

export const cleanupDeprecatedNotificationChannels = rawConfig.cleanupDeprecatedChannels !== false;

export function notificationCategoryForType(type: unknown): NotificationCategory {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "call" || normalized === "incoming_call") return "call";
  if (normalized === "message" || normalized === "chat") return "message";
  if (
    normalized === "booking" ||
    normalized === "broadcast" ||
    normalized === "job" ||
    normalized === "negotiation" ||
    normalized === "provider_response"
  ) {
    return "job";
  }
  return "general";
}
