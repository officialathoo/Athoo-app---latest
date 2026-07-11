import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { api, realtime } from "@/services/api";
import { useAuth } from "./AuthContext";
import { notificationService } from "@/services/NotificationService";
import { soundService } from "@/services/SoundService";

export type NegotiationStatus =
  | "customer_offer"
  | "provider_counter"
  | "accepted"
  | "rejected";

export interface NegotiationMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  offerAmount?: number;
  timestamp: string;
}

export interface Negotiation {
  id: string;
  customerId: string;
  providerId: string;
  customerName: string;
  providerName: string;
  service: string;
  customerOffer: number;
  providerCounter?: number;
  finalPrice?: number;
  status: NegotiationStatus;
  messages: NegotiationMessage[];
  createdAt: string;
  updatedAt: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  bookingId?: string | null;
}

export interface NegotiationAlert {
  type: "new_negotiation" | "counter_offer" | "accepted" | "rejected";
  title: string;
  message: string;
  negotiation: Negotiation;
}

interface NegotiationContextType {
  negotiations: Negotiation[];
  isLoading: boolean;
  pendingAlerts: NegotiationAlert[];
  consumeNegAlerts: () => NegotiationAlert[];
  createNegotiation: (data: {
    providerId: string;
    providerName: string;
    service: string;
    customerOffer: number;
    address?: string;
    latitude?: number;
    longitude?: number;
    scheduledDate?: string;
    scheduledTime?: string;
    mediaUrls?: string[];
  }) => Promise<Negotiation>;
  counterOffer: (
    id: string,
    amount: number,
    message: string,
    senderName: string
  ) => Promise<void>;
  acceptOffer: (id: string, finalPrice?: number) => Promise<{ negotiation: Negotiation; bookingId?: string | null }>;
  rejectOffer: (id: string) => Promise<void>;
  getMyNegotiations: (userId: string) => Negotiation[];
  loadNegotiations: (opts?: { silent?: boolean }) => Promise<void>;
}

const NegotiationContext = createContext<NegotiationContextType | null>(null);

const NEGOTIATION_POLL_INTERVAL_MS = 60_000;

function negKey(n: Negotiation): string {
  return `${n.id}:${n.status}:${(n.messages || []).length}:${n.updatedAt || ""}`;
}

function isLikelyNetworkError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("network error")
  );
}

export function NegotiationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAlerts, setPendingAlerts] = useState<NegotiationAlert[]>([]);

  const pendingAlertsRef = useRef<NegotiationAlert[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenKeysRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const isPollingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const consumeNegAlerts = useCallback((): NegotiationAlert[] => {
    const copy = [...pendingAlertsRef.current];
    pendingAlertsRef.current = [];
    setPendingAlerts([]);
    return copy;
  }, []);

  const loadNegotiations = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user) {
        setNegotiations([]);
        seenKeysRef.current.clear();
        return;
      }

      const silent = opts?.silent === true;
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      if (!silent) {
        setIsLoading(true);
      }

      try {
        const res = await api.getNegotiations();
        const list = Array.isArray(res?.negotiations) ? (res.negotiations as Negotiation[]) : [];
        setNegotiations(list);

        if (!initializedRef.current) {
          list.forEach((n) => seenKeysRef.current.add(negKey(n)));
          initializedRef.current = true;
        }
      } catch (error) {
        if (!isLikelyNetworkError(error)) {
          console.log("Failed to load negotiations:", error);
        }
      } finally {
        isLoadingRef.current = false;
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [user]
  );

  useEffect(() => {
    void loadNegotiations();
  }, [loadNegotiations]);

  const pollNegotiations = useCallback(async () => {
    if (!user) return;
    if (appStateRef.current !== "active") return;
    if (isPollingRef.current) return;

    isPollingRef.current = true;

    try {
      const res = await api.getNegotiations();
      const fresh = Array.isArray(res?.negotiations) ? (res.negotiations as Negotiation[]) : [];
      const newAlerts: NegotiationAlert[] = [];

      for (const n of fresh) {
        const key = negKey(n);
        if (seenKeysRef.current.has(key)) continue;
        seenKeysRef.current.add(key);

        let alert: NegotiationAlert | null = null;

        if (user.role === "provider" && n.providerId === user.id) {
          if (n.status === "customer_offer") {
            alert = {
              type: "new_negotiation",
              title: "💰 Price Negotiation!",
              message: `${n.customerName} offered Rs. ${n.customerOffer} for ${n.service}`,
              negotiation: n,
            };
          }
        }

        if (user.role === "customer" && n.customerId === user.id) {
          if (n.status === "provider_counter") {
            alert = {
              type: "counter_offer",
              title: "🔄 Counter Offer!",
              message: `${n.providerName} countered at Rs. ${n.providerCounter} for ${n.service}`,
              negotiation: n,
            };
          } else if (n.status === "accepted") {
            alert = {
              type: "accepted",
              title: "✅ Offer Accepted!",
              message: `${n.providerName} accepted Rs. ${n.finalPrice} for ${n.service}`,
              negotiation: n,
            };
          } else if (n.status === "rejected") {
            alert = {
              type: "rejected",
              title: "❌ Offer Rejected",
              message: `${n.providerName} declined the ${n.service} offer`,
              negotiation: n,
            };
          }
        }

        if (alert) {
          try {
            await notificationService.scheduleStatusAlert(alert.title, alert.message, {
              role: user.role === "provider" ? "provider" : "customer",
              negotiationId: n.id,
            });
          } catch {
            // ignore notification scheduling errors
          }

          try {
            await soundService.playNotification();
          } catch {
            // ignore sound errors
          }

          newAlerts.push(alert);
        }
      }

      if (newAlerts.length > 0) {
        pendingAlertsRef.current = [...pendingAlertsRef.current, ...newAlerts];
        setPendingAlerts((prev) => [...prev, ...newAlerts]);
      }

      setNegotiations(fresh);
    } catch (error) {
      if (!isLikelyNetworkError(error)) {
        console.log("Negotiation polling issue:", error);
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      pollRef.current = null;
      initializedRef.current = false;
      seenKeysRef.current.clear();
      setNegotiations([]);
      return;
    }

    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    pollRef.current = setInterval(() => {
      void pollNegotiations();
    }, NEGOTIATION_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      pollRef.current = null;
    };
  }, [user, pollNegotiations]);

  // ── Real-time WebSocket delivery ──────────────────────────────────────────
  // The 15-second poll is only a fallback. All live events arrive here first.
  useEffect(() => {
    if (!user) return;

    const off = realtime.on((msg) => {
      const isNew = msg.type === "negotiation:new";
      const isUpdated = msg.type === "negotiation:updated";
      const isExpired = msg.type === "negotiation:expired";

      if (!isNew && !isUpdated && !isExpired) return;

      const neg = (msg.payload as any)?.negotiation as Negotiation | undefined;
      if (!neg) return;

      // Mark this state as already seen so the polling loop doesn't re-alert.
      seenKeysRef.current.add(negKey(neg));

      if (isExpired) {
        setNegotiations((prev) =>
          prev.map((n) => (n.id === neg.id ? { ...n, status: "rejected" as NegotiationStatus } : n))
        );
        return;
      }

      // Upsert into the local list.
      setNegotiations((prev) => {
        const exists = prev.some((n) => n.id === neg.id);
        return exists ? prev.map((n) => (n.id === neg.id ? neg : n)) : [neg, ...prev];
      });

      // Build an alert based on who we are and what just happened.
      let alert: NegotiationAlert | null = null;

      if (isNew && user.role === "provider" && neg.providerId === user.id) {
        alert = {
          type: "new_negotiation",
          title: "💰 New Price Offer!",
          message: `${neg.customerName} offered Rs. ${neg.customerOffer} for ${neg.service}`,
          negotiation: neg,
        };
      }

      if (isUpdated && user.role === "customer" && neg.customerId === user.id) {
        if (neg.status === "provider_counter") {
          alert = {
            type: "counter_offer",
            title: "🔄 Counter Offer!",
            message: `${neg.providerName} countered at Rs. ${neg.providerCounter} for ${neg.service}`,
            negotiation: neg,
          };
        } else if (neg.status === "accepted") {
          alert = {
            type: "accepted",
            title: "✅ Offer Accepted!",
            message: `${neg.providerName} accepted Rs. ${neg.finalPrice} for ${neg.service}`,
            negotiation: neg,
          };
        } else if (neg.status === "rejected") {
          alert = {
            type: "rejected",
            title: "❌ Offer Rejected",
            message: `${neg.providerName} declined the ${neg.service} offer`,
            negotiation: neg,
          };
        }
      }

      if (isUpdated && user.role === "provider" && neg.providerId === user.id) {
        if (neg.status === "customer_offer") {
          alert = {
            type: "new_negotiation",
            title: "💰 Customer Re-offered!",
            message: `${neg.customerName} updated their offer to Rs. ${neg.customerOffer} for ${neg.service}`,
            negotiation: neg,
          };
        }
      }

      if (alert) {
        soundService.playNotification().catch(() => {});
        notificationService
          .scheduleStatusAlert(alert.title, alert.message, {
            role: user.role === "provider" ? "provider" : "customer",
            negotiationId: neg.id,
          })
          .catch(() => {});
        pendingAlertsRef.current = [...pendingAlertsRef.current, alert];
        setPendingAlerts((prev) => [...prev, alert!]);
      }
    });

    return off;
  }, [user]);
  // ─────────────────────────────────────────────────────────────────────────

  const createNegotiation = useCallback(
    async (data: {
      providerId: string;
      providerName: string;
      service: string;
      customerOffer: number;
      address?: string;
      latitude?: number;
      longitude?: number;
      scheduledDate?: string;
      scheduledTime?: string;
      mediaUrls?: string[];
    }): Promise<Negotiation> => {
      if (!user) throw new Error("Not logged in");

      const res = await api.createNegotiation({
        ...data,
        customerName: user.name,
      });

      const neg = res.negotiation as Negotiation;
      setNegotiations((prev) => [neg, ...prev]);
      seenKeysRef.current.add(negKey(neg));
      return neg;
    },
    [user]
  );

  const counterOffer = useCallback(
    async (id: string, amount: number, message: string, senderName: string) => {
      const res = await api.counterOffer(id, amount, message, senderName);
      const updated = res.negotiation as Negotiation;
      seenKeysRef.current.add(negKey(updated));
      setNegotiations((prev) => prev.map((n) => (n.id === id ? updated : n)));
    },
    []
  );

  const acceptOffer = useCallback(async (id: string, _finalPrice?: number): Promise<{ negotiation: Negotiation; bookingId?: string | null }> => {
    const res = await api.acceptOffer(id);
    const updated = res.negotiation as Negotiation;
    const bookingId = (res as any).bookingId as string | null ?? updated.bookingId ?? null;
    if (bookingId) {
      updated.bookingId = bookingId;
    }
    seenKeysRef.current.add(negKey(updated));
    setNegotiations((prev) => prev.map((n) => (n.id === id ? updated : n)));
    return { negotiation: updated, bookingId };
  }, []);

  const rejectOffer = useCallback(async (id: string) => {
    const res = await api.rejectOffer(id);
    const updated = res.negotiation as Negotiation;
    seenKeysRef.current.add(negKey(updated));
    setNegotiations((prev) => prev.map((n) => (n.id === id ? updated : n)));
  }, []);

  const getMyNegotiations = useCallback(
    (userId: string) => {
      return negotiations.filter(
        (n) => n.customerId === userId || n.providerId === userId
      );
    },
    [negotiations]
  );

  return (
    <NegotiationContext.Provider
      value={{
        negotiations,
        isLoading,
        pendingAlerts,
        consumeNegAlerts,
        createNegotiation,
        counterOffer,
        acceptOffer,
        rejectOffer,
        getMyNegotiations,
        loadNegotiations,
      }}
    >
      {children}
    </NegotiationContext.Provider>
  );
}

export function useNegotiation() {
  const ctx = useContext(NegotiationContext);
  if (!ctx) throw new Error("useNegotiation must be used within NegotiationProvider");
  return ctx;
}
