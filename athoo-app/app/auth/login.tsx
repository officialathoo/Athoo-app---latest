import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { isBiometricAvailable, isBiometricEnabled, getBiometricLabel, getBiometricType, type BiometricType } from "@/services/biometric";
import { apiErrorToMessage } from "@/lib/apiError";

type LoginTab = "otp" | "password";

export default function LoginScreen() {
  const { role } = useLocalSearchParams<{ role: UserRole }>();
  const { sendOtp, verifyOtpAndLogin, sendEmailOtp, verifyEmailOtpAndLogin, loginWithPassword, promptBiometricSetup, completeBiometricLogin } = useAuth();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const localizedRow = direction === "rtl" ? styles.rowReverse : undefined;
  const phoneRef = useRef("");
  const insets = useSafeAreaInsets();

  const isProvider = role === "provider";

  const [tab, setTab] = useState<LoginTab>("otp");
  const [rememberMe, setRememberMe] = useState(true);

  const [otpChannel, setOtpChannel] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "otp">("phone");
  const [otpHint, setOtpHint] = useState("");
  const [otpDeliveryMessage, setOtpDeliveryMessage] = useState("");
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [otpResendIn, setOtpResendIn] = useState(0);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricBtnLabel, setBiometricBtnLabel] = useState(() => tr("Sign in with Biometrics"));
  const [biometricType, setBiometricType] = useState<BiometricType>("biometric");

  useEffect(() => {
    if (otpStep !== "otp") return;
    const timer = setInterval(() => {
      setOtpExpiresIn((value) => (value > 0 ? value - 1 : 0));
      setOtpResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpStep]);

  useEffect(() => {
    const checkBiometric = async () => {
      const hardwareAvailable = await isBiometricAvailable();
      const enabled = await isBiometricEnabled();
      setBiometricAvailable(hardwareAvailable && enabled);
      if (hardwareAvailable) {
        const [label, type] = await Promise.all([getBiometricLabel(), getBiometricType()]);
        setBiometricBtnLabel(tr("Sign in with {{method}}", { method: label }));
        setBiometricType(type);
      }
    };
    checkBiometric();
  }, [tr]);

  const handleSendOtp = async () => {
    if (otpChannel === "phone") {
      const cleaned = phone.trim().replace(/\D/g, "");
      if (cleaned.length < 10) {
        Alert.alert(tr("Invalid Phone"), tr("Please enter a valid phone number (min 10 digits)."));
        return;
      }
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert(tr("Invalid Email"), tr("Please enter a valid verified email address."));
      return;
    }

    setLoading(true);
    const roleValue = isProvider ? "provider" : "customer";
    const res = otpChannel === "phone"
      ? await sendOtp(phone.trim(), "login", roleValue)
      : await sendEmailOtp(email.trim().toLowerCase(), roleValue);
    setLoading(false);

    if (!res.success || res.error) {
      const emailErrorCode =
        otpChannel === "email" && "errorCode" in res
          ? String(res.errorCode || "")
          : "";

      if (otpChannel === "email" && emailErrorCode === "EMAIL_NOT_VERIFIED") {
        Alert.alert(
          tr("Email not verified"),
          tr("Email not verified. Please verify your email first."),
          [
            {
              text: tr("Cancel"),
              style: "cancel",
            },
            {
              text: tr("Verify Email Now"),
              onPress: () =>
                router.push({
                  pathname: "/auth/email-verification" as any,
                  params: {
                    role: roleValue,
                    email: email.trim().toLowerCase(),
                    mode: "login",
                  },
                }),
            },
          ],
        );
        return;
      }

      Alert.alert(
        tr("Failed"),
        tr(apiErrorToMessage(
          res.error || res.message,
          "Unable to send OTP. Please try again.",
        )),
      );
      return;
    }

    if (otpChannel === "phone") phoneRef.current = phone.trim();
    setOtpHint(__DEV__ ? (res.code || "") : "");
    setOtpDeliveryMessage(res.message || tr("Verification code sent."));
    setOtpExpiresIn(res.expiresInSeconds || 600);
    setOtpResendIn(res.resendAfterSeconds || 45);
    setOtpStep("otp");
    if (__DEV__ && res.code) Alert.alert(tr("OTP Code"), tr("Your OTP: {{code}}\n\nEnter this code below to sign in.", { code: res.code }));
  };

  const handleVerifyOtp = async () => {
    if (otpExpiresIn === 0) {
      Alert.alert(tr("Code Expired"), tr("Code expired. Request a new OTP."));
      return;
    }
    const expectedLength = otpChannel === "email" ? 6 : 4;
    if (!otp || otp.length !== expectedLength) {
      Alert.alert(tr("Invalid OTP"), tr(`Please enter the ${expectedLength}-digit OTP.`));
      return;
    }

    setLoading(true);
    const roleValue = isProvider ? "provider" : "customer";
    const res = otpChannel === "phone"
      ? await verifyOtpAndLogin(phone.trim(), otp.trim(), rememberMe, "login", roleValue)
      : await verifyEmailOtpAndLogin(email.trim().toLowerCase(), otp.trim(), rememberMe, roleValue);
    setLoading(false);

    if (!res.success) {
      Alert.alert(tr("Verification Failed"), tr(apiErrorToMessage(res.error, "Invalid or expired OTP.")));
      return;
    }

    const loggedInRole = res.user?.role === "provider" ? "provider" : "customer";
    if (rememberMe && res.user?.phone) await promptBiometricSetup(res.user.phone, loggedInRole);
    // The root session guard performs the single post-login transition.
  };

  const handlePasswordLogin = async () => {
    if (!identifier.trim()) {
      Alert.alert(tr("Required"), tr("Please enter your email or phone number."));
      return;
    }

    if (!password) {
      Alert.alert(tr("Required"), tr("Please enter your password."));
      return;
    }

    setLoading(true);
    const res = await loginWithPassword(identifier, password, isProvider ? "provider" : "customer", rememberMe);
    setLoading(false);

    if (!res.success) {
      Alert.alert(tr("Sign In Failed"), tr(apiErrorToMessage(res.error, "Invalid credentials.")));
      return;
    }

    const loggedInRole = res.user?.role === "provider" ? "provider" : "customer";
    if (rememberMe && res.user?.phone) await promptBiometricSetup(res.user.phone, loggedInRole);
    // The root session guard performs the single post-login transition.
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    const res = await completeBiometricLogin();
    setLoading(false);

    if (!res.success) {
      Alert.alert(tr("Biometric Login Failed"), tr(apiErrorToMessage(res.error, "Authentication failed.")));
      return;
    }

    // The root session guard performs the single post-login transition.
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
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              if (tab === "otp" && otpStep === "otp") {
                setOtpStep("phone");
                setOtp("");
              } else {
                router.back();
              }
            }}
          >
            <Icon name="arrow-left" size={20} color={theme.colors.white} />
          </Pressable>

          <View style={[styles.logoRow, localizedRow]}>
            <Image
              source={brandConfig.assets.mark}
              style={{ width: 70, height: 50 }}
              resizeMode="contain"
            />
          </View>

          <Text style={[styles.heroTitle, localizedText]}>
            {isProvider ? tr("Provider Sign In") : tr("Welcome Back")}
          </Text>
          <Text style={[styles.heroSub, localizedText]}>
            {isProvider
              ? tr("Sign in to your service provider account")
              : tr("Sign in to book home services")}
          </Text>

          <View style={[styles.roleBadge, localizedRow]}>
            <Icon name={isProvider ? "tool" : "user"} size={12} color={theme.colors.white} />
            <Text style={[styles.roleBadgeText, localizedText]}>
              {isProvider ? tr("Service Provider") : tr("Customer")}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <View style={[styles.tabs, localizedRow]}>
            <Pressable
              style={[styles.tab, tab === "otp" && styles.tabActive]}
              onPress={() => {
                setTab("otp");
                setOtpStep("phone");
                setOtp("");
              }}
            >
              <Icon
                name="phone"
                size={14}
                color={tab === "otp" ? theme.colors.primary : theme.colors.textSecondary}
              />
              <Text style={[styles.tabLabel, tab === "otp" && styles.tabLabelActive]}>
                {tr("Mobile OTP")}
              </Text>
            </Pressable>

            <Pressable
              testID="login-password-tab"
              style={[styles.tab, tab === "password" && styles.tabActive]}
              onPress={() => setTab("password")}
            >
              <Icon
                name="lock"
                size={14}
                color={tab === "password" ? theme.colors.primary : theme.colors.textSecondary}
              />
              <Text style={[styles.tabLabel, tab === "password" && styles.tabLabelActive]}>
                {tr("Password")}
              </Text>
            </Pressable>
          </View>

          {biometricAvailable && (
            <Pressable
              style={[styles.biometricBtn, localizedRow]}
              onPress={handleBiometricLogin}
              disabled={loading}
            >
              <Icon name={biometricType === "face" ? "scan-face" : biometricType === "iris" ? "eye" : biometricType === "fingerprint" ? "fingerprint" : "shield"} size={20} color={theme.colors.primary} />
              <Text style={[styles.biometricText, localizedText]}>{biometricBtnLabel}</Text>
            </Pressable>
          )}

          {tab === "otp" && (
            <View style={styles.form}>
              <View style={[styles.otpChannelTabs, localizedRow]}>
                <Pressable
                  style={[styles.otpChannelTab, otpChannel === "phone" && styles.otpChannelTabActive]}
                  onPress={() => { setOtpChannel("phone"); setOtpStep("phone"); setOtp(""); }}
                >
                  <Icon name="phone" size={14} color={otpChannel === "phone" ? theme.colors.primary : theme.colors.textSecondary} />
                  <Text style={[styles.otpChannelText, otpChannel === "phone" && styles.otpChannelTextActive]}>{tr("Mobile OTP")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.otpChannelTab, otpChannel === "email" && styles.otpChannelTabActive]}
                  onPress={() => { setOtpChannel("email"); setOtpStep("phone"); setOtp(""); }}
                >
                  <Icon name="mail" size={14} color={otpChannel === "email" ? theme.colors.primary : theme.colors.textSecondary} />
                  <Text style={[styles.otpChannelText, otpChannel === "email" && styles.otpChannelTextActive]}>{tr("Email OTP")}</Text>
                </Pressable>
              </View>
              {otpStep === "phone" ? (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, localizedText]}>{tr(otpChannel === "phone" ? "Phone Number" : "Verified Email Address")}</Text>
                    <View style={[styles.inputWrapper, localizedRow]}>
                      {otpChannel === "phone" ? (
                        <View style={styles.countryCode}>
                          <Text style={styles.countryCodeText}>🇵🇰 +92</Text>
                        </View>
                      ) : (
                        <Icon name="mail" size={18} color={theme.colors.textMuted} />
                      )}
                      <TextInput
                        style={[styles.input, localizedText, { paddingHorizontal: 8 }]}
                        value={otpChannel === "phone" ? phone : email}
                        onChangeText={otpChannel === "phone" ? setPhone : setEmail}
                        placeholder={otpChannel === "phone" ? "3XX-XXXXXXX" : "email@example.com"}
                        placeholderTextColor={theme.colors.textMuted}
                        keyboardType={otpChannel === "phone" ? "phone-pad" : "email-address"}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                      />
                    </View>
                    {otpChannel === "email" ? (
                      <Text style={[styles.emailOtpHelp, localizedText]}>{tr("Email OTP works only after the email has been verified on your Athoo account.")}</Text>
                    ) : null}
                  </View>

                  <View style={[styles.rememberRow, localizedRow]}>
                    <Switch
                      value={rememberMe}
                      onValueChange={setRememberMe}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primary + "50" }}
                      thumbColor={rememberMe ? theme.colors.primary : theme.colors.textMuted}
                      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    />
                    <Pressable onPress={() => setRememberMe(!rememberMe)} style={{ flex: 1 }}>
                      <Text style={[styles.rememberLabel, localizedText]}>{tr("Keep me signed in")}</Text>
                    </Pressable>
                    <Text style={styles.rememberHint}>
                      {rememberMe ? `✓ ${tr("Stays logged in")}` : tr("Signs out on close")}
                    </Text>
                  </View>

                  <Pressable
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    onPress={handleSendOtp}
                    disabled={loading}
                  >
                    <LinearGradient
                      colors={
                        isProvider
                          ? [theme.colors.secondary, theme.colors.secondaryPressed]
                          : [theme.colors.primary, theme.colors.primaryPressed]
                      }
                      style={styles.primaryBtnGrad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Icon name="send" size={16} color={theme.colors.white} />
                      <Text style={styles.primaryBtnText}>
                        {loading ? tr("Sending...") : tr(otpChannel === "email" ? "Send Email Code" : "Get OTP Code")}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={[styles.otpSentBox, localizedRow]}>
                    <Icon name="check-circle" size={18} color={theme.colors.success} />
                    <Text style={styles.otpSentText}>
                      {tr(otpDeliveryMessage || "Verification code sent.")}
                    </Text>
                  </View>

                  {otpHint ? (
                    <View style={[styles.otpHintBox, localizedRow]}>
                      <Icon name="info" size={14} color={theme.colors.secondary} />
                      <Text style={styles.otpHintText}>
                        Your OTP:{" "}
                        <Text style={{ fontWeight: "800", fontSize: 16 }}>{otpHint}</Text>
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, localizedText]}>{tr(otpChannel === "email" ? "Enter 6-digit email code" : "Enter 4-digit OTP")}</Text>
                    <View style={[styles.inputWrapper, styles.otpWrapper]}>
                      <TextInput
                        style={[styles.input, styles.otpInput]}
                        value={otp}
                        onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, otpChannel === "email" ? 6 : 4))}
                        placeholder={otpChannel === "email" ? "• • • • • •" : "• • • •"}
                        placeholderTextColor={theme.colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={otpChannel === "email" ? 6 : 4}
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
                      colors={
                        isProvider
                          ? [theme.colors.secondary, theme.colors.secondaryPressed]
                          : [theme.colors.primary, theme.colors.primaryPressed]
                      }
                      style={styles.primaryBtnGrad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Icon name="log-in" size={16} color={theme.colors.white} />
                      <Text style={styles.primaryBtnText}>
                        {loading ? tr("Verifying...") : tr("Verify & Sign In")}
                      </Text>
                    </LinearGradient>
                  </Pressable>

                  <Text style={[styles.otpTimerText, otpExpiresIn === 0 && styles.otpTimerExpired]}>
                    {otpExpiresIn > 0
                      ? tr("Code expires in {{time}}", { time: `${Math.floor(otpExpiresIn / 60)}:${String(otpExpiresIn % 60).padStart(2, "0")}` })
                      : tr("Code expired. Request a new OTP.")}
                  </Text>

                  <Pressable
                    style={[styles.resendOtpBtn, (loading || otpResendIn > 0) && styles.btnDisabled]}
                    disabled={loading || otpResendIn > 0}
                    onPress={handleSendOtp}
                  >
                    <Text style={styles.resendOtpText}>
                      {otpResendIn > 0 ? tr("Resend in {{seconds}}s", { seconds: otpResendIn }) : tr("Resend OTP")}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.changePhoneBtn}
                    onPress={() => {
                      setOtpStep("phone");
                      setOtp("");
                      setOtpExpiresIn(0);
                      setOtpResendIn(0);
                    }}
                  >
                    <Icon name="arrow-left" size={14} color={theme.colors.primary} />
                    <Text style={styles.changePhoneText}>{tr(otpChannel === "email" ? "Change email address" : "Change phone number")}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {tab === "password" && (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, localizedText]}>{tr("Email or Phone")}</Text>
                <View style={[styles.inputWrapper, localizedRow]}>
                  <Icon name="user" size={18} color={theme.colors.textMuted} />
                  <TextInput
                    style={[styles.input, localizedText]}
                    testID="login-identifier"
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="email@example.com or 03XX-XXXXXXX"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, localizedText]}>{tr("Password")}</Text>
                <View style={[styles.inputWrapper, localizedRow]}>
                  <Icon name="lock" size={18} color={theme.colors.textMuted} />
                  <TextInput
                    style={[styles.input, localizedText]}
                    testID="login-password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder={tr("Enter your password")}
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Icon
                      name={showPassword ? "eye-off" : "eye"}
                      size={18}
                      color={theme.colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={[styles.rememberRow, localizedRow]}>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary + "50" }}
                  thumbColor={rememberMe ? theme.colors.primary : theme.colors.textMuted}
                  style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                />
                <Pressable onPress={() => setRememberMe(!rememberMe)} style={{ flex: 1 }}>
                  <Text style={[styles.rememberLabel, localizedText]}>{tr("Keep me signed in")}</Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                testID="login-submit"
                    onPress={handlePasswordLogin}
                disabled={loading}
              >
                <LinearGradient
                  colors={
                    isProvider ? [theme.colors.secondary, theme.colors.secondaryPressed] : [theme.colors.primary, theme.colors.primaryPressed]
                  }
                  style={styles.primaryBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Icon name="log-in" size={16} color={theme.colors.white} />
                  <Text style={styles.primaryBtnText}>
                    {loading ? tr("Signing in...") : tr("Sign In")}
                  </Text>
                </LinearGradient>
              </Pressable>

              <View>
                <View style={[styles.infoNote, localizedRow]}>
                  <Icon name="info" size={13} color={theme.colors.textMuted} />
                  <Text style={styles.infoNoteText}>
                    {tr("No password yet? Sign in with OTP first, then set one in your Profile settings.")}
                  </Text>
                </View>

                <Pressable
                  style={styles.forgotPasswordBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/auth/forgot-password",
                      params: { role: isProvider ? "provider" : "customer" },
                    })
                  }
                >
                  <Icon
                    name="help-circle"
                    size={15}
                    color={isProvider ? theme.colors.secondary : theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.forgotPasswordText,
                      { color: isProvider ? theme.colors.secondary : theme.colors.primary },
                    ]}
                  >
                    {tr("Forgot Password?")}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={[styles.dividerText, localizedText]}>{tr("New to Athoo?")}</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={[styles.registerBtn, localizedRow]}
            onPress={() => {
              if (isProvider) {
                router.push({ pathname: "/auth/provider-register" });
              } else {
                router.push({ pathname: "/auth/register", params: { role: "customer" } });
              }
            }}
          >
            <Icon
              name="user-plus"
              size={16}
              color={isProvider ? theme.colors.secondary : theme.colors.primary}
            />
            <Text
              style={[
                styles.registerBtnText,
                { color: isProvider ? theme.colors.secondary : theme.colors.primary },
              ]}
            >
              {tr("Create an Account")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  rowReverse: { flexDirection: "row-reverse" },

  hero: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontSize: 22, fontWeight: "800", color: theme.colors.white, letterSpacing: -0.5 },
  heroTitle: { fontSize: 28, fontWeight: "800", color: theme.colors.white, marginBottom: 5, letterSpacing: -0.45 },
  heroSub: { fontSize: 13.5, lineHeight: 19, color: "rgba(255,255,255,0.72)", marginBottom: 13 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  roleBadgeText: { fontSize: 12, color: theme.colors.white, fontWeight: "600" },

  card: {
    flex: 1,
    backgroundColor: theme.dark ? "rgba(7,17,31,0.96)" : theme.colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 44,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(148,163,184,0.16)" : theme.colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.20,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },

  tabs: {
    flexDirection: "row",
    backgroundColor: theme.dark ? "rgba(255,255,255,0.055)" : theme.colors.surfaceAlt,
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(148,163,184,0.14)" : theme.colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: theme.dark ? "rgba(37,99,235,0.16)" : theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(59,130,246,0.26)" : theme.colors.border,
    shadowColor: theme.colors.overlay,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  tabLabel: { fontSize: 13, fontWeight: "600", color: theme.colors.textSecondary },
  tabLabelActive: { color: theme.colors.primary },

  otpChannelTabs: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 13,
    backgroundColor: theme.dark ? "rgba(255,255,255,0.045)" : theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(148,163,184,0.14)" : theme.colors.border,
  },
  otpChannelTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  otpChannelTabActive: { backgroundColor: theme.colors.surface },
  otpChannelText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: "600" },
  otpChannelTextActive: { color: theme.colors.primary },
  emailOtpHelp: { fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },

  form: { gap: 14 },
  inputGroup: { gap: 7 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.dark ? "rgba(255,255,255,0.045)" : theme.colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 54,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(148,163,184,0.18)" : theme.colors.border,
    gap: 10,
  },
  otpWrapper: {
    justifyContent: "center",
    borderColor: theme.colors.primary + "60",
    backgroundColor: theme.colors.primary + "08",
  },
  input: { flex: 1, fontSize: 15.5, color: theme.colors.text, paddingVertical: 0 },
  otpInput: { textAlign: "center", fontSize: 28, fontWeight: "800", letterSpacing: 16 },

  countryCode: {
    backgroundColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countryCodeText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.dark ? "rgba(255,255,255,0.04)" : theme.colors.surfaceAlt,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(148,163,184,0.12)" : theme.colors.border,
  },
  rememberLabel: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  rememberHint: { fontSize: 11, color: theme.colors.textMuted },

  otpSentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.success + "15",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.success + "30",
  },
  otpSentText: { fontSize: 13, color: theme.colors.text, flex: 1 },

  otpHintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.secondary + "15",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "30",
  },
  otpHintText: { fontSize: 13, color: theme.colors.text },

  primaryBtn: { borderRadius: 17, overflow: "hidden", shadowColor: "#2563EB", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  primaryBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  btnDisabled: { opacity: 0.6 },

  otpTimerText: { textAlign: "center", fontSize: 12, color: theme.colors.textSecondary },
  otpTimerExpired: { color: theme.colors.danger, fontWeight: "700" },
  resendOtpBtn: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  resendOtpText: { fontSize: 14, color: theme.colors.primary, fontWeight: "700" },
  changePhoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 8,
  },
  changePhoneText: { fontSize: 14, color: theme.colors.primary, fontWeight: "600" },

  infoNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
  },
  infoNoteText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 22,
    marginBottom: 14,
  },
  divider: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "500" },

  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(148,163,184,0.18)" : theme.colors.border,
    backgroundColor: theme.dark ? "rgba(255,255,255,0.04)" : theme.colors.surfaceAlt,
  },
  registerBtnText: { fontSize: 15, fontWeight: "700" },

  forgotPasswordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
  },

  forgotPasswordText: {
    fontSize: 14,
    fontWeight: "700",
  },

  biometricBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 50,
    backgroundColor: theme.dark ? "rgba(37,99,235,0.10)" : theme.colors.surfaceAlt,
    borderRadius: 15,
    paddingHorizontal: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.dark ? "rgba(59,130,246,0.22)" : theme.colors.border,
  },
  biometricText: { fontSize: 16, fontWeight: "600", color: theme.colors.primary },
});
