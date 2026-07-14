import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { AthooTheme } from "@/design/theme";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface OtpModalProps {
  visible: boolean;
  title: string;
  subtitle: string;
  onVerify: (code: string) => void;
  onCancel: () => void;
  onResend?: () => void | Promise<void>;
  sentTo?: string;
  hint?: string;
  loading?: boolean;
}

export function OtpModal({
  visible,
  title,
  subtitle,
  onVerify,
  onCancel,
  onResend,
  sentTo,
  hint,
  loading = false,
}: OtpModalProps) {
  const { theme } = useTheme();
  const { isUrdu, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const [code, setCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(30);
  const [resending, setResending] = useState(false);
  const inputs = useRef<TextInput[]>([]);
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.85);
      opacity.setValue(0);
      return;
    }

    setCode(["", "", "", ""]);
    setError("");
    setResendTimer(30);
    setResending(false);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => inputs.current[0]?.focus());

    const interval = setInterval(() => {
      setResendTimer((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [opacity, scale, visible]);

  const handleChange = (value: string, index: number) => {
    const digits = value.replace(/\D/g, "").split("");
    if (digits.length > 1) {
      const nextCode = [...code];
      digits.slice(0, 4).forEach((digit, digitIndex) => {
        nextCode[Math.min(index + digitIndex, 3)] = digit;
      });
      setCode(nextCode);
      setError("");
      inputs.current[Math.min(index + digits.length, 3)]?.focus();
      return;
    }

    const nextCode = [...code];
    nextCode[index] = digits[0] || "";
    setCode(nextCode);
    setError("");
    if (digits[0] && index < 3) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = (event: { nativeEvent: { key: string } }, index: number) => {
    if (event.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = () => {
    const fullCode = code.join("");
    if (fullCode.length < 4) {
      setError(tr("Enter the 4-digit OTP"));
      return;
    }
    onVerify(fullCode);
  };

  const handleResend = async () => {
    if (resendTimer > 0 || resending || loading) return;
    setResending(true);
    setError("");
    try {
      await onResend?.();
      setResendTimer(30);
    } catch {
      setError(tr("Unable to resend OTP. Please try again."));
    } finally {
      setResending(false);
    }
  };

  const verifyDisabled = loading || code.some((digit) => !digit);
  const resendDisabled = resendTimer > 0 || resending || loading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={tr("Close OTP dialog")}
        />
        <Animated.View
          style={[styles.card, { transform: [{ scale }] }]}
          accessible
          accessibilityLabel={`${title}. ${subtitle}`}
        >
          <View style={styles.iconCircle}>
            <Icon name="shield" size={30} color={theme.colors.primary} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {sentTo ? <Text style={styles.sentTo}>{tr("Sent to: {{destination}}", { destination: sentTo })}</Text> : null}

          {hint ? (
            <View style={styles.hintBox} accessibilityRole="text">
              <Icon name="info" size={14} color={theme.colors.secondary} />
              <Text style={styles.hintText}>
                {tr("Your code:")} <Text style={styles.hintCode}>{hint}</Text>
              </Text>
            </View>
          ) : null}

          <View style={styles.otpRow}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => { if (ref) inputs.current[index] = ref; }}
                style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                value={digit}
                onChangeText={(value) => handleChange(value, index)}
                onKeyPress={(event) => handleKeyPress(event, index)}
                keyboardType="number-pad"
                maxLength={index === 0 ? 4 : 1}
                textAlign="center"
                selectionColor={theme.colors.primary}
                textContentType={index === 0 ? "oneTimeCode" : "none"}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                accessibilityLabel={tr("OTP digit {{position}} of 4", { position: index + 1 })}
                accessibilityValue={{ text: digit ? tr("Entered") : tr("Empty") }}
              />
            ))}
          </View>

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.verifyBtn, verifyDisabled && styles.disabled, pressed && !verifyDisabled && styles.pressed]}
            onPress={handleVerify}
            disabled={verifyDisabled}
            accessibilityRole="button"
            accessibilityLabel={tr("Verify OTP")}
            accessibilityState={{ disabled: verifyDisabled, busy: loading }}
          >
            {loading ? <ActivityIndicator size="small" color={theme.colors.white} /> : null}
            <Text style={styles.verifyText}>{loading ? tr("Verifying…") : tr("Verify OTP")}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.resendBtn, pressed && !resendDisabled && styles.pressed]}
            onPress={handleResend}
            disabled={resendDisabled}
            accessibilityRole="button"
            accessibilityLabel={resendTimer > 0 ? tr("Resend available in {{seconds}} seconds", { seconds: resendTimer }) : tr("Resend OTP")}
            accessibilityState={{ disabled: resendDisabled, busy: resending }}
          >
            {resending ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
            <Text style={[styles.resendText, resendDisabled && styles.resendTextDisabled]}>
              {resending
                ? tr("Sending…")
                : resendTimer > 0
                  ? tr("Resend in {{seconds}}s", { seconds: resendTimer })
                  : tr("Resend OTP")}
            </Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={tr("Cancel")}
            hitSlop={8}
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>{tr("Cancel")}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 28,
      padding: 24,
      alignItems: "center",
      width: "100%",
      maxWidth: 380,
      gap: 12,
      ...theme.shadows.lg,
    },
    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: theme.colors.infoSoft,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: theme.colors.focusRing,
    },
    title: { fontSize: 20, fontWeight: "800", color: theme.colors.text, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    subtitle: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 19, writingDirection: isUrdu ? "rtl" : "ltr" },
    sentTo: { fontSize: 12, fontWeight: "700", color: theme.colors.primary, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    hintBox: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.warningSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.warning, alignSelf: "stretch" },
    hintText: { flex: 1, fontSize: 13, color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    hintCode: { fontWeight: "800", color: theme.colors.secondary },
    otpRow: { flexDirection: "row", gap: 10, marginVertical: 8, direction: "ltr" },
    otpInput: { width: 56, height: 60, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.border, fontSize: 24, fontWeight: "800", color: theme.colors.text, backgroundColor: theme.colors.input },
    otpInputFilled: { borderColor: theme.colors.primary, backgroundColor: theme.colors.infoSoft },
    error: { fontSize: 12, color: theme.colors.danger, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    verifyBtn: { backgroundColor: theme.colors.primary, width: "100%", minHeight: 48, borderRadius: 16, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    verifyText: { color: theme.colors.white, fontWeight: "800", fontSize: 15, writingDirection: isUrdu ? "rtl" : "ltr" },
    resendBtn: { minHeight: 44, paddingHorizontal: 12, flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 8 },
    resendText: { fontSize: 13, fontWeight: "600", color: theme.colors.primary, writingDirection: isUrdu ? "rtl" : "ltr" },
    resendTextDisabled: { color: theme.colors.textMuted },
    cancelBtn: { minHeight: 44, minWidth: 88, alignItems: "center", justifyContent: "center" },
    cancelText: { fontSize: 13, color: theme.colors.textSecondary, writingDirection: isUrdu ? "rtl" : "ltr" },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.82 },
  });
}
