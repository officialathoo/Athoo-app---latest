import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
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
import { api } from "@/services/api";

export default function ProviderChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

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
      Alert.alert(
        "Password Updated",
        "Your password has been saved. You can now sign in using phone/email + password.",
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

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBox}>
            <Icon name="shield" size={20} color={Colors.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Set or Change Password</Text>
              <Text style={styles.infoText}>
                Use this password for faster sign-in alongside OTP. Leave current password blank if you are setting it for the first time.
              </Text>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Password <Text style={styles.labelHint}>(leave blank if not set yet)</Text></Text>
              <View style={styles.inputWrapper}>
                <Icon name="lock" size={18} color={Colors.textMuted} />
                <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password (if any)" placeholderTextColor={Colors.textMuted} secureTextEntry={!showCurrent} autoCapitalize="none" />
                <Pressable onPress={() => setShowCurrent((v) => !v)}>
                  <Icon name={showCurrent ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>New Password *</Text>
              <View style={styles.inputWrapper}>
                <Icon name="lock" size={18} color={Colors.textMuted} />
                <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} placeholder="At least 8 characters" placeholderTextColor={Colors.textMuted} secureTextEntry={!showNew} autoCapitalize="none" />
                <Pressable onPress={() => setShowNew((v) => !v)}>
                  <Icon name={showNew ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password *</Text>
              <View style={styles.inputWrapper}>
                <Icon name="lock" size={18} color={Colors.textMuted} />
                <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Retype new password" placeholderTextColor={Colors.textMuted} secureTextEntry={!showConfirm} autoCapitalize="none" />
                <Pressable onPress={() => setShowConfirm((v) => !v)}>
                  <Icon name={showConfirm ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <Button title={loading ? "Saving..." : "Save Password"} onPress={handleSave} loading={loading} fullWidth style={{ marginTop: 8 }} />

            <Pressable
              onPress={() => router.push("/auth/forgot-password" as any)}
              style={styles.forgotLink}
            >
              <Icon name="help-circle" size={15} color={Colors.secondary} />
              <Text style={styles.forgotLinkText}>Forgot Password? Reset via OTP</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  content: { padding: 20, gap: 16 },
  infoBox: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 16, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  infoTitle: { fontSize: 15, fontWeight: "800", color: Colors.text, marginBottom: 4 },
  infoText: { fontSize: 13, lineHeight: 19, color: Colors.textSecondary },
  form: { gap: 14, backgroundColor: Colors.white, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border },
  inputGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: "700", color: Colors.text },
  labelHint: { fontWeight: "500", color: Colors.textMuted },
  inputWrapper: { minHeight: 52, borderRadius: 14, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 14 },
  forgotLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginTop: 4 },
  forgotLinkText: { fontSize: 13, color: Colors.secondary, fontWeight: "600" },
});

