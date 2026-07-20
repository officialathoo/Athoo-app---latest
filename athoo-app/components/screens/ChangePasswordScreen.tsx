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
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

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
            <PasswordField
              label={tr("Current password (optional if none is set)")}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={tr("Enter current password")}
              visible={showCurrent}
              onToggle={() => setShowCurrent((value) => !value)}
              current
            />
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
            <Button
              title={tr("Forgot password? Reset with OTP")}
              onPress={() => router.push("/auth/forgot-password" as any)}
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
