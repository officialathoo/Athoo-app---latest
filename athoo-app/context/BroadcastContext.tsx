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
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { notificationService } from "@/services/NotificationService";
import { soundService } from "@/services/SoundService";

interface BroadcastContextType {
  openBroadcastCount: number;
  latestBroadcast: any | null;
  refreshBroadcasts: () => void;
  dismissLatestBroadcast: () => void;
}

const BroadcastContext = createContext<BroadcastContextType>({
  openBroadcastCount: 0,
  latestBroadcast: null,
  refreshBroadcasts: () => {},
  dismissLatestBroadcast: () => {},
});

export function useBroadcast() {
  return useContext(BroadcastContext);
}

export function BroadcastProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { push } = useNotifications();
  const [openBroadcastCount, setOpenBroadcastCount] = useState(0);
  const [latestBroadcast, setLatestBroadcast] = useState<any | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const refreshBroadcasts = useCallback(async () => {
    if (!user || user.role !== "provider") return;
    if (appStateRef.current !== "active") return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    try {
      const res = await api.getBroadcastRequests();
      if (!mountedRef.current) return;
      setOpenBroadcastCount(res.requests?.length ?? 0);
    } catch {
      // silently fail
    } finally {
      inFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (nextState === "active") {
        void refreshBroadcasts();
      }
    });
    return () => sub.remove();
  }, [refreshBroadcasts]);

  // Poll every 60s for providers as a light backup. WebSocket events remain primary;
  // the shorter interval prevents missed job alerts when mobile sockets sleep.
  useEffect(() => {
    mountedRef.current = true;
    if (!user || user.role !== "provider") {
      setOpenBroadcastCount(0);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    refreshBroadcasts();
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollRef.current = setInterval(refreshBroadcasts, 120_000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user, refreshBroadcasts]);

  // Real-time WebSocket listener — handles both provider (new jobs) and customer (responses)
  useEffect(() => {
    if (!user) return;

    const off = realtime.on((msg) => {
      // ── Provider: new broadcast job available ────────────────────────────────
      if (msg.type === "broadcast:new" && user.role === "provider") {
        const req = msg.payload?.request;
        if (!mountedRef.current) return;

        setLatestBroadcast(req ?? null);
        setOpenBroadcastCount((prev) => prev + 1);

        const serviceLabel = req?.serviceLabel ?? "service";
        const priceText = req?.customerOffer ? `Rs. ${req.customerOffer}` : "open price";
        const title = "New Broadcast Job!";
        const message = `${serviceLabel} — ${priceText} · ${req?.address ?? ""}`;

        push({
          type: "booking",
          title,
          message,
          role: "provider",
        });

        notificationService
          .scheduleBroadcastAlert(title, message, {
            broadcastRequestId: req?.id,
            role: "provider",
            type: "broadcast",
          })
          .catch(() => {});

        soundService.playRingtone().catch(() => soundService.playNotification().catch(() => {}));
      }

      // ── Customer: a provider responded to their broadcast ────────────────────
      if (msg.type === "broadcast:response" && user.role === "customer") {
        const resp = msg.payload?.response;
        if (!mountedRef.current) return;

        const providerName = resp?.providerName ?? "A provider";
        const priceText = resp?.providerOffer != null ? `Rs. ${resp.providerOffer}` : "open price";
        const title = "Provider responded to your request!";
        const message = `${providerName} offered ${priceText}`;

        push({
          type: "booking",
          title,
          message,
          role: "customer",
        });

        notificationService.scheduleResponseAlert(title, message, {
          broadcastResponseId: resp?.id,
          broadcastRequestId: resp?.requestId,
          role: "customer",
        }).catch(() => {});
        soundService.playNotification().catch(() => {});
      }

      // ── Provider: customer selected YOU ─────────────────────────────────────
      if (msg.type === "broadcast:selected" && user.role === "provider") {
        const { serviceLabel, customerName, booking } = msg.payload ?? {};
        if (!mountedRef.current) return;

        const title = "🎉 You got the job!";
        const message = `${customerName ?? "Customer"} selected you for ${serviceLabel ?? "a service"}`;

        push({ type: "booking", title, message, role: "provider", bookingId: booking?.id });
        notificationService.scheduleStatusAlert(title, message).catch(() => {});
        soundService.playRingtone().catch(() => soundService.playNotification().catch(() => {}));
        refreshBroadcasts();
      }

      // ── Provider: customer selected someone else ──────────────────────────
      if (msg.type === "broadcast:rejected" && user.role === "provider") {
        const { serviceLabel, customerName } = msg.payload ?? {};
        if (!mountedRef.current) return;

        const title = "Request filled";
        const message = `${customerName ?? "Customer"}'s ${serviceLabel ?? "request"} was filled by another provider`;

        push({ type: "system", title, message, role: "provider" });
        soundService.playNotification().catch(() => {});
        refreshBroadcasts();
      }

      if (msg.type === "broadcast:accepted" || msg.type === "broadcast:cancelled") {
        refreshBroadcasts();
      }
    });

    return off;
  }, [user, push, refreshBroadcasts]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dismissLatestBroadcast = useCallback(() => {
    setLatestBroadcast(null);
  }, []);

  return (
    <BroadcastContext.Provider
      value={{ openBroadcastCount, latestBroadcast, refreshBroadcasts, dismissLatestBroadcast }}
    >
      {children}
    </BroadcastContext.Provider>
  );
}
