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
import { createAuthPalette } from "@/design/authPalette";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { isBiometricAvailable, isBiometricEnabled, getBiometricLabel, getBiometricRole, getBiometricType, type BiometricType } from "@/services/biometric";
import { apiErrorToMessage } from "@/lib/apiError";

type LoginTab = "otp" | "password";

export default function LoginScreen() {
  const { role } = useLocalSearchParams<{ role: UserRole }>();
  const { sendOtp, verifyOtpAndLogin, sendEmailOtp, verifyEmailOtpAndLogin, loginWithPassword, promptBiometricSetup, completeBiometricLogin } = useAuth();
  const { theme } = useTheme();
  const auth = useMemo(() => createAuthPalette(theme), [theme]);
  const { translate: tr, textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const localizedRow = direction === "rtl" ? styles.rowReverse : undefined;
  const phoneRef = useRef("");
  const insets = useSafeAreaInsets();

  const isProvider = role === "provider";

  const [tab, setTab] = useState<LoginTab>("password");
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
      const [hardwareAvailable, enabled, savedRole] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnabled(),
        getBiometricRole(),
      ]);
      const roleMatches = savedRole === (isProvider ? "provider" : "customer");
      setBiometricAvailable(hardwareAvailable && enabled && roleMatches);
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
          colors={
            theme.dark
              ? [auth.heroInk, auth.heroNavy, auth.heroBlue]
              : isProvider
                ? [theme.colors.secondaryPressed, theme.colors.secondary, auth.heroAmber]
                : [theme.colors.primaryPressed, theme.colors.primary, auth.heroSky]
          }
          style={[styles.hero, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 12 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Icon name="arrow-left" size={20} color={theme.colors.white} />
          </Pressable>

          <View style={[styles.logoRow, localizedRow]}>
            <Image
              source={brandConfig.assets.appIcon}
              style={styles.brandIcon}
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
              style={[styles.tab, tab === "password" && styles.tabActive]}
              testID="login-password-tab"
              onPress={() => setTab("password")}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "password" }}
            >
              <Icon name="lock" size={15} color={tab === "password" ? theme.colors.primary : theme.colors.textMuted} />
              <Text style={[styles.tabLabel, localizedText, tab === "password" && styles.tabLabelActive]}>
                {tr("Password")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, tab === "otp" && styles.tabActive]}
              testID="login-otp-tab"
              onPress={() => setTab("otp")}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "otp" }}
            >
              <Icon name="smartphone" size={15} color={tab === "otp" ? theme.colors.primary : theme.colors.textMuted} />
              <Text style={[styles.tabLabel, localizedText, tab === "otp" && styles.tabLabelActive]}>
                {tr("OTP Code")}
              </Text>
            </Pressable>
          </View>

          {tab === "password" ? (
            <>
          <View style={[styles.passwordMethodHeader, localizedRow]}>
            <View style={styles.passwordMethodIcon}>
              <Icon name="lock" size={18} color={isProvider ? theme.colors.secondary : theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.passwordMethodTitle, localizedText]}>{tr("Password Sign In")}</Text>
              <Text style={[styles.passwordMethodSub, localizedText]}>{tr("Enter your Athoo account password to continue.")}</Text>
            </View>
          </View>
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
                    {tr("Forgot your password? Reset it securely before signing in.")}
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
            </>
          ) : (
            <View style={styles.form}>
              <View style={[styles.otpChannelTabs, localizedRow]}>
                <Pressable
                  style={[styles.otpChannelTab, otpChannel === "phone" && styles.otpChannelTabActive]}
                  testID="login-otp-channel-phone"
                  onPress={() => { setOtpChannel("phone"); setOtpStep("phone"); }}
                >
                  <Icon name="smartphone" size={14} color={otpChannel === "phone" ? theme.colors.primary : theme.colors.textMuted} />
                  <Text style={[styles.otpChannelText, localizedText, otpChannel === "phone" && styles.otpChannelTextActive]}>
                    {tr("Phone")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.otpChannelTab, otpChannel === "email" && styles.otpChannelTabActive]}
                  testID="login-otp-channel-email"
                  onPress={() => { setOtpChannel("email"); setOtpStep("phone"); }}
                >
                  <Icon name="mail" size={14} color={otpChannel === "email" ? theme.colors.primary : theme.colors.textMuted} />
                  <Text style={[styles.otpChannelText, localizedText, otpChannel === "email" && styles.otpChannelTextActive]}>
                    {tr("Email")}
                  </Text>
                </Pressable>
              </View>

              {otpStep === "phone" ? (
                <>
                  {otpChannel === "phone" ? (
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, localizedText]}>{tr("Phone Number")}</Text>
                      <View style={[styles.inputWrapper, localizedRow]}>
                        <Text style={styles.countryCode}>+92</Text>
                        <TextInput
                          style={[styles.input, localizedText]}
                          testID="login-otp-phone"
                          value={phone}
                          onChangeText={setPhone}
                          placeholder="03XX-XXXXXXX"
                          placeholderTextColor={theme.colors.textMuted}
                          keyboardType="phone-pad"
                          autoComplete="tel"
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, localizedText]}>{tr("Verified Email")}</Text>
                      <View style={[styles.inputWrapper, localizedRow]}>
                        <Icon name="mail" size={18} color={theme.colors.textMuted} />
                        <TextInput
                          style={[styles.input, localizedText]}
                          testID="login-otp-email"
                          value={email}
                          onChangeText={setEmail}
                          placeholder="email@example.com"
                          placeholderTextColor={theme.colors.textMuted}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                      <Text style={[styles.emailOtpHelp, localizedText]}>
                        {tr("We only send codes to email addresses you have already verified in Athoo.")}
                      </Text>
                    </View>
                  )}

                  <Pressable
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    testID="login-otp-send"
                    onPress={handleSendOtp}
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
                      <Icon name="message-square" size={16} color={theme.colors.white} />
                      <Text style={styles.primaryBtnText}>{loading ? tr("Sending...") : tr("Send Code")}</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              ) : (
                <>
                  {otpDeliveryMessage ? (
                    <View style={styles.otpSentBox}>
                      <Text style={[styles.otpSentText, localizedText]}>{otpDeliveryMessage}</Text>
                    </View>
                  ) : null}

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, localizedText]}>
                      {otpChannel === "email" ? tr("6-digit code") : tr("4-digit code")}
                    </Text>
                    <View style={[styles.otpWrapper, localizedRow]}>
                      <TextInput
                        style={[styles.otpInput, localizedText]}
                        testID="login-otp-code"
                        value={otp}
                        onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, otpChannel === "email" ? 6 : 4))}
                        placeholder="••••"
                        placeholderTextColor={theme.colors.textMuted}
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        maxLength={otpChannel === "email" ? 6 : 4}
                      />
                    </View>
                    {__DEV__ && otpHint ? (
                      <View style={styles.otpHintBox}>
                        <Text style={[styles.otpHintText, localizedText]}>{tr("Dev hint: {{code}}", { code: otpHint })}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    testID="login-otp-verify"
                    onPress={handleVerifyOtp}
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
                      <Text style={styles.primaryBtnText}>{loading ? tr("Verifying...") : tr("Verify & Sign In")}</Text>
                    </LinearGradient>
                  </Pressable>

                  <View style={[styles.rememberRow, localizedRow]}>
                    <Text style={[styles.otpTimerText, localizedText, otpExpiresIn === 0 && styles.otpTimerExpired]}>
                      {otpExpiresIn > 0
                        ? tr("Code expires in {{minutes}}:{{seconds}}", {
                            minutes: String(Math.floor(otpExpiresIn / 60)).padStart(2, "0"),
                            seconds: String(otpExpiresIn % 60).padStart(2, "0"),
                          })
                        : tr("Code expired")}
                    </Text>
                  </View>

                  <Pressable
                    style={styles.resendOtpBtn}
                    testID="login-otp-resend"
                    onPress={handleSendOtp}
                    disabled={loading || otpResendIn > 0}
                  >
                    <Text style={[styles.resendOtpText, localizedText, otpResendIn > 0 && { color: theme.colors.textMuted }]}>
                      {otpResendIn > 0
                        ? tr("Resend OTP in {{seconds}}s", { seconds: String(otpResendIn) })
                        : tr("Resend OTP")}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.changePhoneBtn}
                    onPress={() => setOtpStep("phone")}
                  >
                    <Text style={[styles.changePhoneText, localizedText]}>
                      {otpChannel === "phone" ? tr("Use a different number") : tr("Use a different email")}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {biometricAvailable && (
            <>
              <View style={styles.loginOrRow}>
                <View style={styles.divider} />
                <Text style={[styles.loginOrText, localizedText]}>{tr("or")}</Text>
                <View style={styles.divider} />
              </View>
              <Pressable
                style={[styles.biometricBtn, localizedRow]}
                onPress={handleBiometricLogin}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={biometricBtnLabel}
              >
                <Icon name={biometricType === "face" ? "scan-face" : biometricType === "iris" ? "eye" : biometricType === "fingerprint" ? "fingerprint" : "shield"} size={20} color={theme.colors.primary} />
                <Text style={[styles.biometricText, localizedText]}>{biometricBtnLabel}</Text>
              </Pressable>
            </>
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
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingBottom: 46,
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
    marginBottom: 18,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    marginBottom: 16,
  },
  brandIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
  },
  heroTitle: {
    ...theme.typography.display,
    color: theme.colors.white,
    marginBottom: 6,
    letterSpacing: -0.7,
  },
  heroSub: {
    ...theme.typography.body,
    color: "rgba(255,255,255,0.82)",
    marginBottom: 16,
    maxWidth: 520,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
  },
  roleBadgeText: {
    ...theme.typography.caption,
    color: theme.colors.white,
    fontFamily: theme.typography.label.fontFamily,
  },

  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -22,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: 24,
    paddingBottom: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.md,
  },

  passwordMethodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 18,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.primary + "26",
  },
  passwordMethodIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  passwordMethodTitle: { ...theme.typography.label, color: theme.colors.text },
  passwordMethodSub: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 },
  loginOrRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 12 },
  loginOrText: { ...theme.typography.caption, color: theme.colors.textMuted },

  tabs: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.lg,
    padding: 4,
    marginBottom: 18,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 44,
    borderRadius: theme.radius.md,
  },
  tabActive: {
    backgroundColor: theme.dark ? theme.colors.infoSoft : theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary + "33",
    ...theme.shadows.sm,
  },
  tabLabel: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
  },
  tabLabelActive: { color: theme.colors.primary },

  otpChannelTabs: {
    flexDirection: "row",
    padding: 3,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  otpChannelTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: theme.radius.sm,
  },
  otpChannelTabActive: {
    backgroundColor: theme.dark ? theme.colors.infoSoft : theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary + "2B",
  },
  otpChannelText: {
    ...theme.typography.caption,
    fontFamily: theme.typography.label.fontFamily,
    color: theme.colors.textSecondary,
  },
  otpChannelTextActive: { color: theme.colors.primary },
  emailOtpHelp: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  form: { gap: redesign.layout.fieldGap },
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
  otpWrapper: {
    justifyContent: "center",
    borderColor: theme.colors.primary + "66",
    backgroundColor: theme.colors.infoSoft,
  },
  input: {
    flex: 1,
    ...theme.typography.bodyLg,
    color: theme.colors.text,
    paddingVertical: 0,
  },
  otpInput: {
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
    fontFamily: theme.typography.h1.fontFamily,
    letterSpacing: 14,
  },

  countryCode: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  countryCodeText: {
    ...theme.typography.caption,
    fontFamily: theme.typography.label.fontFamily,
    color: theme.colors.text,
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rememberLabel: {
    ...theme.typography.label,
    color: theme.colors.text,
  },
  rememberHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  otpSentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.successSoft,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.success + "40",
  },
  otpSentText: {
    ...theme.typography.body,
    color: theme.colors.text,
    flex: 1,
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

  primaryBtn: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
    ...theme.shadows.sm,
  },
  primaryBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: redesign.control.largeHeight,
  },
  primaryBtnText: {
    ...theme.typography.bodyLg,
    fontFamily: theme.typography.h3.fontFamily,
    color: theme.colors.white,
  },
  btnDisabled: { opacity: redesign.visual.disabledOpacity },

  otpTimerText: {
    ...theme.typography.caption,
    textAlign: "center",
    color: theme.colors.textSecondary,
  },
  otpTimerExpired: { color: theme.colors.danger, fontFamily: theme.typography.label.fontFamily },
  resendOtpBtn: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  resendOtpText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontFamily: theme.typography.label.fontFamily,
  },
  changePhoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 8,
  },
  changePhoneText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontFamily: theme.typography.label.fontFamily,
  },

  infoNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoNoteText: {
    flex: 1,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    marginBottom: 14,
  },
  divider: { flex: 1, height: 1, backgroundColor: theme.colors.divider },
  dividerText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: redesign.control.standardHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary + "55",
    backgroundColor: theme.colors.infoSoft,
  },
  registerBtnText: {
    ...theme.typography.body,
    fontFamily: theme.typography.h3.fontFamily,
  },

  forgotPasswordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  forgotPasswordText: {
    ...theme.typography.body,
    fontFamily: theme.typography.label.fontFamily,
  },

  biometricBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: redesign.control.standardHeight,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radius.md,
    paddingHorizontal: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.primary + "33",
  },
  biometricText: {
    ...theme.typography.bodyLg,
    fontFamily: theme.typography.label.fontFamily,
    color: theme.colors.primary,
  },
});