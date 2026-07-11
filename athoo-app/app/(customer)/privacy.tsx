import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

const PRIVACY_ITEMS = [
  { icon: "phone-off", title: "Phone Number Hidden", desc: "Your phone number is never visible to providers. All contact happens via secure in-app chat only.", color: Colors.success },
  { icon: "lock", title: "End-to-End Chat", desc: "All chat messages between you and providers are encrypted and stored securely.", color: Colors.primary },
  { icon: "eye-off", title: "No Data Selling", desc: "We never sell, share, or rent your personal information to any third party.", color: "#8B5CF6" },
  { icon: "shield", title: "Provider Verification", desc: "All providers are CNIC and police verified before being listed on the platform.", color: Colors.secondary },
  { icon: "trash-2", title: "Data Deletion", desc: "You can request full deletion of your account and data at any time.", color: Colors.error },
];

export default function PrivacyScreen() {
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteMe();
              await logout();
            } catch {
              Alert.alert("Error", "Could not delete account. Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        <AnimatedCard delay={60}>
          <View style={styles.heroBanner}>
            <Icon name="shield" size={40} color={Colors.primary} />
            <Text style={styles.heroTitle}>Your Privacy is Our Priority</Text>
            <Text style={styles.heroText}>
              Athoo is built with a privacy-first approach. Here's exactly how we protect your data.
            </Text>
          </View>
        </AnimatedCard>

        {PRIVACY_ITEMS.map((item, i) => (
          <AnimatedCard key={i} delay={120 + i * 60}>
            <View style={styles.privacyCard}>
              <View style={[styles.iconBox, { backgroundColor: item.color + "15" }]}>
                <Icon name={item.icon as any} size={22} color={item.color} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.privacyTitle}>{item.title}</Text>
                <Text style={styles.privacyDesc}>{item.desc}</Text>
              </View>
            </View>
          </AnimatedCard>
        ))}

        <AnimatedCard delay={500}>
          <Pressable style={styles.deleteBtn} onPress={handleDeleteAccount}>
            <Icon name="trash-2" size={16} color={Colors.error} />
            <Text style={styles.deleteBtnText}>Request Account Deletion</Text>
          </Pressable>
        </AnimatedCard>
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
  content: { padding: 20, gap: 14, paddingBottom: 80 },
  heroBanner: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 24, alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: Colors.primary + "20",
  },
  heroTitle: { fontSize: 17, fontWeight: "800", color: Colors.text, textAlign: "center" },
  heroText: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  privacyCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
  },
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  privacyTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  privacyDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 19 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: Colors.error + "40",
    borderRadius: 14, paddingVertical: 14, backgroundColor: Colors.error + "08",
  },
  deleteBtnText: { fontSize: 14, fontWeight: "700", color: Colors.error },
});

