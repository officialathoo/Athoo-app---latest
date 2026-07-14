import { Icon } from "@/components/ui/Icon";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
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
      });

      if (__DEV__ && res?.code) {
        setOtpHint(res.code);
        Alert.alert(tr("Dev Mode OTP"), tr("Your OTP is: {{code}}", { code: res.code }));
      }
      setChallengeToken(res.challengeToken || "");
      setStep("otp");
    } catch (e: any) {
      Alert.alert(tr("Failed"), tr(apiErrorToMessage(e, "Failed to send reset OTP.")));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.trim().length < 4) {
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
          colors={isProvider ? [theme.colors.secondary, theme.colors.secondaryPressed] : [theme.colors.primary, theme.colors.primaryPressed]}
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
                  {tr("OTP sent to {{identifier}}", { identifier })}
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

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}
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
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
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
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.white,
    letterSpacing: -0.5,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: theme.colors.white,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    marginBottom: 16,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 12,
    color: theme.colors.white,
    fontWeight: "600",
  },

  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    padding: 24,
    paddingBottom: 48,
    shadowColor: theme.colors.overlay,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },

  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.text },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },

  otpWrapper: {
    justifyContent: "center",
    borderColor: theme.colors.primary + "60",
    backgroundColor: theme.colors.primary + "08",
  },
  otpInput: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 16,
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.success + "15",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.success + "30",
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
    backgroundColor: theme.colors.secondary + "15",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "30",
  },
  hintText: {
    fontSize: 13,
    color: theme.colors.text,
  },

  primaryBtn: {
    borderRadius: 16,
    overflow: "hidden",
  },
  primaryBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.white,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
