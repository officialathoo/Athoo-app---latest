import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
import { radius } from "@/design/tokens";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";
import { useAuth } from "@/context/AuthContext";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  error?: string;
  current?: boolean;
};

type OtpResetStep = "idle" | "otp" | "reset";

function PasswordField({ label, value, onChangeText, placeholder, visible, onToggle, error, current }: PasswordFieldProps) {
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection } = useLang();
  return (
    <View style={styles.fieldGroup}>
      <AppText variant="label">{label}</AppText>
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: theme.colors.input,
            borderColor: error ? theme.colors.danger : theme.colors.border,
          },
        ]}
      >
        <Icon name={current ? "unlock" : "lock"} size={18} color={theme.colors.textMuted} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={current ? "password" : "newPassword"}
          maxLength={128}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              textAlign,
              writingDirection,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? tr("Hide password") : tr("Show password")}
          hitSlop={8}
          onPress={onToggle}
          style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
        >
          <Icon name={visible ? "eye-off" : "eye"} size={19} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      {error ? <AppText variant="caption" tone="danger">{error}</AppText> : null}
    </View>
  );
}

export function ChangePasswordScreen() {
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection } = useLang();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpResetStep, setOtpResetStep] = useState<OtpResetStep>("idle");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [otpResendIn, setOtpResendIn] = useState(0);

  useEffect(() => {
    if (otpResetStep !== "otp") return;
    const timer = setInterval(() => {
      setOtpExpiresIn((value) => (value > 0 ? value - 1 : 0));
      setOtpResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpResetStep]);

  const newPasswordError = useMemo(() => {
    if (!newPassword) return "";
    if (newPassword.length < 8) return tr("Password must be at least 8 characters.");
    return "";
  }, [newPassword, tr]);

  const confirmError = useMemo(() => {
    if (!confirmPassword) return "";
    if (confirmPassword !== newPassword) return tr("Passwords do not match.");
    return "";
  }, [confirmPassword, newPassword, tr]);

  const resetOtpState = () => {
    setOtpResetStep("idle");
    setOtp("");
    setChallengeToken("");
    setResetToken("");
    setOtpExpiresIn(0);
    setOtpResendIn(0);
  };

  const save = async () => {
    if (newPassword.length < 8) {
      Alert.alert(tr("Password too short"), tr("Password must be at least 8 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(tr("Passwords do not match"), tr("Please enter the same new password in both fields."));
      return;
    }
    if (currentPassword && currentPassword === newPassword) {
      Alert.alert(tr("Choose a different password"), tr("Your new password should be different from your current password."));
      return;
    }

    setLoading(true);
    try {
      await api.setPassword({ currentPassword: currentPassword || undefined, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      resetOtpState();
      Alert.alert(
        tr("Password updated"),
        tr("Your password was changed and all existing sessions were signed out for security. Please sign in again with the new password or OTP."),
        [{
          text: tr("Sign in"),
          onPress: () => {
            void logout().finally(() => router.replace("/auth/welcome"));
          },
        }],
      );
    } catch (caught) {
      Alert.alert(
        tr("Unable to update password"),
        tr(apiErrorToMessage(caught, "We couldn't update your password. Please check your current password and try again.")),
      );
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordResetOtp = async () => {
    const role = user?.role === "provider" ? "provider" : "customer";
    const identifier = String(user?.phone || user?.email || "").trim();
    if (!identifier) {
      Alert.alert(tr("Account contact missing"), tr("Add a phone number or verified email before using OTP password reset."));
      return;
    }

    setLoading(true);
    try {
      const res = await api.request<{
        success: boolean;
        challengeToken?: string;
        expiresInSeconds?: number;
        resendAfterSeconds?: number;
        message?: string;
      }>("/api/auth/forgot-password/send-otp", {
        method: "POST",
        body: { identifier, role },
      });
      setChallengeToken(res.challengeToken || "");
      setResetToken("");
      setOtp("");
      setOtpExpiresIn(Math.max(0, Number(res.expiresInSeconds || 600)));
      setOtpResendIn(Math.max(0, Number(res.resendAfterSeconds || 45)));
      setOtpResetStep("otp");
      Alert.alert(
        tr("Check for your code"),
        tr(res.message || "A reset OTP has been sent to your registered contact."),
      );
    } catch (caught) {
      Alert.alert(tr("Failed"), tr(apiErrorToMessage(caught, "Failed to send reset OTP.")));
    } finally {
      setLoading(false);
    }
  };

  const verifyPasswordResetOtp = async () => {
    if (otpExpiresIn === 0) {
      Alert.alert(tr("Code Expired"), tr("Code expired. Request a new OTP."));
      return;
    }
    if (!/^\d{4}$/.test(otp.trim())) {
      Alert.alert(tr("Invalid OTP"), tr("Please enter the 4-digit OTP."));
      return;
    }
    if (!challengeToken) {
      Alert.alert(tr("Reset request expired"), tr("Please request a new OTP."));
      resetOtpState();
      return;
    }

    setLoading(true);
    try {
      const res = await api.request<{ success: boolean; resetToken?: string }>(
        "/api/auth/forgot-password/verify-otp",
        {
          method: "POST",
          body: { challengeToken, code: otp.trim() },
        },
      );
      setResetToken(res.resetToken || "");
      setOtpResetStep("reset");
      Alert.alert(tr("OTP verified"), tr("Enter and save your new password on this screen."));
    } catch (caught) {
      Alert.alert(tr("Verification Failed"), tr(apiErrorToMessage(caught, "Invalid or expired OTP.")));
    } finally {
      setLoading(false);
    }
  };

  const resetPasswordAfterOtp = async () => {
    if (!resetToken) {
      Alert.alert(tr("OTP required"), tr("Please verify the OTP before saving your new password."));
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert(tr("Password too short"), tr("Password must be at least 8 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(tr("Passwords do not match"), tr("Please enter the same new password in both fields."));
      return;
    }

    setLoading(true);
    try {
      await api.request("/api/auth/forgot-password/reset", {
        method: "POST",
        body: { resetToken, newPassword: newPassword.trim() },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      resetOtpState();
      Alert.alert(tr("Password reset"), tr("Your password was reset successfully. Please sign in again."), [
        {
          text: tr("Sign in"),
          onPress: () => {
            void logout().finally(() => router.replace("/auth/welcome"));
          },
        },
      ]);
    } catch (caught) {
      Alert.alert(tr("Reset Failed"), tr(apiErrorToMessage(caught, "Failed to reset password.")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title={tr("Account security")} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 44 }]}
      >
        <AppCard elevated={false} style={{ backgroundColor: theme.colors.infoSoft }}>
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: theme.colors.surface }]}>
              <Icon name="shield" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{tr("Protect your account")}</AppText>
              <AppText variant="caption" tone="secondary" style={styles.infoCopy}>
                {tr("Use a unique password. Athoo will never ask you to share it in chat, calls, or support messages.")}
              </AppText>
            </View>
          </View>
        </AppCard>

        <AppCard elevated={false}>
          <View style={styles.form}>
            {otpResetStep === "idle" ? (
              <PasswordField
                label={tr("Current password (optional if none is set)")}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder={tr("Enter current password")}
                visible={showCurrent}
                onToggle={() => setShowCurrent((value) => !value)}
                current
              />
            ) : (
              <View style={[styles.otpBox, { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.border }]}>
                <Icon name="shield-check" size={18} color={theme.colors.primary} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">
                    {otpResetStep === "otp" ? tr("OTP password reset") : tr("OTP verified")}
                  </AppText>
                  <AppText variant="caption" tone="secondary" style={styles.infoCopy}>
                    {otpResetStep === "otp"
                      ? tr("Stay on this screen and enter the 4-digit reset code sent to your registered contact.")
                      : tr("Now set your new password below. Your sessions will be signed out after reset.")}
                  </AppText>
                </View>
              </View>
            )}

            {otpResetStep === "otp" ? (
              <View style={styles.fieldGroup}>
                <AppText variant="label">{tr("4-digit OTP")}</AppText>
                <View style={[styles.inputWrap, { backgroundColor: theme.colors.input, borderColor: theme.colors.border }]}>
                  <Icon name="lock" size={18} color={theme.colors.textMuted} />
                  <TextInput
                    accessibilityLabel={tr("4-digit OTP")}
                    value={otp}
                    onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="----"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                    textContentType="oneTimeCode"
                    style={[
                      styles.input,
                      {
                        color: theme.colors.text,
                        writingDirection,
                      },
                      styles.otpInput,
                    ]}
                  />
                </View>
                <AppText variant="caption" tone={otpExpiresIn === 0 ? "danger" : "secondary"}>
                  {otpExpiresIn > 0
                    ? tr("Code expires in {{minutes}}:{{seconds}}", {
                        minutes: String(Math.floor(otpExpiresIn / 60)).padStart(2, "0"),
                        seconds: String(otpExpiresIn % 60).padStart(2, "0"),
                      })
                    : tr("Code expired")}
                </AppText>
              </View>
            ) : null}

            {otpResetStep !== "otp" ? (
              <>
                <PasswordField
                  label={tr("New password")}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={tr("At least 8 characters")}
                  visible={showNew}
                  onToggle={() => setShowNew((value) => !value)}
                  error={newPasswordError}
                />
                <PasswordField
                  label={tr("Confirm new password")}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={tr("Enter the new password again")}
                  visible={showConfirm}
                  onToggle={() => setShowConfirm((value) => !value)}
                  error={confirmError}
                />
              </>
            ) : null}

            {otpResetStep === "idle" ? (
              <Button
                title={loading ? tr("Saving…") : tr("Save password")}
                onPress={() => void save()}
                loading={loading}
                disabled={Boolean(newPasswordError || confirmError || !newPassword || !confirmPassword)}
                fullWidth
              />
            ) : otpResetStep === "otp" ? (
              <Button
                title={loading ? tr("Verifying…") : tr("Verify OTP")}
                onPress={() => void verifyPasswordResetOtp()}
                loading={loading}
                disabled={loading || otpExpiresIn === 0 || otp.trim().length !== 4}
                fullWidth
              />
            ) : (
              <Button
                title={loading ? tr("Resetting…") : tr("Reset password")}
                onPress={() => void resetPasswordAfterOtp()}
                loading={loading}
                disabled={Boolean(newPasswordError || confirmError || !newPassword || !confirmPassword)}
                fullWidth
              />
            )}

            {otpResetStep === "otp" ? (
              <Button
                title={otpResendIn > 0 ? tr("Resend OTP in {{seconds}}s", { seconds: String(otpResendIn) }) : tr("Resend OTP")}
                onPress={() => void requestPasswordResetOtp()}
                variant="ghost"
                disabled={loading || otpResendIn > 0}
                fullWidth
              />
            ) : null}

            <Button
              title={otpResetStep === "idle" ? tr("Forgot password? Reset with OTP") : tr("Cancel OTP reset")}
              onPress={otpResetStep === "idle" ? () => void requestPasswordResetOtp() : resetOtpState}
              variant="ghost"
              fullWidth
            />
          </View>
        </AppCard>

        <AppCard elevated={false} style={{ backgroundColor: theme.colors.surfaceAlt }}>
          <AppText variant="bodyStrong">{tr("Strong password checklist")}</AppText>
          {[
            tr("Use at least 8 characters"),
            tr("Mix letters, numbers, and symbols"),
            tr("Do not reuse a password from another account"),
            tr("Never share your password or OTP"),
          ].map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Icon name="check-circle" size={17} color={theme.colors.success} />
              <AppText variant="caption" tone="secondary" style={styles.flex}>{tip}</AppText>
            </View>
          ))}
        </AppCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: redesign.visual.pressedScale }],
  },
  content: {
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: redesign.layout.fieldGap,
    gap: redesign.layout.cardGap,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: redesign.layout.cardGap,
  },
  infoIcon: {
    width: redesign.control.compactHeight,
    height: redesign.control.compactHeight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: {
    lineHeight: 19,
    marginTop: 3,
  },
  otpBox: {
    minHeight: redesign.control.standardHeight,
    borderRadius: radius.md,
    borderWidth: redesign.visual.inputBorderWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: redesign.layout.cardGap,
    paddingVertical: redesign.layout.fieldGap,
  },
  form: {
    gap: redesign.layout.fieldGap,
  },
  fieldGroup: {
    gap: 7,
  },
  inputWrap: {
    minHeight: redesign.control.standardHeight,
    borderRadius: radius.md,
    borderWidth: redesign.visual.inputBorderWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: redesign.layout.cardGap,
  },
  input: {
    flex: 1,
    minHeight: redesign.control.compactHeight,
    fontSize: 14,
  },
  otpInput: {
    letterSpacing: 6,
    fontWeight: "800",
    textAlign: "center",
  },
  eyeButton: {
    width: redesign.control.compactHeight,
    height: redesign.control.compactHeight,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    minHeight: 24,
  },
});
