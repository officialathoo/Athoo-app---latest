import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useNotifications } from "@/context/NotificationContext";

const ICON_MAP: Record<string, { icon: string; color: string }> = {
  booking: { icon: "calendar", color: Colors.primary },
  negotiation: { icon: "dollar-sign", color: Colors.secondary },
  message: { icon: "message-circle", color: "#8B5CF6" },
  system: { icon: "info", color: Colors.textSecondary },
  success: { icon: "check-circle", color: "#22C55E" },
  warning: { icon: "alert-triangle", color: "#F59E0B" },
};

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ProviderNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const {
    notifications,
    dismiss,
    markAllRead,
    clearAll,
    handleNotificationPress,
  } = useNotifications();

  const handleClearAll = () => {
    Alert.alert("Clear All", "Remove all notifications?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clearAll },
    ]);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          {notifications.length > 0 && unreadCount > 0 && (
            <Pressable onPress={markAllRead}>
              <Text style={styles.markAll}>Mark all</Text>
            </Pressable>
          )}

          {notifications.length > 0 && (
            <Pressable onPress={handleClearAll}>
              <Text style={styles.clearAll}>Clear</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="bell-off" size={56} color={Colors.border} />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySubtitle}>You're all caught up!</Text>
          </View>
        ) : (
          notifications.map((n, i) => {
            const iconInfo = ICON_MAP[n.type] || ICON_MAP.system;
            return (
              <Pressable
                key={`${n.id}-${i}`}
                style={({ pressed }) => [
                  styles.notifCard,
                  !n.read && styles.notifUnread,
                  pressed && styles.pressed,
                ]}
                onPress={() => handleNotificationPress(n)}
              >
                <View
                  style={[
                    styles.iconBg,
                    { backgroundColor: iconInfo.color + "20" },
                  ]}
                >
                  <Icon
                    name={iconInfo.icon as any}
                    size={20}
                    color={iconInfo.color}
                  />
                </View>

                <View style={styles.notifContent}>
                  <View style={styles.notifHeader}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    <Text style={styles.notifTime}>{timeAgo(n.timestamp)}</Text>
                  </View>
                  <Text style={styles.notifMessage} numberOfLines={2}>
                    {n.message}
                  </Text>
                </View>

                {!n.read && <View style={styles.unreadDot} />}

                <Pressable
                  style={styles.dismissBtn}
                  onPress={() => dismiss(n.id)}
                >
                  <Icon name="x" size={14} color={Colors.textMuted} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  badge: {
    backgroundColor: Colors.error,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    minWidth: 22,
    alignItems: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  markAll: { fontSize: 13, fontWeight: "600", color: Colors.primary },
  clearAll: { fontSize: 13, fontWeight: "600", color: Colors.error },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 8 },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notifUnread: {
    borderColor: Colors.secondary + "40",
    backgroundColor: Colors.secondary + "05",
  },
  pressed: { opacity: 0.85 },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  notifContent: { flex: 1 },
  notifHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  notifTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  notifTime: { fontSize: 11, color: Colors.textMuted },
  notifMessage: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.secondary,
    marginTop: 4,
  },
  dismissBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    borderRadius: 8,
  },
});
