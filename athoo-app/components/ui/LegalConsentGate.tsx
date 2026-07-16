import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { LegalAcceptanceCheckbox, LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";
import { apiErrorToMessage } from "@/lib/apiError";

/** Blocking legal re-consent modal mounted at the application root. */
export function LegalConsentGate() {
  const { user, acceptCurrentLegal, logout } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  if (user.legalVersion === LEGAL_VERSION) return null;

  const onAccept = async () => {
    if (!accepted || busy) return;
    setBusy(true);
    setError(null);
    const result = await acceptCurrentLegal();
    setBusy(false);
    if (!result.success) {
      setError(apiErrorToMessage(result.error, "Could not save your acceptance. Please try again."));
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => undefined} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconBox}>
            <Feather name="file-text" size={22} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>We&apos;ve updated our Terms</Text>
          <Text style={styles.body}>
            To continue using Athoo, please review and accept our updated Terms of Service and Privacy Policy
            {` (version ${LEGAL_VERSION}).`}
          </Text>

          <ScrollView style={styles.reasonBox} contentContainerStyle={styles.reasonContent}>
            <Text style={styles.reasonText}>
              • We&apos;ve clarified how location data is used for live job tracking.{"\n"}
              • We&apos;ve added details about chat content and dispute resolution.{"\n"}
              • Cancellation and refund timelines are now explained more clearly.{"\n\n"}
              Read the complete documents using the links below.
            </Text>
          </ScrollView>

          <LegalAcceptanceCheckbox value={accepted} onChange={setAccepted} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <Pressable
              onPress={() => void logout()}
              style={({ pressed }) => [styles.button, styles.ghostButton, pressed && styles.pressed]}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Decline and sign out"
            >
              <Text style={styles.ghostButtonText}>Decline & sign out</Text>
            </Pressable>
            <Pressable
              onPress={() => void onAccept()}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                (!accepted || busy) && styles.disabled,
                pressed && accepted && !busy && styles.pressed,
              ]}
              disabled={!accepted || busy}
              accessibilityRole="button"
              accessibilityLabel="Accept the updated Terms"
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Accept & continue</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.colors.overlay, padding: 20, justifyContent: "center" },
    card: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 20,
      padding: 22,
      gap: 12,
      maxHeight: "90%",
      ...theme.shadows.lg,
    },
    iconBox: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: theme.colors.infoSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
    body: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },
    reasonBox: {
      maxHeight: 160,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    reasonContent: { padding: 12 },
    reasonText: { fontSize: 13, color: theme.colors.text, lineHeight: 19 },
    error: { fontSize: 12, color: theme.colors.danger, fontWeight: "600" },
    row: { flexDirection: "row", gap: 10, marginTop: 6 },
    button: { flex: 1, minHeight: 46, paddingHorizontal: 10, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    primaryButton: { backgroundColor: theme.colors.primary },
    primaryButtonText: { color: theme.colors.white, fontWeight: "700", fontSize: 14, textAlign: "center" },
    ghostButton: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
    ghostButtonText: { color: theme.colors.textSecondary, fontWeight: "700", fontSize: 13, textAlign: "center" },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.78 },
  });
}
