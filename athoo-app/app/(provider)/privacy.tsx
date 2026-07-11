import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";

const SECTIONS = [
  { icon: "phone-off", title: "Phone Number Privacy", color: Colors.primary, text: "Your phone number is never shared with customers. All communication happens through Athoo's secure in-app chat system only." },
  { icon: "credit-card", title: "CNIC Protection", color: Colors.secondary, text: "Your CNIC and documents are stored securely and used only for identity verification. They are never shared with customers or third parties." },
  { icon: "shield", title: "Profile Verification", color: "#22C55E", text: "Your verified status is shown publicly. However, your personal document details are kept confidential and only used during verification." },
  { icon: "map-pin", title: "Location Privacy", color: "#8B5CF6", text: "Only your general service area (Rawalpindi / Islamabad) is shown. Your live location is only shared with the customer during an active booking." },
  { icon: "lock", title: "Account Security", color: "#F59E0B", text: "Your password is stored securely. We recommend using a unique password and changing it periodically. Enable 2-step verification where possible." },
  { icon: "database", title: "Data Storage", color: Colors.primary, text: "All data is stored locally on your device using secure encrypted storage. No payment data is stored by Athoo." },
];

export default function ProviderPrivacyScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Privacy & Security</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroBanner}>
          <View style={styles.heroIcon}><Icon name="shield" size={28} color={Colors.secondary} /></View>
          <Text style={styles.heroTitle}>Your Privacy is Our Priority</Text>
          <Text style={styles.heroSub}>Athoo protects both providers and customers with strict privacy standards.</Text>
        </View>
        {SECTIONS.map((s, i) => (
          <View key={i} style={styles.sectionCard}>
            <View style={[styles.sectionIcon, { backgroundColor: s.color + "20" }]}>
              <Icon name={s.icon as any} size={20} color={s.color} />
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionText}>{s.text}</Text>
            </View>
          </View>
        ))}
        <Pressable style={styles.changePassBtn} onPress={() => router.push("/(provider)/change-password")}>
          <Icon name="lock" size={16} color={Colors.secondary} />
          <Text style={styles.changePassText}>Change Password</Text>
          <Icon name="chevron-right" size={16} color={Colors.textMuted} />
        </Pressable>
        <Text style={styles.footer}>Last updated: April 2026 • Rawalpindi & Islamabad</Text>
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
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  heroBanner: {
    backgroundColor: Colors.secondary + "12", borderRadius: 18, padding: 20,
    alignItems: "center", gap: 8,
  },
  heroIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.secondary + "20", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  heroSub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },
  sectionCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  sectionBody: { flex: 1, gap: 4 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  sectionText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  changePassBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.secondary + "30",
  },
  changePassText: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.text },
  footer: { textAlign: "center", fontSize: 11, color: Colors.textMuted },
});

