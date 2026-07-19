import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLang } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";

function UnreadBadge({ count, backgroundColor }: { count: number; backgroundColor: string }) {
  const { theme } = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color: theme.colors.onDanger }]}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

export default function CustomerTabLayout() {
  const { t } = useLang();
  const { unreadCount } = useNotifications();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const safeBottom = Platform.OS === "web"
    ? 20
    : Math.max(insets.bottom, Platform.OS === "android" ? 8 : 6);
  const tabHeight = Platform.OS === "web" ? 84 : 64 + safeBottom;
  const tabPadBottom = safeBottom;
  const activeTabStyle = {
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radius.sm,
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.divider,
          height: tabHeight,
          paddingBottom: tabPadBottom,
          paddingTop: 6,
          ...theme.shadows.sm,
        },
        tabBarItemStyle: {
          minHeight: 54,
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: theme.typography.label.fontFamily,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t.home, tabBarIcon: ({ color, focused }) => (
        <View style={[styles.iconWrap, focused && activeTabStyle]}><Icon name="home" size={theme.iconSize.md} color={color} /></View>
      ) }} />
      <Tabs.Screen name="search" options={{ title: t.search, tabBarIcon: ({ color, focused }) => (
        <View style={[styles.iconWrap, focused && activeTabStyle]}><Icon name="search" size={theme.iconSize.md} color={color} /></View>
      ) }} />
      <Tabs.Screen name="bookings" options={{ title: t.bookings, tabBarIcon: ({ color, focused }) => (
        <View style={[styles.iconWrap, focused && activeTabStyle]}><Icon name="calendar" size={theme.iconSize.md} color={color} /></View>
      ) }} />
      <Tabs.Screen name="chat" options={{ title: t.chat, tabBarIcon: ({ color, focused }) => (
        <View style={[styles.iconWrap, focused && activeTabStyle]}><Icon name="message-circle" size={theme.iconSize.md} color={color} /></View>
      ) }} />
      <Tabs.Screen name="profile" options={{ title: t.profile, tabBarIcon: ({ color, focused }) => (
        <View style={[styles.iconWrap, focused && activeTabStyle]}>
          <Icon name="user" size={theme.iconSize.md} color={color} />
          <UnreadBadge count={unreadCount} backgroundColor={theme.colors.danger} />
        </View>
      ) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    position: "relative",
    width: 44,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
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
  badgeText: { fontSize: 9, fontWeight: "800" },
});
