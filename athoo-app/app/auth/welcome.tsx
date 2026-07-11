import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getBiometricType, getBiometricRole } from "@/services/biometric";

const FEATURES = [
  { icon: "search", text: "Find skilled workers nearby" },
  { icon: "map-pin", text: "Live location tracking" },
  { icon: "clock", text: "Book now or schedule later" },
  { icon: "message-circle", text: "Chat & call in-app" },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const { requiresBiometric, completeBiometricLogin, user } = useAuth();
  const [biometricType, setBiometricType] = useState<"face" | "fingerprint" | "iris" | "none">("none");
  const [bioRole, setBioRole] = useState<string>("customer");
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState("");

  useEffect(() => {
    if (requiresBiometric) {
      getBiometricType().then(setBiometricType);
      getBiometricRole().then(setBioRole);
    }
  }, [requiresBiometric]);

  // Navigate as soon as biometric auth completes and user is set
  useEffect(() => {
    if (user && !requiresBiometric) {
      if (user.role === "provider") {
        router.replace("/(provider)/(tabs)/dashboard");
      } else {
        router.replace("/(customer)/(tabs)/home");
      }
    }
  }, [user, requiresBiometric]);

  const handleBiometricLogin = async () => {
    setBioError("");
    setBioLoading(true);
    const result = await completeBiometricLogin();
    setBioLoading(false);
    if (result.success) {
      // navigation handled by the useEffect above
    } else if (result.error === "Session expired. Please login again.") {
      setBioError("Session expired — please sign in again.");
      setTimeout(() => router.push("/auth/login?role=customer"), 1200);
    } else {
      setBioError("Authentication cancelled. Try again or use OTP.");
    }
  };

  return (
    <LinearGradient
      colors={[Colors.gradientStart, Colors.gradientEnd]}
      testID="welcome-screen"
      style={[styles.container, { paddingTop: topPad + 20, paddingBottom: botPad + 20 }]}
    >
      <View style={styles.logoSection}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/images/logo_transparent.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.tagline}>Home Services at Your Fingertips</Text>
        <Text style={styles.subTagline}>Rawalpindi & Islamabad</Text>
      </View>

      {requiresBiometric ? (
        <View style={styles.biometricSection}>
          <Pressable
            style={({ pressed }) => [styles.biometricBtn, pressed && { opacity: 0.85 }]}
            onPress={handleBiometricLogin}
            disabled={bioLoading}
          >
            {bioLoading ? (
              <ActivityIndicator color={Colors.primary} size="large" />
            ) : (
              <>
                <View style={styles.biometricIcon}>
                  <Icon
                    name={
                      biometricType === "face"
                        ? "scan-face"
                        : biometricType === "iris"
                          ? "eye"
                          : "fingerprint"
                    }
                    size={52}
                    color={Colors.primary}
                    strokeWidth={1.5}
                  />
                </View>
                <Text style={styles.biometricTitle}>
                  {biometricType === "face"
                    ? "Sign in with Face ID"
                    : biometricType === "iris"
                      ? "Sign in with Iris Scan"
                      : "Sign in with Fingerprint"}
                </Text>
                <Text style={styles.biometricSubtitle}>
                  {biometricType === "face"
                    ? "Look at your phone to sign in instantly"
                    : biometricType === "iris"
                      ? "Scan your iris to sign in instantly"
                      : "Touch the sensor to sign in instantly"}
                </Text>
              </>
            )}
          </Pressable>
          {bioError ? (
            <View style={styles.bioErrorBox}>
              <Icon name="alert-circle" size={14} color="#fff" />
              <Text style={styles.bioErrorText}>{bioError}</Text>
            </View>
          ) : null}
          <Pressable
            style={styles.otpFallback}
            onPress={() => router.push(`/auth/login?role=${bioRole}` as any)}
          >
            <Icon name="phone" size={14} color="rgba(255,255,255,0.75)" />
            <Text style={styles.otpFallbackText}>Sign in with OTP instead</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.featuresCard}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Icon name={f.icon as never} size={18} color={Colors.primary} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
      )}

      {!requiresBiometric && (
        <View style={styles.actions}>
          <Text style={styles.joinText}>Join as</Text>
          <View style={styles.roleButtons}>
            <Pressable
              style={({ pressed }) => [styles.roleBtn, pressed && styles.rolePressed]}
              onPress={() => router.push("/auth/register?role=customer")}
            >
              <Icon name="user" size={26} color={Colors.primary} />
              <Text style={styles.roleTitle}>Customer</Text>
              <Text style={styles.roleDesc}>Find & hire services</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.roleBtn, styles.roleBtnProvider, pressed && styles.rolePressed]}
              onPress={() => router.push("/auth/provider-register")}
            >
              <Icon name="briefcase" size={26} color={Colors.secondary} />
              <Text style={styles.roleTitle}>Provider</Text>
              <Text style={styles.roleDesc}>Join as a pro</Text>
              <View style={styles.verifiedTag}>
                <Icon name="shield" size={10} color="#fff" />
                <Text style={styles.verifiedTagText}>Verified Pro</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.signInSection}>
            <Text style={styles.loginText}>Already registered?</Text>
            <View style={styles.signInButtons}>
              <Pressable
                style={({ pressed }) => [styles.signInBtn, pressed && { opacity: 0.8 }]}
                testID="welcome-customer-sign-in"
                onPress={() => router.push("/auth/login?role=customer")}
              >
                <Icon name="user" size={16} color={Colors.primary} />
                <Text style={styles.signInBtnText}>Customer Sign In</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.signInBtn, styles.signInBtnProvider, pressed && { opacity: 0.8 }]}
                testID="welcome-provider-sign-in"
                onPress={() => router.push("/auth/login?role=provider")}
              >
                <Icon name="briefcase" size={16} color={Colors.secondary} />
                <Text style={[styles.signInBtnText, { color: Colors.secondary }]}>Provider Sign In</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  logoSection: {
    alignItems: "center",
    gap: 10,
  },
  logoContainer: {
    width: 170,
    height: 170,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  logoImage: {
    width: 150,
    height: 150,
  },
  logoText: {
    fontSize: 64,
    fontWeight: "900",
    color: Colors.primary,
    lineHeight: 72,
  },
  tagline: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.white,
    textAlign: "center",
    marginTop: 16,
  },
  subTagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
  },
  biometricSection: {
    alignItems: "center",
    gap: 20,
  },
  biometricBtn: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    minHeight: 180,
    justifyContent: "center",
  },
  biometricIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.primary + "30",
  },
  biometricTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "center",
  },
  biometricSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  bioErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(220,50,50,0.35)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,100,100,0.4)",
  },
  bioErrorText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "500",
    flex: 1,
  },
  otpFallback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  otpFallbackText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },
  featuresCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: "500",
  },
  actions: { gap: 16 },
  joinText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    fontWeight: "500",
  },
  roleButtons: {
    flexDirection: "row",
    gap: 12,
  },
  roleBtn: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  roleBtnProvider: { borderWidth: 2, borderColor: Colors.secondary + "60" },
  rolePressed: { opacity: 0.85 },
  verifiedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  verifiedTagText: { fontSize: 9, fontWeight: "700", color: "#fff" },
  roleTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  roleDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  signInSection: { gap: 10, alignItems: "center" },
  loginText: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "500" },
  signInButtons: { flexDirection: "row", gap: 10, width: "100%" },
  signInBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  signInBtnProvider: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1.5,
    borderColor: Colors.secondary + "50",
  },
  signInBtnText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
});

