import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { radius, spacing } from "@/design/tokens";
import { apiErrorToMessage } from "@/lib/apiError";
import { api } from "@/services/api";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CallRole = "customer" | "provider";

interface CallHistoryScreenProps {
  role: CallRole;
}

interface CallEntry {
  id: string;
  direction: "incoming" | "outgoing";
  otherUserId: string;
  otherUserName: string | null;
  otherUserPublicId?: string | null;
  service?: string | null;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  chatId?: string | null;
}

const CALL_HISTORY_PAGE_SIZE = 50;

function describeCall(call: CallEntry): { label: string; tone: "good" | "bad" | "neutral" } {
  if (call.status === "rejected") return { label: "Declined", tone: "bad" };
  if (call.status === "active" || call.status === "ringing") return { label: "In progress", tone: "neutral" };
  const start = call.startedAt ? new Date(call.startedAt).getTime() : null;
  const end = call.endedAt ? new Date(call.endedAt).getTime() : null;
  if (start && end && end - start >= 15_000) return { label: "Completed", tone: "good" };
  return { label: "Missed", tone: "bad" };
}

function formatDuration(startedAt?: string | null, endedAt?: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  const secs = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return locale.startsWith("ur") ? "ابھی" : "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function CallHistoryScreen({ role }: CallHistoryScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t, isUrdu, translate: tr, textAlign, writingDirection } = useLang();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const localizedText = { textAlign, writingDirection } as const;
  const locale = isUrdu ? "ur-PK" : "en-PK";
  const accent = role === "customer" ? theme.colors.primary : theme.colors.secondary;

  const load = useCallback(async ({ showSpinner = true }: { showSpinner?: boolean } = {}) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const result = await api.getCallHistory(CALL_HISTORY_PAGE_SIZE);
      setCalls(result.calls || []);
    } catch (e) {
      setError(apiErrorToMessage(e, "We couldn't load your call history. Pull down to retry."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openChat = useCallback((call: CallEntry) => {
    if (!call.otherUserId) return;
    const base = role === "customer" ? "/(customer)/chat-room" : "/(provider)/chat-room";
    router.push({
      pathname: base,
      params: {
        ...(call.chatId ? { chatId: call.chatId } : {}),
        otherUserId: call.otherUserId,
        otherUserName: call.otherUserName || "",
      },
    } as any);
  }, [role, router]);

  const renderItem = useCallback(({ item, index }: { item: CallEntry; index: number }) => {
    const info = describeCall(item);
    const outgoing = item.direction === "outgoing";
    const duration = formatDuration(item.startedAt, item.endedAt);
    const statusColor =
      info.tone === "good" ? theme.colors.success
      : info.tone === "bad" ? theme.colors.danger
      : theme.colors.textMuted;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.otherUserName || tr("Unknown")} - ${info.label}`}
        onPress={() => openChat(item)}
        style={({ pressed }) => [
          styles.row,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={[styles.directionBadge, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Icon name={outgoing ? "call-made" : "call-received"} size={16} color={accent} />
        </View>
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, localizedText]} numberOfLines={1}>
            {item.otherUserName || tr("Unknown")}
          </Text>
          <View style={styles.rowMeta}>
            <Icon name={outgoing ? "arrow-forward" : "arrow-back"} size={11} color={statusColor} />
            <Text style={[styles.rowMetaText, { color: statusColor }]}>{tr(info.label)}</Text>
            {duration ? (
              <Text style={[styles.rowMetaText, styles.rowMetaDim]}>
                {" · "}
                {duration}
              </Text>
            ) : null}
            {item.service ? (
              <Text style={[styles.rowMetaText, styles.rowMetaDim]} numberOfLines={1}>
                {" · "}
                {item.service}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={[styles.rowWhen, localizedText]}>{formatWhen(item.createdAt, locale)}</Text>
      </Pressable>
    );
  }, [accent, locale, localizedText, openChat, styles, t, theme, tr]);

  const emptyLabel = error
    ? error
    : loading
      ? tr("Loading…")
      : tr("No calls yet. Calls you make or receive will appear here.");

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, localizedText]}>{tr("Calls")}</Text>
          <View style={[styles.headerMeta, isUrdu && styles.headerMetaRtl]}>
            <Icon name="shield" size={13} color={accent} />
            <Text style={[styles.headerMetaText, localizedText, { color: accent }]}>
              {tr("Secure voice history")}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={calls.length === 0 ? styles.emptyWrap : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ showSpinner: false });
            }}
            tintColor={accent}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Icon name="call-outline" size={34} color={theme.colors.textMuted} />
              <Text style={[styles.emptyText, localizedText]}>{emptyLabel}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerCopy: {
      gap: 4,
    },
    title: {
      fontSize: 26,
      fontWeight: "800",
      color: theme.colors.text,
    },
    headerMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    headerMetaRtl: {
      flexDirection: "row-reverse",
    },
    headerMetaText: {
      fontSize: 12,
      fontWeight: "600",
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    directionBadge: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    rowMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.colors.text,
    },
    rowMeta: {
      flexDirection: "row",
      alignItems: "center",
    },
    rowMetaText: {
      fontSize: 12,
      fontWeight: "500",
    },
    rowMetaDim: {
      color: theme.colors.textMuted,
    },
    rowWhen: {
      fontSize: 12,
      fontWeight: "500",
      color: theme.colors.textMuted,
    },
    emptyWrap: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      justifyContent: "center",
    },
    emptyCard: {
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: theme.colors.surfaceAlt,
    },
    emptyText: {
      textAlign: "center",
      fontSize: 13,
      fontWeight: "500",
      color: theme.colors.textMuted,
      lineHeight: 19,
    },
  });
}
