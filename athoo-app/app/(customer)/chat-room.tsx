import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState , useMemo} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PrivateImage } from "@/services/storage";
import { api } from "@/services/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { useChat, Message } from "@/context/ChatContext";
import { useNotifications } from "@/context/NotificationContext";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatRoomScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { chatId, otherUserId, otherUserName, otherUserImage, otherUserColor } = useLocalSearchParams<{
    chatId: string;
    otherUserId: string;
    otherUserName: string;
    otherUserImage?: string;
    otherUserColor?: string;
  }>();
  const { user } = useAuth();
  const { chats, messages, sendMessage, markAsRead, setActiveChatId, loadingMessages } = useChat();
  const { startOutgoingCall } = useCall();
  const { notifications, markRead } = useNotifications();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [otherProfile, setOtherProfile] = useState<{ profileImage?: string | null; profileColor?: string } | null>(
    (otherUserImage || otherUserColor)
      ? { profileImage: otherUserImage || null, profileColor: otherUserColor || undefined }
      : null
  );
  const flatRef = useRef<FlatList>(null);

  const chatMessages: Message[] = messages[chatId || ""] || [];
  const activeChat = chats.find((item) => item.id === chatId);
  const resolvedOtherUserId =
    otherUserId ||
    (user && activeChat
      ? activeChat.participant1Id === user.id
        ? activeChat.participant2Id
        : activeChat.participant1Id
      : "");
  const resolvedOtherUserName =
    otherUserName ||
    (user && activeChat
      ? activeChat.participant1Id === user.id
        ? activeChat.participant2Name
        : activeChat.participant1Name
      : "User");

  useEffect(() => {
    if (chatId) {
      setActiveChatId(chatId);
      if (user) markAsRead(chatId, user.id);
      // Clear any in-app message notifications for this chat so the badge resets
      notifications
        .filter((n) => n.type === "message" && n.chatId === chatId && !n.read)
        .forEach((n) => markRead(n.id));
    }
    return () => setActiveChatId(null);
  }, [chatId, user]);

  useEffect(() => {
    if (resolvedOtherUserId) {
      api
        .getUser(resolvedOtherUserId)
        .then((res: any) => {
          if (res?.user) setOtherProfile(res.user);
        })
        .catch(() => {});
    }
  }, [resolvedOtherUserId]);

  const handleSend = async () => {
    if (!text.trim() || !chatId || !user) return;
    const msg = text.trim();
    setText("");
    setSending(true);
    try {
      await sendMessage(chatId, user.id, user.name, msg);
    } catch {
      // Restore text so user can retry
      setText(msg);
      Alert.alert("Send Failed", "Message could not be sent. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const initials = (resolvedOtherUserName || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = user?.id === item.senderId;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && (
          otherProfile?.profileImage ? (
            <PrivateImage objectPath={otherProfile.profileImage} style={[styles.msgAvatar, { borderRadius: 16 }]} />
          ) : (
            <View style={[styles.msgAvatar, { backgroundColor: otherProfile?.profileColor || theme.colors.primary }]}>
              <Text style={styles.msgAvatarText}>{initials}</Text>
            </View>
          )
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
          <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
            {formatTime(item.createdAt || item.timestamp || new Date().toISOString())}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        {otherProfile?.profileImage ? (
          <PrivateImage objectPath={otherProfile.profileImage} style={[styles.avatar, { borderRadius: 22 }]} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: otherProfile?.profileColor || theme.colors.primary }]}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>{resolvedOtherUserName}</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Athoo secure chat</Text>
          </View>
        </View>
        <Pressable
          style={styles.callBtn}
          onPress={() => startOutgoingCall(resolvedOtherUserId || "", resolvedOtherUserName || "Provider", "Voice Call", theme.colors.primary)}
        >
          <Icon name="phone" size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {loadingMessages ? (
          <View style={styles.emptyChat}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textSecondary, marginTop: 12, fontSize: 13 }}>Loading messages…</Text>
          </View>
        ) : chatMessages.length === 0 ? (
          <View style={styles.emptyChat}>
            <View style={styles.emptyChatIcon}>
              <Icon name="message-circle" size={32} color={theme.colors.textMuted} />
            </View>
            <Text style={styles.emptyChatTitle}>Start a conversation</Text>
            <Text style={styles.emptyChatText}>
              Send a message to {resolvedOtherUserName} about the service
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={chatMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={{ flex: 1 }}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            removeClippedSubviews={true}
            maxToRenderPerBatch={20}
            windowSize={10}
            initialNumToRender={20}
            onContentSizeChange={() =>
              flatRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: botPad + 8 }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={text}
              onChangeText={setText}
              multiline
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>
          <Pressable
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Icon name="send" size={18} color={theme.colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  avatarTxt: { fontSize: 13, fontWeight: "700", color: theme.colors.onBrand },
  providerName: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: theme.colors.success,
  },
  onlineText: { fontSize: 11, color: theme.colors.success, fontWeight: "600" },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyChatIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyChatTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  emptyChatText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  messagesList: { padding: 16, gap: 8, paddingBottom: 16 },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 8,
  },
  msgRowMe: { justifyContent: "flex-end" },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  msgAvatarText: { fontSize: 10, fontWeight: "700", color: theme.colors.onBrand },
  bubble: {
    maxWidth: "72%",
    borderRadius: 18,
    padding: 10,
    paddingHorizontal: 14,
  },
  bubbleMe: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bubbleText: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  bubbleTextMe: { color: theme.colors.surface },
  bubbleTime: { fontSize: 10, color: theme.colors.textMuted, marginTop: 4, textAlign: "right" },
  bubbleTimeMe: { color: "rgba(255,255,255,0.7)" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  input: { fontSize: 14, color: theme.colors.text },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: theme.colors.textMuted },
});

