import { Icon } from "@/components/ui/Icon";
import { useCall } from "@/context/CallContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}


export default function CallScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    activeCall,
    callDuration,
    endCall,
    isMuted,
    setMuted,
    isSpeaker,
    setSpeaker,
    mediaState,
    transportLabel,
    transportDetails,
    callAction,
  } = useCall();
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
  const active = activeCall.state === "active";
  const mediaFailed = mediaState === "failed";
  const mediaReady = mediaState === "webrtc";
  const mediaFallback = mediaState === "fallback";
  const mediaDotColor = connecting || mediaState === "connecting"
    ? theme.colors.warning
    : mediaFailed
      ? theme.colors.danger
      : mediaFallback
        ? theme.colors.warning
        : theme.colors.success;
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
          <View style={[styles.statusDot, { backgroundColor: mediaDotColor }]} />
          <Text style={[styles.statusText, !connecting && styles.activeDuration]}>
            {connecting ? "Calling..." : active ? formatDuration(callDuration) : "Connecting..."}
          </Text>
        </View>

        <View style={[
          styles.transportBadge,
          mediaReady && styles.transportBadgeReady,
          mediaFailed && styles.transportBadgeFailed,
        ]}>
          <Icon
            name={mediaFailed ? "alert-circle" : mediaReady ? "shield-check" : "radio"}
            size={13}
            color={mediaFailed ? theme.colors.danger : mediaReady ? theme.colors.success : theme.colors.white}
          />
          <Text style={[
            styles.transportText,
            mediaReady && { color: theme.colors.success },
            mediaFailed && { color: theme.colors.danger },
          ]}>
            {connecting ? "Waiting for answer" : mediaState === "connecting" ? "Connecting secure audio" : transportLabel}
          </Text>
        </View>

        {transportDetails ? (
          <Text style={styles.transportDetails}>
            {[
              transportDetails.candidateType ? transportDetails.candidateType.toUpperCase() : null,
              transportDetails.protocol ? transportDetails.protocol.toUpperCase() : null,
              transportDetails.roundTripMs !== undefined ? `${transportDetails.roundTripMs} ms RTT` : null,
            ].filter(Boolean).join(" - ")}
          </Text>
        ) : null}
        <Text style={styles.privacyBadge}>Phone number hidden - Athoo secure call</Text>
      </View>


      <View style={[styles.controls, { paddingBottom: bottomPadding + 24 }]}>
        <View style={styles.controlsRow}>
          <Pressable
            style={({ pressed }) => [styles.controlButton, isMuted && styles.controlButtonActive, pressed && styles.pressed]}
            disabled={callAction === "ending"}
            onPress={() => setMuted(!isMuted)}
            accessibilityRole="button"
            accessibilityState={{ selected: isMuted }}
          >
            <Icon name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? theme.colors.danger : theme.colors.white} />
            <Text style={[styles.controlLabel, isMuted && { color: theme.colors.danger }]}>{isMuted ? "Unmute" : "Mute"}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.controlButton, isSpeaker && styles.controlButtonActive, pressed && styles.pressed]}
            disabled={callAction === "ending"}
            onPress={() => void setSpeaker(!isSpeaker)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSpeaker }}
          >
            <Icon name={isSpeaker ? "volume-2" : "volume-1"} size={22} color={isSpeaker ? theme.colors.success : theme.colors.white} />
            <Text style={styles.controlLabel}>Speaker</Text>
          </Pressable>

        </View>

        <Pressable
          style={({ pressed }) => [
            styles.endCallButton,
            callAction === "ending" && styles.controlDisabled,
            pressed && callAction !== "ending" && styles.endCallPressed,
          ]}
          disabled={callAction === "ending"}
          onPress={() => void endCall()}
          accessibilityRole="button"
          accessibilityLabel="End call"
          accessibilityState={{ busy: callAction === "ending" }}
        >
          {callAction === "ending" ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <Icon name="phone-off" size={28} color={theme.colors.white} />
          )}
        </Pressable>
        <Text style={styles.endCallLabel}>
          {callAction === "ending" ? "Ending..." : "End Call"}
        </Text>
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
    callerSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 10 },
    avatarRipple: { width: 116, height: 116, borderRadius: 58, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" },
    avatarRippleInner: { width: 98, height: 98, borderRadius: 49, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
    callerAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.38)" },
    callerAvatarText: { fontSize: 30, fontWeight: "800", color: theme.colors.white },
    callerName: { fontSize: 24, fontWeight: "800", color: theme.colors.white, letterSpacing: -0.4, textAlign: "center" },
    callerService: { fontSize: 15, color: mutedWhite, fontWeight: "500", textAlign: "center" },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 17, fontWeight: "700", color: mutedWhite, letterSpacing: 0.3 },
    activeDuration: { color: theme.colors.white, letterSpacing: 1.6 },
    transportBadge: {
      minHeight: 30,
      borderRadius: 999,
      paddingHorizontal: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)",
    },
    transportBadgeReady: {
      backgroundColor: "rgba(22,163,74,0.16)",
      borderColor: "rgba(134,239,172,0.30)",
    },
    transportBadgeFailed: {
      backgroundColor: "rgba(220,38,38,0.16)",
      borderColor: "rgba(254,202,202,0.28)",
    },
    transportText: { fontSize: 11, color: mutedWhite, fontWeight: "600" },
    transportDetails: { fontSize: 10, color: "rgba(255,255,255,0.68)", fontWeight: "600", textAlign: "center" },
    privacyBadge: { fontSize: 11, color: "rgba(255,255,255,0.60)", marginTop: 3, textAlign: "center" },
    controls: { alignItems: "center", paddingHorizontal: 16, gap: 12 },
    controlsRow: { width: "100%", flexDirection: "row", gap: 10, justifyContent: "center" },
    controlButton: { flex: 1, maxWidth: 120, minWidth: 100, minHeight: 64, borderRadius: 18, backgroundColor: glass, alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
    controlDisabled: { opacity: 0.5 },
    controlButtonActive: { backgroundColor: glassStrong, borderColor: "rgba(255,255,255,0.30)" },
    controlLabel: { fontSize: 11, color: mutedWhite, fontWeight: "600" },
    endCallButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center", shadowColor: theme.colors.danger, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
    endCallPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
    endCallLabel: { fontSize: 13, color: mutedWhite, fontWeight: "600" },
    pressed: { opacity: 0.76 },
  });
}
