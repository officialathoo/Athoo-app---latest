import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { api } from "@/services/api";
import { PrivateImage } from "@/services/storage";
import { router } from "expo-router";
import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiErrorToMessage } from "@/lib/apiError";

function formatTime(iso: string, nowLabel: string, locale: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return nowLabel;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export default function ChatScreen() {
  const { user } = useAuth();
  const { getMyChats, loadingChats, deleteChat: contextDeleteChat } = useChat();
  const { t, isUrdu, translate: tr, textAlign, writingDirection } = useLang();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [profiles, setProfiles] = useState<Record<string, { profileImage?: string | null; profileColor?: string }>>({});
  const requestedProfileIds = useRef(new Set<string>());

  const myChats = user ? getMyChats(user.id) : [];
  const localizedText = { textAlign, writingDirection } as const;
  const locale = isUrdu ? "ur-PK" : "en-PK";

  const deleteChat = async (chatId: string, otherName: string) => {
    Alert.alert(
      tr("Delete Chat"),
      tr("Are you sure you want to delete your chat with {{name}}? This action cannot be undone.", { name: otherName }),
      [
        { text: t.cancel, style: "cancel" },
        {
          text: tr("Delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await contextDeleteChat(chatId);
            } catch (error) {
              const message = apiErrorToMessage(error, "We couldn't load your conversations. Please try again.");
              Alert.alert(tr("Error"), message || tr("Failed to delete chat. Please try again."));
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!myChats.length) return;
    const ids = [...new Set(myChats.map((chat) => {
      const isParticipantOne = user?.id === chat.participant1Id;
      return isParticipantOne ? chat.participant2Id : chat.participant1Id;
    }).filter(Boolean))] as string[];

    ids.forEach((id) => {
      if (profiles[id] || requestedProfileIds.current.has(id)) return;
      requestedProfileIds.current.add(id);
      api.getUser(id)
        .then((response: any) => setProfiles((current) => ({ ...current, [id]: response.user })))
        .catch(() => { requestedProfileIds.current.delete(id); });
    });
  }, [myChats, profiles, user?.id]);

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.title, localizedText, { color: theme.colors.text }]}>{tr("Messages")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Find a provider to message")}
          style={({ pressed }) => [
            styles.composeBtn,
            { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.75 : 1 },
          ]}
          onPress={() => router.push("/(customer)/(tabs)/search" as any)}
        >
          <Icon name="edit" size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {loadingChats ? (
          [0, 1, 2].map((index) => (
            <View
              key={index}
              style={[styles.chatItem, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}
            >
              <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]} />
              <View style={styles.skeletonContent}>
                <View style={[styles.skeletonName, { backgroundColor: theme.colors.border }]} />
                <View style={[styles.skeletonMessage, { backgroundColor: theme.colors.surfaceAlt }]} />
              </View>
            </View>
          ))
        ) : myChats.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Icon name="message-circle" size={32} color={theme.colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, localizedText, { color: theme.colors.text }]}>{tr("No messages yet")}</Text>
            <Text style={[styles.emptySubtitle, localizedText, { color: theme.colors.textSecondary }]}>
              {tr("Book a service to start chatting with providers")}
            </Text>
          </View>
        ) : (
          myChats.map((chat, index) => {
            const isParticipantOne = user?.id === chat.participant1Id;
            const otherId = isParticipantOne ? chat.participant2Id : chat.participant1Id;
            const otherName = isParticipantOne
              ? (chat.participant2Name || t.provider)
              : (chat.participant1Name || t.provider);
            const initials = otherName
              .split(" ")
              .map((name: string) => name[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            const otherProfile = otherId ? profiles[otherId] : null;

            return (
              <Pressable
                key={`${chat.id}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={tr("Open chat with {{name}}", { name: otherName })}
                style={({ pressed }) => [
                  styles.chatItem,
                  {
                    backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
                    borderBottomColor: theme.colors.border,
                  },
                ]}
                onPress={() => router.push({
                  pathname: "/(customer)/chat-room",
                  params: {
                    chatId: chat.id,
                    otherUserId: otherId,
                    otherUserName: otherName,
                    otherUserImage: otherProfile?.profileImage || undefined,
                    otherUserColor: otherProfile?.profileColor || undefined,
                  },
                })}
                onLongPress={() => deleteChat(chat.id, otherName)}
              >
                {otherProfile?.profileImage ? (
                  <PrivateImage objectPath={otherProfile.profileImage} style={styles.avatarImage} />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: otherProfile?.profileColor || theme.colors.primary,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                )}
                <View style={styles.chatContent}>
                  <View style={[styles.chatHeader, { flexDirection: isUrdu ? "row-reverse" : "row" }]}>
                    <Text style={[styles.chatName, localizedText, { color: theme.colors.text }]} numberOfLines={1}>
                      {otherName}
                    </Text>
                    {chat.lastMessageAt ? (
                      <Text style={[styles.chatTime, { color: theme.colors.textMuted }]}>
                        {formatTime(chat.lastMessageAt, tr("now"), locale)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.lastMessage, localizedText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {chat.lastMessage || tr("No messages yet")}
                  </Text>
                  {chat.service ? (
                    <Text style={[styles.serviceTag, localizedText, { color: theme.colors.primary }]} numberOfLines={1}>
                      {chat.service}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: "800" },
  composeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 100 },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  chatContent: { flex: 1, minWidth: 0 },
  chatHeader: { alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 },
  chatName: { flex: 1, fontSize: 15, fontWeight: "700" },
  chatTime: { fontSize: 11 },
  lastMessage: { fontSize: 13 },
  serviceTag: { fontSize: 11, fontWeight: "600", marginTop: 3 },
  skeletonContent: { flex: 1, gap: 8 },
  skeletonName: { height: 13, width: "55%", borderRadius: 6 },
  skeletonMessage: { height: 11, width: "80%", borderRadius: 6 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 10 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptySubtitle: { fontSize: 14, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
});
