import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { api } from "@/services/api";
import { useFocusEffect } from "expo-router";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  createdAt: string;
};

type Reply = {
  id: string;
  note: string;
  createdAt: string;
  adminName?: string;
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  open: { bg: "#EFF6FF", text: "#2563EB" },
  in_progress: { bg: "#FFF7ED", text: "#C2410C" },
  resolved: { bg: "#F0FDF4", text: "#16A34A" },
  closed: { bg: "#F1F5F9", text: "#64748B" },
};

function statusLabel(s: string) {
  return s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SupportTicketsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadTickets = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.getMySupportTickets();
      setTickets(res.tickets || []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadTickets(); }, [loadTickets]));

  async function openTicket(ticket: Ticket) {
    setSelected(ticket);
    setDetailLoading(true);
    setReplies([]);
    try {
      const res = await api.getSupportTicketDetail(ticket.id);
      setReplies(res.replies || []);
    } catch {
      setReplies([]);
    } finally {
      setDetailLoading(false);
    }
  }

  if (selected) {
    const sc = STATUS_COLOR[selected.status] || STATUS_COLOR.open;
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setSelected(null)}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{selected.subject}</Text>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>{statusLabel(selected.status)}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.bubble}>
            <View style={styles.bubbleHeader}>
              <Icon name="user" size={14} color={Colors.primary} />
              <Text style={styles.bubbleName}>You</Text>
              <Text style={styles.bubbleTime}>{new Date(selected.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={styles.bubbleMsg}>{selected.message}</Text>
          </View>

          {detailLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
          ) : replies.length === 0 ? (
            <View style={styles.noReplies}>
              <Icon name="clock" size={20} color={Colors.textMuted} />
              <Text style={styles.noRepliesText}>Awaiting support team response…</Text>
            </View>
          ) : (
            replies.map((r, i) => (
              <View key={`${r.id}-${i}`} style={[styles.bubble, styles.replyBubble]}>
                <View style={styles.bubbleHeader}>
                  <Icon name="headphones" size={14} color="#059669" />
                  <Text style={[styles.bubbleName, { color: "#059669" }]}>{r.adminName || "Support Team"}</Text>
                  <Text style={styles.bubbleTime}>{new Date(r.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.bubbleMsg}>{r.note}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>My Support Tickets</Text>
          {!loading && <Text style={styles.headerSub}>{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</Text>}
        </View>
        <Pressable style={styles.newBtn} onPress={() => router.push("/(customer)/contact-support" as any)}>
          <Icon name="plus" size={16} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.center}>
          <Icon name="message-circle" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No tickets yet</Text>
          <Text style={styles.emptySub}>Submit a request and it will appear here.</Text>
          <Pressable style={styles.ctaBtn} onPress={() => router.push("/(customer)/contact-support" as any)}>
            <Text style={styles.ctaBtnText}>Contact Support</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTickets(true)} colors={[Colors.primary]} tintColor={Colors.primary} />}
        >
          {tickets.map((t, i) => {
            const sc = STATUS_COLOR[t.status] || STATUS_COLOR.open;
            return (
              <Pressable key={`${t.id}-${i}`} style={styles.card} onPress={() => openTicket(t)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardSubject} numberOfLines={1}>{t.subject}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>{statusLabel(t.status)}</Text>
                  </View>
                </View>
                <Text style={styles.cardMsg} numberOfLines={2}>{t.message}</Text>
                <Text style={styles.cardDate}>{new Date(t.createdAt).toLocaleDateString()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  headerTextWrap: { flex: 1 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  newBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: Colors.text, marginTop: 8 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  ctaBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  ctaBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cardSubject: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  cardMsg: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 8 },
  cardDate: { fontSize: 11, color: Colors.textMuted },
  detailContent: { padding: 16, gap: 12 },
  bubble: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  replyBubble: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  bubbleHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  bubbleName: { fontSize: 13, fontWeight: "700", color: Colors.primary, flex: 1 },
  bubbleTime: { fontSize: 11, color: Colors.textMuted },
  bubbleMsg: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  noReplies: { alignItems: "center", gap: 8, paddingVertical: 24 },
  noRepliesText: { fontSize: 13, color: Colors.textMuted },
});
