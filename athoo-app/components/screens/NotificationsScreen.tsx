import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { useNotifications, type AppNotif } from "@/context/NotificationContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

type Role = "customer" | "provider";

function notificationIcon(type: AppNotif["type"], colors: any) {
  const map: Record<AppNotif["type"], { icon: string; color: string }> = {
    booking: { icon: "calendar", color: colors.primary },
    negotiation: { icon: "dollar-sign", color: colors.secondary },
    message: { icon: "message-circle", color: colors.accent },
    system: { icon: "info", color: colors.textSecondary },
    success: { icon: "check-circle", color: colors.success },
    warning: { icon: "alert-triangle", color: colors.warning },
    broadcast: { icon: "radio", color: colors.secondary },
    premium: { icon: "star", color: colors.warning },
    call: { icon: "phone-call", color: colors.success },
    refund: { icon: "rotate-ccw", color: colors.info },
    withdrawal: { icon: "credit-card", color: colors.success },
    support: { icon: "help-circle", color: colors.accent },
    invoice: { icon: "file-text", color: colors.textSecondary },
  };
  return map[type] || map.system;
}

export function NotificationsScreen({ role }: { role: Role }) {
  const { theme } = useTheme();
  const { translate: tr, formatNumber } = useLang();
  const insets = useSafeAreaInsets();
  const accent = role === "provider" ? theme.colors.secondary : theme.colors.primary;
  const { notifications, dismiss, clearAll, markAllRead, handleNotificationPress } = useNotifications();
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  const timeAgo = (timestamp: string) => {
    const parsed = new Date(timestamp).getTime();
    if (!Number.isFinite(parsed)) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
    if (seconds < 60) return tr("Just now");
    if (seconds < 3600) return tr("{{count}} min ago", { count: formatNumber(Math.floor(seconds / 60)) });
    if (seconds < 86400) return tr("{{count}} hr ago", { count: formatNumber(Math.floor(seconds / 3600)) });
    return tr("{{count}} day(s) ago", { count: formatNumber(Math.floor(seconds / 86400)) });
  };

  const confirmClear = () => {
    Alert.alert(
      tr("Clear notifications"),
      tr("Remove all notifications from this device?"),
      [
        { text: tr("Cancel"), style: "cancel" },
        { text: tr("Clear all"), style: "destructive", onPress: clearAll },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader
        title={tr("Notifications")}
        subtitle={unreadCount ? tr("{{count}} unread", { count: formatNumber(unreadCount) }) : tr("You're all caught up")}
        right={notifications.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("Notification options")}
            onPress={confirmClear}
            style={({ pressed }) => [styles.headerIcon, { backgroundColor: theme.colors.dangerSoft }, pressed && { opacity: 0.72 }]}
          >
            <Icon name="trash-2" size={18} color={theme.colors.danger} />
          </Pressable>
        ) : null}
      />

      {notifications.length === 0 ? (
        <View style={[styles.empty, responsiveContent, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Icon name="bell-off" size={38} color={theme.colors.textMuted} />
          </View>
          <AppText variant="h2" align="center">{tr("No notifications")}</AppText>
          <AppText tone="secondary" align="center" style={styles.emptyCopy}>
            {tr("Booking updates, messages, payments, and support replies will appear here.")}
          </AppText>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 36 }]}
        >
          {unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Mark all notifications as read")}
              onPress={markAllRead}
              style={({ pressed }) => [styles.markAll, { backgroundColor: theme.colors.infoSoft }, pressed && { opacity: 0.76 }]}
            >
              <Icon name="check-check" size={17} color={accent} />
              <AppText variant="label" style={{ color: accent }}>{tr("Mark all as read")}</AppText>
            </Pressable>
          ) : null}

          {notifications.map((notification, index) => {
            const visual = notificationIcon(notification.type, theme.colors);
            return (
              <AppCard
                key={`${notification.id}-${index}`}
                onPress={() => handleNotificationPress(notification)}
                elevated={!notification.read}
                style={[
                  styles.notification,
                  !notification.read && { borderColor: accent, backgroundColor: theme.colors.infoSoft },
                ]}
                testID={`notification-${notification.id}`}
              >
                <View style={styles.row}>
                  <View style={[styles.iconWrap, { backgroundColor: `${visual.color}22` }]}>
                    <Icon name={visual.icon as any} size={21} color={visual.color} />
                  </View>

                  <View style={styles.copy}>
                    <View style={styles.titleRow}>
                      <AppText variant="bodyStrong" style={styles.title} numberOfLines={1}>{notification.title}</AppText>
                      <AppText variant="caption" tone="muted">{timeAgo(notification.timestamp)}</AppText>
                    </View>
                    <AppText tone="secondary" numberOfLines={3} style={styles.message}>{notification.message}</AppText>
                    {notification.actionLabel ? (
                      <AppText variant="caption" style={{ color: accent, marginTop: 6 }}>{notification.actionLabel}</AppText>
                    ) : null}
                  </View>

                  {!notification.read ? <View style={[styles.unreadDot, { backgroundColor: accent }]} /> : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr("Dismiss {{title}}", { title: notification.title })}
                    hitSlop={8}
                    onPress={(event) => {
                      event.stopPropagation();
                      dismiss(notification.id);
                    }}
                    style={({ pressed }) => [styles.dismiss, { backgroundColor: theme.colors.surfaceAlt }, pressed && { opacity: 0.65 }]}
                  >
                    <Icon name="x" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              </AppCard>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  markAll: { minHeight: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 2 },
  notification: { padding: 13 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { flex: 1 },
  message: { lineHeight: 19 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  dismiss: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: -2, marginRight: -2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 28 },
  emptyIcon: { width: 92, height: 92, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  emptyCopy: { maxWidth: 520, lineHeight: 22 },
});
