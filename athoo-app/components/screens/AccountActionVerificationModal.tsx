import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppInput, AppText } from "@/components/design";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";

type AccountAction = "deactivate" | "delete";
type VerificationMethod = "password" | "phone" | "email";
type Credential = { password: string } | { verificationToken: string };
type Options = Awaited<ReturnType<typeof api.getAccountStepUpOptions>>;

export function AccountActionVerificationModal({
  visible,
  action,
  onClose,
  onVerified,
}: {
  visible: boolean;
  action: AccountAction;
  onClose: () => void;
  onVerified: (credential: Credential) => Promise<void>;
}) {
  const { theme } = useTheme();
  const { translate: tr } = useLang();
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<Options | null>(null);
  const [method, setMethod] = useState<VerificationMethod | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setOptions(null);
    setMethod(null);
    setPassword("");
    setCode("");
    setCodeSent(false);
    setDestination(null);
    setError("");
    setLoading(true);
    api.getAccountStepUpOptions()
      .then((next) => {
        setOptions(next);
        setMethod(next.passwordAvailable ? "password" : next.phoneAvailable ? "phone" : next.emailAvailable ? "email" : null);
      })
      .catch((caught) => setError(tr(apiErrorToMessage(caught, "Verification options could not be loaded. Please try again."))))
      .finally(() => setLoading(false));
  }, [tr, visible]);

  const chooseMethod = (next: VerificationMethod) => {
    if (loading) return;
    setMethod(next);
    setPassword("");
    setCode("");
    setCodeSent(false);
    setDestination(null);
    setError("");
  };

  const sendCode = async () => {
    if (method !== "phone" && method !== "email") return;
    setLoading(true);
    setError("");
    try {
      const result = await api.requestAccountStepUpCode({ action, channel: method });
      setDestination(result.destination || (method === "phone" ? options?.maskedPhone : options?.maskedEmail) || null);
      setCode("");
      setCodeSent(true);
    } catch (caught) {
      setError(tr(apiErrorToMessage(caught, "The verification code could not be sent. Please try another method.")));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setError("");
    if (method === "password") {
      if (!password || password.length > 256) {
        setError(tr("Enter your current password."));
        return;
      }
      setLoading(true);
      try {
        await onVerified({ password });
      } catch (caught) {
        setError(tr(apiErrorToMessage(caught, "Your account action could not be completed. Please try again.")));
        setLoading(false);
      }
      return;
    }
    if (method !== "phone" && method !== "email") return;
    if (!/^\d{6}$/.test(code)) {
      setError(tr("Enter the 6-digit verification code."));
      return;
    }
    setLoading(true);
    try {
      const result = await api.verifyAccountStepUpCode({ action, channel: method, code });
      await onVerified({ verificationToken: result.verificationToken });
    } catch (caught) {
      setError(tr(apiErrorToMessage(caught, "The verification code is incorrect or expired.")));
      setLoading(false);
    }
  };

  const methodOptions: Array<{ key: VerificationMethod; title: string; subtitle: string; available: boolean; icon: string }> = [
    { key: "password", title: tr("Password"), subtitle: tr("Use your current account password"), available: options?.passwordAvailable === true, icon: "lock" },
    { key: "phone", title: tr("Mobile code"), subtitle: options?.maskedPhone || tr("Code sent to your registered mobile"), available: options?.phoneAvailable === true, icon: "smartphone" },
    { key: "email", title: tr("Email code"), subtitle: options?.maskedEmail || tr("Code sent to your verified email"), available: options?.emailAvailable === true, icon: "mail" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={loading ? undefined : onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={tr("Close verification")} onPress={loading ? undefined : onClose} />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 18),
            },
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View style={[styles.icon, { backgroundColor: theme.colors.dangerSoft }]}>
                <Icon name="shield-check" size={24} color={theme.colors.danger} />
              </View>
              <View style={styles.flex}>
                <AppText variant="h3">{tr("Confirm it’s you")}</AppText>
                <AppText variant="caption" tone="secondary" style={styles.description}>
                  {action === "delete"
                    ? tr("Permanent deletion requires fresh verification for your protection.")
                    : tr("Temporary deactivation requires fresh verification for your protection.")}
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} disabled={loading} onPress={onClose} hitSlop={12}>
                <Icon name="x" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {options ? methodOptions.filter((item) => item.available).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: method === item.key }}
                onPress={() => chooseMethod(item.key)}
                style={[
                  styles.method,
                  { borderColor: method === item.key ? theme.colors.primary : theme.colors.border },
                  method === item.key && { backgroundColor: theme.colors.infoSoft },
                ]}
              >
                <Icon name={item.icon as any} size={20} color={method === item.key ? theme.colors.primary : theme.colors.textMuted} />
                <View style={styles.flex}>
                  <AppText variant="label">{item.title}</AppText>
                  <AppText variant="caption" tone="secondary">{item.subtitle}</AppText>
                </View>
                {method === item.key ? <Icon name="check-circle" size={20} color={theme.colors.primary} /> : null}
              </Pressable>
            )) : null}

            {method === "password" ? (
              <AppInput
                label={tr("Current password")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={confirm}
              />
            ) : null}

            {(method === "phone" || method === "email") && !codeSent ? (
              <Button title={tr("Send verification code")} onPress={sendCode} loading={loading} fullWidth />
            ) : null}

            {(method === "phone" || method === "email") && codeSent ? (
              <View style={styles.codeArea}>
                <AppText variant="caption" tone="secondary">
                  {tr("Enter the code sent to {{destination}}").replace("{{destination}}", destination || "")}
                </AppText>
                <AppInput
                  label={tr("6-digit code")}
                  value={code}
                  onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={confirm}
                  style={styles.codeInput}
                />
                <Button title={tr("Send a new code")} onPress={sendCode} disabled={loading} variant="ghost" fullWidth />
              </View>
            ) : null}

            {options && !method ? <AppText tone="danger">{tr("No verification method is available. Contact Athoo Support.")}</AppText> : null}
            {error ? <AppText variant="caption" tone="danger" accessibilityRole="alert">{error}</AppText> : null}

            {method === "password" || codeSent ? (
              <Button
                title={action === "delete" ? tr("Verify and schedule deletion") : tr("Verify and deactivate")}
                onPress={confirm}
                loading={loading}
                disabled={method === "password" ? !password : code.length !== 6}
                variant="danger"
                fullWidth
              />
            ) : null}
            <Button title={tr("Cancel")} onPress={onClose} disabled={loading} variant="outline" fullWidth />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.5)" },
  sheet: { maxHeight: "92%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1 },
  content: { padding: 20, gap: 13 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  description: { lineHeight: 18, marginTop: 3 },
  method: { minHeight: 64, borderRadius: 14, borderWidth: 1.5, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  codeArea: { gap: 10 },
  codeInput: { fontSize: 22, letterSpacing: 9, textAlign: "center" },
});
