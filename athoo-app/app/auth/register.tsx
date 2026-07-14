import { Icon } from "@/components/ui/Icon";
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
import { Button } from "@/components/ui/Button";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
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

  const [step, setStep] = useState<"phone" | "otp" | "details">(phoneParam ? "details" : "phone");
  const [phone, setPhone] = useState(phoneParam || "");
  const [otpHint, setOtpHint] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    const cleaned = phone.trim().replace(/\D/g, "");
    const isPakistani = /^(92|0)?3\d{9}$/.test(cleaned);
    if (!isPakistani) {
      Alert.alert(tr("Invalid Phone Number"), tr("Please enter a valid Pakistani mobile number (e.g. 03XX-XXXXXXX)."));
      return;
    }
    setLoading(true);
    const res = await sendOtp(phone.trim());
    setLoading(false);
    if (!res.success || res.error) {
      Alert.alert(tr("Failed"), tr(apiErrorToMessage(res.error || res.message, "Unable to send OTP. Please try again.")));
      return;
    }
    if (__DEV__) setOtpHint(res.code || "");
    setStep("otp");
    if (__DEV__ && res.code) Alert.alert(tr("Your OTP Code"), tr("Code: {{code}}\n\nEnter this code below to continue.", { code: res.code }), [{ text: "OK" }]);
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 4) {
      Alert.alert(tr("Invalid OTP"), tr("Please enter the 4-digit OTP."));
      return;
    }
    setLoading(true);
    const res = await verifyOtpAndLogin(phone.trim(), otp.trim());
    setLoading(false);
    if (!res.success) {
      Alert.alert(tr("Invalid OTP"), tr(apiErrorToMessage(res.error, "OTP is wrong or expired.")));
      return;
    }
    if (!res.isNewUser) {
      const existingRole: AppRole = res.user?.role === "provider" ? "provider" : "customer";
      Alert.alert(
        tr("Account Already Exists"),
        existingRole === "provider"
          ? tr("This phone number is already registered as a provider. Please sign in instead.")
          : tr("This phone number is already registered. Please sign in instead."),
        [{ text: tr("Go to Sign In"), onPress: () => router.replace({ pathname: "/auth/login", params: { role: existingRole } }) }]
      );
      return;
    }
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
    const ok = await register({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, role: selectedRole, password, termsAccepted: true, privacyAccepted: true, legalVersion: LEGAL_VERSION });
    setLoading(false);
    if (!ok.success) {
      Alert.alert(tr("Error"), tr(apiErrorToMessage(ok.error, "Could not create account. Please try again.")));
      return;
    }
    const registeredRole: AppRole = ok.user?.role === "provider" ? "provider" : "customer";
    await promptBiometricSetup(phone.trim(), registeredRole);
    const dest = registeredRole === "provider" ? "/(provider)/(tabs)/dashboard" : "/(customer)/(tabs)/home";
    router.replace(dest as any);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: topPad + 10 }]} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backBtn} onPress={() => {
          if (step === "otp") { setStep("phone"); setOtp(""); }
          else if (step === "details" && !phoneParam) { setStep("otp"); }
          else { router.back(); }
        }}>
          <Icon name="arrow-left" size={22} color={theme.colors.text} />
        </Pressable>

        <View style={styles.header}>
          <Text style={[styles.title, localizedText]}>{step === "phone" ? tr("Create Account") : step === "otp" ? tr("Verify Phone") : tr("Your Details")}</Text>
          <Text style={[styles.subtitle, localizedText]}>{step === "phone" ? tr("Enter your phone number to get started") : step === "otp" ? tr("We sent a code to {{phone}}", { phone }) : tr("Almost done! Fill in your details")}</Text>
        </View>

        {step === "phone" && <View style={styles.form}><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Phone Number")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="phone" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={phone} onChangeText={setPhone} placeholder="03XX-XXXXXXX" placeholderTextColor={theme.colors.textMuted} keyboardType="phone-pad" autoFocus /></View></View><Button title={loading ? tr("Sending...") : tr("Get Verification Code")} onPress={handleSendOtp} loading={loading} fullWidth style={{ marginTop: 8 }} /></View>}

        {step === "otp" && <View style={styles.form}>{otpHint ? <View style={[styles.otpHintBox, localizedRow]}><Icon name="info" size={14} color={theme.colors.secondary} /><Text style={styles.otpHintText}>{tr("Your OTP: {{code}}", { code: otpHint })}</Text></View> : null}<View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("4-Digit OTP")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="lock" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, styles.otpInput]} value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="----" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" maxLength={4} autoFocus /></View></View><Button title={loading ? tr("Verifying...") : tr("Verify & Continue")} onPress={handleVerifyOtp} loading={loading} fullWidth style={{ marginTop: 8 }} /><Pressable style={styles.resendBtn} onPress={() => { setStep("phone"); setOtp(""); }}><Text style={[styles.resendText, localizedText]}>{tr("Change phone number")}</Text></Pressable></View>}

        {step === "details" && <View style={styles.form}><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Full Name *")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="user" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={name} onChangeText={setName} placeholder={tr("Your full name")} placeholderTextColor={theme.colors.textMuted} autoFocus /></View></View><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Email (optional)")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="mail" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={theme.colors.textMuted} keyboardType="email-address" autoCapitalize="none" /></View></View><View style={styles.inputGroup}><Text style={[styles.label, localizedText]}>{tr("Password *")}</Text><View style={[styles.inputWrapper, localizedRow]}><Icon name="lock" size={18} color={theme.colors.textMuted} /><TextInput style={[styles.input, localizedText]} value={password} onChangeText={setPassword} placeholder={tr("Enter your password")} placeholderTextColor={theme.colors.textMuted} secureTextEntry={!showPassword} autoCapitalize="none" /><Pressable onPress={() => setShowPassword((prev) => !prev)}><Icon name={showPassword ? "eye-off" : "eye"} size={18} color={theme.colors.textMuted} /></Pressable></View></View><View style={[styles.phoneDisplay, localizedRow]}><Icon name="check-circle" size={16} color={theme.colors.success} /><Text style={[styles.phoneDisplayText, localizedText]}>{tr("Phone verified: {{phone}}", { phone })}</Text></View><LegalAcceptanceCheckbox value={legalAccepted} onChange={setLegalAccepted} /><Button title={loading ? tr("Creating Account...") : tr("Create Account")} onPress={handleRegister} loading={loading} disabled={!legalAccepted} fullWidth style={{ marginTop: 8 }} /></View>}

        <View style={[styles.loginRow, localizedRow]}><Text style={[styles.loginText, localizedText]}>{tr("Already have an account?")} </Text><Pressable onPress={() => router.replace({ pathname: "/auth/login", params: { role: selectedRole } })}><Text style={[styles.loginLink, localizedText]}>{tr("Sign In")}</Text></Pressable></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  rowReverse: { flexDirection: "row-reverse" },
  content: { padding: 24, paddingBottom: 60 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  header: { marginBottom: 32, gap: 8 },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: 15, color: theme.colors.textSecondary, lineHeight: 22 },
  form: { gap: 16 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1.5, borderColor: theme.colors.border, gap: 10 },
  input: { flex: 1, fontSize: 16, color: theme.colors.text },
  otpInput: { fontSize: 24, fontWeight: "800", letterSpacing: 12 },
  otpHintBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.secondary + "15", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.secondary + "30" },
  otpHintText: { fontSize: 13, color: theme.colors.text },
  resendBtn: { alignSelf: "center", paddingVertical: 8 },
  resendText: { fontSize: 14, color: theme.colors.primary, fontWeight: "600" },
  phoneDisplay: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.success + "15", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.success + "30" },
  phoneDisplayText: { fontSize: 13, color: theme.colors.text, fontWeight: "600" },
  loginRow: { flexDirection: "row", justifyContent: "center", marginTop: 32 },
  loginText: { fontSize: 14, color: theme.colors.textSecondary },
  loginLink: { fontSize: 14, color: theme.colors.primary, fontWeight: "700" },
});

