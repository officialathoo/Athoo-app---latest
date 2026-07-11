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
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { api, realtime } from "@/services/api";


function isExpoGoRuntime(): boolean {
  const C = Constants as any;
  const owner = String(C?.appOwnership || "").toLowerCase();
  const env = String(C?.executionEnvironment || "").toLowerCase();
  // Expo Go cannot reliably load remote push notification native modules.
  // In production/dev-client builds this becomes false, so real notifications still work.
  return owner === "expo" || owner === "guest" || env.includes("storeclient") || (!!__DEV__ && owner !== "standalone");
}

type NotifType =
  | "booking"
  | "negotiation"
  | "message"
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

const ICON_MAP: Record<NotifType, { icon: string; color: string }> = {
  booking: { icon: "calendar", color: Colors.primary },
  negotiation: { icon: "dollar-sign", color: Colors.secondary },
  message: { icon: "message-circle", color: "#8B5CF6" },
  system: { icon: "info", color: Colors.textSecondary },
  success: { icon: "check-circle", color: "#22C55E" },
  warning: { icon: "alert-triangle", color: "#F59E0B" },
};

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function notificationFromResponseData(
  data: Record<string, unknown> | undefined,
  currentRole: "customer" | "provider"
): AppNotif | null {
  if (!data) return null;

  const rawType = toStringValue(data.type);
  const type: NotifType =
    rawType === "booking" || rawType === "negotiation" || rawType === "message"
      ? rawType
      : rawType === "warning" || rawType === "success" || rawType === "system"
      ? rawType
      : toStringValue(data.negotiationId)
      ? "negotiation"
      : toStringValue(data.chatId)
      ? "message"
      : toStringValue(data.bookingId)
      ? "booking"
      : "system";

  return {
    id: `response-${Date.now()}`,
    type,
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
  const { icon, color } = ICON_MAP[notif.type] || ICON_MAP.system;
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
          <Feather name="x" size={14} color={Colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const SEED_NOTIFICATIONS: AppNotif[] = [];

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotif[]>([]);
  const [queue, setQueue] = useState<AppNotif[]>([]);
  const [active, setActive] = useState<AppNotif | null>(null);
  const loadedRef = useRef(false);
  const remoteFetchInFlightRef = useRef(false);

  const currentRole = user?.role === "provider" ? "provider" : user?.role === "customer" ? "customer" : null;


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
  useEffect(() => {
    let activeFetch = true;
    if (!user) return;

    (async () => {
      if (remoteFetchInFlightRef.current) return;
      remoteFetchInFlightRef.current = true;
      try {
        const res = await api.getNotifications();
        if (!activeFetch) return;
        const remote = (res.notifications || []).map((n: any) => ({
          id: String(n.id),
          type: (n.type === "booking" || n.type === "negotiation" || n.type === "message" || n.type === "warning" || n.type === "success") ? n.type : "system",
          title: n.title || "Notification",
          message: n.body || n.message || "",
          timestamp: n.createdAt || n.created_at || new Date().toISOString(),
          read: !!(n.isRead ?? n.is_read),
          role: (currentRole as ("customer" | "provider" | undefined)) || undefined,
          bookingId: n.data?.bookingId || n.bookingId,
          chatId: n.data?.chatId || n.chatId,
          negotiationId: n.data?.negotiationId || n.negotiationId,
        })) as AppNotif[];
        setNotifications((prev) => {
          const preserved = prev.filter((n) => String(n.id).startsWith("local-"));
          const map = new Map<string, AppNotif>();
          [...remote, ...preserved].forEach((item) => map.set(item.id, item));
          return Array.from(map.values()).sort((a,b)=> new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime());
        });
      } catch {
        // Remote notification sync must not destabilize local notification state.
      } finally {
        remoteFetchInFlightRef.current = false;
      }
    })();

    return () => {
      activeFetch = false;
    };
  }, [user?.id, currentRole]);


  const visibleNotifications = useMemo(() => {
    if (!currentRole) return [];
    return notifications.filter((n) => !n.role || n.role === currentRole);
  }, [notifications, currentRole]);

  const unreadCount = useMemo(() => {
    return visibleNotifications.filter((n) => !n.read).length;
  }, [visibleNotifications]);

  useEffect(() => {
    if (!user) {
      setQueue([]);
      setActive(null);
    }
  }, [user]);

  const handleNotificationPress = useCallback(
    (notif: AppNotif) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );

      if (!user) {
        router.replace("/auth/welcome");
        return;
      }

      const role = (notif.role || currentRole) === "provider" ? "provider" : "customer";

      if (role === "provider") {
        if (notif.chatId) {
          router.push({
            pathname: "/(provider)/chat-room",
            params: { chatId: notif.chatId },
          });
          return;
        }

        if (notif.bookingId) {
          router.push({
            pathname: "/(provider)/job-detail",
            params: { bookingId: notif.bookingId },
          });
          return;
        }

        if (notif.negotiationId || notif.type === "negotiation") {
          router.push({
            pathname: "/(provider)/negotiations",
            params: notif.negotiationId ? { negId: notif.negotiationId } : {},
          });
          return;
        }

        if (notif.broadcastRequestId || notif.type === "broadcast" as any) {
          router.push("/(provider)/broadcast-jobs" as any);
          return;
        }

        if (notif.type === "message") {
          router.push("/(provider)/(tabs)/chat");
          return;
        }

        router.push("/(provider)/notifications");
        return;
      }

      if (notif.chatId) {
        router.push({
          pathname: "/(customer)/chat-room",
          params: { chatId: notif.chatId },
        });
        return;
      }

      if (notif.bookingId) {
        router.push({
          pathname: "/(customer)/booking-detail",
          params: { bookingId: notif.bookingId },
        });
        return;
      }

      if (notif.negotiationId || notif.type === "negotiation") {
        router.push({
          pathname: "/(customer)/negotiate",
          params: notif.negotiationId ? { negId: notif.negotiationId } : {},
        });
        return;
      }

      if (notif.type === "message") {
        router.push("/(customer)/(tabs)/chat");
        return;
      }

      router.push("/(customer)/notifications");
    },
    [currentRole, user]
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
    if (!user) return;
    const off = realtime.on((msg) => {
      if (msg.type !== "notification:new") return;
      const p = msg.payload as any;
      if (!p?.title) return;
      const rawType: string = p.type || "";
      const type: NotifType =
        rawType === "booking" || rawType === "broadcast" ? "booking"
        : rawType === "negotiation" ? "negotiation"
        : rawType === "message" ? "message"
        : rawType === "warning" ? "warning"
        : rawType === "success" ? "success"
        : rawType === "system" ? "system"
        : p.data?.bookingId || p.data?.broadcastRequestId ? "booking"
        : p.data?.chatId ? "message"
        : p.data?.negotiationId ? "negotiation"
        : "system";
      push({
        type,
        title: p.title,
        message: p.body || p.message || "",
        role: currentRole || "customer",
        bookingId: p.data?.bookingId || p.bookingId,
        chatId: p.data?.chatId || p.chatId,
        negotiationId: p.data?.negotiationId || p.negotiationId,
      });
      // Play a sound for important notification types
      const isSoundType = type === "booking" || type === "message" || type === "negotiation";
      if (isSoundType) {
        import("@/services/SoundService").then(({ soundService }) => {
          soundService.playNotification().catch(() => {});
        }).catch(() => {});
      }
    });
    return off;
  }, [user, currentRole, push]);

  useEffect(() => {
    let mounted = true;
    let subscription: { remove: () => void } | null = null;

    (async () => {
      if (Platform.OS === "web" || isExpoGoRuntime()) return;

      try {
        const Notifications = await import("expo-notifications");
        if (!mounted) return;

        const openResponse = (response: any) => {
          const content = response.notification.request.content;
          const notif = notificationFromResponseData(
            content.data as Record<string, unknown>,
            currentRole || "customer"
          );
          if (!notif) return;

          handleNotificationPress({
            ...notif,
            title: content.title || notif.title,
            message: content.body || notif.message,
          });
        };

        const lastResponse = await Notifications.getLastNotificationResponseAsync?.();
        if (lastResponse) {
          openResponse(lastResponse);
        }

        subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
      } catch {}
    })();

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [currentRole, handleNotificationPress]);

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

const styles = StyleSheet.create({
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
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.text,
  },

  toastMsg: {
    fontSize: 12,
    color: Colors.textSecondary,
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
