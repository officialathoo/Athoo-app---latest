import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { api } from "@/services/api";

type FaqItem = { id?: string; q: string; a: string };

const FAQ_CACHE_KEY = "athoo.admin.faqs.provider.cache.v1";

function FAQItem({ faq, index }: { faq: FaqItem; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable style={[styles.faqItem, open && styles.faqItemOpen]} onPress={() => setOpen(!open)}>
      <View style={styles.faqQuestion}>
        <Text style={styles.faqNum}>{String(index + 1).padStart(2, "0")}</Text>
        <Text style={styles.faqQ}>{faq.q}</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.secondary} />
      </View>
      {open && <Text style={styles.faqA}>{faq.a}</Text>}
    </Pressable>
  );
}

export default function ProviderHelpScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [faqs, setFaqs] = useState<FaqItem[]>([]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(FAQ_CACHE_KEY).then((raw) => {
      if (!active || !raw) return;
      const cached = JSON.parse(raw);
      if (Array.isArray(cached)) setFaqs(cached);
    }).catch(() => {});

    api.getFaqs("provider")
      .then(async (res) => {
        const next = Array.isArray(res.faqs) ? res.faqs.map((f) => ({ id: f.id, q: f.question, a: f.answer })) : [];
        if (!active) return;
        setFaqs(next);
        await AsyncStorage.setItem(FAQ_CACHE_KEY, JSON.stringify(next));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Help & FAQs</Text>
        <Pressable style={styles.chatBtn} onPress={() => router.push("/(provider)/contact-support")}>
          <Icon name="headphones" size={18} color={Colors.secondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroBanner}>
          <Icon name="help-circle" size={32} color={Colors.secondary} />
          <Text style={styles.heroTitle}>Provider Support Centre</Text>
          <Text style={styles.heroSubtitle}>Everything you need to know about using Athoo as a service provider.</Text>
        </View>
        {faqs.map((faq, i) => <FAQItem key={faq.id || i} faq={faq} index={i} />)}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactSubtitle}>Our team is available 9 AM – 9 PM daily.</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={[styles.contactBtn, { flex: 1, backgroundColor: Colors.primary }]} onPress={() => router.push("/(provider)/contact-support")}>
              <Icon name="headphones" size={16} color="#fff" />
              <Text style={styles.contactBtnText}>Contact Support</Text>
            </Pressable>
          </View>
          <Pressable style={styles.myTicketsBtn} onPress={() => router.push("/(provider)/support-tickets" as any)}>
            <Icon name="inbox" size={14} color={Colors.primary} />
            <Text style={styles.myTicketsText}>View my support tickets</Text>
          </Pressable>
        </View>
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
  chatBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.secondary + "15", alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  heroBanner: {
    alignItems: "center", padding: 24, gap: 8,
    backgroundColor: Colors.secondary + "10", borderRadius: 18, marginBottom: 8,
  },
  heroTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  heroSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },
  faqItem: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  faqItemOpen: { borderColor: Colors.secondary + "50" },
  faqQuestion: { flexDirection: "row", alignItems: "center", gap: 10 },
  faqNum: { fontSize: 11, fontWeight: "800", color: Colors.secondary, width: 22 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.text },
  faqA: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginTop: 10, paddingLeft: 32 },
  contactCard: {
    backgroundColor: Colors.secondary + "15", borderRadius: 18, padding: 20,
    alignItems: "center", gap: 8, marginTop: 8,
  },
  contactTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  contactSubtitle: { fontSize: 12, color: Colors.textSecondary },
  contactBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.secondary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 4,
  },
  contactBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  myTicketsBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30", alignSelf: "center" },
  myTicketsText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
});
