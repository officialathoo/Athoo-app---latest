import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { api, realtime } from "@/services/api";
import { useAuth } from "./AuthContext";

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  isRead: boolean;
  createdAt: string;
  timestamp?: string;
  clientMessageId?: string;
  deliveryStatus?: string;
}

export interface Chat {
  id: string;
  participant1Id: string;
  participant2Id: string;
  participant1Name: string;
  participant2Name: string;
  lastMessage?: string;
  lastMessageAt?: string;
  bookingId?: string;
  service?: string;
  createdAt: string;
}

interface ChatContextType {
  chats: Chat[];
  messages: Record<string, Message[]>;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  sendMessage: (chatId: string, senderId: string, senderName: string, text: string) => Promise<void>;
  getOrCreateChat: (user1Id: string, user1Name: string, user2Id: string, user2Name: string, bookingId?: string, service?: string) => Promise<Chat>;
  markAsRead: (chatId: string, userId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  getMyChats: (userId: string) => Chat[];
  loadChats: () => Promise<void>;
  loadingChats: boolean;
  loadingMessages: boolean;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgTimeRef = useRef<Record<string, string>>({});
  const chatsLoadedRef = useRef(false);
  const chatsInFlightRef = useRef(false);
  const messagesInFlightRef = useRef<Set<string>>(new Set());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const loadChats = useCallback(async () => {
    if (!user || appStateRef.current !== "active" || chatsInFlightRef.current) return;
    chatsInFlightRef.current = true;
    try {
      const res = await api.getChats();
      setChats(res.chats as Chat[]);
    } catch {
      // Cached chat state remains visible during temporary network failures.
    } finally {
      chatsInFlightRef.current = false;
      if (!chatsLoadedRef.current) {
        chatsLoadedRef.current = true;
        setLoadingChats(false);
      }
    }
  }, [user]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!user) {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
      if (msgPollRef.current) clearInterval(msgPollRef.current);
      chatPollRef.current = null;
      msgPollRef.current = null;
      chatsLoadedRef.current = false;
      chatsInFlightRef.current = false;
      messagesInFlightRef.current.clear();
      lastMsgTimeRef.current = {};
      setChats([]);
      setMessages({});
      setActiveChatId(null);
      setLoadingChats(true);
      setLoadingMessages(false);
      return;
    }
    chatPollRef.current = setInterval(() => {
      if (appStateRef.current === "active") void loadChats();
    }, 60_000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [user, loadChats]);

  const loadMessages = useCallback(async (chatId: string, showLoading = false) => {
    if (appStateRef.current !== "active" || messagesInFlightRef.current.has(chatId)) return;
    messagesInFlightRef.current.add(chatId);
    if (showLoading) setLoadingMessages(true);
    try {
      // Load recent messages only (last 50) for better performance
      const res = await api.getMessages(chatId, undefined, 50);
      const incoming = res.messages as Message[];
      setMessages((prev) => {
        const existing = prev[chatId] || [];
        // Merge: keep existing optimistic messages not yet confirmed by server,
        // replace with server truth for everything else. Deduplicates by id.
        const serverIds = new Set(incoming.map((m) => m.id));
        const optimistic = existing.filter((m) => !serverIds.has(m.id) && (m as any)._optimistic);
        const merged = [...incoming, ...optimistic].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return { ...prev, [chatId]: merged };
      });
      if (incoming.length > 0) {
        lastMsgTimeRef.current[chatId] = incoming[incoming.length - 1].createdAt;
      }
    } catch {
      // Keep existing messages available when the device is offline.
    } finally {
      messagesInFlightRef.current.delete(chatId);
      if (showLoading) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!activeChatId) {
      if (msgPollRef.current) clearInterval(msgPollRef.current);
      msgPollRef.current = null;
      return;
    }
    const hasExisting = !!(messages[activeChatId]);
    loadMessages(activeChatId, !hasExisting);
    msgPollRef.current = setInterval(() => {
      if (appStateRef.current === "active") void loadMessages(activeChatId);
    }, 30_000);
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [activeChatId, loadMessages]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (nextState !== "active" || !user) return;
      void loadChats();
      if (activeChatId) void loadMessages(activeChatId);
    });
    return () => subscription.remove();
  }, [user, activeChatId, loadChats, loadMessages]);

  const getOrCreateChat = useCallback(
    async (
      user1Id: string, user1Name: string,
      user2Id: string, user2Name: string,
      bookingId?: string, service?: string
    ): Promise<Chat> => {
      if (!user) throw new Error("Not logged in");
      const res = await api.getOrCreateChat({
        otherUserId: user2Id,
        otherUserName: user2Name,
        myName: user1Name,
        bookingId,
        service,
      });
      const chat = res.chat as Chat;
      setChats((prev) => {
        const exists = prev.find((c) => c.id === chat.id);
        return exists ? prev.map((c) => c.id === chat.id ? chat : c) : [...prev, chat];
      });
      await loadMessages(chat.id);
      setActiveChatId(chat.id);
      return chat;
    },
    [user, loadMessages]
  );

  const sendMessage = useCallback(
    async (chatId: string, _senderId: string, senderName: string, text: string) => {
      // Optimistic: show message immediately with a temp id so the UI feels instant.
      const clientMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      const tempId = `opt_${clientMessageId}`;
      const optimisticMsg: Message & { _optimistic?: boolean } = {
        id: tempId,
        chatId,
        senderId: user?.id || "",
        senderName,
        text,
        isRead: false,
        createdAt: new Date().toISOString(),
        clientMessageId,
        deliveryStatus: "sending",
        _optimistic: true,
      };
      setMessages((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), optimisticMsg],
      }));
      setChats((prev) =>
        prev.map((c) => c.id === chatId ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() } : c)
      );

      try {
        const res = await api.sendMessage(chatId, text, clientMessageId);
        const confirmedMsg = res.message as Message;
        // Replace the optimistic message with the confirmed server message.
        setMessages((prev) => {
          const arr = prev[chatId] || [];
          // Remove temp + any duplicate of the confirmed id, then append confirmed.
          const filtered = arr.filter((m) => m.id !== tempId && m.id !== confirmedMsg.id && m.clientMessageId !== confirmedMsg.clientMessageId);
          return { ...prev, [chatId]: [...filtered, confirmedMsg] };
        });
      } catch (err) {
        // Rollback: remove the optimistic message so the user knows it failed.
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).filter((m) => m.id !== tempId),
        }));
        throw err; // re-throw so the UI can show an error toast
      }
    },
    [user]
  );

  const markAsRead = useCallback(async (chatId: string, _userId: string) => {
    try {
      await api.markChatRead(chatId);
    } catch {}
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    try {
      await api.deleteChat(chatId);

      // Immediately remove from local state
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages[chatId];
        return newMessages;
      });
      // Clear active chat if it was the deleted one
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }

    } catch (error) {
      throw error; // Re-throw to let the UI handle the error
    }
  }, [activeChatId]);

  // ── Real-time message delivery via WebSocket ───────────────────────────────
  // The server fires chat:message via emitToUser() when a message is sent.
  // We handle it here so messages appear instantly without waiting for the poll.
  // The 15s poll stays as a reliability fallback for reconnection scenarios.
  useEffect(() => {
    if (!user) return;
    const off = realtime.on((msg) => {
      if (msg.type === "chat:read") {
        const chatId = (msg.payload as any)?.chatId as string | undefined;
        const readerId = (msg.payload as any)?.readerId as string | undefined;
        if (!chatId || !readerId) return;
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((message) =>
            message.senderId !== readerId
              ? { ...message, isRead: true, deliveryStatus: "read" }
              : message
          ),
        }));
        return;
      }
      if (msg.type !== "chat:message") return;
      const incoming = (msg.payload as any)?.message as Message | undefined;
      const chatId = (msg.payload as any)?.chatId as string | undefined;
      if (!incoming?.id || !chatId) return;

      setMessages((prev) => {
        const existing = prev[chatId] || [];
        if (existing.some((m) => m.id === incoming.id)) return prev;
        const filtered = existing.filter(
          (m) => !(m as any)._optimistic || m.clientMessageId !== incoming.clientMessageId
        );
        return { ...prev, [chatId]: [...filtered, incoming] };
      });

      setChats((prev) => {
        const known = prev.some((chat) => chat.id === chatId);
        if (!known) {
          loadChats().catch(() => undefined);
          return prev;
        }
        return prev.map((chat) => chat.id === chatId
          ? { ...chat, lastMessage: incoming.text, lastMessageAt: incoming.createdAt }
          : chat
        );
      });
    });
    return off;
  }, [user, loadChats]);


  const getMyChats = useCallback(
    (userId: string) => {
      return chats.filter(
        (c) => c.participant1Id === userId || c.participant2Id === userId
      );
    },
    [chats]
  );

  return (
    <ChatContext.Provider
      value={{
        chats,
        messages,
        activeChatId,
        setActiveChatId,
        sendMessage,
        getOrCreateChat,
        markAsRead,
        deleteChat,
        getMyChats,
        loadChats,
        loadingChats,
        loadingMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

