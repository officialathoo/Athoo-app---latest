import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { apiErrorToMessage } from "@/lib/apiError";
import { PrivateImage } from "@/services/storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ChatRole = "customer" | "provider";

interface ConversationListScreenProps {
  role: ChatRole;
}

function formatTime(iso: string, nowLabel: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return nowLabel;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;

  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

export function ConversationListScreen({
  role,
}: ConversationListScreenProps) {
  const { user } = useAuth();
  const {
    getMyChats,
    loadingChats,
    deleteChat: contextDeleteChat,
  } = useChat();
  const {
    t,
    isUrdu,
    translate: tr,
    textAlign,
    writingDirection,
  } = useLang();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { push: guardedPush } = useNavigationGuard();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const myChats = user ? getMyChats(user.id) : [];
  const unreadTotal = myChats.reduce(
    (total, chat) => total + Number(chat.unreadCount || 0),
    0,
  );

  const localizedText = {
    textAlign,
    writingDirection,
  } as const;

  const locale = isUrdu ? "ur-PK" : "en-PK";
  const isCustomer = role === "customer";
  const accent = isCustomer
    ? theme.colors.primary
    : theme.colors.secondary;
  const accentSoft = isCustomer
    ? theme.colors.infoSoft
    : theme.colors.premiumSoft;
  const otherRoleFallback = isCustomer ? t.provider : t.customer;

  const [query, setQuery] = useState("");
  type ChatItem = (typeof myChats)[number];

  const otherNameFor = (chat: ChatItem): string =>
    user?.id === chat.participant1Id
      ? chat.participant2Name || otherRoleFallback
      : chat.participant1Name || otherRoleFallback;

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return myChats;
    return myChats.filter((chat) => {
      const name = otherNameFor(chat).toLowerCase();
      const message = (chat.lastMessage || "").toLowerCase();
      const service = (chat.service || "").toLowerCase();
      return name.includes(q) || message.includes(q) || service.includes(q);
    });
  }, [myChats, query, user?.id]);

  const unreadChats = useMemo(
    () => filteredChats.filter((chat) => Number(chat.unreadCount || 0) > 0),
    [filteredChats],
  );
  const readChats = useMemo(
    () => filteredChats.filter((chat) => !(Number(chat.unreadCount || 0) > 0)),
    [filteredChats],
  );
  const orderedChats = useMemo(() => [...unreadChats, ...readChats], [unreadChats, readChats]);

  const openDiscovery = () => {
    if (isCustomer) {
      router.push("/(customer)/(tabs)/search" as any);
      return;
    }

    router.push("/(provider)/(tabs)/jobs" as any);
  };

  const deleteChat = async (
    chatId: string,
    otherName: string,
  ) => {
    Alert.alert(
      tr("Delete Chat"),
      tr(
        "Are you sure you want to delete your chat with {{name}}? This action cannot be undone.",
        { name: otherName },
      ),
      [
        { text: t.cancel, style: "cancel" },
        {
          text: tr("Delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await contextDeleteChat(chatId);
            } catch (error) {
              const message = apiErrorToMessage(
                error,
                "We couldn't delete this conversation. Please try again.",
              );
              Alert.alert(
                tr("Error"),
                message ||
                  tr("Failed to delete chat. Please try again."),
              );
            }
          },
        },
      ],
    );
  };

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
        <View style={styles.headerCopy}>
          <Text style={[styles.title, localizedText]}>
            {tr("Messages")}
          </Text>
          <View
            style={[
              styles.headerMeta,
              isUrdu && styles.headerMetaRtl,
            ]}
          >
            <Icon name="shield" size={13} color={accent} />
            <Text
              style={[
                styles.headerMetaText,
                localizedText,
                { color: accent },
              ]}
            >
              {unreadTotal > 0
                ? `${unreadTotal} ${tr("unread")} - ${myChats.length} ${tr("conversations")}`
                : `${myChats.length} ${tr("secure conversations")}`}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("Call history")}
            onPress={() =>
              guardedPush(
                (isCustomer ? "/(customer)/calls" : "/(provider)/calls") as any,
              )
            }
            style={({ pressed }) => [
              styles.composeButton,
              {
                backgroundColor: accentSoft,
                borderColor: theme.colors.focusRing,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Icon name="call" size={18} color={accent} />
          </Pressable>
          {isCustomer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr(
                "Find a provider to message",
              )}
              onPress={openDiscovery}
              style={({ pressed }) => [
                styles.composeButton,
                {
                  backgroundColor: accentSoft,
                  borderColor: theme.colors.focusRing,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <Icon name="edit" size={18} color={accent} />
            </Pressable>
          ) : (
            <View
              style={[
                styles.secureBadge,
                { backgroundColor: accentSoft },
              ]}
            >
              <Icon name="lock" size={13} color={accent} />
              <Text
                style={[
                  styles.secureBadgeText,
                  { color: accent },
                ]}
              >
                {tr("Secure")}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 92 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loadingChats ? (
          [0, 1, 2].map((index) => (
            <AnimatedCard
              key={index}
              delay={index * 55}
              direction="fade"
              style={styles.cardMotion}
            >
              <View style={styles.skeletonCard}>
                <View style={styles.skeletonAvatar} />
                <View style={styles.skeletonContent}>
                  <View style={styles.skeletonTopRow}>
                    <View style={styles.skeletonName} />
                    <View style={styles.skeletonTime} />
                  </View>
                  <View style={styles.skeletonMessage} />
                  <View style={styles.skeletonService} />
                </View>
              </View>
            </AnimatedCard>
          ))
        ) : myChats.length === 0 ? (
          <AnimatedCard
            direction="fade"
            style={styles.emptyMotion}
          >
            <View style={styles.emptyCard}>
              <LinearGradient
                colors={
                  isCustomer
                    ? [
                        theme.colors.primary,
                        theme.colors.primaryPressed,
                      ]
                    : [
                        theme.colors.secondary,
                        theme.colors.secondaryPressed,
                      ]
                }
                style={styles.emptyIcon}
              >
                <Icon
                  name="message-circle"
                  size={31}
                  color={
                    isCustomer
                      ? theme.colors.onBrand
                      : theme.colors.onLight
                  }
                />
              </LinearGradient>

              <Text
                style={[
                  styles.emptyTitle,
                  localizedText,
                ]}
              >
                {tr("No conversations yet")}
              </Text>

              <Text
                style={[
                  styles.emptyText,
                  localizedText,
                ]}
              >
                {isCustomer
                  ? tr(
                      "Book a service or open a provider profile to start a secure Athoo conversation.",
                    )
                  : tr(
                      "Customer conversations will appear here as soon as a booking is ready for contact.",
                    )}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={openDiscovery}
                style={({ pressed }) => [
                  styles.emptyAction,
                  {
                    backgroundColor: accent,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <Icon
                  name={isCustomer ? "search" : "briefcase"}
                  size={16}
                  color={
                    isCustomer
                      ? theme.colors.onBrand
                      : theme.colors.onLight
                  }
                />
                <Text
                  style={[
                    styles.emptyActionText,
                    {
                      color: isCustomer
                        ? theme.colors.onBrand
                        : theme.colors.onLight,
                    },
                  ]}
                >
                  {isCustomer
                    ? tr("Find a Provider")
                    : tr("View Jobs")}
                </Text>
              </Pressable>
            </View>
          </AnimatedCard>
        ) : (
          <>
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Icon name="search" size={16} color={theme.colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={tr("Search conversations")}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.searchInput, localizedText, { color: theme.colors.text }]}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel={tr("Search conversations")}
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={tr("Clear search")}
                >
                  <Icon name="x" size={16} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {filteredChats.length === 0 ? (
              <AnimatedCard direction="fade" style={styles.noMatchesMotion}>
                <View style={styles.noMatchesCard}>
                  <View style={[styles.noMatchesIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Icon name="search" size={26} color={theme.colors.textMuted} />
                  </View>
                  <Text style={[styles.noMatchesTitle, localizedText]}>{tr("No matches found")}</Text>
                  <Text style={[styles.noMatchesText, localizedText]}>
                    {tr("Try a different name, service or message keyword.")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setQuery("")}
                    style={({ pressed }) => [
                      styles.noMatchesAction,
                      {
                        backgroundColor: accent,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.noMatchesActionText,
                        {
                          color: isCustomer ? theme.colors.onBrand : theme.colors.onLight,
                        },
                      ]}
                    >
                      {tr("Clear search")}
                    </Text>
                  </Pressable>
                </View>
              </AnimatedCard>
            ) : (
              orderedChats.map((chat, index) => {
            if (index === unreadChats.length && unreadChats.length > 0 && readChats.length > 0) {
              return (
                <View key={`chat-section-${index}`} style={styles.sectionHeader}>
                  <Text style={[styles.sectionLabel, localizedText]}>{tr("All conversations")}</Text>
                  <View style={[styles.sectionCount, { backgroundColor: accentSoft }]}>
                    <Text style={[styles.sectionCountText, { color: accent }]}>{readChats.length}</Text>
                  </View>
                </View>
              );
            }
            const isParticipantOne =
              user?.id === chat.participant1Id;
            const otherId = isParticipantOne
              ? chat.participant2Id
              : chat.participant1Id;
            const otherName = isParticipantOne
              ? chat.participant2Name || otherRoleFallback
              : chat.participant1Name || otherRoleFallback;
            const otherProfile = {
              profileImage: isParticipantOne
                ? chat.participant2ProfileImage
                : chat.participant1ProfileImage,
              profileColor: isParticipantOne
                ? chat.participant2ProfileColor
                : chat.participant1ProfileColor,
            };
            const initials = otherName
              .split(" ")
              .filter(Boolean)
              .map((name: string) => name[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            const unread = Number(chat.unreadCount || 0);
            const hasUnread = unread > 0;

            return (
              <AnimatedCard
                key={chat.id}
                delay={Math.min(index * 45, 260)}
                style={styles.cardMotion}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr(
                    "Open chat with {{name}}",
                    { name: otherName },
                  )}
                  accessibilityHint={tr(
                    "Long press to delete this conversation",
                  )}
                  onLongPress={() =>
                    void deleteChat(chat.id, otherName)
                  }
                  onPress={() =>
                    guardedPush({
                      pathname:
                        (isCustomer
                          ? "/(customer)/chat-room"
                          : "/(provider)/chat-room") as any,
                      params: {
                        chatId: chat.id,
                        otherUserId: otherId,
                        otherUserName: otherName,
                        otherUserImage:
                          otherProfile.profileImage ||
                          undefined,
                        otherUserColor:
                          otherProfile.profileColor ||
                          undefined,
                      },
                    } as any)
                  }
                  style={({ pressed }) => [
                    styles.conversationCard,
                    hasUnread &&
                      {
                        borderColor: accent,
                        backgroundColor: accentSoft,
                      },
                    pressed && styles.cardPressed,
                  ]}
                >
                  <View style={styles.avatarWrap}>
                    {otherProfile.profileImage ? (
                      <PrivateImage
                        objectPath={otherProfile.profileImage}
                        style={[
                          styles.avatarImage,
                          {
                            borderColor: hasUnread
                              ? accent
                              : theme.colors.border,
                          },
                        ]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.avatar,
                          {
                            backgroundColor:
                              otherProfile.profileColor ||
                              accent,
                            borderColor: hasUnread
                              ? accent
                              : theme.colors.border,
                          },
                        ]}
                      >
                        <Text style={styles.avatarText}>
                          {initials || "?"}
                        </Text>
                      </View>
                    )}

                    {hasUnread ? (
                      <View
                        style={[
                          styles.activityDot,
                          {
                            backgroundColor: accent,
                            borderColor:
                              hasUnread
                                ? accentSoft
                                : theme.colors.surface,
                          },
                        ]}
                      />
                    ) : null}
                  </View>

                  <View style={styles.chatContent}>
                    <View
                      style={[
                        styles.chatHeader,
                        isUrdu && styles.rowReverse,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chatName,
                          localizedText,
                          hasUnread && styles.chatNameUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {otherName}
                      </Text>

                      {chat.lastMessageAt ? (
                        <Text
                          style={[
                            styles.chatTime,
                            {
                              color: hasUnread
                                ? accent
                                : theme.colors.textMuted,
                            },
                          ]}
                        >
                          {formatTime(
                            chat.lastMessageAt,
                            tr("now"),
                            locale,
                          )}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={[
                        styles.previewRow,
                        isUrdu && styles.rowReverse,
                      ]}
                    >
                      <Text
                        style={[
                          styles.lastMessage,
                          localizedText,
                          hasUnread &&
                            styles.lastMessageUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {chat.lastMessage ||
                          tr("No messages yet")}
                      </Text>

                      {hasUnread ? (
                        <View
                          style={[
                            styles.unreadBadge,
                            { backgroundColor: accent },
                          ]}
                        >
                          <Text
                            style={[
                              styles.unreadBadgeText,
                              {
                                color: isCustomer
                                  ? theme.colors.onBrand
                                  : theme.colors.onLight,
                              },
                            ]}
                          >
                            {unread > 99 ? "99+" : unread}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View
                      style={[
                        styles.contextRow,
                        isUrdu && styles.rowReverse,
                      ]}
                    >
                      <View
                        style={[
                          styles.servicePill,
                          { backgroundColor: accentSoft },
                        ]}
                      >
                        <Icon
                          name="briefcase"
                          size={11}
                          color={accent}
                        />
                        <Text
                          style={[
                            styles.serviceText,
                            { color: accent },
                          ]}
                          numberOfLines={1}
                        >
                          {chat.service ||
                            tr("Athoo conversation")}
                        </Text>
                      </View>

                      <View style={styles.securityMini}>
                        <Icon
                          name="lock"
                          size={10}
                          color={theme.colors.textMuted}
                        />
                        <Text style={styles.securityMiniText}>
                          {tr("Secure")}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </AnimatedCard>
            );
            })
            )}
          </>
        )}
      </ScrollView>
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
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: redesign.layout.compactHorizontalPadding,
      paddingTop: 10,
      paddingBottom: 11,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: redesign.visual.cardBorderWidth,
      borderBottomColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      ...theme.typography.h2,
      color: theme.colors.text,
      letterSpacing: -0.4,
    },
    headerMeta: {
      marginTop: 3,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    headerMetaRtl: {
      flexDirection: "row-reverse",
      alignSelf: "flex-end",
    },
    headerMetaText: {
      ...theme.typography.caption,
      fontFamily: theme.typography.label.fontFamily,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    composeButton: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: redesign.visual.cardBorderWidth,
      ...theme.shadows.sm,
    },
    secureBadge: {
      minHeight: 32,
      paddingHorizontal: 10,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    secureBadgeText: {
      fontSize: 10.5,
      fontWeight: "800",
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: redesign.layout.compactHorizontalPadding,
      paddingTop: 10,
      gap: 10,
    },
    searchBox: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: redesign.visual.cardBorderWidth,
      backgroundColor: theme.colors.surface,
    },
    searchInput: {
      flex: 1,
      fontSize: 13.5,
      paddingVertical: 0,
    },
    noMatchesMotion: { width: "100%" },
    noMatchesCard: {
      minHeight: 240,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 28,
      borderRadius: theme.radius.xl,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    noMatchesIcon: { width: 54, height: 54, borderRadius: theme.radius.lg, alignItems: "center", justifyContent: "center", marginBottom: 12 },
    noMatchesTitle: { ...theme.typography.h2, color: theme.colors.text, textAlign: "center" },
    noMatchesText: { marginTop: 6, ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center", maxWidth: 330 },
    noMatchesAction: { minHeight: 42, marginTop: 14, paddingHorizontal: 16, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center" },
    noMatchesActionText: { fontSize: 13, fontWeight: "900" },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingTop: 8,
      paddingBottom: 4,
    },
    sectionLabel: { ...theme.typography.caption, color: theme.colors.textSecondary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    sectionCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
    sectionCountText: { fontSize: 10, fontWeight: "900" },
    cardMotion: {
      width: "100%",
    },
    conversationCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 11,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    cardPressed: {
      opacity: 0.86,
      transform: [{ scale: redesign.visual.pressedScale }],
    },
    avatarWrap: {
      width: 44,
      height: 44,
      position: "relative",
      flexShrink: 0,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      overflow: "hidden",
    },
    avatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
    },
    avatarText: {
      fontSize: 14,
      fontWeight: "900",
      color: theme.colors.white,
    },
    activityDot: {
      position: "absolute",
      right: 0,
      bottom: 0,
      width: 11,
      height: 11,
      borderRadius: 5.5,
      borderWidth: 2,
    },
    chatContent: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    chatHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    rowReverse: {
      flexDirection: "row-reverse",
    },
    chatName: {
      flex: 1,
      fontSize: 14.5,
      fontWeight: "700",
      color: theme.colors.text,
    },
    chatNameUnread: {
      fontWeight: "900",
    },
    chatTime: {
      fontSize: 10,
      fontWeight: "700",
    },
    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    lastMessage: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    lastMessageUnread: {
      color: theme.colors.text,
      fontWeight: "700",
    },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    unreadBadgeText: {
      fontSize: 9.5,
      fontWeight: "900",
    },
    contextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 2,
    },
    servicePill: {
      maxWidth: "70%",
      minHeight: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      borderRadius: theme.radius.pill,
    },
    serviceText: {
      flexShrink: 1,
      fontSize: 10,
      fontWeight: "800",
    },
    securityMini: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    securityMiniText: {
      fontSize: 9,
      fontWeight: "700",
      color: theme.colors.textMuted,
    },
    skeletonCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 11,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    skeletonAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceAlt,
    },
    skeletonContent: {
      flex: 1,
      gap: 7,
    },
    skeletonTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
    },
    skeletonName: {
      width: "45%",
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.colors.border,
    },
    skeletonTime: {
      width: 34,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: theme.colors.surfaceAlt,
    },
    skeletonMessage: {
      width: "82%",
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.surfaceAlt,
    },
    skeletonService: {
      width: 84,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.colors.surfaceAlt,
    },
    emptyMotion: {
      flex: 1,
    },
    emptyCard: {
      flex: 1,
      minHeight: 300,
      marginTop: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
      paddingVertical: 36,
      borderRadius: theme.radius.xl,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      ...theme.typography.h2,
      color: theme.colors.text,
      textAlign: "center",
    },
    emptyText: {
      marginTop: 8,
      maxWidth: 330,
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
    emptyAction: {
      minHeight: 44,
      marginTop: 18,
      paddingHorizontal: 18,
      borderRadius: theme.radius.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      ...theme.shadows.sm,
    },
    emptyActionText: {
      fontSize: 13,
      fontWeight: "900",
    },
  });
}
