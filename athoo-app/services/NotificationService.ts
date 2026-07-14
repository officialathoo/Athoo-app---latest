import { appLogger } from "@/lib/logger";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";

function normalizeApiBaseUrl(value: string): string {
  return String(value || "").trim().replace(/\/$/, "");
}

function isExpoGo(): boolean {
  const C = Constants as any;
  const owner = String(C?.appOwnership || "").toLowerCase();
  const env = String(C?.executionEnvironment || "").toLowerCase();
  return owner === "expo" || owner === "guest" || env.includes("storeclient") || (!!__DEV__ && owner !== "standalone");
}

export type NotificationCategory = "job" | "message" | "general" | "call";

type NotificationPolicy = {
  channelId: string;
  channelName: string;
  sound: string;
  importance: "max" | "high";
  vibrationPattern: number[];
  lightColor: string;
};

const NOTIFICATION_POLICIES: Record<NotificationCategory, NotificationPolicy> = {
  job: {
    channelId: "jobs-v2",
    channelName: "Jobs and Booking Alerts",
    sound: "athoo_job.wav",
    importance: "max",
    vibrationPattern: [0, 500, 180, 500, 180, 500],
    lightColor: "#F97316",
  },
  message: {
    channelId: "messages-v2",
    channelName: "Chat Messages",
    sound: "athoo_message.wav",
    importance: "high",
    vibrationPattern: [0, 220, 120, 220],
    lightColor: "#8B5CF6",
  },
  general: {
    channelId: "general-v2",
    channelName: "General Updates",
    sound: "athoo_general.wav",
    importance: "high",
    vibrationPattern: [0, 300, 120, 300],
    lightColor: "#1A6EE0",
  },
  call: {
    channelId: "calls-v2",
    channelName: "Incoming Calls",
    sound: "athoo_call.wav",
    importance: "max",
    vibrationPattern: [0, 700, 250, 700, 250, 700],
    lightColor: "#22C55E",
  },
};

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

let Notifications: typeof import("expo-notifications") | null = null;

async function loadNotifications() {
  if (Notifications) return Notifications;
  try {
    Notifications = await import("expo-notifications");

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    Notifications = null;
  }
  return Notifications;
}

class NotificationService {
  private channelsCreated = false;
  private permissionGranted = false;
  private initPromise: Promise<void> | null = null;
  private syncedToken: string | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init().catch((error) => {
      // Allow a later foreground retry after a temporary native-module failure.
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    if (Platform.OS === "web" || isExpoGo()) return;
    const N = await loadNotifications();
    if (!N) return;

    try {
      if (Platform.OS === "android" && !this.channelsCreated) {
        const visibility = N.AndroidNotificationVisibility?.PRIVATE;
        for (const policy of Object.values(NOTIFICATION_POLICIES)) {
          await N.setNotificationChannelAsync(policy.channelId, {
            name: policy.channelName,
            importance:
              policy.importance === "max"
                ? N.AndroidImportance.MAX
                : N.AndroidImportance.HIGH,
            vibrationPattern: policy.vibrationPattern,
            lightColor: policy.lightColor,
            sound: policy.sound,
            enableVibrate: true,
            enableLights: true,
            ...(visibility ? { lockscreenVisibility: visibility } : {}),
          });
        }
        this.channelsCreated = true;
      }

      const { status: existing, canAskAgain: existingCanAsk } = await N.getPermissionsAsync();
      let final = existing;
      let canAskAgainFinal = existingCanAsk;

      if (existing !== "granted") {
        const result = await N.requestPermissionsAsync();
        final = result.status;
        canAskAgainFinal = result.canAskAgain;
      }

      this.permissionGranted = final === "granted";

      if (!this.permissionGranted && canAskAgainFinal === false) {
        Alert.alert(
          "Notifications Disabled",
          "Enable notifications to receive job alerts, chat messages, calls, and booking updates. Tap Open Settings → Athoo → Notifications.",
          [
            { text: "Not Now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (error) {
      appLogger.debug("notifications", "Notification init error:", error);
    }
  }

  resetSyncedToken(): void {
    this.syncedToken = null;
  }

  async getExpoPushToken(): Promise<string | null> {
    if (Platform.OS === "web" || isExpoGo()) return null;
    await this.init();
    const N = await loadNotifications();
    if (!N || !this.permissionGranted) return null;

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId;

      if (!projectId) return null;

      const token = await N.getExpoPushTokenAsync({ projectId });
      return token?.data || null;
    } catch (error) {
      appLogger.debug("notifications", "getExpoPushToken error:", error);
      return null;
    }
  }

  async syncPushToken(apiBaseUrl: string, authToken: string): Promise<void> {
    if (!apiBaseUrl || !authToken) return;

    const expoPushToken = await this.getExpoPushToken();
    if (!expoPushToken || this.syncedToken === expoPushToken) return;

    try {
      const response = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}/api/auth/push-token`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ expoPushToken }),
      });
      if (!response.ok) throw new Error(`Push token sync failed (${response.status})`);
      this.syncedToken = expoPushToken;
    } catch (error) {
      appLogger.debug("notifications", "syncPushToken error:", error);
    }
  }

  async scheduleBookingAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("job", "booking", title, body, data);
  }

  async scheduleMessageAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("message", "message", title, body, data);
  }

  async scheduleStatusAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("general", "status", title, body, data);
  }

  async scheduleBroadcastAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("job", "broadcast", title, body, data);
  }

  async scheduleResponseAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("job", "provider_response", title, body, data);
  }

  async scheduleCallAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("call", "call", title, body, data);
  }

  private async schedule(
    category: NotificationCategory,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (Platform.OS === "web" || isExpoGo()) return;
    await this.init();
    const N = await loadNotifications();
    if (!N || !this.permissionGranted) return;

    const policy = NOTIFICATION_POLICIES[category];
    try {
      await N.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: policy.sound,
          priority: N.AndroidNotificationPriority.HIGH,
          vibrate: policy.vibrationPattern,
          data: {
            type,
            notificationCategory: category,
            channelId: policy.channelId,
            ...(data || {}),
          },
        },
        trigger:
          Platform.OS === "android"
            ? ({ seconds: 1, channelId: policy.channelId, repeats: false } as any)
            : null,
      });
    } catch (error) {
      appLogger.debug("notifications", "schedule notification error:", error);
    }
  }

  async clearBadge(): Promise<void> {
    if (Platform.OS === "web" || isExpoGo()) return;
    const N = await loadNotifications();
    if (!N) return;
    try {
      await N.setBadgeCountAsync(0);
    } catch {}
  }
}

export const notificationService = new NotificationService();
