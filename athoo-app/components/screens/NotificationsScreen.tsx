import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import {
  type AppNotif,
  useNotifications,
} from "@/context/NotificationContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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

type Role = "customer" | "provider";
type Filter = "all" | "unread";

type NotificationVisual = {
  icon: string;
  color: string;
  label: string;
};

function notificationVisual(
  type: AppNotif["type"],
  theme: AthooTheme,
): NotificationVisual {
  const colors = theme.colors;
  const map: Record<AppNotif["type"], NotificationVisual> = {
    booking: { icon: "calendar", color: colors.primary, label: "Booking" },
    negotiation: { icon: "dollar-sign", color: colors.secondary, label: "Negotiation" },
    message: { icon: "message-circle", color: colors.accent, label: "Message" },
    system: { icon: "shield", color: colors.info, label: "Account" },
    success: { icon: "check-circle", color: colors.success, label: "Update" },
    warning: { icon: "alert-triangle", color: colors.warning, label: "Important" },
    broadcast: { icon: "radio", color: colors.secondary, label: "Job Alert" },
    premium: { icon: "crown", color: colors.premium, label: "Premium" },
    call: { icon: "phone-call", color: colors.success, label: "Call" },
    refund: { icon: "rotate-ccw", color: colors.info, label: "Refund" },
    withdrawal: { icon: "credit-card", color: colors.success, label: "Withdrawal" },
    support: { icon: "headphones", color: colors.accent, label: "Support" },
    invoice: { icon: "file-text", color: colors.textSecondary, label: "Invoice" },
  };
  return map[type] || map.system;
}

export function NotificationsScreen({ role }: { role: Role }) {
  const { theme } = useTheme();
  const { translate: tr, formatNumber, textAlign, writingDirection } = useLang();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState<Filter>("all");

  const accent = role === "provider" ? theme.colors.secondary : theme.colors.primary;
  const accentPressed = role === "provider" ? theme.colors.secondaryPressed : theme.colors.primaryPressed;
  const accentText = role === "provider" ? theme.colors.onLight : theme.colors.onBrand;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const localizedText = { textAlign, writingDirection } as const;

  const {
    notifications,
    dismiss,
    clearAll,
    markAllRead,
    handleNotificationPress,
  } = useNotifications();

  const roleNotifications = useMemo(
    () => notifications.filter((notification) => !notification.role || notification.role === role),
    [notifications, role],
  );
  const unreadCount = useMemo(
    () => roleNotifications.filter((notification) => !notification.read).length,
    [roleNotifications],
  );
  const filteredNotifications = useMemo(
    () => filter === "unread"
      ? roleNotifications.filter((notification) => !notification.read)
      : roleNotifications,
    [filter, roleNotifications],
  );

  const timeAgo = (timestamp: string) => {
    const parsed = new Date(timestamp).getTime();
    if (!Number.isFinite(parsed)) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
    if (seconds < 60) return tr("Just now");
    if (seconds < 3600) {
      return tr("{{count}} min ago", { count: formatNumber(Math.floor(seconds / 60)) });
    }
    if (seconds < 86400) {
      return tr("{{count}} hr ago", { count: formatNumber(Math.floor(seconds / 3600)) });
    }
    return tr("{{count}} day(s) ago", { count: formatNumber(Math.floor(seconds / 86400)) });
  };

  const confirmClear = () => {
    Alert.alert(
      tr("Clear notification inbox"),
      tr("Remove all notifications from your Athoo inbox? This does not change your push settings."),
      [
        { text: tr("Cancel"), style: "cancel" },
        { text: tr("Clear inbox"), style: "destructive", onPress: clearAll },
      ],
    );
  };

  const emptyTitle = filter === "unread" ? tr("No unread notifications") : tr("No notifications yet");
  const emptyCopy = filter === "unread"
    ? tr("You're caught up. New unread alerts will appear here.")
    : tr("Booking updates, messages, payments, calls and support replies will appear here.");

  return (
    <View style={[styles.screen, { paddingTop: topPad, backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Go back")}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Icon name="arrow-left" size={19} color={theme.colors.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, localizedText]}>{tr("Notifications Inbox")}</Text>
          <Text style={[styles.headerSubtitle, localizedText]}>
            {tr("Updates that need your attention, in one place.")}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Notification preferences")}
          onPress={() => router.push("/notification-preferences" as any)}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: theme.colors.surfaceAlt },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="settings" size={19} color={accent} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 34 }]}
      >
        <AnimatedCard direction="fade" style={styles.summaryMotion}>
          <LinearGradient colors={[accent, accentPressed]} style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryIcon}>
                <Icon name="bell" size={22} color={accentText} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={[styles.summaryCount, { color: accentText }]}>
                  {formatNumber(unreadCount)}
                </Text>
                <Text style={[styles.summaryLabel, { color: accentText }]}>
                  {unreadCount === 1 ? tr("unread notification") : tr("unread notifications")}
                </Text>
              </View>
              <View style={styles.summaryTotal}>
                <Text style={[styles.summaryTotalValue, { color: accentText }]}>
                  {formatNumber(roleNotifications.length)}
                </Text>
                <Text style={[styles.summaryTotalLabel, { color: accentText }]}>{tr("Inbox")}</Text>
              </View>
            </View>

            <View style={styles.summaryActions}>
              <Pressable
                disabled={unreadCount === 0}
                onPress={markAllRead}
                style={({ pressed }) => [
                  styles.summaryAction,
                  unreadCount === 0 && styles.summaryActionDisabled,
                  pressed && unreadCount > 0 && styles.summaryActionPressed,
                ]}
              >
                <Icon name="check-circle" size={15} color={accentText} />
                <Text style={[styles.summaryActionText, { color: accentText }]}>{tr("Mark all read")}</Text>
              </Pressable>

              <Pressable
                disabled={roleNotifications.length === 0}
                onPress={confirmClear}
                style={({ pressed }) => [
                  styles.summaryAction,
                  roleNotifications.length === 0 && styles.summaryActionDisabled,
                  pressed && roleNotifications.length > 0 && styles.summaryActionPressed,
                ]}
              >
                <Icon name="trash-2" size={15} color={accentText} />
                <Text style={[styles.summaryActionText, { color: accentText }]}>{tr("Clear inbox")}</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </AnimatedCard>

        <View style={styles.filterRow}>
          {([
            ["all", tr("All")],
            ["unread", tr("Unread")],
          ] as Array<[Filter, string]>).map(([value, label]) => {
            const active = filter === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => setFilter(value)}
                style={({ pressed }) => [
                  styles.filterButton,
                  {
                    backgroundColor: active ? accent : theme.colors.surface,
                    borderColor: active ? accent : theme.colors.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, { color: active ? accentText : theme.colors.textSecondary }]}>
                  {label}
                </Text>
                {value === "unread" && unreadCount > 0 ? (
                  <View
                    style={[
                      styles.filterCount,
                      { backgroundColor: active ? "rgba(255,255,255,0.22)" : theme.colors.surfaceAlt },
                    ]}
                  >
                    <Text style={[styles.filterCountText, { color: active ? accentText : accent }]}>
                      {unreadCount > 99 ? "99+" : formatNumber(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {filteredNotifications.length === 0 ? (
          <AnimatedCard direction="fade" style={styles.emptyMotion}>
            <View style={styles.emptyCard}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Icon
                  name={filter === "unread" ? "check-circle" : "bell-off"}
                  size={32}
                  color={filter === "unread" ? theme.colors.success : theme.colors.textMuted}
                />
              </View>
              <Text style={[styles.emptyTitle, localizedText]}>{emptyTitle}</Text>
              <Text style={[styles.emptyCopy, localizedText]}>{emptyCopy}</Text>
              {filter === "unread" && roleNotifications.length > 0 ? (
                <Pressable
                  onPress={() => setFilter("all")}
                  style={({ pressed }) => [
                    styles.emptyAction,
                    { backgroundColor: accent },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.emptyActionText, { color: accentText }]}>{tr("View all notifications")}</Text>
                </Pressable>
              ) : null}
            </View>
          </AnimatedCard>
        ) : (
          <View style={styles.list}>
            {filteredNotifications.map((notification, index) => {
              const visual = notificationVisual(notification.type, theme);
              return (
                <AnimatedCard
                  key={notification.id}
                  delay={Math.min(index * 38, 240)}
                  style={styles.itemMotion}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${notification.title}. ${notification.message}`}
                    accessibilityHint={tr("Opens the related Athoo screen")}
                    onPress={() => handleNotificationPress(notification)}
                    style={({ pressed }) => [
                      styles.notificationCard,
                      !notification.read && {
                        borderColor: accent,
                        backgroundColor: theme.colors.elevated,
                      },
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: visual.color + "18" }]}>
                      <Icon name={visual.icon} size={20} color={visual.color} />
                    </View>

                    <View style={styles.copy}>
                      <View style={styles.metaRow}>
                        <View style={[styles.typePill, { backgroundColor: visual.color + "14" }]}>
                          <Text style={[styles.typeText, { color: visual.color }]}>{tr(visual.label)}</Text>
                        </View>
                        <Text style={styles.timeText}>{timeAgo(notification.timestamp)}</Text>
                      </View>

                      <Text
                        style={[styles.itemTitle, localizedText, !notification.read && styles.itemTitleUnread]}
                        numberOfLines={2}
                      >
                        {notification.title}
                      </Text>
                      <Text style={[styles.itemMessage, localizedText]} numberOfLines={3}>
                        {notification.message}
                      </Text>

                      <View style={styles.itemFooter}>
                        <View style={styles.openHint}>
                          <Text style={[styles.openHintText, { color: accent }]}>
                            {notification.actionLabel || tr("View details")}
                          </Text>
                          <Icon name="arrow-right" size={12} color={accent} />
                        </View>
                        {!notification.read ? (
                          <View style={[styles.unreadStatus, { backgroundColor: accent }]}>
                            <Text style={[styles.unreadStatusText, { color: accentText }]}>{tr("New")}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tr("Dismiss {{title}}", { title: notification.title })}
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        dismiss(notification.id);
                      }}
                      style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
                    >
                      <Icon name="x" size={15} color={theme.colors.textMuted} />
                    </Pressable>
                  </Pressable>
                </AnimatedCard>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    header: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: redesign.layout.horizontalPadding,
      paddingVertical: 11,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: redesign.visual.cardBorderWidth,
      borderBottomColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    headerButton: {
      width: redesign.control.iconButtonSize,
      height: redesign.control.iconButtonSize,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    headerCopy: { flex: 1, minWidth: 0 },
    headerTitle: { ...theme.typography.h2, color: theme.colors.text, letterSpacing: -0.25 },
    headerSubtitle: { marginTop: 2, ...theme.typography.caption, color: theme.colors.textMuted },
    content: { padding: redesign.layout.horizontalPadding, gap: 12 },
    summaryMotion: { width: "100%" },
    summaryCard: {
      borderRadius: theme.radius.xl,
      padding: 16,
      gap: 14,
      ...theme.shadows.md,
    },
    summaryTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    summaryIcon: {
      width: 46,
      height: 46,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    summaryCopy: { flex: 1 },
    summaryCount: { ...theme.typography.h1 },
    summaryLabel: { marginTop: 1, ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, opacity: 0.88 },
    summaryTotal: { alignItems: "flex-end" },
    summaryTotalValue: { ...theme.typography.h3 },
    summaryTotalLabel: { marginTop: 2, ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, opacity: 0.8 },
    summaryActions: { flexDirection: "row", gap: 8 },
    summaryAction: {
      flex: 1,
      minHeight: redesign.control.compactHeight,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 8,
      borderRadius: theme.radius.md,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: "rgba(255,255,255,0.22)",
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    summaryActionDisabled: { opacity: redesign.visual.disabledOpacity },
    summaryActionPressed: { opacity: 0.78, transform: [{ scale: redesign.visual.pressedScale }] },
    summaryActionText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily },
    filterRow: { flexDirection: "row", gap: 8 },
    filterButton: {
      minHeight: redesign.control.compactHeight,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 15,
      borderRadius: theme.radius.pill,
      borderWidth: redesign.visual.cardBorderWidth,
    },
    filterText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily },
    filterCount: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
    },
    filterCountText: { fontSize: 9.5, fontWeight: "900" },
    list: { gap: 9 },
    itemMotion: { width: "100%" },
    notificationCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 11,
      padding: 13,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    cardPressed: { opacity: 0.86, transform: [{ scale: redesign.visual.pressedScale }] },
    iconWrap: { width: 42, height: 42, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    copy: { flex: 1, minWidth: 0 },
    metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 },
    typePill: { minHeight: 22, paddingHorizontal: 7, borderRadius: theme.radius.pill, justifyContent: "center" },
    typeText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily },
    timeText: { ...theme.typography.caption, color: theme.colors.textMuted },
    itemTitle: { ...theme.typography.label, color: theme.colors.text },
    itemTitleUnread: { fontWeight: "900" },
    itemMessage: { marginTop: 4, ...theme.typography.body, color: theme.colors.textSecondary },
    itemFooter: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    openHint: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
    openHintText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily },
    unreadStatus: { minHeight: 22, paddingHorizontal: 7, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center" },
    unreadStatusText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily },
    dismissButton: {
      width: 30,
      height: 30,
      marginTop: -2,
      marginRight: -2,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
      flexShrink: 0,
    },
    pressed: { opacity: 0.78, transform: [{ scale: redesign.visual.pressedScale }] },
    emptyMotion: { width: "100%" },
    emptyCard: {
      minHeight: 300,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
      paddingVertical: 38,
      borderRadius: theme.radius.xl,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    emptyIcon: { width: 70, height: 70, borderRadius: theme.radius.xl, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    emptyTitle: { ...theme.typography.h2, color: theme.colors.text, textAlign: "center" },
    emptyCopy: { marginTop: 8, ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center", maxWidth: 360 },
    emptyAction: { minHeight: redesign.control.standardHeight, marginTop: 18, paddingHorizontal: 15, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", ...theme.shadows.sm },
    emptyActionText: { ...theme.typography.label },
  });
}
