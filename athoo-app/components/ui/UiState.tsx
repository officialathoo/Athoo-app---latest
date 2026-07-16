import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AppCard, AppText } from "@/components/design";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/context/ThemeContext";
import { Feather } from "@expo/vector-icons";

/** Branded full-screen / inline loading view. */
export function LoadingView({ label, compact }: { label?: string; compact?: boolean }) {
  const { theme } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label || "Loading"} style={[styles.center, compact ? styles.centerCompact : styles.centerFull]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {label ? <AppText variant="caption" tone="secondary">{label}</AppText> : null}
    </View>
  );
}

/** Branded error state with optional retry. */
export function ErrorView({
  title = "Something went wrong",
  message,
  onRetry,
  compact,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <AppCard elevated={false} style={[styles.center, compact ? styles.centerCompact : styles.centerFull, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.iconCircle, { backgroundColor: theme.colors.dangerSoft }]}>
        <Feather name="alert-circle" size={28} color={theme.colors.danger} />
      </View>
      <AppText variant="h3" align="center">{title}</AppText>
      {message ? <AppText variant="body" tone="secondary" align="center">{message}</AppText> : null}
      {onRetry ? (
        <Button title="Try Again" onPress={onRetry} size="sm" accessibilityLabel="Retry" />
      ) : null}
    </AppCard>
  );
}

/** Branded empty state with optional CTA. */
export function EmptyView({
  icon = "inbox",
  title,
  message,
  ctaLabel,
  onCta,
  compact,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
  ctaLabel?: string;
  onCta?: () => void;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <AppCard elevated={false} style={[styles.center, compact ? styles.centerCompact : styles.centerFull, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.iconCircle, { backgroundColor: theme.colors.infoSoft }]}>
        <Feather name={icon} size={28} color={theme.colors.primary} />
      </View>
      <AppText variant="h3" align="center">{title}</AppText>
      {message ? <AppText variant="body" tone="secondary" align="center">{message}</AppText> : null}
      {ctaLabel && onCta ? (
        <Button title={ctaLabel} onPress={onCta} size="sm" accessibilityLabel={ctaLabel} />
      ) : null}
    </AppCard>
  );
}

/**
 * OfflineBanner — listens to @react-native-community/netinfo when available
 * and shows a non-blocking banner at the top of the screen when offline.
 * Falls back to navigator.onLine on web. No-ops if neither is available.
 */
export function OfflineBanner() {
  const { theme } = useTheme();
  const [offline, setOffline] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let mounted = true;

    if (Platform.OS === "web") {
      const check = () => mounted && setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
      check();
      if (typeof window !== "undefined") {
        window.addEventListener("online", check);
        window.addEventListener("offline", check);
        unsub = () => {
          window.removeEventListener("online", check);
          window.removeEventListener("offline", check);
        };
      }
    } else {
      (async () => {
        try {
          // Optional dependency — resolved at runtime only if installed
          const mod: any = await (Function('return import("@react-native-community/netinfo")') as () => Promise<any>)();
          const NetInfo = mod?.default ?? mod;
          if (!NetInfo?.addEventListener) return;
          const sub = NetInfo.addEventListener((state: any) => {
            if (!mounted) return;
            const isOffline = state?.isConnected === false || state?.isInternetReachable === false;
            setOffline(Boolean(isOffline));
          });
          unsub = () => sub();
        } catch {
          // NetInfo not installed — silently no-op
        }
      })();
    }

    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: offline ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [offline, opacity]);

  if (!offline) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.offlineBanner, { opacity, backgroundColor: theme.colors.danger, borderRadius: theme.radius.sm, shadowColor: theme.colors.overlay }]}>
      <Feather name="wifi-off" size={theme.iconSize.xs} color={theme.colors.white} />
      <Text style={[styles.offlineText, { color: theme.colors.white }]}>You are offline. Some features may not work.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 12 },
  centerFull: { flex: 1, paddingVertical: 60 },
  centerCompact: { paddingVertical: 32 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  offlineBanner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 28,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 9998,
    elevation: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  offlineText: { fontSize: 12, fontWeight: "700", flex: 1 },
});
