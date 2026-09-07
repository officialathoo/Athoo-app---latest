import React, { useMemo, useState } from "react";
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
import { OtpModal } from "@/components/ui/OtpModal";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
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

async function postJson(path: string, body: Record<string, unknown>) {
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
  if (!response.ok) throw new Error(data?.error || data?.message || "Request failed");
  return data;
}

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
          style={({ pressed }) => [styles.eyeButton, pressed && { opacity: 0.6 }]}
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
  const { translate: tr } = useLang();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [otpResetMode, setOtpResetMode] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState(600);
  const [otpResendIn, setOtpResendIn] = useState(45);
  const [otpHint, setOtpHint] = useState("");

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

  const finishPasswordChange = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setOtpResetMode(false);
    setChallengeToken("");
    setResetToken("");
    setOtpHint("");
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
  };

  const requestOtpReset = async () => {
    if (!user?.phone) {
      Alert.alert(tr("Unable to send OTP"), tr("A verified phone number is required for OTP password reset."));
      return;
    }
    setOtpLoading(true);
    try {
      const res = await postJson("/api/auth/forgot-password/send-otp", { identifier: user.phone });
      setChallengeToken(String(res.challengeToken || ""));
      setOtpExpiresIn(Number(res.expiresInSeconds || 600));
      setOtpResendIn(Number(res.resendAfterSeconds || 45));
      setOtpHint(__DEV__ ? String(res.code || "") : "");
      setShowOtp(true);
    } catch (caught) {
      Alert.alert(tr("Unable to send OTP"), tr(apiErrorToMessage(caught, "We couldn't send the password reset OTP. Please try again.")));
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtpReset = async (code: string) => {
    if (!challengeToken) return;
    setOtpLoading(true);
    try {
      const res = await postJson("/api/auth/forgot-password/verify-otp", {
        challengeToken,
        code: code.trim(),
      });
      const token = String(res.resetToken || "");
      if (!token) throw new Error("Password reset token was not received");
      setResetToken(token);
      setOtpResetMode(true);
      setShowOtp(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (caught) {
      Alert.alert(tr("Verification failed"), tr(apiErrorToMessage(caught, "The OTP is invalid or expired.")));
    } finally {
      setOtpLoading(false);
    }
  };

  const cancelOtpReset = () => {
    setShowOtp(false);
    setOtpResetMode(false);
    setChallengeToken("");
    setResetToken("");
    setOtpHint("");
    setNewPassword("");
    setConfirmPassword("");
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
    if (!otpResetMode && currentPassword && currentPassword === newPassword) {
      Alert.alert(tr("Choose a different password"), tr("Your new password should be different from your current password."));
      return;
    }
    if (otpResetMode && !resetToken) {
      Alert.alert(tr("OTP verification required"), tr("Verify the OTP again before setting a new password."));
      return;
    }

    setLoading(true);
    try {
      if (otpResetMode) {
        await postJson("/api/auth/forgot-password/reset", {
          resetToken,
          newPassword: newPassword.trim(),
        });
      } else {
        await api.setPassword({ currentPassword: currentPassword || undefined, newPassword });
      }
      finishPasswordChange();
    } catch (caught) {
      Alert.alert(
        tr("Unable to update password"),
        tr(apiErrorToMessage(caught, "We couldn't update your password. Please check your details and try again.")),
      );
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
              <AppText variant="bodyStrong">{otpResetMode ? tr("Phone verified") : tr("Protect your account")}</AppText>
              <AppText variant="caption" tone="secondary" style={styles.infoCopy}>
                {otpResetMode
                  ? tr("OTP verification is complete. Set your new password below without leaving Account Security.")
                  : tr("Use a unique password. Athoo will never ask you to share it in chat, calls, or support messages.")}
              </AppText>
            </View>
          </View>
        </AppCard>

        <AppCard elevated={false}>
          <View style={styles.form}>
            {!otpResetMode ? (
              <PasswordField
                label={tr("Current password (optional if none is set)")}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder={tr("Enter current password")}
                visible={showCurrent}
                onToggle={() => setShowCurrent((value) => !value)}
                current
              />
            ) : null}
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
            <Button
              title={loading ? tr("Saving…") : tr("Save password")}
              onPress={() => void save()}
              loading={loading}
              disabled={Boolean(newPasswordError || confirmError || !newPassword || !confirmPassword)}
              fullWidth
            />
            {!otpResetMode ? (
              <Button
                title={otpLoading ? tr("Sending OTP…") : tr("Forgot password? Reset with OTP")}
                onPress={() => void requestOtpReset()}
                loading={otpLoading}
                variant="ghost"
                fullWidth
              />
            ) : (
              <Button
                title={tr("Cancel OTP reset")}
                onPress={cancelOtpReset}
                variant="ghost"
                fullWidth
              />
            )}
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

      <OtpModal
        visible={showOtp}
        title={tr("Reset password with OTP")}
        subtitle={tr("Enter the 4-digit code sent to your registered phone number.")}
        sentTo={user?.phone || ""}
        hint={otpHint}
        loading={otpLoading}
        expiresInSeconds={otpExpiresIn}
        resendAfterSeconds={otpResendIn}
        onVerify={(code) => void verifyOtpReset(code)}
        onResend={async () => {
          await requestOtpReset();
        }}
        onCancel={() => setShowOtp(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 16 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  infoCopy: { lineHeight: 19, marginTop: 3 },
  form: { gap: 17 },
  fieldGroup: { gap: 7 },
  inputWrap: { minHeight: 54, borderRadius: 15, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 50, fontSize: 15 },
  eyeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10 },
});
