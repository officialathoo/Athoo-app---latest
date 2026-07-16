import { Icon } from "@/components/ui/Icon";
import { useCall } from "@/context/CallContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

const KEYPAD_NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export default function CallScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { activeCall, callDuration, endCall, isMuted, setMuted, isSpeaker, setSpeaker } = useCall();
  const [keypadVisible, setKeypadVisible] = useState(false);
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnimation, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    pulseLoopRef.current = pulse;
    pulse.start();
    return () => {
      pulse.stop();
      pulseLoopRef.current = null;
    };
  }, [pulseAnimation]);

  useEffect(() => {
    if (!activeCall) {
      pulseLoopRef.current?.stop();
      try {
        if (router.canGoBack()) router.back();
      } catch {
        // The root navigator will recover if there is no call route to pop.
      }
    }
  }, [activeCall]);

  if (!activeCall) return null;

  const connecting = activeCall.state === "outgoing";
  const gradient = theme.dark
    ? [theme.colors.background, theme.colors.surfaceAlt, theme.colors.primaryPressed] as const
    : [theme.colors.primaryPressed, theme.colors.primary, theme.colors.secondaryPressed] as const;

  return (
    <LinearGradient colors={gradient} style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Minimise call"
        >
          <Icon name="chevron-down" size={20} color={theme.colors.white} />
        </Pressable>
        <Text style={styles.headerLabel}>Athoo In-App Call</Text>
        <View style={styles.encryptedBadge}>
          <Icon name="lock" size={10} color={theme.colors.white} />
          <Text style={styles.encryptedText}>Encrypted</Text>
        </View>
      </View>

      <View style={styles.callerSection}>
        <Animated.View style={[styles.avatarRipple, { transform: [{ scale: pulseAnimation }] }]}>
          <View style={styles.avatarRippleInner}>
            <View style={[styles.callerAvatar, { backgroundColor: activeCall.callerColor || theme.colors.primary }]}>
              <Text style={styles.callerAvatarText}>{activeCall.callerInitials}</Text>
            </View>
          </View>
        </Animated.View>

        <Text style={styles.callerName}>{activeCall.callerName}</Text>
        {activeCall.service ? <Text style={styles.callerService}>{activeCall.service}</Text> : null}

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: connecting ? theme.colors.warning : theme.colors.success }]} />
          <Text style={[styles.statusText, !connecting && { color: theme.colors.success }]}>
            {connecting ? "Connecting…" : formatDuration(callDuration)}
          </Text>
        </View>

        <Text style={styles.privacyBadge}>🔒 Phone number hidden · via Athoo only</Text>
      </View>

      {keypadVisible ? (
        <View style={styles.keypadGrid}>
          {KEYPAD_NUMBERS.map((number) => (
            <Pressable
              key={number}
              style={({ pressed }) => [styles.keypadButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Key ${number}`}
            >
              <Text style={styles.keypadNumber}>{number}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: bottomPadding + 24 }]}>
        <View style={styles.controlsRow}>
          <Pressable
            style={({ pressed }) => [styles.controlButton, isMuted && styles.controlButtonActive, pressed && styles.pressed]}
            onPress={() => setMuted(!isMuted)}
            accessibilityRole="button"
            accessibilityState={{ selected: isMuted }}
          >
            <Icon name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? theme.colors.danger : theme.colors.white} />
            <Text style={[styles.controlLabel, isMuted && { color: theme.colors.danger }]}>{isMuted ? "Unmute" : "Mute"}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.controlButton, isSpeaker && styles.controlButtonActive, pressed && styles.pressed]}
            onPress={() => setSpeaker(!isSpeaker)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSpeaker }}
          >
            <Icon name={isSpeaker ? "volume-2" : "volume-1"} size={22} color={isSpeaker ? theme.colors.success : theme.colors.white} />
            <Text style={styles.controlLabel}>Speaker</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.controlButton, keypadVisible && styles.controlButtonActive, pressed && styles.pressed]}
            onPress={() => setKeypadVisible(!keypadVisible)}
            accessibilityRole="button"
            accessibilityState={{ selected: keypadVisible }}
          >
            <Icon name="grid" size={22} color={keypadVisible ? theme.colors.warning : theme.colors.white} />
            <Text style={styles.controlLabel}>Keypad</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.endCallButton, pressed && styles.endCallPressed]}
          onPress={endCall}
          accessibilityRole="button"
          accessibilityLabel="End call"
        >
          <Icon name="phone-off" size={28} color={theme.colors.white} />
        </Pressable>
        <Text style={styles.endCallLabel}>End Call</Text>
      </View>
    </LinearGradient>
  );
}

function createStyles(theme: AthooTheme) {
  const glass = "rgba(255,255,255,0.15)";
  const glassStrong = "rgba(255,255,255,0.25)";
  const mutedWhite = "rgba(255,255,255,0.76)";

  return StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    headerButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: glass, alignItems: "center", justifyContent: "center" },
    headerLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: mutedWhite },
    encryptedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: glass, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    encryptedText: { fontSize: 11, color: mutedWhite },
    callerSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
    avatarRipple: { width: 128, height: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" },
    avatarRippleInner: { width: 108, height: 108, borderRadius: 54, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
    callerAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.38)" },
    callerAvatarText: { fontSize: 34, fontWeight: "800", color: theme.colors.white },
    callerName: { fontSize: 28, fontWeight: "800", color: theme.colors.white, letterSpacing: -0.5, textAlign: "center" },
    callerService: { fontSize: 15, color: mutedWhite, fontWeight: "500", textAlign: "center" },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 18, fontWeight: "700", color: mutedWhite, letterSpacing: 2 },
    privacyBadge: { fontSize: 11, color: "rgba(255,255,255,0.60)", marginTop: 8, textAlign: "center" },
    keypadGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, paddingHorizontal: 40, paddingBottom: 16 },
    keypadButton: { width: 70, height: 60, borderRadius: 16, backgroundColor: glass, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
    keypadNumber: { fontSize: 22, fontWeight: "700", color: theme.colors.white },
    controls: { alignItems: "center", paddingHorizontal: 20, gap: 16 },
    controlsRow: { flexDirection: "row", gap: 16, justifyContent: "center" },
    controlButton: { width: 82, minHeight: 72, borderRadius: 20, backgroundColor: glass, alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
    controlButtonActive: { backgroundColor: glassStrong, borderColor: "rgba(255,255,255,0.30)" },
    controlLabel: { fontSize: 11, color: mutedWhite, fontWeight: "600" },
    endCallButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center", shadowColor: theme.colors.danger, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
    endCallPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
    endCallLabel: { fontSize: 13, color: mutedWhite, fontWeight: "600" },
    pressed: { opacity: 0.76 },
  });
}
