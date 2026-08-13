import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EmailVerificationScreen() {
  const params = useLocalSearchParams<{
    role?: string;
    sent?: string;
    expires?: string;
    resend?: string;
    code?: string;
    email?: string;
    mode?: string;
  }>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const insets = useSafeAreaInsets();
  const role = params.role === "provider" ? "provider" : "customer";
  const destination = role === "provider" ? "/(provider)/(tabs)/dashboard" : "/(customer)/(tabs)/home";
  const publicEmail = String(params.email || "").trim().toLowerCase();
  const publicLoginVerification =
    !user &&
    params.mode === "login" &&
    Boolean(publicEmail);
  const verificationEmail = user?.email || publicEmail;

  const returnToLogin = () => {
    router.replace({
      pathname: "/auth/login" as any,
      params: { role },
    });
  };

  const continueAfterVerification = () => {
    if (publicLoginVerification) {
      returnToLogin();
      return;
    }

    router.replace(destination as any);
  };

  const [code, setCode] = useState(__DEV__ ? String(params.code || "") : "");
  const [loading, setLoading] = useState(false);
  const initiallySent = params.sent === "true";
  const [expiresIn, setExpiresIn] = useState(Math.max(0, Number(params.expires || (initiallySent ? 600 : 0))));
  const [resendIn, setResendIn] = useState(Math.max(0, Number(params.resend || (initiallySent ? 45 : 0))));
  const [sent, setSent] = useState(initiallySent);

  useEffect(() => {
    if (user?.emailVerified) router.replace(destination as any);
  }, [destination, user?.emailVerified]);

  useEffect(() => {
    const timer = setInterval(() => {
      setExpiresIn((value) => (value > 0 ? value - 1 : 0));
      setResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sendCode = async () => {
    if (!verificationEmail) {
      Alert.alert(
        tr("Could not send email"),
        tr("Add an email address from your profile before verification."),
      );
      return;
    }

    setLoading(true);
    try {
      const result = publicLoginVerification
        ? await api.sendPublicEmailVerification(verificationEmail, role)
        : await api.sendEmailVerification();

      if (result.alreadyVerified) {
        if (user) await refreshUser();

        Alert.alert(
          tr("Email verified"),
          tr("This email is already verified. You can use email OTP to sign in."),
          [
            {
              text: tr("Continue"),
              onPress: continueAfterVerification,
            },
          ],
        );
        return;
      }

      setSent(true);
      setExpiresIn(result.expiresInSeconds || 600);
      setResendIn(result.resendAfterSeconds || 45);

      if (__DEV__ && result.code) setCode(result.code);

      Alert.alert(
        tr("Email sent"),
        tr("A new 6-digit verification code was sent to your email."),
      );
    } catch (error) {
      Alert.alert(
        tr("Could not send email"),
        tr(apiErrorToMessage(
          error,
          "Please check the email configuration or try again shortly.",
        )),
      );
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      Alert.alert(tr("Invalid code"), tr("Enter the 6-digit code from your email."));
      return;
    }
    if (!verificationEmail) {
      Alert.alert(
        tr("Verification failed"),
        tr("Add an email address from your profile before verification."),
      );
      return;
    }

    setLoading(true);
    try {
      if (publicLoginVerification) {
        await api.verifyPublicEmailVerification(
          verificationEmail,
          code,
          role,
        );
      } else {
        await api.verifyEmailVerification(code);
        await refreshUser();
      }

      Alert.alert(
        tr("Email verified"),
        tr("Your email is now verified and can be used for secure email OTP login."),
        [
          {
            text: tr("Continue"),
            onPress: continueAfterVerification,
          },
        ],
      );
    } catch (error) {
      Alert.alert(tr("Verification failed"), tr(apiErrorToMessage(error, "The code is incorrect or expired.")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.iconWrap}><Icon name="mail" size={34} color={theme.colors.primary} /></View>
        <Text style={[styles.title, localizedText]}>{tr("Verify your email")}</Text>
        <Text style={[styles.subtitle, localizedText]}>
          {verificationEmail
            ? tr("Enter the code sent to {{email}}.", { email: verificationEmail })
            : tr("Add an email address from your profile before verification.")}
        </Text>

        <View style={styles.securityNote}>
          <Icon name="shield" size={18} color={theme.colors.success} />
          <Text style={[styles.securityText, localizedText]}>{tr("Verified email enables email OTP login, recovery messages, and important security alerts.")}</Text>
        </View>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="• • • • • •"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        {sent ? (
          <Text style={[styles.timer, expiresIn === 0 && styles.expired]}>
            {expiresIn > 0
              ? tr("Code expires in {{time}}", { time: `${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}` })
              : tr("Code expired. Request a new code.")}
          </Text>
        ) : null}

        {sent ? (
          <Button title={loading ? tr("Verifying...") : tr("Verify Email")} onPress={verify} loading={loading} disabled={expiresIn === 0 || !verificationEmail} fullWidth />
        ) : null}
        <Pressable style={[styles.linkButton, (loading || resendIn > 0 || !verificationEmail) && styles.disabled]} disabled={loading || resendIn > 0 || !verificationEmail} onPress={sendCode}>
          <Text style={styles.linkText}>
            {!sent
              ? tr("Send verification code")
              : resendIn > 0
                ? tr("Resend in {{seconds}}s", { seconds: resendIn })
                : tr("Resend verification email")}
          </Text>
        </Pressable>
        <Pressable
          style={styles.skipButton}
          onPress={continueAfterVerification}
        >
          <Text style={[styles.skipText, localizedText]}>
            {publicLoginVerification
              ? tr("Back to Sign In")
              : tr("Continue without email login")}
          </Text>
        </Pressable>

        <Text style={[styles.skipHint, localizedText]}>
          {publicLoginVerification
            ? tr("After verification, return to sign in and request your email OTP.")
            : tr("You can verify later from Email Preferences. Email OTP login remains disabled until verification is complete.")}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, width: "100%", maxWidth: redesign.layout.maxContentWidth, alignSelf: "center", paddingHorizontal: redesign.layout.horizontalPadding, justifyContent: "center", gap: redesign.layout.fieldGap },
  iconWrap: { alignSelf: "center", width: 76, height: 76, borderRadius: 24, backgroundColor: theme.colors.infoSoft, borderWidth: 1, borderColor: theme.colors.primary + "30", alignItems: "center", justifyContent: "center", ...theme.shadows.sm },
  title: { ...theme.typography.h1, color: theme.colors.text, textAlign: "center", letterSpacing: -0.5 },
  subtitle: { ...theme.typography.bodyLg, color: theme.colors.textSecondary, textAlign: "center" },
  securityNote: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: theme.colors.successSoft, borderColor: theme.colors.success + "35", borderWidth: 1, borderRadius: theme.radius.md, padding: 14 },
  securityText: { flex: 1, color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  codeInput: { color: theme.colors.text, backgroundColor: theme.colors.input, borderColor: theme.colors.primary + "70", borderWidth: redesign.visual.focusedBorderWidth, borderRadius: theme.radius.md, minHeight: 64, paddingVertical: 14, paddingHorizontal: 16, textAlign: "center", fontSize: 28, fontFamily: theme.typography.h1.fontFamily, letterSpacing: 10 },
  timer: { color: theme.colors.textSecondary, textAlign: "center", fontSize: 12 },
  expired: { color: theme.colors.danger, fontWeight: "700" },
  linkButton: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 12 },
  linkText: { color: theme.colors.primary, fontWeight: "700", fontSize: 14 },
  skipButton: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  skipText: { color: theme.colors.textSecondary, fontWeight: "600", fontSize: 14 },
  skipHint: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center" },
  disabled: { opacity: redesign.visual.disabledOpacity },
});
