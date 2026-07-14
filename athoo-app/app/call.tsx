import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "@/context/CallContext";

function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function CallScreen() {
  const { activeCall, callDuration, endCall, isMuted, setMuted, isSpeaker, setSpeaker } = useCall();
  const [keypad, setKeypad] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current = pulse;
    pulse.start();
    // Always stop on unmount — prevents the loop running after screen is gone
    return () => { pulse.stop(); pulseLoopRef.current = null; };
  }, []);

  useEffect(() => {
    if (!activeCall) {
      // Stop animation immediately so it doesn't run on a null screen
      pulseLoopRef.current?.stop();
      try { if (router.canGoBack()) router.back(); } catch {}
    }
  }, [activeCall]);

  if (!activeCall) {
    return null;
  }

  const isConnecting = activeCall.state === "outgoing";

  const KEYPAD_NUMS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  return (
    <LinearGradient
      colors={["#0D1B2A", "#1A3A5C", "#0D4BA0"]}
      style={[styles.container, { paddingTop: topPad }]}
    >
      <View style={styles.header}>
        <Pressable style={styles.minimiseBtn} onPress={() => router.back()}>
          <Icon name="chevron-down" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.headerLabel}>Athoo In-App Call</Text>
        <View style={styles.encryptedBadge}>
          <Icon name="lock" size={10} color="rgba(255,255,255,0.7)" />
          <Text style={styles.encryptedText}>Encrypted</Text>
        </View>
      </View>

      <View style={styles.callerSection}>
        <Animated.View style={[styles.avatarRipple, { transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.avatarRipple2]}>
            <View style={[styles.callerAvatar, { backgroundColor: activeCall.callerColor || "#1A6EE0" }]}>
              <Text style={styles.callerAvatarText}>{activeCall.callerInitials}</Text>
            </View>
          </View>
        </Animated.View>

        <Text style={styles.callerName}>{activeCall.callerName}</Text>
        {activeCall.service && (
          <Text style={styles.callerService}>{activeCall.service}</Text>
        )}

        <View style={styles.statusRow}>
          {isConnecting ? (
            <>
              <View style={styles.connectingDot} />
              <Text style={styles.statusText}>Connecting...</Text>
            </>
          ) : (
            <>
              <View style={styles.activeDot} />
              <Text style={[styles.statusText, { color: "#22C55E" }]}>{fmt(callDuration)}</Text>
            </>
          )}
        </View>

        <Text style={styles.privacyBadge}>🔒 Phone number hidden · via Athoo only</Text>
      </View>

      {keypad ? (
        <View style={styles.keypadGrid}>
          {KEYPAD_NUMS.map((n) => (
            <Pressable key={n} style={styles.keypadBtn}>
              <Text style={styles.keypadNum}>{n}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: botPad + 24 }]}>
        <View style={styles.controlsRow}>
          <Pressable style={[styles.controlBtn, isMuted && styles.controlBtnActive]} onPress={() => setMuted(!isMuted)}>
            <Icon name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? Colors.error : "#fff"} />
            <Text style={[styles.controlLabel, isMuted && { color: Colors.error }]}>{isMuted ? "Unmute" : "Mute"}</Text>
          </Pressable>

          <Pressable style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]} onPress={() => setSpeaker(!isSpeaker)}>
            <Icon name={isSpeaker ? "volume-2" : "volume-1"} size={22} color={isSpeaker ? "#22C55E" : "#fff"} />
            <Text style={styles.controlLabel}>Speaker</Text>
          </Pressable>

          <Pressable style={[styles.controlBtn, keypad && styles.controlBtnActive]} onPress={() => setKeypad(!keypad)}>
            <Icon name="grid" size={22} color={keypad ? "#F59E0B" : "#fff"} />
            <Text style={styles.controlLabel}>Keypad</Text>
          </Pressable>
        </View>

        <Pressable style={styles.endCallBtn} onPress={endCall}>
          <Icon name="phone-off" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.endCallLabel}>End Call</Text>
      </View>
    </LinearGradient>
  );
}

const Colors = {
  error: "#EF4444",
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  minimiseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  encryptedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  encryptedText: { fontSize: 11, color: "rgba(255,255,255,0.7)" },
  callerSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  avatarRipple: { width: 128, height: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  avatarRipple2: { width: 108, height: 108, borderRadius: 54, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  callerAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.3)" },
  callerAvatarText: { fontSize: 34, fontWeight: "800", color: "#fff" },
  callerName: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  callerService: { fontSize: 15, color: "rgba(255,255,255,0.65)", fontWeight: "500" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  connectingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  statusText: { fontSize: 18, fontWeight: "700", color: "rgba(255,255,255,0.7)", letterSpacing: 2 },
  privacyBadge: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8 },
  keypadGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, paddingHorizontal: 40, paddingBottom: 16 },
  keypadBtn: { width: 70, height: 60, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  keypadNum: { fontSize: 22, fontWeight: "700", color: "#fff" },
  controls: { alignItems: "center", paddingHorizontal: 20, gap: 16 },
  controlsRow: { flexDirection: "row", gap: 16, justifyContent: "center" },
  controlBtn: { width: 78, height: 70, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", gap: 6 },
  controlBtnActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  controlLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  endCallBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", shadowColor: "#EF4444", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
  endCallLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
});

