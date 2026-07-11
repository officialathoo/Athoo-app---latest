import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React from "react";
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";

export default function ProviderAboutScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>About Athoo</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logoCard}>
          <View style={styles.logoBox}>
            <Image source={require("../../assets/images/logo.png")} style={{ width: 120, height: 48, marginBottom: 6 }} resizeMode="contain" />
            <Text style={styles.logoSub}>Home Services Marketplace</Text>
          </View>
          <Text style={styles.tagline}>Connecting Rawalpindi & Islamabad</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Our Mission</Text>
          <Text style={styles.cardText}>Athoo connects skilled service professionals with customers in Rawalpindi and Islamabad. We provide a transparent, safe, and fair platform for both providers and customers to connect and transact with confidence.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Provider Promise</Text>
          {["Fair pay with transparent billing", "Privacy protection for all users", "CNIC verification for trust", "In-app chat only — no number sharing", "Prompt support 7 days a week"].map((item, i) => (
            <View key={i} style={styles.promiseRow}>
              <View style={styles.promiseIcon}><Icon name="check" size={14} color={Colors.secondary} /></View>
              <Text style={styles.promiseText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect With Us</Text>
          <Pressable style={styles.contactRow} onPress={() => Linking.openURL("https://wa.me/923390051068")}>
            <Icon name="message-circle" size={18} color="#25D366" />
            <Text style={styles.contactText}>WhatsApp: +92 339 0051068</Text>
          </Pressable>
          <Pressable style={styles.contactRow} onPress={() => Linking.openURL("https://instagram.com/athoo_services")}>
            <Icon name="instagram" size={18} color="#E1306C" />
            <Text style={styles.contactText}>@athoo_services</Text>
          </Pressable>
          <Pressable style={styles.contactRow} onPress={() => Linking.openURL("https://facebook.com/athoo.services")}>
            <Icon name="facebook" size={18} color="#1877F2" />
            <Text style={styles.contactText}>athoo.services</Text>
          </Pressable>
        </View>
        <Text style={styles.version}>Athoo Provider v1.0.0 • © 2026 Athoo Services</Text>
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
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  logoCard: {
    backgroundColor: Colors.secondary + "15", borderRadius: 18, padding: 28,
    alignItems: "center", gap: 8,
  },
  logoBox: { alignItems: "center", gap: 4 },
  logoText: { fontSize: 36, fontWeight: "900", color: Colors.secondary },
  logoSub: { fontSize: 14, color: Colors.textSecondary, fontWeight: "600" },
  tagline: { fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  card: { backgroundColor: Colors.card, borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 15, fontWeight: "800", color: Colors.text, marginBottom: 2 },
  cardText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  promiseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  promiseIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.secondary + "20", alignItems: "center", justifyContent: "center" },
  promiseText: { fontSize: 13, color: Colors.text, flex: 1 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  contactText: { fontSize: 14, color: Colors.text, fontWeight: "500" },
  version: { textAlign: "center", fontSize: 12, color: Colors.textMuted },
});

