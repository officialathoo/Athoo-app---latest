import { Icon } from "@/components/ui/Icon";
import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { useNotifications } from "@/context/NotificationContext";
import { useBroadcast } from "@/context/BroadcastContext";
import { useBookings } from "@/context/BookingContext";

function NegotiationAlertHandler() {
  const { pendingAlerts, consumeNegAlerts } = useNegotiation();
  const { push } = useNotifications();

  useEffect(() => {
    if (pendingAlerts.length === 0) return;
    const alerts = consumeNegAlerts();
    for (const alert of alerts) {
      push({
        type: "negotiation",
        title: alert.title,
        message: alert.message,
        role: "provider",
        negotiationId: alert.negotiation.id,
      });
    }
  }, [pendingAlerts]);

  return null;
}

/**
 * BroadcastAlertHandler — mounts inside the provider tab navigator so it has
 * access to the navigation context. Watches `latestBroadcast` from
 * BroadcastContext and fires the in-app popup + ringtone every time a new
 * broadcast job arrives, even if the app is already open.
 *
 * Belt-and-suspenders: BroadcastContext also calls push() / playRingtone()
 * directly, but those can fire before the navigation tree is ready when the
 * app cold-starts. This handler runs inside the fully-mounted navigator so
 * the popup can navigate correctly on tap.
 */
function BroadcastAlertHandler() {
  const { latestBroadcast, dismissLatestBroadcast } = useBroadcast();
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestBroadcast) return;
    if (lastIdRef.current === latestBroadcast.id) return; // already processed
    lastIdRef.current = latestBroadcast.id;

    // NotificationContext and the backend push own audio and OS delivery.
    // This navigator-level handler only releases the transient popup state.
    // Auto-dismiss after 30 s so future alerts are never blocked
    const timer = setTimeout(dismissLatestBroadcast, 30_000);
    return () => clearTimeout(timer);
  }, [latestBroadcast]);

  return null;
}

function BroadcastBadge({ count, backgroundColor }: { count: number; backgroundColor: string }) {
  const { theme } = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color: theme.colors.onDanger }]}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

function UnreadBadge({ count, backgroundColor }: { count: number; backgroundColor: string }) {
  const { theme } = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color: theme.colors.onDanger }]}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

export default function ProviderTabLayout() {
  const { t } = useLang();
  const { openBroadcastCount } = useBroadcast();
  const { unreadCount, unreadMessageCount } = useNotifications();
  const { bookings } = useBookings();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabHeight = Platform.OS === "web" ? 84 : 56 + insets.bottom;
  const tabPadBottom = Platform.OS === "web" ? 20 : insets.bottom + 4;

  return (
    <>
      <NegotiationAlertHandler />
      <BroadcastAlertHandler />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.colors.secondary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.divider,
            height: tabHeight,
            paddingBottom: tabPadBottom,
            paddingTop: theme.spacing.sm,
            ...theme.shadows.sm,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: theme.typography.label.fontFamily,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: t.dashboard,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconWrap, focused && { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.sm }]}>
                <Icon name="grid" size={theme.iconSize.md} color={color} />
                {openBroadcastCount > 0 && (
                  <BroadcastBadge count={openBroadcastCount} backgroundColor={theme.colors.danger} />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="jobs"
          options={{
            title: t.jobs,
            tabBarIcon: ({ color, focused }) => {
              const pendingCount = bookings.filter(
                (b) => b.status === "pending"
              ).length;
              return (
                <View style={[styles.iconWrap, focused && { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.sm }]}>
                  <Icon name="briefcase" size={theme.iconSize.md} color={color} />
                  {pendingCount > 0 && <UnreadBadge count={pendingCount} backgroundColor={theme.colors.danger} />}
                </View>
              );
            },
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: t.earnings,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconWrap, focused && { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.sm }]}>
                <Icon name="dollar-sign" size={theme.iconSize.md} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: t.chat,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconWrap, focused && { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.sm }]}>
                <Icon name="message-circle" size={theme.iconSize.md} color={color} />
                {unreadMessageCount > 0 && <UnreadBadge count={unreadMessageCount} backgroundColor={theme.colors.danger} />}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t.profile,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconWrap, focused && { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.sm }]}>
                <Icon name="user" size={theme.iconSize.md} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 32,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
});
