import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PrivateImage } from "@/services/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLang } from "@/context/LanguageContext";
import { api } from "@/services/api";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString();
}

export default function ChatScreen() {
  const { user } = useAuth();
  const { getMyChats, loadingChats, deleteChat: contextDeleteChat } = useChat();
  const { isUrdu } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [profiles, setProfiles] = useState<Record<string, { profileImage?: string | null; profileColor?: string }>>({});

  const myChats = user ? getMyChats(user.id) : [];

  const deleteChat = async (chatId: string, otherName: string) => {
    Alert.alert(
      "Delete Chat",
      `Are you sure you want to delete your chat with ${otherName}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await contextDeleteChat(chatId);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              Alert.alert("Error", message || "Failed to delete chat. Please try again.");
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!myChats.length) return;
    const ids = [...new Set(myChats.map((c) => {
      const isP1 = user?.id === c.participant1Id;
      return isP1 ? c.participant2Id : c.participant1Id;
    }).filter(Boolean))] as string[];
    ids.forEach((id) => {
      if (profiles[id]) return;
      api.getUser(id).then((res: any) => {
        setProfiles((prev) => ({ ...prev, [id]: res.user }));
      }).catch(() => {});
    });
  }, [myChats.length]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{isUrdu ? "پیغامات" : "Messages"}</Text>
        <Pressable
          style={styles.composeBtn}
          onPress={() => router.push("/(customer)/(tabs)/search" as any)}
        >
          <Icon name="edit" size={18} color={Colors.primary} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}>
        {loadingChats ? (
          [0, 1, 2].map((i) => (
            <View key={i} style={[styles.chatItem, { gap: 14 }]}>
              <View style={[styles.avatar, { backgroundColor: Colors.border }]} />
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ height: 13, width: "55%", backgroundColor: Colors.border, borderRadius: 6 }} />
                <View style={{ height: 11, width: "80%", backgroundColor: Colors.surface, borderRadius: 6 }} />
              </View>
            </View>
          ))
        ) : myChats.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="message-circle" size={32} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{isUrdu ? "ابھی کوئی پیغام نہیں" : "No messages yet"}</Text>
            <Text style={styles.emptySubtitle}>
              {isUrdu ? "سروس بک کریں اور فراہم کنندہ سے بات کریں" : "Book a service to start chatting with providers"}
            </Text>
          </View>
        ) : (
          myChats.map((chat, i) => {
            const isP1 = user?.id === chat.participant1Id;
            const otherId = isP1 ? chat.participant2Id : chat.participant1Id;
            const otherName = isP1 ? (chat.participant2Name || "Provider") : (chat.participant1Name || "Provider");
            const initials = otherName
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            const otherProfile = otherId ? profiles[otherId] : null;

            return (
              <Pressable
                key={`${chat.id}-${i}`}
                style={({ pressed }) => [styles.chatItem, pressed && styles.pressed]}
                onPress={() =>
                  router.push({
                    pathname: "/(customer)/chat-room",
                    params: {
                      chatId: chat.id,
                      otherUserId: otherId,
                      otherUserName: otherName,
                      otherUserImage: otherProfile?.profileImage || undefined,
                      otherUserColor: otherProfile?.profileColor || undefined,
                    },
                  })
                }
                onLongPress={() => deleteChat(chat.id, otherName)}
              >
                {otherProfile?.profileImage ? (
                  <PrivateImage objectPath={otherProfile.profileImage} style={[styles.avatar, { borderRadius: 24 }]} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: otherProfile?.profileColor || Colors.primary }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                )}
                <View style={styles.chatContent}>
                  <View style={styles.chatHeader}>
                    <Text style={styles.chatName}>{otherName}</Text>
                    {chat.lastMessageAt && (
                      <Text style={styles.chatTime}>
                        {formatTime(chat.lastMessageAt)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.chatFooter}>
                    <Text style={styles.lastMessage} numberOfLines={1}>
                      {chat.lastMessage || "No messages yet"}
                    </Text>
                  </View>
                  {chat.service && (
                    <Text style={styles.serviceTag}>
                      {chat.service}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: "800", color: Colors.text },
  composeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pressed: { backgroundColor: Colors.background },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  chatContent: { flex: 1 },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  chatName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  chatTime: { fontSize: 11, color: Colors.textMuted },
  chatFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastMessage: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  unreadBadge: {
    backgroundColor: Colors.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  unreadText: { fontSize: 10, fontWeight: "700", color: Colors.white },
  serviceTag: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: "600",
    marginTop: 3,
  },
  empty: { alignItems: "center", paddingVertical: 80, gap: 10 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});

