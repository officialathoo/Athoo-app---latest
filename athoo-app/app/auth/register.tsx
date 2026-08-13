import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
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
import { Button } from "@/components/ui/Button";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { LegalAcceptanceCheckbox, LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";
import { apiErrorToMessage } from "@/lib/apiError";

type AppRole = "customer" | "provider";

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ role?: UserRole; phone?: string }>();
  const selectedRole: AppRole = params.role === "provider" ? "provider" : "customer";
  const phoneParam = typeof params.phone === "string" ? params.phone : "";

  const { sendOtp, verifyOtpAndLogin, register, promptBiometricSetup } = useAuth();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const localizedRow = direction === "rtl" ? styles.rowReverse : undefined;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [step, setStep] = useState<"phone" | "otp" | "details">("phone");
  const [phone, setPhone] = useState(phoneParam || "");
  const [otpHint, setOtpHint] = useState("");
  const [otp, setOtp] = useState("");
  const [registrationToken, setRegistrationToken] = useState("");
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [otpResendIn, setOtpResendIn] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step !== "otp") return;
    const timer = setInterval(() => {
      setOtpExpiresIn((value) => (value > 0 ? value - 1 : 0));
      setOtpResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const handleSendOtp = async () => {
    const cleaned = phone.trim().replace(/\D/g, "");
    const isPakistani = /^(92|0)?3\d{9}$/.test(cleaned);
    if (!isPakistani) {
      Alert.alert(tr("Invalid Phone Number"), tr("Please enter a valid Pakistani mobile number (e.g. 03XX-XXXXXXX)."));
      return;
    }
    setLoading(true);
    const res = await sendOtp(phone.trim(), "registration", selectedRole);
    setLoading(false);
    if (!res.success || res.error) {
      Alert.alert(tr("Failed"), tr(apiErrorToMessage(res.error || res.message, "Unable to send OTP. Please try again.")));
      return;
    }
    if (__DEV__) setOtpHint(res.code || "");
    setOtpExpiresIn(res.expiresInSeconds || 600);
    setOtpResendIn(res.resendAfterSeconds || 45);
    setStep("otp");
    if (__DEV__ && res.code) Alert.alert(tr("Your OTP Code"), tr("Code: {{code}}\n\nEnter this code below to continue.", { code: res.code }), [{ text: "OK" }]);
  };

  const handleVerifyOtp = async () => {
    if (otpExpiresIn === 0) {
      Alert.alert(tr("Code Expired"), tr("Code expired. Request a new OTP."));
      return;
    }
    if (!otp || otp.length < 4) {
      Alert.alert(tr("Invalid OTP"), tr("Please enter the 4-digit OTP."));
      return;
    }
    setLoading(true);
    const res = await verifyOtpAndLogin(phone.trim(), otp.trim(), true, "registration", selectedRole);
    setLoading(false);
    if (!res.success) {
      Alert.alert(tr("Invalid OTP"), tr(apiErrorToMessage(res.error, "OTP is wrong or expired.")));
      return;
    }
    if (!res.registrationToken) {
      Alert.alert(tr("Verification Failed"), tr("Phone verification could not be completed. Please request a new code."));
      return;
    }
    setRegistrationToken(res.registrationToken);
    setStep("details");
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert(tr("Required"), tr("Please enter your full name."));
      return;
    }
    if (!password || password.length < 8) {
      Alert.alert(tr("Error"), tr("Password must be at least 8 characters"));
      return;
    }
    if (!legalAccepted) {
      Alert.alert(tr("Required"), tr("Please accept the Terms of Service and Privacy Policy to continue."));
      return;
    }
    setLoading(true);
    const ok = await register({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, role: selectedRole, password, termsAccepted: true, privacyAccepted: true, legalVersion: LEGAL_VERSION, registrationToken });
    setLoading(false);
    if (!ok.success) {
      Alert.alert(tr("Error"), tr(apiErrorToMessage(ok.error, "Could not create account. Please try again.")));
      return;
    }
    const registeredRole: AppRole = ok.user?.role === "provider" ? "provider" : "customer";
    await promptBiometricSetup(phone.trim(), registeredRole);
    if (email.trim() && ok.emailVerificationRequired) {
      router.replace({
        pathname: "/auth/email-verification" as any,
        params: {
          role: registeredRole,
          sent: String(ok.emailVerificationSent === true),
          expires: String(ok.emailVerificationExpiresInSeconds || 600),
          resend: String(ok.emailVerificationResendAfterSeconds || 45),
          ...(__DEV__ && ok.emailVerificationCode ? { code: ok.emailVerificationCode } : {}),
        },
      });
      return;
    }
    const dest = registeredRole === "provider" ? "/(provider)/(tabs)/dashboard" : "/(customer)/(tabs)/home";
    router.replace(dest as any);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: topPad + 10 }]} keyboardShouldPersistTaps="handled">
        <LinearGradient
          colors={
            theme.dark
              ? ["#07101F", "#0B2A59", "#0C4EA6"]
              : selectedRole === "provider"
                ? [theme.colors.secondaryPressed, theme.colors.secondary, "#FF9A45"]
                : [theme.colors.primaryPressed, theme.colors.primary, "#4EA1FF"]
          }
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroTop}>
            <Pressable style={styles.backBtn} onPress={() => {
              if (step === "otp") { setStep("phone"); setOtp(""); }
              else if (step === "details" && !phoneParam) { setStep("otp"); }
              else { router.back(); }
            }}>
              <Icon name="arrow-left" size={22} color={theme.colors.white} />
            </Pressable>
            <View style={styles.brandRow}>
              <Image source={brandConfig.assets.appIcon} style={styles.brandIcon} resizeMode="cover" />
              <Text style={styles.brandName}>{brandConfig.displayName}</Text>
            </View>
          </View>

          <View style={styles.header}>
            <Text style={[styles.title, localizedText]}>{step === "phone" ? tr("Create Account") : step === "otp" ? tr("Verify Phone") : tr("Your Details")}</Text>
            <Text style={[styles.subtitle, localizedText]}>{step === "phone" ? tr("Enter your phone number to get started") : step === "otp" ? tr("We sent a code to {{phone}}", { phone }) : tr("Almost done! Fill in your details")}</Text>
          </View>

          <View style={styles.stepBadge}>
            <Icon name={step === "phone" ? "phone" : step === "otp" ? "shield-check" : "user-check"} size={13} color={theme.colors.white} />
            <Text style={styles.stepBadgeText}>
              {step === "phone" ? tr("Step 1 - Mobile") : step === "otp" ? tr("Step 2 - Verification") : tr("Step 3 - Account Details")}
            </Text>
          </View>
        </LinearGradient>

        {step === "phone" && <View style={styles.form}><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Phone Number")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="phone" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={phone} onChangeText={setPhone} placeholder="03XX-XXXXXXX" placeholderTextColor={theme.colors.textMuted} keyboardType="phone-pad" autoFocus /></View></View><Button title={loading ? tr("Sending...") : tr("Get Verification Code")} onPress={handleSendOtp} loading={loading} fullWidth style={{ marginTop: 8 }} /></View>}

        {step === "otp" && (
          <View style={styles.form}>
            {otpHint ? <View style={[styles.otpHintBox, localizedRow]}><Icon name="info" size={14} color={theme.colors.secondary} /><Text style={styles.otpHintText}>{tr("Your OTP: {{code}}", { code: otpHint })}</Text></View> : null}
            <View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("4-Digit OTP")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="lock" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, styles.otpInput]} value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="----" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" maxLength={4} autoFocus /></View></View>
            <Text style={[styles.otpTimerText, otpExpiresIn === 0 && styles.otpTimerExpired]}>{otpExpiresIn > 0 ? tr("Code expires in {{time}}", { time: `${Math.floor(otpExpiresIn / 60)}:${String(otpExpiresIn % 60).padStart(2, "0")}` }) : tr("Code expired. Request a new OTP.")}</Text>
            <Button title={loading ? tr("Verifying...") : tr("Verify & Continue")} onPress={handleVerifyOtp} loading={loading} disabled={otpExpiresIn === 0} fullWidth style={{ marginTop: 8 }} />
            <Pressable style={styles.resendBtn} disabled={loading || otpResendIn > 0} onPress={handleSendOtp}><Text style={[styles.resendText, localizedText, (loading || otpResendIn > 0) && { color: theme.colors.textMuted }]}>{otpResendIn > 0 ? tr("Resend in {{seconds}}s", { seconds: otpResendIn }) : tr("Resend OTP")}</Text></Pressable>
            <Pressable style={styles.resendBtn} onPress={() => { setStep("phone"); setOtp(""); setOtpExpiresIn(0); setOtpResendIn(0); }}><Text style={[styles.resendText, localizedText]}>{tr("Change phone number")}</Text></Pressable>
          </View>
        )}

        {step === "details" && <View style={styles.form}><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Full Name *")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="user" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={name} onChangeText={setName} placeholder={tr("Your full name")} placeholderTextColor={theme.colors.textMuted} autoFocus /></View></View><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Email (optional)")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="mail" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={theme.colors.textMuted} keyboardType="email-address" autoCapitalize="none" /></View></View><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Password *")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="lock" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={password} onChangeText={setPassword} placeholder={tr("Enter your password")} placeholderTextColor={theme.colors.textMuted} secureTextEntry={!showPassword} autoCapitalize="none" /><Pressable onPress={() => setShowPassword((prev) => !prev)}><Icon name={showPassword ? "eye-off" : "eye"} size={18} color={theme.colors.textMuted} /></Pressable></View></View><View style={[styles.phoneDisplay, localizedRow]}><Icon name="check-circle" size={16} color={theme.colors.success} /><Text style={[styles.phoneDisplayText, localizedText]}>{tr("Phone verified: {{phone}}", { phone })}</Text></View><LegalAcceptanceCheckbox value={legalAccepted} onChange={setLegalAccepted} /><Button title={loading ? tr("Creating Account...") : tr("Create Account")} onPress={handleRegister} loading={loading} disabled={!legalAccepted} fullWidth style={{ marginTop: 8 }} /></View>}

        <View style={[styles.loginRow, localizedRow]}><Text style={[styles.loginText, localizedText]}>{tr("Already have an account?")} </Text><Pressable onPress={() => router.replace({ pathname: "/auth/login", params: { role: selectedRole } })}><Text style={[styles.loginLink, localizedText]}>{tr("Sign In")}</Text></Pressable></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  rowReverse: { flexDirection: "row-reverse" },
  content: {
    width: "100%",
    maxWidth: redesign.layout.maxContentWidth,
    alignSelf: "center",
    paddingBottom: 52,
  },
  hero: {
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: 12,
    paddingBottom: 42,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  backBtn: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  brandIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
  },
  brandName: {
    ...theme.typography.h3,
    color: theme.colors.white,
    letterSpacing: -0.3,
  },
  header: { marginTop: 26, gap: 6 },
  title: {
    ...theme.typography.display,
    color: theme.colors.white,
    letterSpacing: -0.7,
  },
  subtitle: {
    ...theme.typography.body,
    color: "rgba(255,255,255,0.82)",
    maxWidth: 520,
  },
  stepBadge: {
    alignSelf: "flex-start",
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepBadgeText: {
    ...theme.typography.caption,
    color: theme.colors.white,
    fontFamily: theme.typography.label.fontFamily,
  },
  form: {
    gap: redesign.layout.fieldGap,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 20,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    marginHorizontal: redesign.layout.horizontalPadding,
    marginTop: -18,
    ...theme.shadows.md,
  },
  inputGroup: { gap: 7 },
  label: {
    ...theme.typography.label,
    color: theme.colors.text,
  },
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
  otpInput: {
    fontSize: 27,
    lineHeight: 34,
    fontFamily: theme.typography.h1.fontFamily,
    letterSpacing: 14,
    textAlign: "center",
  },
  otpHintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.premiumSoft,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "40",
  },
  otpHintText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  otpTimerText: {
    ...theme.typography.caption,
    textAlign: "center",
    color: theme.colors.textSecondary,
    marginTop: -2,
  },
  otpTimerExpired: {
    color: theme.colors.danger,
    fontFamily: theme.typography.label.fontFamily,
  },
  resendBtn: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resendText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontFamily: theme.typography.label.fontFamily,
  },
  phoneDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.successSoft,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: theme.colors.success + "40",
  },
  phoneDisplayText: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontFamily: theme.typography.label.fontFamily,
  },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
    marginHorizontal: redesign.layout.horizontalPadding,
    paddingVertical: 12,
  },
  loginText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  loginLink: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontFamily: theme.typography.h3.fontFamily,
  },
});