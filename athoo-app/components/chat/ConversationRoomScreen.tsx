import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { Message, useChat } from "@/context/ChatContext";
import { useLang } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { PrivateImage } from "@/services/storage";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ChatRole = "customer" | "provider";

interface ConversationRoomScreenProps {
  role: ChatRole;
}

function formatTime(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDateLabel(
  iso: string,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey(iso) === dateKey(today.toISOString())) {
    return todayLabel;
  }

  if (dateKey(iso) === dateKey(yesterday.toISOString())) {
    return yesterdayLabel;
  }

  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === today.getFullYear()
        ? undefined
        : "numeric",
  });
}

function deliveryLabel(
  message: Message,
  tr: (value: string) => string,
) {
  if ((message as any)._optimistic) return tr("Sending");

  switch (message.deliveryStatus) {
    case "read":
      return tr("Read");
    case "delivered":
      return tr("Delivered");
    case "sending":
      return tr("Sending");
    default:
      return tr("Sent");
  }
}

export function ConversationRoomScreen({
  role,
}: ConversationRoomScreenProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    translate: tr,
    isUrdu,
    textAlign,
    writingDirection,
  } = useLang();
  const {
    chatId,
    otherUserId,
    otherUserName,
    otherUserImage,
    otherUserColor,
  } = useLocalSearchParams<{
    chatId: string;
    otherUserId?: string;
    otherUserName?: string;
    otherUserImage?: string;
    otherUserColor?: string;
  }>();

  const { user } = useAuth();
  const {
    chats,
    messages,
    sendMessage,
    markAsRead,
    setActiveChatId,
    loadingMessages,
  } = useChat();
  const { startOutgoingCall } = useCall();
  const { notifications, markRead } = useNotifications();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const isCustomer = role === "customer";
  const accent = isCustomer
    ? theme.colors.primary
    : theme.colors.secondary;
  const accentSoft = isCustomer
    ? theme.colors.infoSoft
    : theme.colors.premiumSoft;
  const ownTextColor = isCustomer
    ? theme.colors.onBrand
    : theme.colors.onLight;
  const ownMetaColor = isCustomer
    ? "rgba(255,255,255,0.76)"
    : theme.colors.onLight;
  const locale = isUrdu ? "ur-PK" : "en-PK";
  const localizedText = {
    textAlign,
    writingDirection,
  } as const;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const flatRef = useRef<FlatList<Message>>(null);

  const activeChat = chats.find(
    (item) => item.id === chatId,
  );
  const chatMessages: Message[] =
    messages[chatId || ""] || [];
  const hasMessageSnapshot = chatId
    ? Object.prototype.hasOwnProperty.call(messages, chatId)
    : true;

  const isParticipantOne =
    !!user &&
    !!activeChat &&
    activeChat.participant1Id === user.id;

  const resolvedOtherUserId =
    otherUserId ||
    (user && activeChat
      ? isParticipantOne
        ? activeChat.participant2Id
        : activeChat.participant1Id
      : "");

  const resolvedOtherUserName =
    otherUserName ||
    (user && activeChat
      ? isParticipantOne
        ? activeChat.participant2Name
        : activeChat.participant1Name
      : tr("User"));

  const otherProfile = useMemo(() => {
    const chatImage =
      user && activeChat
        ? isParticipantOne
          ? activeChat.participant2ProfileImage
          : activeChat.participant1ProfileImage
        : null;
    const chatColor =
      user && activeChat
        ? isParticipantOne
          ? activeChat.participant2ProfileColor
          : activeChat.participant1ProfileColor
        : null;

    return {
      profileImage:
        chatImage || otherUserImage || null,
      profileColor:
        chatColor || otherUserColor || accent,
    };
  }, [
    accent,
    activeChat,
    isParticipantOne,
    otherUserColor,
    otherUserImage,
    user,
  ]);

  const initials = (resolvedOtherUserName || "U")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  useEffect(() => {
    if (!chatId) return;

    setActiveChatId(chatId);

    if (user) {
      void markAsRead(chatId, user.id);
    }

    return () => setActiveChatId(null);
  }, [chatId, user?.id]);

  useEffect(() => {
    if (!chatId) return;

    notifications
      .filter(
        (notification) =>
          notification.type === "message" &&
          notification.chatId === chatId &&
          !notification.read,
      )
      .forEach((notification) =>
        markRead(notification.id),
      );
  }, [chatId, markRead, notifications]);

  const handleSend = async () => {
    if (
      sending ||
      !text.trim() ||
      !chatId ||
      !user
    ) {
      return;
    }

    const message = text.trim();
    setText("");
    setSending(true);

    try {
      await sendMessage(
        chatId,
        user.id,
        user.name,
        message,
      );
    } catch {
      setText(message);
      Alert.alert(
        tr("Send Failed"),
        tr(
          "Message could not be sent. Please check your connection and try again.",
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const handleCall = async () => {
    if (
      calling ||
      !resolvedOtherUserId
    ) {
      return;
    }

    setCalling(true);
    try {
      await startOutgoingCall(
        resolvedOtherUserId,
        resolvedOtherUserName ||
          (isCustomer ? tr("Provider") : tr("Customer")),
        "Voice Call",
        accent,
      );
    } catch {
      Alert.alert(
        tr("Call unavailable"),
        tr(
          "Athoo could not start this call. Please try again.",
        ),
      );
    } finally {
      setCalling(false);
    }
  };

  const renderMessage = ({
    item,
    index,
  }: {
    item: Message;
    index: number;
  }) => {
    const isMe = user?.id === item.senderId;
    const previous = chatMessages[index - 1];
    const startsNewDay =
      !previous ||
      dateKey(previous.createdAt) !==
        dateKey(item.createdAt);
    const startsGroup =
      startsNewDay ||
      !previous ||
      previous.senderId !== item.senderId;
    const showAvatar = !isMe && startsGroup;
    const status = isMe
      ? deliveryLabel(item, tr)
      : null;

    return (
      <>
        {startsNewDay ? (
          <View style={styles.dateSeparator}>
            <View style={styles.dateRule} />
            <Text style={styles.dateText}>
              {formatDateLabel(
                item.createdAt,
                locale,
                tr("Today"),
                tr("Yesterday"),
              )}
            </Text>
            <View style={styles.dateRule} />
          </View>
        ) : null}

        <View
          style={[
            styles.messageRow,
            isMe && styles.messageRowMine,
          ]}
        >
          {!isMe ? (
            showAvatar ? (
              otherProfile.profileImage ? (
                <PrivateImage
                  objectPath={
                    otherProfile.profileImage
                  }
                  style={[
                    styles.messageAvatar,
                    {
                      borderColor:
                        theme.colors.border,
                    },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.messageAvatar,
                    {
                      backgroundColor:
                        otherProfile.profileColor,
                      borderColor:
                        theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={styles.messageAvatarText}
                  >
                    {initials || "?"}
                  </Text>
                </View>
              )
            ) : (
              <View style={styles.avatarSpacer} />
            )
          ) : null}

          <View
            style={[
              styles.bubble,
              isMe
                ? [
                    styles.bubbleMine,
                    { backgroundColor: accent },
                  ]
                : styles.bubbleTheirs,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                localizedText,
                {
                  color: isMe
                    ? ownTextColor
                    : theme.colors.text,
                },
              ]}
            >
              {item.text}
            </Text>

            <View style={styles.messageMeta}>
              <Text
                style={[
                  styles.messageTime,
                  {
                    color: isMe
                      ? ownMetaColor
                      : theme.colors.textMuted,
                  },
                ]}
              >
                {formatTime(
                  item.createdAt ||
                    item.timestamp ||
                    new Date().toISOString(),
                  locale,
                )}
              </Text>

              {status ? (
                <View style={styles.deliveryMeta}>
                  <Icon
                    name="check"
                    size={10}
                    color={ownMetaColor}
                  />
                  <Text
                    style={[
                      styles.deliveryText,
                      { color: ownMetaColor },
                    ]}
                  >
                    {status}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </>
    );
  };

  const showInitialSync =
    !hasMessageSnapshot ||
    (loadingMessages &&
      chatMessages.length === 0);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: topPad,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Go back")}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
        >
          <Icon
            name="arrow-left"
            size={19}
            color={theme.colors.text}
          />
        </Pressable>

        {otherProfile.profileImage ? (
          <PrivateImage
            objectPath={otherProfile.profileImage}
            style={[
              styles.headerAvatar,
              { borderColor: accent },
            ]}
          />
        ) : (
          <View
            style={[
              styles.headerAvatar,
              {
                backgroundColor:
                  otherProfile.profileColor,
                borderColor: accent,
              },
            ]}
          >
            <Text style={styles.headerAvatarText}>
              {initials || "?"}
            </Text>
          </View>
        )}

        <View style={styles.headerIdentity}>
          <Text
            style={[
              styles.headerName,
              localizedText,
            ]}
            numberOfLines={1}
          >
            {resolvedOtherUserName}
          </Text>

          <View
            style={[
              styles.headerSubRow,
              isUrdu && styles.rowReverse,
            ]}
          >
            <View
              style={[
                styles.secureStatus,
                { backgroundColor: accentSoft },
              ]}
            >
              <Icon
                name="shield"
                size={11}
                color={accent}
              />
              <Text
                style={[
                  styles.secureStatusText,
                  { color: accent },
                ]}
              >
                {tr("Secure chat")}
              </Text>
            </View>

            {activeChat?.service ? (
              <Text
                style={styles.serviceContext}
                numberOfLines={1}
              >
                {activeChat.service}
              </Text>
            ) : null}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Start voice call")}
          disabled={
            calling || !resolvedOtherUserId
          }
          onPress={() => void handleCall()}
          style={({ pressed }) => [
            styles.callButton,
            {
              backgroundColor: accentSoft,
              borderColor:
                theme.colors.focusRing,
            },
            (calling || !resolvedOtherUserId) &&
              styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {calling ? (
            <ActivityIndicator
              size="small"
              color={accent}
            />
          ) : (
            <Icon
              name="phone"
              size={18}
              color={accent}
            />
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
        keyboardVerticalOffset={0}
      >
        {showInitialSync ? (
          <View style={styles.syncState}>
            <AnimatedCard
              direction="fade"
              style={styles.syncCardMotion}
            >
              <View style={styles.syncCard}>
                <View
                  style={[
                    styles.syncIcon,
                    { backgroundColor: accentSoft },
                  ]}
                >
                  <ActivityIndicator
                    size="small"
                    color={accent}
                  />
                </View>
                <View style={styles.syncCopy}>
                  <Text style={styles.syncTitle}>
                    {tr("Opening conversation")}
                  </Text>
                  <Text style={styles.syncText}>
                    {tr(
                      "Syncing recent messages securely...",
                    )}
                  </Text>
                </View>
              </View>
            </AnimatedCard>
          </View>
        ) : chatMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <AnimatedCard
              direction="fade"
              style={styles.emptyCardMotion}
            >
              <View style={styles.emptyCard}>
                <View
                  style={[
                    styles.emptyIcon,
                    { backgroundColor: accentSoft },
                  ]}
                >
                  <Icon
                    name="message-circle"
                    size={30}
                    color={accent}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {tr("Start the conversation")}
                </Text>
                <Text style={styles.emptyText}>
                  {tr(
                    "Messages stay connected to this Athoo conversation so both sides can keep the service discussion in one place.",
                  )}
                </Text>
                <View style={styles.emptySecureRow}>
                  <Icon
                    name="lock"
                    size={12}
                    color={theme.colors.textMuted}
                  />
                  <Text style={styles.emptySecureText}>
                    {tr("Athoo secure messaging")}
                  </Text>
                </View>
              </View>
            </AnimatedCard>
          </View>
        ) : (
          <FlatList<Message>
            ref={flatRef}
            data={chatMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={styles.messageList}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            removeClippedSubviews
            maxToRenderPerBatch={20}
            windowSize={10}
            initialNumToRender={20}
            onContentSizeChange={() =>
              flatRef.current?.scrollToEnd({
                animated: false,
              })
            }
          />
        )}

        <View
          style={[
            styles.composerShell,
            { paddingBottom: botPad + 8 },
          ]}
        >
          <View style={styles.composer}>
            <View
              style={[
                styles.composerSecurity,
                { backgroundColor: accentSoft },
              ]}
            >
              <Icon
                name="lock"
                size={13}
                color={accent}
              />
            </View>

            <TextInput
              style={[
                styles.input,
                localizedText,
              ]}
              placeholder={tr("Type a message...")}
              value={text}
              onChangeText={setText}
              multiline
              editable={!sending}
              placeholderTextColor={
                theme.colors.textMuted
              }
              accessibilityLabel={tr("Message")}
              returnKeyType="default"
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Send message")}
              disabled={
                !text.trim() || sending
              }
              onPress={() => void handleSend()}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: accent,
                },
                (!text.trim() || sending) &&
                  styles.sendButtonDisabled,
                pressed &&
                  !!text.trim() &&
                  !sending &&
                  styles.sendButtonPressed,
              ]}
            >
              {sending ? (
                <ActivityIndicator
                  size="small"
                  color={ownTextColor}
                />
              ) : (
                <Icon
                  name="send"
                  size={18}
                  color={ownTextColor}
                />
              )}
            </Pressable>
          </View>

          <Text style={styles.composerHint}>
            {tr(
              "Keep payments and service details inside Athoo for safer records.",
            )}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.dark ? 0.16 : 0.05,
      shadowRadius: 8,
      elevation: 2,
      zIndex: 5,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    pressed: {
      opacity: 0.72,
    },
    disabled: {
      opacity: 0.5,
    },
    headerAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      overflow: "hidden",
      flexShrink: 0,
    },
    headerAvatarText: {
      fontSize: 14,
      fontWeight: "900",
      color: theme.colors.white,
    },
    headerIdentity: {
      flex: 1,
      minWidth: 0,
    },
    headerName: {
      fontSize: 15.5,
      lineHeight: 20,
      fontWeight: "900",
      color: theme.colors.text,
    },
    headerSubRow: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    },
    rowReverse: {
      flexDirection: "row-reverse",
    },
    secureStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 7,
      minHeight: 21,
      borderRadius: 10.5,
    },
    secureStatusText: {
      fontSize: 9.5,
      fontWeight: "900",
    },
    serviceContext: {
      flex: 1,
      minWidth: 0,
      fontSize: 10,
      color: theme.colors.textMuted,
      fontWeight: "700",
    },
    callButton: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    keyboardArea: {
      flex: 1,
    },
    messageList: {
      flex: 1,
    },
    messagesContent: {
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 10,
    },
    dateSeparator: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      marginVertical: 12,
      paddingHorizontal: 8,
    },
    dateRule: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.divider,
    },
    dateText: {
      fontSize: 10,
      fontWeight: "800",
      color: theme.colors.textMuted,
    },
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 7,
      marginBottom: 6,
    },
    messageRowMine: {
      justifyContent: "flex-end",
    },
    messageAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      overflow: "hidden",
      flexShrink: 0,
    },
    avatarSpacer: {
      width: 28,
      height: 1,
      flexShrink: 0,
    },
    messageAvatarText: {
      fontSize: 9.5,
      fontWeight: "900",
      color: theme.colors.white,
    },
    bubble: {
      maxWidth: "78%",
      minWidth: 72,
      paddingHorizontal: 12,
      paddingTop: 9,
      paddingBottom: 7,
      borderRadius: 18,
    },
    bubbleMine: {
      borderBottomRightRadius: 6,
    },
    bubbleTheirs: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderBottomLeftRadius: 6,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: theme.dark ? 0.12 : 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    messageText: {
      fontSize: 14,
      lineHeight: 20,
    },
    messageMeta: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 6,
    },
    messageTime: {
      fontSize: 9.5,
      fontWeight: "600",
    },
    deliveryMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    deliveryText: {
      fontSize: 9,
      fontWeight: "800",
    },
    syncState: {
      flex: 1,
      justifyContent: "center",
      padding: 18,
    },
    syncCardMotion: {
      width: "100%",
    },
    syncCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderRadius: 18,
      padding: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    syncIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    syncCopy: {
      flex: 1,
    },
    syncTitle: {
      fontSize: 14,
      fontWeight: "900",
      color: theme.colors.text,
    },
    syncText: {
      marginTop: 3,
      fontSize: 11.5,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
    emptyState: {
      flex: 1,
      justifyContent: "center",
      padding: 18,
    },
    emptyCardMotion: {
      width: "100%",
    },
    emptyCard: {
      alignItems: "center",
      paddingHorizontal: 26,
      paddingVertical: 34,
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyIcon: {
      width: 66,
      height: 66,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "900",
      color: theme.colors.text,
      textAlign: "center",
    },
    emptyText: {
      marginTop: 8,
      fontSize: 12.5,
      lineHeight: 19,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
    emptySecureRow: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    emptySecureText: {
      fontSize: 10.5,
      fontWeight: "700",
      color: theme.colors.textMuted,
    },
    composerShell: {
      paddingHorizontal: 10,
      paddingTop: 8,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    composer: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      borderRadius: 18,
      padding: 5,
      paddingLeft: 8,
      backgroundColor: theme.colors.input,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    composerSecurity: {
      width: 32,
      height: 32,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 108,
      paddingHorizontal: 2,
      paddingTop: 10,
      paddingBottom: 9,
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.text,
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 0,
    },
    sendButtonDisabled: {
      opacity: 0.42,
    },
    sendButtonPressed: {
      transform: [{ scale: 0.95 }],
    },
    composerHint: {
      marginTop: 5,
      paddingHorizontal: 4,
      fontSize: 9.5,
      lineHeight: 13,
      color: theme.colors.textMuted,
      textAlign: "center",
    },
  });
}
