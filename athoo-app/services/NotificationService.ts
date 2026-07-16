import { appLogger } from "@/lib/logger";
import { isExpoGoRuntime } from "@/lib/runtimeEnvironment";
import {
  cleanupDeprecatedNotificationChannels,
  deprecatedNotificationChannelIds,
  notificationCategoryForType,
  notificationPolicies,
  type NotificationCategory,
} from "@/config/notifications";
import { soundService } from "@/services/SoundService";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";

function normalizeApiBaseUrl(value: string): string {
  return String(value || "").trim().replace(/\/$/, "");
}

let Notifications: typeof import("expo-notifications") | null = null;
let handlerConfigured = false;

async function loadNotifications() {
  if (Notifications) return Notifications;
  try {
    Notifications = await import("expo-notifications");

    if (!handlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerConfigured = true;
    }
  } catch {
    Notifications = null;
  }
  return Notifications;
}

export type NotificationDiagnostics = {
  supported: boolean;
  expoGo: boolean;
  permissionGranted: boolean;
  channelsCreated: boolean;
  projectIdConfigured: boolean;
  policies: typeof notificationPolicies;
};

class NotificationService {
  private channelsCreated = false;
  private permissionGranted = false;
  private initPromise: Promise<void> | null = null;
  private syncedToken: string | null = null;
  private blockedAlertShown = false;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init().catch((error) => {
      // Permit a later foreground retry after a temporary native-module error.
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    if (Platform.OS === "web" || isExpoGoRuntime()) return;
    const N = await loadNotifications();
    if (!N) return;

    try {
      await this.ensureAndroidChannels(N);

      const { status: existing, canAskAgain: existingCanAsk } = await N.getPermissionsAsync();
      let final = existing;
      let canAskAgainFinal = existingCanAsk;

      if (existing !== "granted") {
        const result = await N.requestPermissionsAsync();
        final = result.status;
        canAskAgainFinal = result.canAskAgain;
      }

      this.permissionGranted = final === "granted";

      if (!this.permissionGranted && canAskAgainFinal === false && !this.blockedAlertShown) {
        this.blockedAlertShown = true;
        Alert.alert(
          "Notifications Disabled",
          "Enable notifications to receive job alerts, chat messages, incoming calls, and booking updates.",
          [
            { text: "Not Now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (error) {
      appLogger.debug("notifications", "Notification initialization failed:", error);
    }
  }

  private async ensureAndroidChannels(N: typeof import("expo-notifications")): Promise<void> {
    if (Platform.OS !== "android" || this.channelsCreated) return;

    if (cleanupDeprecatedNotificationChannels) {
      for (const channelId of deprecatedNotificationChannelIds) {
        try {
          await N.deleteNotificationChannelAsync(channelId);
        } catch {
          // A missing or OS-managed channel is harmless.
        }
      }
    }

    const visibility = N.AndroidNotificationVisibility?.PRIVATE;
    const audioUsage = (N as any).AndroidAudioUsage;
    const audioContentType = (N as any).AndroidAudioContentType;
    for (const policy of Object.values(notificationPolicies)) {
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
        showBadge: true,
        ...(visibility ? { lockscreenVisibility: visibility } : {}),
        ...(audioUsage && audioContentType
          ? {
              audioAttributes: {
                usage:
                  policy.category === "call"
                    ? audioUsage.NOTIFICATION_RINGTONE
                    : audioUsage.NOTIFICATION,
                contentType: audioContentType.SONIFICATION,
              },
            }
          : {}),
      } as any);
    }
    this.channelsCreated = true;
  }

  resetSyncedToken(): void {
    this.syncedToken = null;
  }

  async getDiagnostics(): Promise<NotificationDiagnostics> {
    await this.init().catch(() => undefined);
    return {
      supported: Platform.OS !== "web" && !isExpoGoRuntime(),
      expoGo: isExpoGoRuntime(),
      permissionGranted: this.permissionGranted,
      channelsCreated: this.channelsCreated,
      projectIdConfigured: Boolean(
        Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId,
      ),
      policies: notificationPolicies,
    };
  }

  async getExpoPushToken(): Promise<string | null> {
    if (Platform.OS === "web" || isExpoGoRuntime()) return null;
    await this.init();
    const N = await loadNotifications();
    if (!N || !this.permissionGranted) return null;

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId;

      if (!projectId) {
        appLogger.warn("notifications", "EAS project ID is missing; push token cannot be generated");
        return null;
      }

      const token = await N.getExpoPushTokenAsync({ projectId });
      return token?.data || null;
    } catch (error) {
      appLogger.debug("notifications", "getExpoPushToken failed:", error);
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
      appLogger.debug("notifications", "syncPushToken failed:", error);
    }
  }

  /**
   * Realtime WebSocket events only need an audio fallback in runtimes that do
   * not receive native remote push sounds. Native builds rely on the server
   * push, preventing duplicate foreground sounds and duplicate notifications.
   */
  async playRealtimeFallback(type: unknown): Promise<void> {
    if (Platform.OS !== "web" && !isExpoGoRuntime()) return;
    const category = notificationCategoryForType(type);
    if (category === "call" || category === "job") {
      await soundService.playRingtone().catch(() => soundService.playNotification());
      return;
    }
    if (category === "message") {
      await soundService.playMessage().catch(() => soundService.playNotification());
      return;
    }
    await soundService.playNotification();
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
    if (Platform.OS === "web" || isExpoGoRuntime()) {
      await this.playRealtimeFallback(type).catch(() => undefined);
      return;
    }
    await this.init();
    const N = await loadNotifications();
    if (!N || !this.permissionGranted) return;

    const policy = notificationPolicies[category];
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
      appLogger.debug("notifications", "schedule notification failed:", error);
    }
  }

  async clearBadge(): Promise<void> {
    if (Platform.OS === "web" || isExpoGoRuntime()) return;
    const N = await loadNotifications();
    if (!N) return;
    try {
      await N.setBadgeCountAsync(0);
    } catch {}
  }
}

export { notificationCategoryForType } from "@/config/notifications";
export type { NotificationCategory } from "@/config/notifications";
export const notificationService = new NotificationService();
