import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";

const FEATURES = [
  { icon: "shield", title: "Privacy First", desc: "Phone numbers never shared. All communication via in-app chat." },
  { icon: "trending-down", title: "Price Negotiation", desc: "InDrive-style offer system — you set the price." },
  { icon: "map-pin", title: "Local Focus", desc: "Exclusively serving Rawalpindi & Islamabad." },
  { icon: "check-circle", title: "Verified Providers", desc: "CNIC + police verification for all workers." },
  { icon: "clock", title: "Real-time Tracking", desc: "OTP-based arrival & completion verification." },
  { icon: "star", title: "Transparent Ratings", desc: "Honest reviews from real customers only." },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>About Athoo</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AnimatedCard delay={60}>
          <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.heroBanner}>
            <Image source={require("../../assets/images/logo.png")} style={{ width: 120, height: 48 }} resizeMode="contain" />
            <Text style={styles.heroTagline}>Pakistan's Trusted Home Services Platform</Text>
            <Text style={styles.heroVersion}>Version 1.0 · Rawalpindi & Islamabad</Text>
          </LinearGradient>
        </AnimatedCard>

        <AnimatedCard delay={120}>
          <View style={styles.missionCard}>
            <Text style={styles.missionTitle}>Our Mission</Text>
            <Text style={styles.missionText}>
              Athoo connects skilled local professionals with homeowners across Rawalpindi and Islamabad.
              We believe everyone deserves access to trustworthy, affordable home services — with full privacy protection and transparent pricing.
            </Text>
          </View>
        </AnimatedCard>

        <Text style={styles.sectionTitle}>Key Features</Text>
        {FEATURES.map((f, i) => (
          <AnimatedCard key={i} delay={180 + i * 50}>
            <View style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Icon name={f.icon as any} size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          </AnimatedCard>
        ))}

        <AnimatedCard delay={500}>
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Contact & Support</Text>
            {[
              { icon: "phone", label: "WhatsApp", val: "+92 339 0051068", action: () => Linking.openURL("https://wa.me/923390051068") },
              { icon: "instagram", label: "Instagram", val: "@athoo_services", action: () => Linking.openURL("https://instagram.com/athoo_services") },
              { icon: "facebook", label: "Facebook", val: "athoo.services", action: () => Linking.openURL("https://facebook.com/athoo.services") },
            ].map((c, i) => (
              <Pressable key={i} style={styles.contactRow} onPress={c.action}>
                <Icon name={c.icon as any} size={16} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>{c.label}</Text>
                  <Text style={styles.contactVal}>{c.val}</Text>
                </View>
                <Icon name="external-link" size={14} color={Colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </AnimatedCard>

        <Text style={styles.legal}>
          © 2026 Athoo. All rights reserved.{"\n"}
          Made with ❤️ in Pakistan
        </Text>
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
  content: { padding: 20, gap: 16, paddingBottom: 80 },
  heroBanner: { borderRadius: 22, padding: 28, alignItems: "center", gap: 8 },
  heroLogo: { fontSize: 36, fontWeight: "900", color: "#fff" },
  heroTagline: { fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center", fontWeight: "600" },
  heroVersion: { fontSize: 11, color: "rgba(255,255,255,0.6)" },
  missionCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 18, gap: 8 },
  missionTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  missionText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text, paddingLeft: 2 },
  featureRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
  },
  featureIcon: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  featureTitle: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 2 },
  featureDesc: { fontSize: 12, color: Colors.textSecondary },
  contactCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 4, overflow: "hidden" },
  contactTitle: { fontSize: 15, fontWeight: "800", color: Colors.text, padding: 14, paddingBottom: 8 },
  contactRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  contactLabel: { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  contactVal: { fontSize: 13, fontWeight: "700", color: Colors.text },
  legal: { textAlign: "center", fontSize: 11, color: Colors.textMuted, lineHeight: 18 },
});

