import { Icon } from "@/components/ui/Icon";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "@/constants/colors";

interface OtpModalProps {
  visible: boolean;
  title: string;
  subtitle: string;
  onVerify: (code: string) => void;
  onCancel: () => void;
  sentTo?: string;
  hint?: string;
  loading?: boolean;
}

export function OtpModal({ visible, title, subtitle, onVerify, onCancel, sentTo, hint, loading }: OtpModalProps) {
  const [code, setCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(30);
  const inputs = useRef<TextInput[]>([]);
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setCode(["", "", "", ""]);
      setError("");
      setResendTimer(30);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      const interval = setInterval(() => {
        setResendTimer((t) => (t > 0 ? t - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      scale.setValue(0.85);
      opacity.setValue(0);
    }
  }, [visible]);

  const handleChange = (val: string, i: number) => {
    const digits = val.replace(/\D/g, "").split("");
    const newCode = [...code];
    newCode[i] = digits[0] || "";
    setCode(newCode);
    setError("");
    if (digits[0] && i < 3) inputs.current[i + 1]?.focus();
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, i: number) => {
    if (e.nativeEvent.key === "Backspace" && !code[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handleVerify = () => {
    const fullCode = code.join("");
    if (fullCode.length < 4) {
      setError("Enter the 4-digit OTP");
      return;
    }
    onVerify(fullCode);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.iconCircle}>
            <Icon name="shield" size={30} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {sentTo && <Text style={styles.sentTo}>Sent to: {sentTo}</Text>}

          {hint ? (
            <View style={styles.hintBox}>
              <Icon name="info" size={14} color={Colors.secondary} />
              <Text style={styles.hintText}>Your code: <Text style={{ fontWeight: "800", color: Colors.secondary }}>{hint}</Text></Text>
            </View>
          ) : null}

          <View style={styles.otpRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(r) => { if (r) inputs.current[i] = r; }}
                style={[styles.otpInput, digit && styles.otpInputFilled]}
                value={digit}
                onChangeText={(v) => handleChange(v, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="numeric"
                maxLength={1}
                textAlign="center"
                selectionColor={Colors.primary}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.verifyBtn, loading && { opacity: 0.7 }]}
            onPress={handleVerify}
            disabled={loading}
          >
            <Text style={styles.verifyText}>{loading ? "Verifying…" : "Verify OTP"}</Text>
          </Pressable>

          <Pressable
            style={[styles.resendBtn, resendTimer > 0 && styles.resendDisabled]}
            onPress={() => { if (resendTimer === 0) setResendTimer(30); }}
          >
            <Text style={[styles.resendText, resendTimer > 0 && styles.resendTextDisabled]}>
              {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
            </Text>
          </Pressable>

          <Pressable onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 380,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 25,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary + "30",
  },
  title: { fontSize: 20, fontWeight: "800", color: Colors.text, textAlign: "center" },
  subtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 19 },
  sentTo: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.secondary + "15",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
    alignSelf: "stretch",
  },
  hintText: { fontSize: 13, color: Colors.text },
  otpRow: { flexDirection: "row", gap: 12, marginVertical: 8 },
  otpInput: {
    width: 58,
    height: 62,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    fontSize: 24,
    fontWeight: "800",
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  otpInputFilled: { borderColor: Colors.primary, backgroundColor: Colors.surface },
  error: { fontSize: 12, color: Colors.error, textAlign: "center" },
  verifyBtn: {
    backgroundColor: Colors.primary,
    width: "100%",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  verifyText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  resendBtn: { paddingVertical: 6 },
  resendDisabled: {},
  resendText: { fontSize: 13, fontWeight: "600", color: Colors.primary },
  resendTextDisabled: { color: Colors.textMuted },
  cancelText: { fontSize: 13, color: Colors.textSecondary },
});

