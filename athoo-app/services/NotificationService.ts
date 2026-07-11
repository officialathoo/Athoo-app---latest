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
    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    if (Platform.OS === "web" || isExpoGo()) return;
    const N = await loadNotifications();
    if (!N) return;
    try {
      if (Platform.OS === "android" && !this.channelsCreated) {
        this.channelsCreated = true;
        await N.setNotificationChannelAsync("bookings", {
          name: "Booking Alerts",
          importance: N.AndroidImportance.MAX,
          vibrationPattern: [0, 400, 200, 400],
          lightColor: "#1A6EE0",
          sound: "default",
          enableVibrate: true,
        });
        await N.setNotificationChannelAsync("messages", {
          name: "Messages",
          importance: N.AndroidImportance.HIGH,
          vibrationPattern: [0, 250],
          lightColor: "#8B5CF6",
          sound: "default",
          enableVibrate: true,
        });
        await N.setNotificationChannelAsync("status", {
          name: "Booking Updates",
          importance: N.AndroidImportance.HIGH,
          vibrationPattern: [0, 300, 100, 300],
          lightColor: "#22C55E",
          sound: "default",
          enableVibrate: true,
        });
        await N.setNotificationChannelAsync("broadcast", {
          name: "Broadcast Jobs",
          importance: N.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500, 200, 500],
          lightColor: "#F97316",
          sound: "default",
          enableVibrate: true,
        });
        await N.setNotificationChannelAsync("responses", {
          name: "Provider Responses",
          importance: N.AndroidImportance.MAX,
          vibrationPattern: [0, 400, 200, 400],
          lightColor: "#F97316",
          sound: "default",
          enableVibrate: true,
        });
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

      // Only show the "Open Settings" alert when the permission is permanently
      // blocked (canAskAgain === false). If the user just tapped "Don't Allow"
      // for the first time, stay silent — don't nag them immediately.
      if (!this.permissionGranted && canAskAgainFinal === false) {
        Alert.alert(
          "Notifications Disabled",
          "Enable notifications to receive job alerts, chat messages, and booking updates. Tap Open Settings → Athoo → Notifications.",
          [
            { text: "Not Now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (e) {
      console.log("Notification init error:", e);
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
    } catch (e) {
      console.log("getExpoPushToken error:", e);
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
    } catch (e) {
      console.log("syncPushToken error:", e);
    }
  }

  async scheduleBookingAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("bookings", "booking", title, body, data, [0, 400, 200, 400]);
  }

  async scheduleMessageAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("messages", "message", title, body, data);
  }

  async scheduleStatusAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("status", "status", title, body, data, [0, 300, 100, 300]);
  }

  async scheduleBroadcastAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("broadcast", "broadcast", title, body, data, [0, 500, 200, 500, 200, 500]);
  }

  async scheduleResponseAlert(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.schedule("responses", "broadcast", title, body, data, [0, 400, 200, 400]);
  }

  private async schedule(channelId: string, type: string, title: string, body: string, data?: Record<string, unknown>, vibrate?: number[]) {
    if (Platform.OS === "web" || isExpoGo()) return;
    await this.init();
    const N = await loadNotifications();
    if (!N || !this.permissionGranted) return;
    try {
      await N.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: "default",
          priority: N.AndroidNotificationPriority.HIGH,
          vibrate,
          data: { type, channelId, ...(data || {}) },
        },
        trigger: null,
      });
    } catch (e) {
      console.log("schedule notification error:", e);
    }
  }

  async clearBadge(): Promise<void> {
    if (Platform.OS === "web" || isExpoGo()) return;
    const N = await loadNotifications();
    if (!N) return;
    try { await N.setBadgeCountAsync(0); } catch {}
  }
}

export const notificationService = new NotificationService();

