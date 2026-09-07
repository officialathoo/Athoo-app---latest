import { Icon } from "@/components/ui/Icon";
import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
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

function BroadcastAlertHandler() {
  const { latestBroadcast, dismissLatestBroadcast } = useBroadcast();
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestBroadcast) return;
    if (lastIdRef.current === latestBroadcast.id) return;
    lastIdRef.current = latestBroadcast.id;
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
  const { unreadMessageCount } = useNotifications();
  const { bookings } = useBookings();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web"
    ? 20
    : Math.max(insets.bottom, Platform.OS === "android" ? 8 : 6);
  const tabHeight = Platform.OS === "web" ? 84 : 64 + safeBottom;
  const tabPadBottom = safeBottom;
  const activeTabStyle = {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.secondary + "22",
  };

  return (
    <>
      <NegotiationAlertHandler />
      <BroadcastAlertHandler />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.colors.secondary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: redesign.visual.cardBorderWidth,
            borderTopColor: theme.colors.divider,
            height: tabHeight,
            paddingBottom: tabPadBottom,
            paddingTop: 6,
            ...theme.shadows.sm,
          },
          tabBarItemStyle: {
            minHeight: redesign.control.standardHeight,
            paddingVertical: 2,
          },
          tabBarLabelStyle: {
            ...theme.typography.caption,
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
              <View style={[styles.iconWrap, focused && activeTabStyle]}>
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
                <View style={[styles.iconWrap, focused && activeTabStyle]}>
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
              <View style={[styles.iconWrap, focused && activeTabStyle]}>
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
              <View style={[styles.iconWrap, focused && activeTabStyle]}>
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
              <View style={[styles.iconWrap, focused && activeTabStyle]}>
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
    width: redesign.control.iconButtonSize,
    height: 34,
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
