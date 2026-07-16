import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { useAuth } from "@/context/AuthContext";
import { api, realtime } from "@/services/api";
import { resolveNotificationTarget } from "@/services/notificationRouting";
import { isExpoGoRuntime } from "@/lib/runtimeEnvironment";
import { notificationService } from "@/services/NotificationService";



type NotifType =
  | "booking"
  | "broadcast"
  | "negotiation"
  | "message"
  | "premium"
  | "call"
  | "refund"
  | "withdrawal"
  | "support"
  | "invoice"
  | "system"
  | "success"
  | "warning";

export type AppNotif = {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  role?: "customer" | "provider";
  bookingId?: string;
  chatId?: string;
  negotiationId?: string;
  broadcastRequestId?: string;
  callId?: string;
  refundId?: string;
  subscriptionId?: string;
  withdrawalId?: string;
  ticketId?: string;
  invoiceId?: string;
  link?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type NotifContextType = {
  notifications: AppNotif[];
  unreadCount: number;
  unreadMessageCount: number;
  push: (n: Omit<AppNotif, "id" | "timestamp" | "read">) => void;
  addNotification: (n: {
    title: string;
    body?: string;
    message?: string;
    type: NotifType;
    data?: {
      role?: "customer" | "provider";
      bookingId?: string;
      chatId?: string;
      negotiationId?: string;
      broadcastRequestId?: string;
      callId?: string;
      refundId?: string;
      subscriptionId?: string;
      withdrawalId?: string;
      ticketId?: string;
      invoiceId?: string;
      link?: string;
    };
  }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  handleNotificationPress: (notif: AppNotif) => void;
};

const NotifContext = createContext<NotifContextType | null>(null);

const STORAGE_KEY = "athoo_notifications_v2";

function getStorageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
}

const ICON_MAP: Record<NotifType, string> = {
  booking: "calendar",
  negotiation: "dollar-sign",
  message: "message-circle",
  system: "info",
  success: "check-circle",
  warning: "alert-triangle",
  broadcast: "radio",
  premium: "star",
  call: "phone-call",
  refund: "rotate-ccw",
  withdrawal: "credit-card",
  support: "help-circle",
  invoice: "file-text",
};

function notificationAccent(type: NotifType, theme: AthooTheme): string {
  switch (type) {
    case "negotiation":
    case "broadcast":
      return theme.colors.secondary;
    case "success":
    case "call":
    case "withdrawal":
      return theme.colors.success;
    case "warning":
    case "premium":
      return theme.colors.warning;
    case "message":
    case "support":
      return theme.colors.accent;
    case "refund":
      return theme.colors.info;
    case "system":
    case "invoice":
      return theme.colors.textSecondary;
    case "booking":
    default:
      return theme.colors.primary;
  }
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function normalizeNotificationType(rawType: unknown, data?: Record<string, unknown>): NotifType {
  const normalized = String(rawType || "").trim().toLowerCase();
  if (normalized === "chat") return "message";
  if (normalized === "status" || normalized === "info") return "system";
  if (
    normalized === "booking" ||
    normalized === "broadcast" ||
    normalized === "negotiation" ||
    normalized === "message" ||
    normalized === "premium" ||
    normalized === "call" ||
    normalized === "refund" ||
    normalized === "withdrawal" ||
    normalized === "support" ||
    normalized === "invoice" ||
    normalized === "system" ||
    normalized === "success" ||
    normalized === "warning"
  ) {
    return normalized as NotifType;
  }
  if (toStringValue(data?.callId)) return "call";
  if (toStringValue(data?.chatId)) return "message";
  if (toStringValue(data?.negotiationId)) return "negotiation";
  if (toStringValue(data?.broadcastRequestId)) return "broadcast";
  if (toStringValue(data?.bookingId)) return "booking";
  if (toStringValue(data?.refundId)) return "refund";
  if (toStringValue(data?.subscriptionId)) return "premium";
  if (toStringValue(data?.withdrawalId)) return "withdrawal";
  if (toStringValue(data?.ticketId)) return "support";
  if (toStringValue(data?.invoiceId)) return "invoice";
  return "system";
}

function notificationFromResponseData(
  data: Record<string, unknown> | undefined,
  currentRole: "customer" | "provider",
): AppNotif | null {
  if (!data) return null;

  return {
    id: toStringValue(data.notificationId) || `local-response-${Date.now()}`,
    type: normalizeNotificationType(data.type, data),
    title: toStringValue(data.title) || "Notification",
    message: toStringValue(data.body) || toStringValue(data.message) || "",
    timestamp: new Date().toISOString(),
    read: false,
    role:
      toStringValue(data.role) === "provider"
        ? "provider"
        : toStringValue(data.role) === "customer"
        ? "customer"
        : currentRole,
    bookingId: toStringValue(data.bookingId),
    chatId: toStringValue(data.chatId),
    negotiationId: toStringValue(data.negotiationId),
    broadcastRequestId: toStringValue(data.broadcastRequestId),
    callId: toStringValue(data.callId),
    refundId: toStringValue(data.refundId),
    subscriptionId: toStringValue(data.subscriptionId),
    withdrawalId: toStringValue(data.withdrawalId),
    ticketId: toStringValue(data.ticketId),
    invoiceId: toStringValue(data.invoiceId),
    link: toStringValue(data.link),
  };
}

function notificationFromRemoteRecord(
  record: any,
  currentRole: "customer" | "provider",
): AppNotif {
  const data = (record?.data && typeof record.data === "object" ? record.data : {}) as Record<string, unknown>;
  return {
    id: String(record.id),
    type: normalizeNotificationType(record.type, data),
    title: record.title || "Notification",
    message: record.body || record.message || "",
    timestamp: record.createdAt || record.created_at || new Date().toISOString(),
    read: !!(record.isRead ?? record.is_read),
    role: currentRole,
    bookingId: toStringValue(data.bookingId) || toStringValue(record.bookingId),
    chatId: toStringValue(data.chatId) || toStringValue(record.chatId),
    negotiationId: toStringValue(data.negotiationId) || toStringValue(record.negotiationId),
    broadcastRequestId: toStringValue(data.broadcastRequestId) || toStringValue(record.broadcastRequestId),
    callId: toStringValue(data.callId),
    refundId: toStringValue(data.refundId),
    subscriptionId: toStringValue(data.subscriptionId),
    withdrawalId: toStringValue(data.withdrawalId),
    ticketId: toStringValue(data.ticketId),
    invoiceId: toStringValue(data.invoiceId),
    link: toStringValue(record.link) || toStringValue(data.link),
  };
}

function ToastBanner({
  notif,
  onDismiss,
  onPress,
}: {
  notif: AppNotif;
  onDismiss: () => void;
  onPress: () => void;
}) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();
  const styles = useMemo(() => createNotificationStyles(theme), [theme]);
  const icon = ICON_MAP[notif.type] || ICON_MAP.system;
  const color = notificationAccent(notif.type, theme);
  const topPad = Platform.OS === "web" ? 67 : 20;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: topPad + 12,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss());
    }, 4000);

    return () => clearTimeout(timer);
  }, [opacity, topPad, translateY, onDismiss]);

  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY }], opacity }]}>
      <Pressable style={styles.toastInner} onPress={onPress}>
        <View style={[styles.toastIcon, { backgroundColor: color + "20" }]}>
          <Feather name={icon as any} size={18} color={color} />
        </View>

        <View style={styles.toastBody}>
          <Text style={styles.toastTitle} numberOfLines={1}>
            {notif.title}
          </Text>
          <Text style={styles.toastMsg} numberOfLines={2}>
            {notif.message}
          </Text>
        </View>

        {notif.actionLabel ? (
          <Pressable
            style={[styles.toastAction, { backgroundColor: color + "20" }]}
            onPress={() => {
              notif.onAction?.();
              onDismiss();
            }}
          >
            <Text style={[styles.toastActionText, { color }]}>
              {notif.actionLabel}
            </Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onDismiss} style={styles.toastClose}>
          <Feather name="x" size={14} color={theme.colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const SEED_NOTIFICATIONS: AppNotif[] = [];

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createNotificationStyles(theme), [theme]);
  const [notifications, setNotifications] = useState<AppNotif[]>([]);
  const [queue, setQueue] = useState<AppNotif[]>([]);
  const [active, setActive] = useState<AppNotif | null>(null);
  const loadedRef = useRef(false);
  const remoteFetchInFlightRef = useRef(false);
  const handledResponseIdsRef = useRef<Set<string>>(new Set());
  const notificationNavigationArmedAtRef = useRef<number>(Number.POSITIVE_INFINITY);
  const coldStartCheckedRef = useRef(false);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());

  const currentRole = user?.role === "provider" ? "provider" : user?.role === "customer" ? "customer" : null;

  useEffect(() => {
    knownNotificationIdsRef.current = new Set(notifications.map((notification) => notification.id));
  }, [notifications]);

  const ingestNotification = useCallback((notification: AppNotif, showToast = true) => {
    const alreadyKnown = knownNotificationIdsRef.current.has(notification.id);
    knownNotificationIdsRef.current.add(notification.id);
    setNotifications((previous) => {
      const withoutCurrent = previous.filter((item) => item.id !== notification.id);
      return [notification, ...withoutCurrent].slice(0, 100);
    });
    if (showToast && !alreadyKnown) {
      setQueue((previous) => previous.some((item) => item.id === notification.id) ? previous : [...previous, notification]);
    }
  }, []);


  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const scopedKey = getStorageKey(user?.id);
        const raw = await AsyncStorage.getItem(scopedKey);
        if (!mounted) return;
        if (raw) {
          const parsed = JSON.parse(raw) as AppNotif[];
          setNotifications(Array.isArray(parsed) ? parsed : []);
        } else {
          setNotifications([]);
        }
      } catch {
        if (mounted) setNotifications([]);
      } finally {
        loadedRef.current = true;
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!loadedRef.current) return;
    AsyncStorage.setItem(getStorageKey(user?.id), JSON.stringify(notifications)).catch(() => {});
  }, [notifications, user?.id]);
  const syncRemoteNotifications = useCallback(async () => {
    if (!user || !currentRole || remoteFetchInFlightRef.current) return;
    remoteFetchInFlightRef.current = true;
    try {
      const response = await api.getNotifications();
      const remote = (response.notifications || []).map((record: any) =>
        notificationFromRemoteRecord(record, currentRole),
      );
      setNotifications((previous) => {
        const preserved = previous.filter((notification) => String(notification.id).startsWith("local-"));
        const merged = new Map<string, AppNotif>();
        [...remote, ...preserved].forEach((notification) => merged.set(notification.id, notification));
        return Array.from(merged.values())
          .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
          .slice(0, 100);
      });
    } catch {
      // Remote notification sync must not destabilize local notification state.
    } finally {
      remoteFetchInFlightRef.current = false;
    }
  }, [currentRole, user]);

  useEffect(() => {
    void syncRemoteNotifications();
  }, [syncRemoteNotifications]);

  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncRemoteNotifications();
    });
    return () => subscription.remove();
  }, [syncRemoteNotifications, user]);


  const visibleNotifications = useMemo(() => {
    if (!currentRole) return [];
    return notifications.filter((n) => !n.role || n.role === currentRole);
  }, [notifications, currentRole]);

  const unreadCount = useMemo(() => {
    return visibleNotifications.filter((n) => !n.read).length;
  }, [visibleNotifications]);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGoRuntime()) return;
    import("expo-notifications")
      .then((Notifications) => Notifications.setBadgeCountAsync(user ? unreadCount : 0))
      .catch(() => undefined);
  }, [unreadCount, user]);

  useEffect(() => {
    if (!user) {
      notificationNavigationArmedAtRef.current = Number.POSITIVE_INFINITY;
      handledResponseIdsRef.current.clear();
      setQueue([]);
      setActive(null);
      return;
    }

    // Ignore stale native notification callbacks fired while authentication is
    // restoring or immediately after login. Fresh user taps are enabled once
    // the authenticated navigator has settled.
    notificationNavigationArmedAtRef.current = Date.now() + 1500;
  }, [user?.id]);

  const handleNotificationPress = useCallback(
    (notif: AppNotif) => {
      setNotifications((previous) =>
        previous.map((item) => item.id === notif.id ? { ...item, read: true } : item),
      );
      if (!String(notif.id).startsWith("local-")) {
        api.markNotificationRead(notif.id).catch(() => {});
      }

      if (!user || !currentRole) {
        router.replace("/auth/welcome");
        return;
      }

      const role = (notif.role || currentRole) === "provider" ? "provider" : "customer";
      const target = resolveNotificationTarget({
        type: notif.type,
        link: notif.link,
        bookingId: notif.bookingId,
        chatId: notif.chatId,
        negotiationId: notif.negotiationId,
        broadcastRequestId: notif.broadcastRequestId,
        callId: notif.callId,
        refundId: notif.refundId,
        subscriptionId: notif.subscriptionId,
        withdrawalId: notif.withdrawalId,
        ticketId: notif.ticketId,
        invoiceId: notif.invoiceId,
      }, role);
      router.push(target as any);
    },
    [currentRole, user],
  );

  const push = useCallback(
    (n: Omit<AppNotif, "id" | "timestamp" | "read">) => {
      const notif: AppNotif = {
        ...n,
        id: `local-${Date.now().toString()}${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        read: false,
        role: n.role || currentRole || "customer",
      };

      setNotifications((prev) => [notif, ...prev.slice(0, 99)]);
      setQueue((prev) => [...prev, notif]);
    },
    [currentRole]
  );

  const addNotification = useCallback(
    (n: {
      title: string;
      body?: string;
      message?: string;
      type: NotifType;
      data?: {
        role?: "customer" | "provider";
        bookingId?: string;
        chatId?: string;
        negotiationId?: string;
        broadcastRequestId?: string;
        callId?: string;
        refundId?: string;
        subscriptionId?: string;
        withdrawalId?: string;
        ticketId?: string;
        invoiceId?: string;
        link?: string;
      };
    }) => {
      push({
        type: n.type,
        title: n.title,
        message: n.body || n.message || "",
        role: n.data?.role || currentRole || "customer",
        bookingId: n.data?.bookingId,
        chatId: n.data?.chatId,
        negotiationId: n.data?.negotiationId,
        broadcastRequestId: n.data?.broadcastRequestId,
        callId: n.data?.callId,
        refundId: n.data?.refundId,
        subscriptionId: n.data?.subscriptionId,
        withdrawalId: n.data?.withdrawalId,
        ticketId: n.data?.ticketId,
        invoiceId: n.data?.invoiceId,
        link: n.data?.link,
      });
    },
    [push, currentRole]
  );

  useEffect(() => {
    if (!active && queue.length > 0) {
      setActive(queue[0]);
      setQueue((prev) => prev.slice(1));
    }
  }, [active, queue]);


  // ── Real-time in-app notification delivery via WebSocket ──
  useEffect(() => {
    if (!user || !currentRole) return;
    const off = realtime.on((message) => {
      if (message.type !== "notification:new" && message.type !== "notification:push-failed") return;
      const payload = message.payload as any;
      if (!payload?.title) return;
      const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
      const type = normalizeNotificationType(payload.type, data);
      const notificationId = toStringValue(payload.id) || toStringValue(data.notificationId) || `local-realtime-${Date.now()}`;
      const title = String(payload.title);
      const body = String(payload.body || payload.message || "");
      const link = toStringValue(payload.link) || toStringValue(data.link);

      ingestNotification({
        id: notificationId,
        type,
        title,
        message: body,
        timestamp: new Date().toISOString(),
        read: false,
        role: currentRole,
        bookingId: toStringValue(data.bookingId) || toStringValue(payload.bookingId),
        chatId: toStringValue(data.chatId) || toStringValue(payload.chatId),
        negotiationId: toStringValue(data.negotiationId) || toStringValue(payload.negotiationId),
        broadcastRequestId: toStringValue(data.broadcastRequestId) || toStringValue(payload.broadcastRequestId),
        callId: toStringValue(data.callId),
        refundId: toStringValue(data.refundId),
        subscriptionId: toStringValue(data.subscriptionId),
        withdrawalId: toStringValue(data.withdrawalId),
        ticketId: toStringValue(data.ticketId),
        invoiceId: toStringValue(data.invoiceId),
        link,
      });

      const fallbackRequired =
        message.type === "notification:push-failed" || payload.nativePushExpected === false;
      if (fallbackRequired) {
        notificationService.scheduleRealtimeFallback(type, title, body, {
          notificationId,
          type,
          link,
          role: currentRole,
          ...data,
        }).catch(() => {});
      } else {
        // Web and Expo Go do not receive native remote-push audio.
        notificationService.playRealtimeFallback(type).catch(() => {});
      }
    });
    return off;
  }, [user, currentRole, ingestNotification]);

  useEffect(() => {
    let mounted = true;
    let responseSubscription: { remove: () => void } | null = null;
    let receivedSubscription: { remove: () => void } | null = null;

    (async () => {
      if (Platform.OS === "web" || isExpoGoRuntime() || authLoading) return;

      try {
        const Notifications = await import("expo-notifications");
        if (!mounted) return;

        const openResponse = (response: any) => {
          if (!user || !currentRole) return;
          if (Date.now() < notificationNavigationArmedAtRef.current) return;

          const request = response?.notification?.request;
          const content = request?.content;
          if (!content) return;

          const responseId = String(request?.identifier || response?.actionIdentifier || "");
          if (responseId && handledResponseIdsRef.current.has(responseId)) return;
          if (responseId) handledResponseIdsRef.current.add(responseId);

          const responseData = content.data as Record<string, unknown>;
          void notificationService.acknowledgeNativeDelivery(responseData?.notificationId);
          const notif = notificationFromResponseData(
            responseData,
            currentRole,
          );
          if (!notif) return;

          handleNotificationPress({
            ...notif,
            title: content.title || notif.title,
            message: content.body || notif.message,
          });
        };

        // Cold-start navigation is checked exactly once after initial auth
        // restoration. If the first resolved state is signed out, consume and
        // clear any cached Android response so a later manual login always opens
        // Home rather than an old Notifications destination.
        if (!coldStartCheckedRef.current) {
          coldStartCheckedRef.current = true;
          const lastResponse = await Notifications.getLastNotificationResponseAsync();
          if (user && currentRole && lastResponse) {
            notificationNavigationArmedAtRef.current = Date.now();
            openResponse(lastResponse);
          }
          await (Notifications as any).clearLastNotificationResponseAsync?.().catch(() => undefined);
        }

        if (user && currentRole) {
          receivedSubscription = Notifications.addNotificationReceivedListener((notification: any) => {
            const content = notification?.request?.content;
            if (!content) return;
            const receivedData = content.data as Record<string, unknown>;
            void notificationService.acknowledgeNativeDelivery(receivedData?.notificationId);
            const parsed = notificationFromResponseData(
              receivedData,
              currentRole,
            );
            if (!parsed) return;
            ingestNotification({
              ...parsed,
              title: content.title || parsed.title,
              message: content.body || parsed.message,
            });
          });
          responseSubscription = Notifications.addNotificationResponseReceivedListener(openResponse);
        }
      } catch {}
    })();

    return () => {
      mounted = false;
      responseSubscription?.remove();
      receivedSubscription?.remove();
    };
  }, [authLoading, currentRole, handleNotificationPress, ingestNotification, user]);

  const dismissActive = useCallback(() => setActive(null), []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (!String(id).startsWith("local-")) {
      api.markNotificationRead(id).catch(() => {});
    }
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) =>
        !n.role || n.role === currentRole ? { ...n, read: true } : n
      )
    );
    api.markAllNotificationsRead().catch(() => {});
  }, [currentRole]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!String(id).startsWith("local-")) {
      api.deleteNotification(id).catch(() => {});
    }
  }, []);

  const clearAll = useCallback(() => {
    setNotifications((prev) =>
      prev.filter((n) => n.role && n.role !== currentRole)
    );
    api.deleteAllNotifications().catch(() => {});
  }, [currentRole]);

  const unreadMessageCount = useMemo(() => {
    return visibleNotifications.filter((n) => !n.read && n.type === "message").length;
  }, [visibleNotifications]);

  return (
    <NotifContext.Provider
      value={{
        notifications: visibleNotifications,
        unreadCount,
        unreadMessageCount,
        push,
        addNotification,
        markRead,
        markAllRead,
        dismiss,
        clearAll,
        handleNotificationPress,
      }}
    >
      {children}

      {active && (!active.role || active.role === currentRole) ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <ToastBanner
            key={active.id}
            notif={active}
            onDismiss={dismissActive}
            onPress={() => {
              dismissActive();
              handleNotificationPress(active);
            }}
          />
        </View>
      ) : null}
    </NotifContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotifContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}

const createNotificationStyles = (theme: AthooTheme) => StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    pointerEvents: "box-none",
  },

  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 14,
    shadowColor: theme.colors.overlay,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  toastInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  toastIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  toastBody: {
    flex: 1,
  },

  toastTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },

  toastMsg: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },

  toastAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },

  toastActionText: {
    fontSize: 11,
    fontWeight: "700",
  },

  toastClose: {
    padding: 4,
  },
});
