import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

export default function ChangePasswordScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const hasPassword = true; // Always show current password field for safety; API will handle if no password yet

  const handleSave = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert("Too Short", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords don't match. Please retype.");
      return;
    }
    setLoading(true);
    try {
      await api.setPassword({
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setDone(true);
      Alert.alert(
        "Password Set ✓",
        "Your password has been saved. You can now sign in using your email/phone + this password.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to set password. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Account Security</Text>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBox}>
            <Icon name="shield" size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Set a Password</Text>
              <Text style={styles.infoText}>
                Once you set a password, you can sign in using your email or phone number + password — in addition to the OTP method.
              </Text>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Password <Text style={styles.labelHint}>(leave blank if not set yet)</Text></Text>
              <View style={styles.inputWrapper}>
                <Icon name="lock" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password (if any)"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showCurrent}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowCurrent(!showCurrent)}>
                  <Icon name={showCurrent ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>New Password *</Text>
              <View style={styles.inputWrapper}>
                <Icon name="lock" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showNew}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowNew(!showNew)}>
                  <Icon name={showNew ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <Text style={styles.errorHint}>Too short — need at least 8 characters</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm New Password *</Text>
              <View style={[
                styles.inputWrapper,
                confirmPassword.length > 0 && confirmPassword !== newPassword && styles.inputError,
              ]}>
                <Icon name="check-circle" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Retype new password"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowConfirm(!showConfirm)}>
                  <Icon name={showConfirm ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <Text style={styles.errorHint}>Passwords don't match</Text>
              )}
            </View>

            <Button
              title={loading ? "Saving..." : "Save Password"}
              onPress={handleSave}
              loading={loading}
              fullWidth
              style={{ marginTop: 8 }}
            />

            <Pressable
              onPress={() => router.push("/auth/forgot-password" as any)}
              style={styles.forgotLink}
            >
              <Icon name="help-circle" size={15} color={Colors.primary} />
              <Text style={styles.forgotLinkText}>Forgot Password? Reset via OTP</Text>
            </Pressable>
          </View>

          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>Tips for a strong password</Text>
            {["At least 8 characters long", "Mix letters, numbers, and symbols", "Never share your password with anyone"].map((tip) => (
              <View key={tip} style={styles.tip}>
                <Icon name="check" size={13} color={Colors.success} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.background, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  content: { padding: 24, gap: 24, paddingBottom: 60 },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.primary + "10", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.primary + "25",
  },
  infoTitle: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  infoText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: Colors.text },
  labelHint: { fontSize: 12, fontWeight: "400", color: Colors.textMuted },
  inputWrapper: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.card, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: Colors.border, gap: 10,
  },
  inputError: { borderColor: Colors.error },
  input: { flex: 1, fontSize: 16, color: Colors.text },
  errorHint: { fontSize: 12, color: Colors.error, marginTop: 2 },
  forgotLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  forgotLinkText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: "600",
  },
  tipBox: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 10,
  },
  tipTitle: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  tip: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipText: { fontSize: 13, color: Colors.textSecondary },
});

