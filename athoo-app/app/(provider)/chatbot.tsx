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

const FAQ_PROVIDER = [
  { q: "How do I accept a job?", icon: "briefcase" },
  { q: "How does the start OTP work?", icon: "key" },
  { q: "How are my earnings calculated?", icon: "dollar-sign" },
  { q: "How does commission work?", icon: "percent" },
  { q: "How do I handle negotiations?", icon: "tag" },
  { q: "How do I get more jobs?", icon: "trending-up" },
  { q: "How do I get verified?", icon: "shield" },
  { q: "How do I withdraw money?", icon: "arrow-up-circle" },
];

function getTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

const BOT_INTRO: Message = {
  id: "intro",
  from: "bot",
  text: "Hi! I'm your Athoo Provider Assistant. 😊\n\nI can help you with jobs, OTPs, earnings, commissions, negotiations, and more.\n\nTap a question below or type your own!",
  time: getTime(),
};

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

export default function ProviderChatbotScreen() {
  const [messages, setMessages] = useState<Message[]>([BOT_INTRO]);
  const [input, setInput] = useState("");
  const [botTyping, setBotTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

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
      const fallback = "I'm having trouble connecting right now. Please contact Provider Support:\n\n📱 WhatsApp: +92 339 0051068";
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
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={styles.botInfo}>
            <View style={styles.botAvatar}>
              <Icon name="cpu" size={18} color="#fff" />
            </View>
            <View>
              <Text style={styles.botName}>Provider Support</Text>
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Always Online</Text>
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
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 1 && !botTyping && (
            <View style={styles.quickSection}>
              <Text style={styles.quickLabel}>Frequently Asked</Text>
              <View style={styles.quickGrid}>
                {FAQ_PROVIDER.map((item, i) => (
                  <Pressable key={i} style={styles.quickChip} onPress={() => sendMessage(item.q)}>
                    <Icon name={item.icon as any} size={13} color={Colors.secondary} />
                    <Text style={styles.quickChipText}>{item.q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {messages.map((msg) => (
            <View key={msg.id} style={[styles.msgRow, msg.from === "user" ? styles.msgRowUser : styles.msgRowBot]}>
              {msg.from === "bot" && (
                <View style={styles.botAvatarSmall}>
                  <Icon name="cpu" size={11} color="#fff" />
                </View>
              )}
              <View style={[styles.bubble, msg.from === "user" ? styles.bubbleUser : styles.bubbleBot]}>
                <Text style={[styles.bubbleText, msg.from === "user" && styles.bubbleTextUser]}>{msg.text}</Text>
                <Text style={[styles.bubbleTime, msg.from === "user" && { color: "rgba(255,255,255,0.65)" }]}>{msg.time}</Text>
              </View>
            </View>
          ))}

          {botTyping && (
            <View style={[styles.msgRow, styles.msgRowBot]}>
              <View style={styles.botAvatarSmall}>
                <Icon name="cpu" size={11} color="#fff" />
              </View>
              <TypingDots />
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputArea, { paddingBottom: botPad + 10 }]}>
          <View style={[styles.socialRow]}>
            <Pressable style={[styles.socialBtn, { backgroundColor: "#25D36618" }]} onPress={() => Linking.openURL("https://wa.me/923390051068")}>
              <Icon name="phone" size={14} color="#25D366" />
              <Text style={[styles.socialBtnText, { color: "#25D366" }]}>WhatsApp</Text>
            </Pressable>
            <Pressable style={[styles.socialBtn, { backgroundColor: "#E1306C18" }]} onPress={() => Linking.openURL("https://instagram.com/athoo_services")}>
              <Icon name="instagram" size={14} color="#E1306C" />
              <Text style={[styles.socialBtnText, { color: "#E1306C" }]}>Instagram</Text>
            </Pressable>
          </View>
          <View style={[styles.inputRow, inputFocused && styles.inputRowFocused]}>
            <TextInput
              style={styles.input}
              placeholder="Ask a question..."
              value={input}
              onChangeText={setInput}
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
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4FA" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  botInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  botAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  botName: { fontSize: 16, fontWeight: "800", color: "#fff" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4ADE80" },
  onlineText: { fontSize: 11, color: "rgba(255,255,255,0.85)" },
  whatsappBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 10, paddingBottom: 24 },
  quickSection: { gap: 10, marginBottom: 6 },
  quickLabel: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
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
    borderColor: Colors.secondary + "25",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  quickChipText: { fontSize: 13, fontWeight: "600", color: Colors.text, flex: 1 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowBot: { justifyContent: "flex-start" },
  botAvatarSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center", flexShrink: 0, marginBottom: 2 },
  bubble: { maxWidth: "78%", borderRadius: 18, padding: 12, paddingHorizontal: 14, gap: 4 },
  bubbleBot: { backgroundColor: "#fff", borderBottomLeftRadius: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  bubbleUser: { backgroundColor: Colors.secondary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 21, color: Colors.text },
  bubbleTextUser: { color: "#fff" },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, textAlign: "right" },
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
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.secondary, opacity: 0.7 },
  inputArea: { backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },
  socialRow: { flexDirection: "row", gap: 10 },
  socialBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 9 },
  socialBtnText: { fontSize: 12, fontWeight: "700" },
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
  inputRowFocused: { borderColor: Colors.secondary },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: Colors.text },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: Colors.textMuted },
});
