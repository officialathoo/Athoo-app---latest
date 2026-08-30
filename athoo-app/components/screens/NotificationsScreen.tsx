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
import { responsiveContent } from "@/components/design";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SectionList,
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

type PeriodKey = "today" | "week" | "earlier";

function periodKey(timestamp: string): PeriodKey {
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return "earlier";
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  if (parsed >= dayStart.getTime()) return "today";
  const weekStart = dayStart.getTime() - 6 * 86400000;
  if (parsed >= weekStart) return "week";
  return "earlier";
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
  const sections = useMemo(() => {
    const visible = filter === "unread"
      ? roleNotifications.filter((notification) => !notification.read)
      : roleNotifications;
    const grouped: Record<PeriodKey, AppNotif[]> = { today: [], week: [], earlier: [] };
    for (const notification of visible) grouped[periodKey(notification.timestamp)].push(notification);
    const order: Array<[PeriodKey, string]> = [
      ["today", tr("Today")],
      ["week", tr("This week")],
      ["earlier", tr("Earlier")],
    ];
    return order
      .map(([key, label]) => ({ key, label, data: grouped[key] }))
      .filter((section) => section.data.length > 0);
  }, [filter, roleNotifications]);

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

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 34 }]}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={10}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, localizedText]}>{section.label}</Text>
            <Text style={[styles.sectionCount, { color: accent }]}>{formatNumber(section.data.length)}</Text>
          </View>
        )}
        ListHeaderComponent={
          <View>
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
          </View>
        }
        ListEmptyComponent={
          sections.length === 0 ? (
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
          ) : null
        }
        renderItem={({ item: notification, index }) => {
              const visual = notificationVisual(notification.type, theme);
              const unread = !notification.read;
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
                      unread && {
                        borderColor: accent,
                        backgroundColor: theme.colors.elevated,
                      },
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: visual.color + "18" }]}>
                      <Icon name={visual.icon} size={17} color={visual.color} />
                    </View>

                    <View style={styles.copy}>
                      <View style={styles.metaRow}>
                        <Text
                          style={[
                            styles.itemTitle,
                            localizedText,
                            unread && styles.itemTitleUnread,
                          ]}
                          numberOfLines={1}
                        >
                          {notification.title}
                        </Text>
                        <Text style={styles.timeText}>{timeAgo(notification.timestamp)}</Text>
                      </View>

                      <Text
                        style={[styles.itemMessage, localizedText]}
                        numberOfLines={2}
                      >
                        {notification.message}
                      </Text>

                      <View style={styles.itemFooter}>
                        <View style={styles.openHint}>
                          <Text style={[styles.openHintText, { color: accent }, localizedText]} numberOfLines={1}>
                            {notification.actionLabel || tr("View details")}
                          </Text>
                          <Icon name="arrow-right" size={11} color={accent} />
                        </View>
                        {unread ? (
                          <View style={[styles.unreadStatus, { backgroundColor: accent }]}>
                            <Text style={[styles.unreadStatusText, { color: accentText }]}>
                              {tr("New")}
                            </Text>
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
                      <Icon name="x" size={13} color={theme.colors.textMuted} />
                    </Pressable>
                  </Pressable>
                </AnimatedCard>
              );
        }}
      />
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    /* Header — compact, aligned to content margins */
    header: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: redesign.layout.compactHorizontalPadding,
      paddingVertical: 9,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: redesign.visual.cardBorderWidth,
      borderBottomColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    headerCopy: { flex: 1, minWidth: 0 },
    headerTitle: { ...theme.typography.h2, color: theme.colors.text, letterSpacing: -0.25 },
    headerSubtitle: { marginTop: 1, ...theme.typography.caption, color: theme.colors.textMuted },

    /* Content rhythm — uniform 16px margins, 10px gaps */
    content: { padding: redesign.layout.compactHorizontalPadding, gap: 10 },

    /* Summary box — compact */
    summaryMotion: { width: "100%" },
    summaryCard: {
      borderRadius: theme.radius.xl,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 10,
      ...theme.shadows.md,
    },
    summaryTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    summaryIcon: {
      width: 38,
      height: 38,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    summaryCopy: { flex: 1 },
    summaryCount: { ...theme.typography.h3 },
    summaryLabel: {
      marginTop: 0,
      ...theme.typography.caption,
      fontFamily: theme.typography.label.fontFamily,
      opacity: 0.88,
    },
    summaryTotal: { alignItems: "flex-end" },
    summaryTotalValue: { ...theme.typography.h3 },
    summaryTotalLabel: {
      marginTop: 1,
      ...theme.typography.caption,
      fontFamily: theme.typography.label.fontFamily,
      opacity: 0.82,
    },
    summaryActions: { flexDirection: "row", gap: 8 },
    summaryAction: {
      flex: 1,
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 10,
      borderRadius: theme.radius.md,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: "rgba(255,255,255,0.22)",
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    summaryActionDisabled: { opacity: redesign.visual.disabledOpacity },
    summaryActionPressed: { opacity: 0.78, transform: [{ scale: redesign.visual.pressedScale }] },
    summaryActionText: {
      ...theme.typography.caption,
      fontFamily: theme.typography.label.fontFamily,
      fontWeight: "700",
    },

    /* Filters — compact pills */
    filterRow: { flexDirection: "row", gap: 8 },
    filterButton: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: theme.radius.pill,
      borderWidth: redesign.visual.cardBorderWidth,
    },
    filterText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily },
    filterCount: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
    },
    filterCountText: { fontSize: 9, fontWeight: "900" },

    /* Section heading */
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingTop: 8,
      paddingBottom: 2,
    },
    sectionLabel: {
      ...theme.typography.caption,
      color: theme.colors.textSecondary,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sectionCount: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, fontWeight: "900" },

    /* Notification card — compact, flat, uniform grid */
    itemMotion: { width: "100%" },
    notificationCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 12,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    cardPressed: { opacity: 0.86, transform: [{ scale: redesign.visual.pressedScale }] },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 1,
    },
    copy: { flex: 1, minWidth: 0 },
    metaRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
    },
    itemTitle: {
      flex: 1,
      minWidth: 0,
      ...theme.typography.label,
      color: theme.colors.text,
    },
    itemTitleUnread: { fontWeight: "900" },
    timeText: { marginTop: 2, ...theme.typography.caption, color: theme.colors.textMuted, flexShrink: 0 },
    itemMessage: {
      marginTop: 3,
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      lineHeight: 17,
    },
    itemFooter: {
      marginTop: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      minHeight: 20,
    },
    openHint: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0, flexShrink: 1 },
    openHintText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, flexShrink: 1 },
    unreadStatus: {
      minHeight: 20,
      paddingHorizontal: 8,
      borderRadius: theme.radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    unreadStatusText: {
      ...theme.typography.caption,
      fontFamily: theme.typography.label.fontFamily,
      fontSize: 10.5,
      fontWeight: "800",
    },
    dismissButton: {
      width: 26,
      height: 26,
      marginTop: -2,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
      flexShrink: 0,
    },
    pressed: { opacity: 0.78, transform: [{ scale: redesign.visual.pressedScale }] },

    /* Empty state */
    emptyMotion: { width: "100%" },
    emptyCard: {
      minHeight: 240,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 28,
      borderRadius: theme.radius.xl,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: theme.radius.lg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    emptyTitle: { ...theme.typography.h2, color: theme.colors.text, textAlign: "center" },
    emptyCopy: {
      marginTop: 6,
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      maxWidth: 340,
    },
    emptyAction: {
      minHeight: 44,
      marginTop: 14,
      paddingHorizontal: 14,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.sm,
    },
    emptyActionText: { ...theme.typography.label, fontSize: 13 },
  });
}
