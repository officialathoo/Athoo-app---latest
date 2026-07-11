import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
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
import { Colors } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAuth, UserRole } from "@/context/AuthContext";
import { LegalAcceptanceCheckbox, LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";

type AppRole = "customer" | "provider";

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ role?: UserRole; phone?: string }>();
  const selectedRole: AppRole = params.role === "provider" ? "provider" : "customer";
  const phoneParam = typeof params.phone === "string" ? params.phone : "";

  const { sendOtp, verifyOtpAndLogin, register, promptBiometricSetup } = useAuth();
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
      Alert.alert("Invalid Phone Number", "Please enter a valid Pakistani mobile number (e.g. 03XX-XXXXXXX).");
      return;
    }
    setLoading(true);
    const res = await sendOtp(phone.trim());
    setLoading(false);
    if (!res.success || res.error) {
      Alert.alert("Failed", res.error || res.message || "Unable to send OTP. Please try again.");
      return;
    }
    if (__DEV__) setOtpHint(res.code || "");
    setStep("otp");
    if (__DEV__ && res.code) Alert.alert("Your OTP Code", `Code: ${res.code}\n\nEnter this code below to continue.`, [{ text: "OK" }]);
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 4) {
      Alert.alert("Invalid OTP", "Please enter the 4-digit OTP.");
      return;
    }
    setLoading(true);
    const res = await verifyOtpAndLogin(phone.trim(), otp.trim());
    setLoading(false);
    if (!res.success) {
      Alert.alert("Invalid OTP", res.error || "OTP is wrong or expired.");
      return;
    }
    if (!res.isNewUser) {
      const existingRole: AppRole = res.user?.role === "provider" ? "provider" : "customer";
      Alert.alert(
        "Account Already Exists",
        existingRole === "provider"
          ? "This phone number is already registered as a provider. Please sign in instead."
          : "This phone number is already registered. Please sign in instead.",
        [{ text: "Go to Sign In", onPress: () => router.replace({ pathname: "/auth/login", params: { role: existingRole } }) }]
      );
      return;
    }
    setStep("details");
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter your full name.");
      return;
    }
    if (!password || password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }
    if (!legalAccepted) {
      Alert.alert("Required", "Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setLoading(true);
    const ok = await register({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, role: selectedRole, password, termsAccepted: true, privacyAccepted: true, legalVersion: LEGAL_VERSION });
    setLoading(false);
    if (!ok.success) {
      Alert.alert("Error", ok.error || "Could not create account. Please try again.");
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
          <Icon name="arrow-left" size={22} color={Colors.text} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>{step === "phone" ? "Create Account" : step === "otp" ? "Verify Phone" : "Your Details"}</Text>
          <Text style={styles.subtitle}>{step === "phone" ? "Enter your phone number to get started" : step === "otp" ? `We sent a code to ${phone}` : "Almost done! Fill in your details"}</Text>
        </View>

        {step === "phone" && <View style={styles.form}><View style={styles.inputGroup}><Text style={styles.label}>Phone Number</Text><View style={styles.inputWrapper}><Icon name="phone" size={18} color={Colors.textMuted} /><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="03XX-XXXXXXX" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" autoFocus /></View></View><Button title={loading ? "Sending..." : "Get Verification Code"} onPress={handleSendOtp} loading={loading} fullWidth style={{ marginTop: 8 }} /></View>}

        {step === "otp" && <View style={styles.form}>{otpHint ? <View style={styles.otpHintBox}><Icon name="info" size={14} color={Colors.secondary} /><Text style={styles.otpHintText}>Your OTP: <Text style={{ fontWeight: "800" }}>{otpHint}</Text></Text></View> : null}<View style={styles.inputGroup}><Text style={styles.label}>4-Digit OTP</Text><View style={styles.inputWrapper}><Icon name="lock" size={18} color={Colors.textMuted} /><TextInput style={[styles.input, styles.otpInput]} value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="----" placeholderTextColor={Colors.textMuted} keyboardType="number-pad" maxLength={4} autoFocus /></View></View><Button title={loading ? "Verifying..." : "Verify & Continue"} onPress={handleVerifyOtp} loading={loading} fullWidth style={{ marginTop: 8 }} /><Pressable style={styles.resendBtn} onPress={() => { setStep("phone"); setOtp(""); }}><Text style={styles.resendText}>Change phone number</Text></Pressable></View>}

        {step === "details" && <View style={styles.form}><View style={styles.inputGroup}><Text style={styles.label}>Full Name *</Text><View style={styles.inputWrapper}><Icon name="user" size={18} color={Colors.textMuted} /><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={Colors.textMuted} autoFocus /></View></View><View style={styles.inputGroup}><Text style={styles.label}>Email (optional)</Text><View style={styles.inputWrapper}><Icon name="mail" size={18} color={Colors.textMuted} /><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={Colors.textMuted} keyboardType="email-address" autoCapitalize="none" /></View></View><View style={styles.inputGroup}><Text style={styles.label}>Password *</Text><View style={styles.inputWrapper}><Icon name="lock" size={18} color={Colors.textMuted} /><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Enter password" placeholderTextColor={Colors.textMuted} secureTextEntry={!showPassword} autoCapitalize="none" /><Pressable onPress={() => setShowPassword((prev) => !prev)}><Icon name={showPassword ? "eye-off" : "eye"} size={18} color={Colors.textMuted} /></Pressable></View></View><View style={styles.phoneDisplay}><Icon name="check-circle" size={16} color={Colors.success} /><Text style={styles.phoneDisplayText}>Phone verified: {phone}</Text></View><LegalAcceptanceCheckbox value={legalAccepted} onChange={setLegalAccepted} /><Button title={loading ? "Creating Account..." : "Create Account"} onPress={handleRegister} loading={loading} disabled={!legalAccepted} fullWidth style={{ marginTop: 8 }} /></View>}

        <View style={styles.loginRow}><Text style={styles.loginText}>Already have an account? </Text><Pressable onPress={() => router.replace({ pathname: "/auth/login", params: { role: selectedRole } })}><Text style={styles.loginLink}>Sign In</Text></Pressable></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 60 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  header: { marginBottom: 32, gap: 8 },
  title: { fontSize: 28, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  form: { gap: 16 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: Colors.text },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1.5, borderColor: Colors.border, gap: 10 },
  input: { flex: 1, fontSize: 16, color: Colors.text },
  otpInput: { fontSize: 24, fontWeight: "800", letterSpacing: 12 },
  otpHintBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.secondary + "15", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.secondary + "30" },
  otpHintText: { fontSize: 13, color: Colors.text },
  resendBtn: { alignSelf: "center", paddingVertical: 8 },
  resendText: { fontSize: 14, color: Colors.primary, fontWeight: "600" },
  phoneDisplay: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.success + "15", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.success + "30" },
  phoneDisplayText: { fontSize: 13, color: Colors.text, fontWeight: "600" },
  loginRow: { flexDirection: "row", justifyContent: "center", marginTop: 32 },
  loginText: { fontSize: 14, color: Colors.textSecondary },
  loginLink: { fontSize: 14, color: Colors.primary, fontWeight: "700" },
});

