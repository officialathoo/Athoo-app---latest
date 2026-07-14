import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";

type Role = "customer" | "provider";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority?: string;
  createdAt: string;
};

type Reply = {
  id: string;
  note: string;
  createdAt: string;
  adminName?: string;
};

function normalizeStatus(status: string) {
  return String(status || "open").trim().toLowerCase();
}

export function SupportTicketsScreen({ role }: { role: Role }) {
  const { theme } = useTheme();
  const { translate: tr, formatDate, textAlign } = useLang();
  const insets = useSafeAreaInsets();
  const contactRoute = `/${role === "provider" ? "(provider)" : "(customer)"}/contact-support` as any;
  const accent = role === "provider" ? theme.colors.secondary : theme.colors.primary;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const statusStyles = useMemo(() => ({
    open: { bg: theme.colors.infoSoft, color: theme.colors.info },
    in_progress: { bg: theme.colors.warningSoft, color: theme.colors.warning },
    resolved: { bg: theme.colors.successSoft, color: theme.colors.success },
    closed: { bg: theme.colors.surfaceAlt, color: theme.colors.textSecondary },
  }), [theme]);

  const statusLabel = useCallback((value: string) => {
    const normalized = normalizeStatus(value);
    if (normalized === "in_progress") return tr("In progress");
    if (normalized === "resolved") return tr("Resolved");
    if (normalized === "closed") return tr("Closed");
    return tr("Open");
  }, [tr]);

  const loadTickets = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setListError("");
    try {
      const response = await api.getMySupportTickets();
      setTickets(Array.isArray(response.tickets) ? response.tickets : []);
    } catch (caught) {
      setListError(tr(apiErrorToMessage(caught, "We couldn't load your support tickets. Please try again.")));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tr]);

  useFocusEffect(useCallback(() => {
    void loadTickets();
  }, [loadTickets]));

  const loadDetail = useCallback(async (ticket: Ticket) => {
    setSelected(ticket);
    setReplies([]);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await api.getSupportTicketDetail(ticket.id);
      setReplies(Array.isArray(response.replies) ? response.replies : []);
    } catch (caught) {
      setDetailError(tr(apiErrorToMessage(caught, "We couldn't load this conversation. Please try again.")));
    } finally {
      setDetailLoading(false);
    }
  }, [tr]);

  if (selected) {
    const status = normalizeStatus(selected.status);
    const badge = statusStyles[status as keyof typeof statusStyles] || statusStyles.open;
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <ScreenHeader
          title={selected.subject || tr("Support ticket")}
          subtitle={statusLabel(status)}
          onBack={() => setSelected(null)}
          right={
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <AppText variant="caption" style={{ color: badge.color }}>{statusLabel(status)}</AppText>
            </View>
          }
        />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.detailContent, responsiveContent, { paddingBottom: insets.bottom + 36 }]}
        >
          <AppCard elevated={false}>
            <View style={styles.messageHeader}>
              <View style={[styles.avatar, { backgroundColor: theme.colors.infoSoft }]}>
                <Icon name="user" size={17} color={theme.colors.primary} />
              </View>
              <View style={styles.flex}>
                <AppText variant="label">{tr("You")}</AppText>
                <AppText variant="caption" tone="muted">{formatDate(selected.createdAt)}</AppText>
              </View>
            </View>
            <AppText tone="secondary" style={styles.messageBody}>{selected.message}</AppText>
          </AppCard>

          {detailLoading ? (
            <View style={styles.centerBlock} accessibilityLabel={tr("Loading support replies")}>
              <ActivityIndicator color={accent} />
              <AppText variant="caption" tone="secondary">{tr("Loading replies…")}</AppText>
            </View>
          ) : detailError ? (
            <AppCard elevated={false} style={{ backgroundColor: theme.colors.dangerSoft }}>
              <View style={styles.errorRow} accessibilityRole="alert">
                <Icon name="alert-circle" size={20} color={theme.colors.danger} />
                <AppText variant="caption" tone="danger" style={styles.flex}>{detailError}</AppText>
              </View>
              <Button title={tr("Try again")} onPress={() => void loadDetail(selected)} variant="outline" fullWidth style={{ marginTop: 12 }} />
            </AppCard>
          ) : replies.length === 0 ? (
            <AppCard elevated={false} style={{ backgroundColor: theme.colors.surfaceAlt }}>
              <View style={styles.emptyInline}>
                <Icon name="clock" size={24} color={theme.colors.textMuted} />
                <AppText variant="bodyStrong" align="center">{tr("Awaiting support response")}</AppText>
                <AppText variant="caption" tone="secondary" align="center">
                  {tr("We will notify you when the support team replies.")}
                </AppText>
              </View>
            </AppCard>
          ) : (
            replies.map((reply, index) => (
              <AppCard
                key={`${reply.id}-${index}`}
                elevated={false}
                style={{ backgroundColor: theme.colors.successSoft, borderColor: theme.colors.success }}
              >
                <View style={styles.messageHeader}>
                  <View style={[styles.avatar, { backgroundColor: theme.colors.surface }]}>
                    <Icon name="headphones" size={17} color={theme.colors.success} />
                  </View>
                  <View style={styles.flex}>
                    <AppText variant="label" style={{ color: theme.colors.success }}>{reply.adminName || tr("Support team")}</AppText>
                    <AppText variant="caption" tone="muted">{formatDate(reply.createdAt)}</AppText>
                  </View>
                </View>
                <AppText style={styles.messageBody}>{reply.note}</AppText>
              </AppCard>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const countLabel = tr("{{count}} support ticket(s)", { count: tickets.length });

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader
        title={tr("My support tickets")}
        subtitle={!loading ? countLabel : undefined}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("Create a new support ticket")}
            onPress={() => router.push(contactRoute)}
            style={({ pressed }) => [styles.newButton, { backgroundColor: accent }, pressed && { opacity: 0.78 }]}
          >
            <Icon name="plus" size={19} color={theme.colors.white} />
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.fullCenter}>
          <ActivityIndicator size="large" color={accent} />
          <AppText tone="secondary">{tr("Loading support tickets…")}</AppText>
        </View>
      ) : listError && tickets.length === 0 ? (
        <View style={[styles.fullCenter, responsiveContent]}>
          <View style={[styles.largeIcon, { backgroundColor: theme.colors.dangerSoft }]}>
            <Icon name="wifi-off" size={32} color={theme.colors.danger} />
          </View>
          <AppText variant="h2" align="center">{tr("Unable to load tickets")}</AppText>
          <AppText tone="secondary" align="center" style={styles.centerCopy}>{listError}</AppText>
          <Button title={tr("Try again")} onPress={() => void loadTickets()} fullWidth style={styles.actionWidth} />
        </View>
      ) : tickets.length === 0 ? (
        <View style={[styles.fullCenter, responsiveContent]}>
          <View style={[styles.largeIcon, { backgroundColor: theme.colors.infoSoft }]}>
            <Icon name="message-circle" size={34} color={accent} />
          </View>
          <AppText variant="h2" align="center">{tr("No support tickets yet")}</AppText>
          <AppText tone="secondary" align="center" style={styles.centerCopy}>
            {tr("Create a support request and you can track every reply here.")}
          </AppText>
          <Button title={tr("Contact support")} onPress={() => router.push(contactRoute)} fullWidth style={styles.actionWidth} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadTickets(true)} tintColor={accent} colors={[accent]} />}
          contentContainerStyle={[styles.list, responsiveContent, { paddingBottom: insets.bottom + 36 }]}
        >
          {listError ? (
            <View style={[styles.compactError, { backgroundColor: theme.colors.warningSoft }]} accessibilityRole="alert">
              <Icon name="alert-triangle" size={17} color={theme.colors.warning} />
              <AppText variant="caption" style={[styles.flex, { color: theme.colors.warning }]}>{listError}</AppText>
            </View>
          ) : null}

          {tickets.map((ticket, index) => {
            const status = normalizeStatus(ticket.status);
            const badge = statusStyles[status as keyof typeof statusStyles] || statusStyles.open;
            return (
              <AppCard
                key={`${ticket.id}-${index}`}
                onPress={() => void loadDetail(ticket)}
                style={styles.ticketCard}
                testID={`support-ticket-${ticket.id}`}
              >
                <View style={styles.ticketTop}>
                  <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>{ticket.subject}</AppText>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <AppText variant="caption" style={{ color: badge.color }}>{statusLabel(status)}</AppText>
                  </View>
                </View>
                <AppText tone="secondary" numberOfLines={2} style={[styles.ticketMessage, { textAlign }]}>{ticket.message}</AppText>
                <View style={styles.ticketFooter}>
                  <AppText variant="caption" tone="muted">{formatDate(ticket.createdAt)}</AppText>
                  <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
                </View>
              </AppCard>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  newButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  ticketCard: { gap: 8 },
  ticketTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  ticketMessage: { lineHeight: 20 },
  ticketFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusBadge: { minHeight: 28, paddingHorizontal: 10, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailContent: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  messageHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  messageBody: { lineHeight: 21 },
  centerBlock: { alignItems: "center", gap: 10, paddingVertical: 24 },
  emptyInline: { alignItems: "center", gap: 8, paddingVertical: 10 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 28 },
  largeIcon: { width: 82, height: 82, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  centerCopy: { maxWidth: 520, lineHeight: 22 },
  actionWidth: { maxWidth: 420, marginTop: 6 },
  compactError: { borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
});
