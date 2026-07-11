import { Icon } from "@/components/ui/Icon";
import { Colors } from "@/constants/colors";
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
  const insets = useSafeAreaInsets();

  const safeRole: Role = useMemo(
    () => (role === "provider" ? "provider" : "customer"),
    [role]
  );

  const isProvider = safeRole === "provider";

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [resolvedPhone, setResolvedPhone] = useState("");
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
      Alert.alert("Required", "Please enter your phone number or email address.");
      return;
    }

    try {
      setLoading(true);
      const res = await postJson("/api/auth/forgot-password/send-otp", {
        identifier: trimmed,
      });

      if (__DEV__ && res?.code) {
        setOtpHint(res.code);
        Alert.alert("Dev Mode OTP", `Your OTP is: ${res.code}`);
      }
      setResolvedPhone(res.resolvedPhone || trimmed);
      setStep("otp");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Failed to send reset OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.trim().length < 4) {
      Alert.alert("Invalid OTP", "Please enter the 4-digit OTP.");
      return;
    }

    try {
      setLoading(true);
      const res = await postJson("/api/auth/forgot-password/verify-otp", {
        phone: resolvedPhone,
        code: otp.trim(),
      });

      setResetToken(res.resetToken || "");
      setStep("reset");
    } catch (e: any) {
      Alert.alert("Verification Failed", e?.message || "Invalid or expired OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert("Invalid Password", "Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New password and confirm password do not match.");
      return;
    }

    try {
      setLoading(true);
      await postJson("/api/auth/forgot-password/reset", {
        resetToken,
        newPassword: newPassword.trim(),
      });

      Alert.alert("Success", "Password reset successful. Please sign in now.", [
        {
          text: "OK",
          onPress: goBackToLogin,
        },
      ]);
    } catch (e: any) {
      Alert.alert("Reset Failed", e?.message || "Failed to reset password.");
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
          colors={isProvider ? [Colors.secondary, "#cc4d00"] : [Colors.primary, "#0D4BA0"]}
          style={[styles.hero, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 12 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Pressable style={styles.backBtn} onPress={handleBack}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>

          <View style={styles.logoRow}>
            <View style={styles.logoCircle}>
              <Icon
                name={isProvider ? "tool" : "shield"}
                size={24}
                color={isProvider ? Colors.secondary : Colors.primary}
              />
            </View>
            <Text style={styles.logoText}>Athoo</Text>
          </View>

          <Text style={styles.heroTitle}>Forgot Password</Text>
          <Text style={styles.heroSub}>
            {step === "identifier" && "Enter your phone number or email to receive a reset OTP."}
            {step === "otp" && "Enter the OTP sent to your registered contact."}
            {step === "reset" && "Create a new password for your account."}
          </Text>

          <View style={styles.roleBadge}>
            <Icon name={isProvider ? "tool" : "user"} size={12} color="#fff" />
            <Text style={styles.roleBadgeText}>
              {isProvider ? "Provider Account" : "Customer Account"}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          {step === "identifier" && (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone Number or Email</Text>
                <View style={styles.inputWrapper}>
                  <Icon name="user" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="0300-1234567 or email@example.com"
                    placeholderTextColor={Colors.textMuted}
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
                  colors={isProvider ? [Colors.secondary, "#cc4d00"] : [Colors.primary, "#0D4BA0"]}
                  style={styles.primaryBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Icon name="send" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {loading ? "Sending..." : "Send Reset OTP"}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {step === "otp" && (
            <View style={styles.form}>
              <View style={styles.statusBox}>
                <Icon name="check-circle" size={18} color={Colors.success} />
                <Text style={styles.statusText}>
                  OTP sent to <Text style={{ fontWeight: "700" }}>{identifier}</Text>
                </Text>
              </View>

              {otpHint ? (
                <View style={styles.hintBox}>
                  <Icon name="info" size={14} color={Colors.secondary} />
                  <Text style={styles.hintText}>
                    Your OTP: <Text style={{ fontWeight: "800", fontSize: 16 }}>{otpHint}</Text>
                  </Text>
                </View>
              ) : null}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Enter 4-Digit OTP</Text>
                <View style={[styles.inputWrapper, styles.otpWrapper]}>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 4))}
                    placeholder="• • • •"
                    placeholderTextColor={Colors.textMuted}
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
                  colors={isProvider ? [Colors.secondary, "#cc4d00"] : [Colors.primary, "#0D4BA0"]}
                  style={styles.primaryBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Icon name="shield" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {loading ? "Verifying..." : "Verify OTP"}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {step === "reset" && (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.inputWrapper}>
                  <Icon name="lock" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password (min 8 chars)"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoFocus
                  />
                  <Pressable onPress={() => setShowNewPassword(!showNewPassword)}>
                    <Icon
                      name={showNewPassword ? "eye-off" : "eye"}
                      size={18}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Icon name="lock" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                    <Icon
                      name={showConfirmPassword ? "eye-off" : "eye"}
                      size={18}
                      color={Colors.textMuted}
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
                  colors={isProvider ? [Colors.secondary, "#cc4d00"] : [Colors.primary, "#0D4BA0"]}
                  style={styles.primaryBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Icon name="lock" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {loading ? "Updating..." : "Reset Password"}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

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
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
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
    color: "#fff",
    fontWeight: "600",
  },

  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    padding: 24,
    paddingBottom: 48,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },

  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },

  otpWrapper: {
    justifyContent: "center",
    borderColor: Colors.primary + "60",
    backgroundColor: Colors.primary + "08",
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
    backgroundColor: Colors.success + "15",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.success + "30",
  },
  statusText: {
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },

  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.secondary + "15",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
  },
  hintText: {
    fontSize: 13,
    color: Colors.text,
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
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
