import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import {
  disableBiometric,
  getBiometricLabel,
  getBiometricPhone,
  getBiometricRole,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/services/biometric";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

export function BiometricLoginSetting() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, configureBiometricLogin } = useAuth();
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState("Biometric Login");
  const [busy, setBusy] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [password, setPassword] = useState("");

  const refreshState = useCallback(async () => {
    const [deviceAvailable, localEnabled, savedPhone, savedRole, deviceLabel] = await Promise.all([
      isBiometricAvailable(),
      isBiometricEnabled(),
      getBiometricPhone(),
      getBiometricRole(),
      getBiometricLabel(),
    ]);

    const belongsToCurrentAccount = Boolean(
      user?.phone &&
      savedPhone === user.phone &&
      savedRole === user.role,
    );
    const active = deviceAvailable && localEnabled && belongsToCurrentAccount && user?.biometricEnabled === true;

    if (localEnabled && (!deviceAvailable || !belongsToCurrentAccount || user?.biometricEnabled !== true)) {
      await disableBiometric().catch(() => undefined);
    }

    setAvailable(deviceAvailable);
    setEnabled(active);
    setLabel(deviceLabel);
  }, [user?.biometricEnabled, user?.phone, user?.role]);

  useEffect(() => {
    void refreshState();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshState();
    });
    return () => subscription.remove();
  }, [refreshState]);

  const showDeviceSetup = () => {
    Alert.alert(
      "Biometrics not set up",
      "Set up Face ID, Touch ID, Fingerprint, or Iris in your phone settings, then return to Athoo.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
  };

  const performDisable = async () => {
    setBusy(true);
    const result = await configureBiometricLogin(false);
    setBusy(false);
    if (!result.success) {
      Alert.alert("Unable to disable", result.error || "Please try again.");
      return;
    }
    setEnabled(false);
  };

  const requestToggle = (next: boolean) => {
    if (busy) return;
    if (!next) {
      Alert.alert(
        `Disable ${label}`,
        "You will need your password or OTP the next time you sign in.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Disable", style: "destructive", onPress: () => void performDisable() },
        ],
      );
      return;
    }

    if (!available) {
      showDeviceSetup();
      return;
    }
    setPassword("");
    setPasswordModal(true);
  };

  const performEnable = async () => {
    setBusy(true);
    const result = await configureBiometricLogin(true, password);
    setBusy(false);
    if (!result.success) {
      Alert.alert("Unable to enable biometric login", result.error || "Please try again.");
      return;
    }

    setPassword("");
    setPasswordModal(false);
    setEnabled(true);
    Alert.alert(`${label} enabled`, "Your remembered Athoo session is now protected by device biometrics.");
  };

  const subtitle = available
    ? enabled
      ? "Required when reopening Athoo after inactivity"
      : "Confirm your password and device biometric to enable"
    : "Set up biometrics in your phone settings first";

  return (
    <>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <Icon name="fingerprint" size={18} color={theme.colors.accent} />
        </View>
        <Pressable
          style={styles.textColumn}
          onPress={() => requestToggle(!enabled)}
          accessibilityRole="button"
        >
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </Pressable>
        {busy ? (
          <ActivityIndicator size="small" color={theme.colors.accent} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={requestToggle}
            trackColor={{ false: theme.colors.border, true: theme.colors.accentSoft }}
            thumbColor={enabled ? theme.colors.accent : theme.colors.textMuted}
            accessibilityLabel={`Turn ${label} ${enabled ? "off" : "on"}`}
          />
        )}
      </View>

      <Modal
        visible={passwordModal}
        transparent
        animationType="fade"
        onRequestClose={() => !busy && setPasswordModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && setPasswordModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Icon name="shield" size={24} color={theme.colors.accent} />
            </View>
            <Text style={styles.modalTitle}>Enable {label}</Text>
            <Text style={styles.modalText}>
              Enter your current Athoo password. You will then confirm with your device biometric.
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Current password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={styles.passwordInput}
              accessibilityLabel="Current Athoo password"
              onSubmitEditing={() => void performEnable()}
            />
            <Text style={styles.passwordHint}>Accounts created without a password may leave this blank.</Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.cancelButton}
                disabled={busy}
                onPress={() => setPasswordModal(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.enableButton, busy && styles.disabledButton]}
                disabled={busy}
                onPress={() => void performEnable()}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={theme.colors.onBrand} />
                ) : (
                  <Text style={styles.enableText}>Continue</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    row: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft,
    },
    textColumn: { flex: 1, justifyContent: "center" },
    label: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
    subtitle: { marginTop: 2, fontSize: 11, lineHeight: 16, color: theme.colors.textSecondary },
    overlay: {
      flex: 1,
      justifyContent: "center",
      padding: 20,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    modalCard: {
      width: "100%",
      maxWidth: 460,
      alignSelf: "center",
      borderRadius: 22,
      padding: 22,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    modalIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft,
      marginBottom: 14,
    },
    modalTitle: { fontSize: 19, fontWeight: "800", color: theme.colors.text },
    modalText: { marginTop: 8, fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
    passwordInput: {
      minHeight: 50,
      marginTop: 18,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      paddingHorizontal: 14,
      fontSize: 15,
    },
    passwordHint: { marginTop: 7, fontSize: 11, lineHeight: 15, color: theme.colors.textMuted },
    actions: { flexDirection: "row", gap: 10, marginTop: 20 },
    cancelButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
    },
    cancelText: { fontSize: 14, fontWeight: "700", color: theme.colors.textSecondary },
    enableButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
    },
    disabledButton: { opacity: 0.65 },
    enableText: { fontSize: 14, fontWeight: "800", color: theme.colors.onBrand },
  });
}
