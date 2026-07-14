import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { LegalAcceptanceCheckbox, LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";
import { apiErrorToMessage } from "@/lib/apiError";

/**
 * Blocking modal shown at app launch when the signed-in user's `legalVersion`
 * is missing or older than the constant `LEGAL_VERSION`. Acceptance writes the
 * new version + timestamps via POST /api/me/legal-accept; decline logs out.
 *
 * Mounted globally in app/_layout.tsx so it covers every authenticated route.
 */
export function LegalConsentGate() {
  const { user, acceptCurrentLegal, logout } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  // user.legalVersion null/undefined means legacy account; force re-consent.
  if (user.legalVersion && user.legalVersion === LEGAL_VERSION) return null;

  const onAccept = async () => {
    if (!accepted || busy) return;
    setBusy(true);
    setError(null);
    const res = await acceptCurrentLegal();
    setBusy(false);
    if (!res.success) setError(apiErrorToMessage(res.error, "Could not save your acceptance. Please try again."));
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Feather name="file-text" size={22} color={Colors.primary} />
          </View>
          <Text style={styles.title}>We've updated our Terms</Text>
          <Text style={styles.body}>
            To continue using ATHOO, please review and accept our updated Terms of Service and Privacy Policy (version {LEGAL_VERSION}). Tap the links below to read the full text.
          </Text>

          <ScrollView style={styles.reasonBox} contentContainerStyle={{ padding: 12 }}>
            <Text style={styles.reasonText}>
              • We've clarified how we handle location data for live job tracking.{"\n"}
              • We've added a section on chat content and dispute resolution.{"\n"}
              • Cancellation and refund timelines are now spelled out.{"\n"}
              {"\n"}
              You can read the full updated documents from the links below.
            </Text>
          </ScrollView>

          <View style={{ marginTop: 4 }}>
            <LegalAcceptanceCheckbox value={accepted} onChange={setAccepted} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <Pressable
              onPress={() => logout()}
              style={[styles.btn, styles.btnGhost]}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Decline and sign out"
            >
              <Text style={styles.btnGhostText}>Decline & sign out</Text>
            </Pressable>
            <Pressable
              onPress={onAccept}
              style={[styles.btn, styles.btnPrimary, (!accepted || busy) && styles.btnDisabled]}
              disabled={!accepted || busy}
              accessibilityRole="button"
              accessibilityLabel="Accept the updated Terms"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Accept & continue</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 20, justifyContent: "center" },
  card: { backgroundColor: Colors.white, borderRadius: 20, padding: 22, gap: 12, maxHeight: "90%" },
  iconBox: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Colors.primary + "12",
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  body: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  reasonBox: {
    maxHeight: 160,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reasonText: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  error: { fontSize: 12, color: Colors.error, fontWeight: "600" },
  row: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  btnGhostText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
});
