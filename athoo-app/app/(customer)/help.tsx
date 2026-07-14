import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { api } from "@/services/api";

type Faq = { id?: string; q: string; a: string };

const FAQ_CACHE_KEY = "athoo.admin.faqs.customer.cache.v1";

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [expanded, setExpanded] = useState<number | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(FAQ_CACHE_KEY).then((raw) => {
      if (!active || !raw) return;
      const cached = JSON.parse(raw);
      if (Array.isArray(cached)) setFaqs(cached);
    }).catch(() => {});

    api.getFaqs("customer")
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
        <Text style={styles.headerTitle}>Help & FAQs</Text>
        <Pressable style={styles.chatBtn} onPress={() => router.push("/(customer)/contact-support")}>
          <Icon name="headphones" size={18} color={Colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        <AnimatedCard delay={60}>
          <View style={styles.heroBanner}>
            <Icon name="help-circle" size={32} color={Colors.primary} />
            <Text style={styles.heroTitle}>How can we help?</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[styles.liveChatBtn, { backgroundColor: Colors.secondary ?? "#F97316" }]} onPress={() => router.push("/(customer)/contact-support")}>
                <Icon name="headphones" size={15} color="#fff" />
                <Text style={styles.liveChatText}>Contact Support</Text>
              </Pressable>
            </View>
            <Pressable style={styles.myTicketsBtn} onPress={() => router.push("/(customer)/support-tickets" as any)}>
              <Icon name="inbox" size={14} color={Colors.primary} />
              <Text style={styles.myTicketsText}>View my support tickets</Text>
            </Pressable>
          </View>
        </AnimatedCard>

        <Text style={styles.sectionLabel}>Frequently Asked Questions</Text>

        {faqs.map((faq, i) => (
          <AnimatedCard key={faq.id || i} delay={120 + i * 40}>
            <Pressable
              style={[styles.faqCard, expanded === i && styles.faqCardOpen]}
              onPress={() => setExpanded(expanded === i ? null : i)}
            >
              <View style={styles.faqQuestion}>
                <Text style={styles.faqQ}>{faq.q}</Text>
                <Icon name={expanded === i ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
              </View>
              {expanded === i && (
                <Text style={styles.faqA}>{faq.a}</Text>
              )}
            </Pressable>
          </AnimatedCard>
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
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.text },
  chatBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 12, paddingBottom: 80 },
  heroBanner: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 22, alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: Colors.primary + "20",
  },
  heroTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  liveChatBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
  },
  liveChatText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  myTicketsBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30" },
  myTicketsText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, paddingLeft: 2 },
  faqCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 0,
  },
  faqCardOpen: { borderColor: Colors.primary + "40" },
  faqQuestion: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text },
  faqA: { fontSize: 13, color: Colors.textSecondary, lineHeight: 21, marginTop: 10 },
});
