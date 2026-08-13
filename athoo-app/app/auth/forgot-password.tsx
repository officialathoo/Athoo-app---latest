import { Icon } from "@/components/ui/Icon";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { apiErrorToMessage } from "@/lib/apiError";

type Step = "identifier" | "otp" | "reset";
type Role = "customer" | "provider";

async function postJson(path: string, body: Record<string, any>) {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let data: any = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Request failed");
  }

  return data;
}

export default function ForgotPasswordScreen() {
  const { role } = useLocalSearchParams<{ role?: Role }>();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const localizedRow = direction === "rtl" ? styles.rowReverse : undefined;
  const insets = useSafeAreaInsets();

  const safeRole: Role = useMemo(
    () => (role === "provider" ? "provider" : "customer"),
    [role]
  );

  const isProvider = safeRole === "provider";

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [otpResendIn, setOtpResendIn] = useState(0);

  useEffect(() => {
    if (step !== "otp") return;

    const timer = setInterval(() => {
      setOtpExpiresIn((value) => (value > 0 ? value - 1 : 0));
      setOtpResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  const goBackToLogin = () => {
    router.replace({
      pathname: "/auth/login",
      params: { role: safeRole },
    });
  };

  const handleSendOtp = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || trimmed.length < 3) {
      Alert.alert(tr("Required"), tr("Please enter your phone number or email address."));
      return;
    }

    try {
      setLoading(true);
      const res = await postJson("/api/auth/forgot-password/send-otp", {
        identifier: trimmed,
        role: safeRole,
      });

      if (__DEV__ && res?.code) {
        setOtpHint(res.code);
        Alert.alert(tr("Dev Mode OTP"), tr("Your OTP is: {{code}}", { code: res.code }));
      }
      setChallengeToken(res.challengeToken || "");
      setOtp("");
      setOtpExpiresIn(Math.max(0, Number(res.expiresInSeconds || 600)));
      setOtpResendIn(Math.max(0, Number(res.resendAfterSeconds || 45)));
      setStep("otp");
    } catch (e: any) {
      Alert.alert(tr("Failed"), tr(apiErrorToMessage(e, "Failed to send reset OTP.")));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpExpiresIn === 0) {
      Alert.alert(tr("Code Expired"), tr("Code expired. Request a new OTP."));
      return;
    }

    if (!otp || otp.trim().length !== 4) {
      Alert.alert(tr("Invalid OTP"), tr("Please enter the 4-digit OTP."));
      return;
    }

    try {
      setLoading(true);
      const res = await postJson("/api/auth/forgot-password/verify-otp", {
        challengeToken,
        code: otp.trim(),
      });

      setResetToken(res.resetToken || "");
      setStep("reset");
    } catch (e: any) {
      Alert.alert(tr("Verification Failed"), tr(apiErrorToMessage(e, "Invalid or expired OTP.")));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert(tr("Invalid Password"), tr("Password must be at least 8 characters."));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(tr("Mismatch"), tr("New password and confirm password do not match."));
      return;
    }

    try {
      setLoading(true);
      await postJson("/api/auth/forgot-password/reset", {
        resetToken,
        newPassword: newPassword.trim(),
      });

      Alert.alert(tr("Success"), tr("Password reset successful. Please sign in now."), [
        {
          text: "OK",
          onPress: goBackToLogin,
        },
      ]);
    } catch (e: any) {
      Alert.alert(tr("Reset Failed"), tr(apiErrorToMessage(e, "Failed to reset password.")));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "reset") {
      setStep("otp");
      return;
    }
    if (step === "otp") {
      setStep("identifier");
      setOtp("");
      setOtpExpiresIn(0);
      setOtpResendIn(0);
      return;
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={
            theme.dark
              ? (isProvider
                  ? ["#17100A", "#5B2A09", "#A94708"]
                  : ["#07101F", "#0B2A59", "#0C4EA6"])
              : isProvider
                ? [theme.colors.secondaryPressed, theme.colors.secondary, "#FF9A45"]
                : [theme.colors.primaryPressed, theme.colors.primary, "#4EA1FF"]
          }
          style={[styles.hero, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 12 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Pressable style={styles.backBtn} onPress={handleBack}>
            <Icon name="arrow-left" size={20} color={theme.colors.white} />
          </Pressable>

          <View style={[styles.logoRow, localizedRow]}>
            <View style={styles.logoCircle}>
              <Icon
                name={isProvider ? "tool" : "shield"}
                size={24}
                color={isProvider ? theme.colors.secondary : theme.colors.primary}
              />
            </View>
            <Text style={styles.logoText}>Athoo</Text>
          </View>

          <Text style={[styles.heroTitle, localizedText]}>{tr("Forgot Password")}</Text>
          <Text style={[styles.heroSub, localizedText]}>
            {step === "identifier" && tr("Enter your phone number or email to receive a reset OTP.")}
            {step === "otp" && tr("Enter the OTP sent to your registered contact.")}
            {step === "reset" && tr("Create a new password for your account.")}
          </Text>

          <View style={[styles.roleBadge, localizedRow]}>
            <Icon name={isProvider ? "tool" : "user"} size={12} color={theme.colors.white} />
            <Text style={[styles.roleBadgeText, localizedText]}>
              {isProvider ? tr("Provider Account") : tr("Customer Account")}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          {step === "identifier" && (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, localizedText]}>{tr("Phone Number or Email")}</Text>
                <View style={[styles.inputWrapper, localizedRow]}>
                  <Icon name="user" size={18} color={theme.colors.textMuted} />
                  <TextInput
                    style={[styles.input, localizedText]}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="0300-1234567 or email@example.com"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoFocus
                  />
                </View>
              </View>

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleSendOtp}
                disabled={loading}
              >
                <LinearGradient
                  colors={isProvider ? [theme.colors.secondary, theme.colors.secondaryPressed] : [theme.colors.primary, theme.colors.primaryPressed]}
                  style={styles.primaryBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Icon name="send" size={16} color={theme.colors.white} />
                  <Text style={styles.primaryBtnText}>
                    {loading ? tr("Sending...") : tr("Send Reset OTP")}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {step === "otp" && (
            <View style={styles.form}>
              <View style={[styles.statusBox, localizedRow]}>
                <Icon name="check-circle" size={18} color={theme.colors.success} />
                <Text style={[styles.statusText, localizedText]}>
                  {tr("If an account matches these details, a reset OTP has been sent.")}
                </Text>
              </View>

              {otpHint ? (
                <View style={[styles.hintBox, localizedRow]}>
                  <Icon name="info" size={14} color={theme.colors.secondary} />
                  <Text style={[styles.hintText, localizedText]}>
                    {tr("Your OTP: {{code}}", { code: otpHint })}
                  </Text>
                </View>
              ) : null}

              <View style={styles.inputGroup}>
                <Text style={[styles.label, localizedText]}>{tr("Enter 4-digit OTP")}</Text>
                <View style={[styles.inputWrapper, styles.otpWrapper]}>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 4))}
                    placeholder="• • • •"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                  />
                </View>
              </View>

              <Text style={styles.otpTimer}>
                {otpExpiresIn > 0
                  ? tr("Code expires in {{time}}", {
                      time: Math.floor(otpExpiresIn / 60) + ":" + String(otpExpiresIn % 60).padStart(2, "0"),
                    })
                  : tr("Code expired. Request a new OTP.")}
              </Text>

              <Pressable
                style={[styles.primaryBtn, (loading || otpExpiresIn === 0) && styles.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading || otpExpiresIn === 0}
              >
                <LinearGradient
                  colors={isProvider ? [theme.colors.secondary, theme.colors.secondaryPressed] : [theme.colors.primary, theme.colors.primaryPressed]}
                  style={styles.primaryBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Icon name="shield" size={16} color={theme.colors.white} />
                  <Text style={styles.primaryBtnText}>
                    {loading ? tr("Verifying...") : tr("Verify OTP")}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={[styles.resendBtn, (loading || otpResendIn > 0) && styles.btnDisabled]}
                onPress={handleSendOtp}
                disabled={loading || otpResendIn > 0}
              >
                <Text style={styles.resendText}>
                  {otpResendIn > 0
                    ? tr("Resend in {{seconds}}s", { seconds: otpResendIn })
                    : tr("Resend OTP")}
                </Text>
              </Pressable>
            </View>
          )}

          {step === "reset" && (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, localizedText]}>{tr("New Password")}</Text>
                <View style={[styles.inputWrapper, localizedRow]}>
                  <Icon name="lock" size={18} color={theme.colors.textMuted} />
                  <TextInput
                    style={[styles.input, localizedText]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder={tr("Enter new password (min 8 chars)")}
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoFocus
                  />
                  <Pressable onPress={() => setShowNewPassword(!showNewPassword)}>
                    <Icon
                      name={showNewPassword ? "eye-off" : "eye"}
                      size={18}
                      color={theme.colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, localizedText]}>{tr("Confirm Password")}</Text>
                <View style={[styles.inputWrapper, localizedRow]}>
                  <Icon name="lock" size={18} color={theme.colors.textMuted} />
                  <TextInput
                    style={[styles.input, localizedText]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder={tr("Confirm new password")}
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                    <Icon
                      name={showConfirmPassword ? "eye-off" : "eye"}
                      size={18}
                      color={theme.colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                <LinearGradient
                  colors={isProvider ? [theme.colors.secondary, theme.colors.secondaryPressed] : [theme.colors.primary, theme.colors.primaryPressed]}
                  style={styles.primaryBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Icon name="lock" size={16} color={theme.colors.white} />
                  <Text style={styles.primaryBtnText}>
                    {loading ? tr("Updating...") : tr("Reset Password")}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  rowReverse: { flexDirection: "row-reverse" },

  hero: {
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingBottom: 38,
  },
  backBtn: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    ...theme.typography.h2,
    color: theme.colors.white,
    letterSpacing: -0.5,
  },
  heroTitle: {
    ...theme.typography.display,
    color: theme.colors.white,
    marginBottom: 6,
    letterSpacing: -0.6,
  },
  heroSub: {
    ...theme.typography.body,
    color: "rgba(255,255,255,0.82)",
    marginBottom: 15,
    maxWidth: 520,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },
  roleBadgeText: {
    fontSize: 12,
    color: theme.colors.white,
    fontWeight: "600",
  },

  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -20,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: 24,
    paddingBottom: 44,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.md,
  },

  form: { gap: redesign.layout.fieldGap },
  inputGroup: { gap: 7 },
  label: { ...theme.typography.label, color: theme.colors.text },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.input,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    minHeight: redesign.control.standardHeight,
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    ...theme.typography.bodyLg,
    color: theme.colors.text,
    paddingVertical: 0,
  },

  otpWrapper: {
    justifyContent: "center",
    borderColor: (theme.colors.primary + "66"),
    backgroundColor: theme.colors.infoSoft,
  },
  otpInput: {
    textAlign: "center",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: 14,
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.successSoft,
    borderRadius: theme.radius.md,
    padding: 11,
    borderWidth: 1,
    borderColor: theme.colors.success + "28",
  },
  statusText: {
    fontSize: 13,
    color: theme.colors.text,
    flex: 1,
  },

  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.premiumSoft,
    borderRadius: theme.radius.md,
    padding: 11,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "28",
  },
  hintText: {
    fontSize: 13,
    color: theme.colors.text,
  },

  otpTimer: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },

  resendBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  resendText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },

  primaryBtn: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
    ...theme.shadows.sm,
  },
  primaryBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: redesign.control.largeHeight,
  },
  primaryBtnText: {
    ...theme.typography.bodyLg,
    fontFamily: theme.typography.h3.fontFamily,
    color: theme.colors.white,
  },
  btnDisabled: {
    opacity: redesign.visual.disabledOpacity,
  },
});
