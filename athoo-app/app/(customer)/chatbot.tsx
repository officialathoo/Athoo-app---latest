import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState, useEffect } from "react";
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
import { Colors } from "@/constants/colors";
import { api } from "@/services/api";

interface Message { id: string; from: "user" | "bot"; text: string; time: string; }

const FAQ = [
  { q: "How do I book a service?", icon: "calendar" },
  { q: "How does price negotiation work?", icon: "tag" },
  { q: "Is my phone number safe?", icon: "shield" },
  { q: "How do I pay for services?", icon: "credit-card" },
  { q: "What is the arrival OTP?", icon: "key" },
  { q: "How do I cancel a booking?", icon: "x-circle" },
  { q: "What areas do you serve?", icon: "map-pin" },
  { q: "How do I contact support?", icon: "headphones" },
];

const BOT_INTRO: Message = {
  id: "intro",
  from: "bot",
  text: "Hi! I'm Athoo Assistant. 😊\n\nI can help you with bookings, payments, providers, privacy, and more.\n\nSelect a question below or type your own!",
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
};

function getTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 150);
    const a3 = anim(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.typingBubble}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

export default function ChatbotScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const [messages, setMessages] = useState<Message[]>([BOT_INTRO]);
  const [input, setInput] = useState("");
  const [botTyping, setBotTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const sendMessage = async (text: string) => {
    if (!text.trim() || botTyping) return;
    const userMsg: Message = { id: Date.now().toString(), from: "user", text: text.trim(), time: getTime() };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setBotTyping(true);
    scrollToEnd();

    try {
      const res = await api.chatbot(text.trim());
      const botMsg: Message = { id: (Date.now() + 1).toString(), from: "bot", text: res.reply, time: getTime() };
      setBotTyping(false);
      setMessages((p) => [...p, botMsg]);
    } catch {
      const fallback = "I'm having trouble connecting. Please try again or contact our support team on WhatsApp: +92 339 0051068";
      setBotTyping(false);
      setMessages((p) => [...p, { id: (Date.now() + 1).toString(), from: "bot", text: fallback, time: getTime() }]);
    }
    scrollToEnd();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.container, { paddingTop: topPad }]}>
        <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={styles.headerBot}>
            <View style={styles.botAvatar}>
              <Icon name="cpu" size={18} color="#fff" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Athoo Assistant</Text>
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online · Replies instantly</Text>
              </View>
            </View>
          </View>
          <Pressable
            style={styles.whatsappBtn}
            onPress={() => Linking.openURL("https://wa.me/923390051068")}
          >
            <Icon name="phone" size={16} color="#25D366" />
          </Pressable>
        </LinearGradient>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => (
            <View key={m.id} style={[styles.msgRow, m.from === "user" && styles.msgRowUser]}>
              {m.from === "bot" && (
                <View style={styles.botAvatarSmall}>
                  <Icon name="cpu" size={11} color="#fff" />
                </View>
              )}
              <View style={[styles.bubble, m.from === "user" ? styles.bubbleUser : styles.bubbleBot]}>
                <Text style={[styles.bubbleText, m.from === "user" && styles.bubbleTextUser]}>{m.text}</Text>
                <Text style={[styles.bubbleTime, m.from === "user" && styles.bubbleTimeUser]}>{m.time}</Text>
              </View>
            </View>
          ))}

          {botTyping && (
            <View style={[styles.msgRow]}>
              <View style={styles.botAvatarSmall}>
                <Icon name="cpu" size={11} color="#fff" />
              </View>
              <TypingDots />
            </View>
          )}

          {messages.length === 1 && !botTyping && (
            <View style={styles.quickReplies}>
              <Text style={styles.quickTitle}>Frequently Asked</Text>
              <View style={styles.quickGrid}>
                {FAQ.map((f, i) => (
                  <Pressable
                    key={i}
                    style={styles.quickChip}
                    onPress={() => sendMessage(f.q)}
                  >
                    <Icon name={f.icon as any} size={13} color={Colors.primary} />
                    <Text style={styles.quickText}>{f.q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputArea, { paddingBottom: bottomPad + 10 }]}>
          <View style={[styles.inputRow, inputFocused && styles.inputRowFocused]}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Type a message..."
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={() => sendMessage(input)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              returnKeyType="send"
              multiline={false}
            />
            <Pressable
              style={[styles.sendBtn, (!input.trim() || botTyping) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || botTyping}
            >
              <Icon name="send" size={18} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.socialRow}>
            <Pressable style={styles.socialBtn} onPress={() => Linking.openURL("https://wa.me/923390051068")}>
              <Icon name="phone" size={13} color="#25D366" />
              <Text style={[styles.socialText, { color: "#25D366" }]}>WhatsApp</Text>
            </Pressable>
            <View style={styles.socialDivider} />
            <Pressable style={styles.socialBtn} onPress={() => Linking.openURL("https://instagram.com/athoo_services")}>
              <Icon name="instagram" size={13} color="#E1306C" />
              <Text style={[styles.socialText, { color: "#E1306C" }]}>Instagram</Text>
            </Pressable>
            <View style={styles.socialDivider} />
            <Pressable style={styles.socialBtn} onPress={() => Linking.openURL("https://facebook.com/athoo.services")}>
              <Icon name="facebook" size={13} color="#1877F2" />
              <Text style={[styles.socialText, { color: "#1877F2" }]}>Facebook</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4FA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBot: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  botAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4ADE80" },
  onlineText: { fontSize: 11, color: "rgba(255,255,255,0.85)" },
  whatsappBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  messages: { flex: 1 },
  messagesContent: { padding: 16, gap: 10, paddingBottom: 24 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { flexDirection: "row-reverse" },
  botAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  bubbleBot: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleUser: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  bubbleTextUser: { color: "#fff" },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, alignSelf: "flex-end" },
  bubbleTimeUser: { color: "rgba(255,255,255,0.65)" },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    opacity: 0.7,
  },
  quickReplies: { marginTop: 8, gap: 10 },
  quickTitle: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  quickGrid: { gap: 8 },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  quickText: { fontSize: 13, fontWeight: "600", color: Colors.text, flex: 1 },
  inputArea: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: "#F7F9FC",
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: "center",
  },
  inputRowFocused: { borderColor: Colors.primary },
  textInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: Colors.textMuted },
  socialRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12 },
  socialDivider: { width: 1, height: 14, backgroundColor: Colors.border },
  socialBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  socialText: { fontSize: 12, fontWeight: "700" },
});
