import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import {
  disableBiometric,
  getBiometricPhone,
  getBiometricRole,
  getDeviceAuthenticationState,
  isBiometricEnabled,
  type DeviceAuthenticationState,
} from "@/services/biometric";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [deviceState, setDeviceState] = useState<DeviceAuthenticationState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState("Biometric Login");
  const [busy, setBusy] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [setupModal, setSetupModal] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [openingSettings, setOpeningSettings] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string | null>(null);
  const pendingEnableRef = useRef(false);

  const refreshState = useCallback(async (): Promise<DeviceAuthenticationState> => {
    const [authenticationState, localEnabled, savedPhone, savedRole] = await Promise.all([
      getDeviceAuthenticationState(),
      isBiometricEnabled(),
      getBiometricPhone(),
      getBiometricRole(),
    ]);
    const deviceAvailable = authenticationState.available;

    const belongsToCurrentAccount = Boolean(
      user?.phone &&
      savedPhone === user.phone &&
      savedRole === user.role,
    );
    const active =
      deviceAvailable &&
      localEnabled &&
      belongsToCurrentAccount &&
      user?.biometricEnabled === true;

    // Do not erase a valid remembered login because a vendor biometric API
    // temporarily returns unavailable while the app resumes. Only remove local
    // state when it belongs to another account or the server preference is off.
    if (localEnabled && !belongsToCurrentAccount) {
      await disableBiometric().catch(() => undefined);
    }

    setDeviceState(authenticationState);
    setAvailable(deviceAvailable);
    setEnabled(active);
    setLabel(authenticationState.label);
    return authenticationState;
  }, [user?.biometricEnabled, user?.phone, user?.role]);

  const continueAfterEnrollment = useCallback(() => {
    pendingEnableRef.current = false;
    setSetupStatus(null);
    setSetupModal(false);
    setPassword("");
    setPasswordModal(true);
  }, []);

  useEffect(() => {
    void refreshState();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;

      void (async () => {
        const nextState = await refreshState();
        if (pendingEnableRef.current && nextState.available) {
          continueAfterEnrollment();
        }
      })();
    });

    return () => subscription.remove();
  }, [continueAfterEnrollment, refreshState]);

  const showDeviceSetup = () => {
    pendingEnableRef.current = true;
    setSetupStatus(null);
    setSetupModal(true);
  };

  const openDeviceSettings = async () => {
    if (openingSettings) return;

    pendingEnableRef.current = true;
    setOpeningSettings(true);
    setSetupStatus(null);

    const guidance =
      Platform.OS === "android"
        ? "Athoo could not open Security settings automatically. Open Phone Settings > Security or Privacy > Biometrics, enroll a method, then return here."
        : "Athoo could not open Settings automatically. Open iPhone Settings > Face ID & Passcode or Touch ID & Passcode, enroll a method, then return here.";

    try {
      if (Platform.OS === "android") {
        // Deep-link straight into OS enrollment surfaces. The generic app-info
        // screen cannot enroll biometrics and can trigger a permission review.
        try {
          await Linking.sendIntent("android.settings.BIOMETRIC_ENROLL");
        } catch {
          // The general Security screen is supported more consistently across
          // Android vendors than OEM-specific biometric enrollment activities.
          await Linking.sendIntent("android.settings.SECURITY_SETTINGS");
        }
      } else {
        await Linking.openURL("app-settings:");
      }
    } catch {
      setSetupStatus(guidance);
      Alert.alert(
        "Biometric method not enrolled",
        guidance,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void openDeviceSettings() },
        ],
      );
    } finally {
      setOpeningSettings(false);
    }
  };

  const checkDeviceSetup = async () => {
    if (checkingSetup) return;

    setCheckingSetup(true);
    setSetupStatus(null);

    try {
      const nextState = await refreshState();

      if (nextState.available) {
        continueAfterEnrollment();
        return;
      }

      setSetupStatus(
        nextState.hardwareAvailable
          ? "No enrolled biometric is visible to Athoo yet. Finish enrollment in phone Security settings, then tap Check Again."
          : "This phone is not exposing supported biometric hardware to Athoo. You can continue using your Athoo password or OTP.",
      );
    } catch {
      setSetupStatus(
        "Athoo could not re-check device authentication right now. Return from phone Settings and try again.",
      );
    } finally {
      setCheckingSetup(false);
    }
  };

  const performDisable = async () => {
    if (busy) return;

    setBusy(true);
    try {
      const result = await configureBiometricLogin(false);
      if (!result.success) {
        Alert.alert("Unable to disable", result.error || "Please try again.");
        return;
      }
      await refreshState();
    } finally {
      setBusy(false);
    }
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

    pendingEnableRef.current = false;
    setPassword("");
    setPasswordModal(true);
  };

  const performEnable = async () => {
    if (busy) return;

    setBusy(true);
    try {
      const result = await configureBiometricLogin(true, password);
      if (!result.success) {
        Alert.alert(
          "Unable to enable device authentication",
          result.error || "Please try again.",
        );
        return;
      }

      setPassword("");
      setPasswordModal(false);
      // configureBiometricLogin has already verified the server preference,
      // remembered session, native biometric prompt and SecureStore values.
      // Do not immediately call refreshState here: this callback still closes
      // over the pre-update user object and previously turned the switch back
      // off before React could publish biometricEnabled=true.
      setAvailable(true);
      setEnabled(true);
      Alert.alert(
        `${label} enabled`,
        "Your remembered Athoo session is now protected by your phone's configured authentication method.",
      );
    } finally {
      setBusy(false);
    }
  };

  const exposedMethods = deviceState?.methodLabels?.length
    ? deviceState.methodLabels.join(" / ")
    : Platform.OS === "ios"
      ? "Face ID / Touch ID"
      : "any biometric exposed by Android";

  const subtitle = available
    ? enabled
      ? `Enabled for ${exposedMethods}`
      : `Supports ${exposedMethods}. Confirm your password to enable.`
    : deviceState?.hardwareAvailable
      ? "Enroll a fingerprint, supported face unlock, iris, Face ID or Touch ID first"
      : "Use your Athoo password or OTP on this device";

  const setupTitle =
    Platform.OS === "ios"
      ? "Set up Face ID or Touch ID"
      : "Set up device biometrics";

  const setupIntro =
    Platform.OS === "ios"
      ? "Athoo needs an enrolled Face ID or Touch ID method before biometric sign-in can be enabled."
      : "Athoo accepts any enrolled fingerprint, face unlock or iris method that Android exposes through its secure biometric prompt.";

  return (
    <>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <Icon
            name={
              deviceState?.type === "face"
                ? "scan-face"
                : deviceState?.type === "iris"
                  ? "eye"
                  : deviceState?.type === "fingerprint"
                    ? "fingerprint"
                    : "shield"
            }
            size={18}
            color={theme.colors.accent}
          />
        </View>

        <Pressable
          style={styles.textColumn}
          onPress={() => requestToggle(!enabled)}
          accessibilityRole="button"
          accessibilityLabel={`${label}. ${subtitle}`}
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
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.accentSoft,
            }}
            thumbColor={enabled ? theme.colors.accent : theme.colors.textMuted}
            accessibilityLabel={`Turn ${label} ${enabled ? "off" : "on"}`}
          />
        )}
      </View>

      <Modal
        visible={setupModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (checkingSetup || openingSettings) return;
          pendingEnableRef.current = false;
          setSetupModal(false);
        }}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (checkingSetup || openingSettings) return;
              pendingEnableRef.current = false;
              setSetupModal(false);
            }}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Icon
                name={Platform.OS === "ios" ? "scan-face" : "shield"}
                size={24}
                color={theme.colors.accent}
              />
            </View>

            <Text style={styles.modalTitle}>{setupTitle}</Text>
            <Text style={styles.modalText}>{setupIntro}</Text>

            <View style={styles.setupSteps}>
              <View style={styles.setupStep}>
                <View style={styles.setupStepIndex}>
                  <Text style={styles.setupStepIndexText}>1</Text>
                </View>
                <Text style={styles.setupStepText}>
                  {Platform.OS === "ios"
                    ? "Open iPhone Settings and enroll Face ID or Touch ID."
                    : "Open Phone Settings > Security or Privacy > Biometrics and enroll a supported method."}
                </Text>
              </View>

              <View style={styles.setupStep}>
                <View style={styles.setupStepIndex}>
                  <Text style={styles.setupStepIndexText}>2</Text>
                </View>
                <Text style={styles.setupStepText}>
                  Return to Athoo. We re-check automatically, or you can tap Check Again.
                </Text>
              </View>
            </View>

            {setupStatus ? (
              <View style={styles.setupStatus}>
                <Icon name="info" size={16} color={theme.colors.accent} />
                <Text style={styles.setupStatusText}>{setupStatus}</Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.settingsButton,
                (openingSettings || checkingSetup) && styles.disabledButton,
              ]}
              disabled={openingSettings || checkingSetup}
              onPress={() => void openDeviceSettings()}
              accessibilityRole="button"
              accessibilityLabel="Open phone security settings"
            >
              {openingSettings ? (
                <ActivityIndicator size="small" color={theme.colors.onBrand} />
              ) : (
                <>
                  <Icon name="settings" size={17} color={theme.colors.onBrand} />
                  <Text style={styles.settingsText}>Open Phone Settings</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.checkButton,
                (openingSettings || checkingSetup) && styles.disabledButton,
              ]}
              disabled={openingSettings || checkingSetup}
              onPress={() => void checkDeviceSetup()}
              accessibilityRole="button"
              accessibilityLabel="Check biometric setup again"
            >
              {checkingSetup ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <>
                  <Icon name="refresh-cw" size={16} color={theme.colors.accent} />
                  <Text style={styles.checkText}>Check Again</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancelLink}
              disabled={openingSettings || checkingSetup}
              onPress={() => {
                pendingEnableRef.current = false;
                setSetupModal(false);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.modalCancelLinkText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !busy && setPasswordModal(false)}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Icon name="shield" size={24} color={theme.colors.accent} />
            </View>

            <Text style={styles.modalTitle}>Enable {label}</Text>
            <Text style={styles.modalText}>
              Confirm your Athoo password, then approve the secure authentication prompt from this phone.
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

            <Text style={styles.passwordHint}>
              Accounts created without a password may leave this blank.
            </Text>

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
    textColumn: {
      flex: 1,
      justifyContent: "center",
    },
    label: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 11,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
    overlay: {
      flex: 1,
      justifyContent: "center",
      padding: 20,
      backgroundColor: "rgba(0,0,0,0.58)",
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
    modalTitle: {
      fontSize: 19,
      fontWeight: "800",
      color: theme.colors.text,
    },
    modalText: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary,
    },
    setupSteps: {
      marginTop: 18,
      gap: 12,
    },
    setupStep: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    setupStepIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    setupStepIndexText: {
      fontSize: 11,
      fontWeight: "800",
      color: theme.colors.accent,
    },
    setupStepText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    setupStatus: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    setupStatusText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    settingsButton: {
      minHeight: 50,
      marginTop: 18,
      borderRadius: 13,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
    },
    settingsText: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.colors.onBrand,
    },
    checkButton: {
      minHeight: 48,
      marginTop: 10,
      borderRadius: 13,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    checkText: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.colors.accent,
    },
    modalCancelLink: {
      alignSelf: "center",
      paddingHorizontal: 18,
      paddingVertical: 12,
      marginTop: 2,
    },
    modalCancelLinkText: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.colors.textSecondary,
    },
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
    passwordHint: {
      marginTop: 7,
      fontSize: 11,
      lineHeight: 15,
      color: theme.colors.textMuted,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 20,
    },
    cancelButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
    },
    cancelText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.textSecondary,
    },
    enableButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
    },
    disabledButton: {
      opacity: 0.65,
    },
    enableText: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.colors.onBrand,
    },
  });
}
