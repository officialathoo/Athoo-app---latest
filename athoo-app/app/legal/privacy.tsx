import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";

const SECTIONS = [
  {
    title: "1. What We Collect",
    body: "We collect: (a) account data — name, phone, email, password hash, CNIC details for providers; (b) usage data — bookings, chats, calls, transactions; (c) device data — push token, app version, OS; (d) location — only with your permission, used for nearby provider matching and live job tracking.",
  },
  {
    title: "2. How We Use Your Data",
    body: "To create and manage your account, fulfil bookings, settle payments and commissions, send transactional notifications, prevent fraud, comply with the law, and improve the service.",
  },
  {
    title: "3. Sharing",
    body: "We do not sell your personal data. We share the minimum information needed with the counterparty of a booking (e.g. first name and approximate location), and with vetted processors for hosting, push notifications, SMS/WhatsApp OTP, and email. Phone numbers are never exposed to the other party — chat happens in-app.",
  },
  {
    title: "4. Location Data",
    body: "Foreground location is used to find nearby providers and display your address. Background/always-on location is used only during an active job for live tracking and is paused when the job ends.",
  },
  {
    title: "5. Notifications",
    body: "Push notifications are used for booking updates, chat messages, broadcast alerts, and reminders. You can disable them at any time in your device Settings.",
  },
  {
    title: "6. Photos & Camera",
    body: "Photos are uploaded for CNIC verification, profile pictures, and evidence on refund/complaint requests. Photos are stored privately and only retrieved with a signed, authenticated URL.",
  },
  {
    title: "7. Security",
    body: "Passwords are hashed with bcrypt, sessions use signed JWTs, and OTPs are generated with a CSPRNG. Files are served behind authentication.",
  },
  {
    title: "8. Data Retention",
    body: "We keep account data while your account is active and for a reasonable period afterwards for legal, fraud-prevention and accounting reasons. You can request deletion from Privacy & Security inside the app.",
  },
  {
    title: "9. Your Rights",
    body: "You can access, update, export or delete your data via the Profile and Privacy & Security screens, or by contacting support. Deletion is processed within a reasonable window.",
  },
  {
    title: "10. Changes",
    body: `We may update this Privacy Policy. The current version (${LEGAL_VERSION}) applies to your account until you accept a newer version.`,
  },
  {
    title: "11. Contact",
    body: "For privacy questions please contact support via Help & Support inside the app.",
  },
];

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.version}>Version {LEGAL_VERSION}</Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.card}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  content: { padding: 20, gap: 12 },
  version: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginBottom: 4 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  sectionBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
});
