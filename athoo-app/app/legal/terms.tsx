import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: "By creating an account or using ATHOO you agree to these Terms of Service. If you do not agree, please do not use the platform.",
  },
  {
    title: "2. Eligibility",
    body: "You must be at least 18 years old and resident in Pakistan to use ATHOO. Service providers must additionally pass identity verification (CNIC) before being listed.",
  },
  {
    title: "3. Marketplace Role",
    body: "ATHOO is a marketplace that connects customers with independent service providers. ATHOO does not employ providers and is not party to the service agreement between a customer and a provider.",
  },
  {
    title: "4. Bookings, Pricing & Payments",
    body: "Visit charges and service charges are shown in PKR before you confirm a booking. Hourly-rate jobs are billed based on the actual elapsed time recorded by the provider in-app. Customers are responsible for paying the provider the agreed amount upon completion.",
  },
  {
    title: "5. Cancellations & Refunds",
    body: "Cancellation windows are configured per the platform settings shown in-app. Refund requests can be submitted from the booking detail screen and will be reviewed by ATHOO support.",
  },
  {
    title: "6. Conduct",
    body: "You must not abuse, harass, defraud, or impersonate any other user. Phone numbers and personal contact details should never be exchanged outside the in-app chat.",
  },
  {
    title: "7. Provider Commission",
    body: "Providers agree that ATHOO deducts a percentage commission on every completed job. Commission balances must be cleared periodically via the in-app pay-commission flow.",
  },
  {
    title: "8. Account Suspension",
    body: "ATHOO may suspend or block any account that violates these Terms, breaches the law, or is reported for fraud or abuse. Affected users may contact support to appeal.",
  },
  {
    title: "9. Limitation of Liability",
    body: "ATHOO is provided on an \"as is\" basis. To the maximum extent permitted by law, ATHOO and its affiliates are not liable for any indirect, incidental, or consequential loss arising from use of the platform.",
  },
  {
    title: "10. Changes",
    body: `These Terms may be updated from time to time. The current version (${LEGAL_VERSION}) is the binding version on your account until you accept a newer version.`,
  },
  {
    title: "11. Contact",
    body: "For questions about these Terms please contact support via the Help & Support screen inside the app.",
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Terms of Service</Text>
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
