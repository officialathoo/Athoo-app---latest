import { Icon } from "@/components/ui/Icon";
import { runtimeConfig } from "@/config/runtime";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ChatbotRole = "customer" | "provider";

type Message = { id: string; from: "user" | "bot"; text: string; time: string };
type FaqItem = { question: string; icon: string };
type SocialLink = { key: string; label: string; icon: string; url: string; color: string };

const CUSTOMER_FAQ: FaqItem[] = [
  { question: "How do I book a service?", icon: "calendar" },
  { question: "How does price negotiation work?", icon: "tag" },
  { question: "Is my phone number safe?", icon: "shield" },
  { question: "How do I pay for services?", icon: "credit-card" },
  { question: "What is the arrival OTP?", icon: "key" },
  { question: "How do I cancel a booking?", icon: "x-circle" },
  { question: "What areas do you serve?", icon: "map-pin" },
  { question: "How do I contact support?", icon: "headphones" },
];

const PROVIDER_FAQ: FaqItem[] = [
  { question: "How do I accept a job?", icon: "briefcase" },
  { question: "How does the start OTP work?", icon: "key" },
  { question: "How are my earnings calculated?", icon: "dollar-sign" },
  { question: "How does commission work?", icon: "percent" },
  { question: "How do I handle negotiations?", icon: "tag" },
  { question: "How do I get more jobs?", icon: "trending-up" },
  { question: "How do I get verified?", icon: "shield" },
  { question: "How do I withdraw money?", icon: "arrow-up-circle" },
];

function currentTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildIntro(role: ChatbotRole): Message {
  return {
    id: "intro",
    from: "bot",
    text: role === "provider"
      ? "Hi! I'm your Athoo Provider Assistant. 😊\n\nI can help with jobs, OTPs, earnings, commissions, negotiations, and more.\n\nTap a question below or type your own!"
      : "Hi! I'm Athoo Assistant. 😊\n\nI can help with bookings, payments, providers, privacy, and more.\n\nSelect a question below or type your own!",
    time: currentTime(),
  };
}

function configuredSocialLinks(theme: AthooTheme): SocialLink[] {
  const links: Array<SocialLink | null> = [
    runtimeConfig.support.whatsappUrl
      ? { key: "whatsapp", label: "WhatsApp", icon: "phone", url: runtimeConfig.support.whatsappUrl, color: theme.colors.success }
      : null,
    runtimeConfig.support.instagramUrl
      ? { key: "instagram", label: "Instagram", icon: "instagram", url: runtimeConfig.support.instagramUrl, color: theme.colors.accent }
      : null,
    runtimeConfig.support.facebookUrl
      ? { key: "facebook", label: "Facebook", icon: "facebook", url: runtimeConfig.support.facebookUrl, color: theme.colors.info }
      : null,
  ];
  return links.filter((link): link is SocialLink => Boolean(link));
}

function TypingDots({ accent }: { accent: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme, accent), [accent, theme]);

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: -6, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(600),
      ]),
    );
    const animations = [animate(dot1, 0), animate(dot2, 150), animate(dot3, 300)];
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingBubble}>
      {[dot1, dot2, dot3].map((dot, index) => (
        <Animated.View key={index} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

export function ChatbotScreen({ role }: { role: ChatbotRole }) {
  const { theme } = useTheme();
  const accent = role === "provider" ? theme.colors.secondary : theme.colors.primary;
  const styles = useMemo(() => createStyles(theme, accent), [accent, theme]);
  const faq = role === "provider" ? PROVIDER_FAQ : CUSTOMER_FAQ;
  const title = role === "provider" ? "Provider Support" : "Athoo Assistant";
  const [messages, setMessages] = useState<Message[]>(() => [buildIntro(role)]);
  const [input, setInput] = useState("");
  const [botTyping, setBotTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  const socialLinks = useMemo(() => configuredSocialLinks(theme), [theme]);

  const scrollToEnd = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const openUrl = async (url: string) => {
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (supported) await Linking.openURL(url).catch(() => undefined);
  };

  const sendMessage = async (text: string) => {
    const normalized = text.trim();
    if (!normalized || botTyping) return;

    setMessages((current) => [...current, { id: Date.now().toString(), from: "user", text: normalized, time: currentTime() }]);
    setInput("");
    setBotTyping(true);
    scrollToEnd();

    try {
      const response = await api.chatbot(normalized);
      setMessages((current) => [...current, { id: `${Date.now()}-bot`, from: "bot", text: response.reply, time: currentTime() }]);
    } catch {
      setMessages((current) => [...current, {
        id: `${Date.now()}-offline`,
        from: "bot",
        text: "I'm having trouble connecting right now. Please try again or open an in-app support ticket.",
        time: currentTime(),
      }]);
    } finally {
      setBotTyping(false);
      scrollToEnd();
    }
  };

  const gradient = theme.dark
    ? [theme.colors.surfaceAlt, theme.colors.primaryPressed] as const
    : [accent, theme.colors.primaryPressed] as const;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <LinearGradient colors={gradient} style={styles.header}>
          <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Icon name="arrow-left" size={20} color={theme.colors.white} />
          </Pressable>
          <View style={styles.botInfo}>
            <View style={styles.botAvatar}>
              <Icon name="cpu" size={18} color={theme.colors.white} />
            </View>
            <View style={styles.botCopy}>
              <Text style={styles.botName}>{title}</Text>
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Always online</Text>
              </View>
            </View>
          </View>
          {runtimeConfig.support.whatsappUrl ? (
            <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]} onPress={() => void openUrl(runtimeConfig.support.whatsappUrl!)} accessibilityRole="button" accessibilityLabel="Open WhatsApp support">
              <Icon name="phone" size={17} color={theme.colors.white} />
            </Pressable>
          ) : <View style={styles.headerSpacer} />}
        </LinearGradient>

        <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {messages.length === 1 && !botTyping ? (
            <View style={styles.quickSection}>
              <Text style={styles.quickLabel}>Frequently Asked</Text>
              <View style={styles.quickGrid}>
                {faq.map((item) => (
                  <Pressable key={item.question} style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]} onPress={() => void sendMessage(item.question)}>
                    <Icon name={item.icon as any} size={14} color={accent} />
                    <Text style={styles.quickText}>{item.question}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((message) => {
            const userMessage = message.from === "user";
            return (
              <View key={message.id} style={[styles.messageRow, userMessage ? styles.messageRowUser : styles.messageRowBot]}>
                {!userMessage ? (
                  <View style={styles.botAvatarSmall}>
                    <Icon name="cpu" size={11} color={theme.colors.white} />
                  </View>
                ) : null}
                <View style={[styles.bubble, userMessage ? styles.userBubble : styles.botBubble]}>
                  <Text style={[styles.bubbleText, userMessage && styles.userBubbleText]}>{message.text}</Text>
                  <Text style={[styles.bubbleTime, userMessage && styles.userBubbleTime]}>{message.time}</Text>
                </View>
              </View>
            );
          })}

          {botTyping ? (
            <View style={[styles.messageRow, styles.messageRowBot]}>
              <View style={styles.botAvatarSmall}>
                <Icon name="cpu" size={11} color={theme.colors.white} />
              </View>
              <TypingDots accent={accent} />
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.inputArea, { paddingBottom: bottomPadding + 10 }]}>
          {socialLinks.length ? (
            <View style={styles.socialRow}>
              {socialLinks.map((link) => (
                <Pressable key={link.key} style={({ pressed }) => [styles.socialButton, { borderColor: link.color }, pressed && styles.pressed]} onPress={() => void openUrl(link.url)} accessibilityRole="link" accessibilityLabel={`Open ${link.label}`}>
                  <Icon name={link.icon as any} size={14} color={link.color} />
                  <Text style={[styles.socialText, { color: link.color }]}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[styles.inputRow, inputFocused && styles.inputRowFocused]}>
            <TextInput
              style={styles.input}
              placeholder="Ask a question…"
              value={input}
              onChangeText={setInput}
              placeholderTextColor={theme.colors.textMuted}
              onSubmitEditing={() => void sendMessage(input)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              returnKeyType="send"
              multiline={false}
            />
            <Pressable
              style={({ pressed }) => [styles.sendButton, (!input.trim() || botTyping) && styles.sendButtonDisabled, pressed && input.trim() && !botTyping && styles.pressed]}
              onPress={() => void sendMessage(input)}
              disabled={!input.trim() || botTyping}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Icon name="send" size={18} color={theme.colors.white} />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AthooTheme, accent: string) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
    headerButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
    headerSpacer: { width: 38, height: 38 },
    botInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    botAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.36)" },
    botCopy: { flex: 1 },
    botName: { fontSize: 16, fontWeight: "800", color: theme.colors.white },
    onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.colors.success },
    onlineText: { fontSize: 11, color: "rgba(255,255,255,0.86)" },
    chat: { flex: 1 },
    chatContent: { padding: 16, gap: 10, paddingBottom: 24 },
    quickSection: { gap: 10, marginBottom: 6 },
    quickLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
    quickGrid: { gap: 8 },
    quickChip: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.elevated, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.sm },
    quickText: { fontSize: 13, fontWeight: "600", color: theme.colors.text, flex: 1 },
    messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    messageRowUser: { justifyContent: "flex-end" },
    messageRowBot: { justifyContent: "flex-start" },
    botAvatarSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: accent, alignItems: "center", justifyContent: "center", flexShrink: 0, marginBottom: 2 },
    bubble: { maxWidth: "80%", borderRadius: 18, padding: 12, paddingHorizontal: 14, gap: 4 },
    botBubble: { backgroundColor: theme.colors.elevated, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.sm },
    userBubble: { backgroundColor: accent, borderBottomRightRadius: 4 },
    bubbleText: { fontSize: 14, lineHeight: 21, color: theme.colors.text },
    userBubbleText: { color: theme.colors.white },
    bubbleTime: { fontSize: 10, color: theme.colors.textMuted, alignSelf: "flex-end" },
    userBubbleTime: { color: "rgba(255,255,255,0.72)" },
    typingBubble: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.elevated, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 14, gap: 5, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.sm },
    typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: accent, opacity: 0.78 },
    inputArea: { backgroundColor: theme.colors.elevated, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: 10 },
    socialRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    socialButton: { flexGrow: 1, minWidth: 96, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1 },
    socialText: { fontSize: 12, fontWeight: "700" },
    inputRow: { flexDirection: "row", gap: 10, borderRadius: 26, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.input, paddingHorizontal: 4, paddingVertical: 4, alignItems: "center" },
    inputRowFocused: { borderColor: accent },
    input: { flex: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: theme.colors.text },
    sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: accent, alignItems: "center", justifyContent: "center" },
    sendButtonDisabled: { backgroundColor: theme.colors.textMuted },
    pressed: { opacity: 0.76 },
  });
}
