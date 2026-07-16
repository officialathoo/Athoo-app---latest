import { appLogger } from "@/lib/logger";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus } from "react-native";
import { api, realtime } from "@/services/api";
import { useAuth } from "./AuthContext";
import { notificationService } from "@/services/NotificationService";

export type BookingStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Booking {
  id: string;
  publicId?: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  providerId: string;
  providerName: string;
  providerPhone: string;
  service: string;
  serviceIcon: string;
  description?: string;
  attachment?: string | null;
  videoUrl?: string | null;
  address: string;
  scheduledDate: string;
  scheduledTime: string;
  status: BookingStatus;
  price?: number;
  rating?: number;
  review?: string;
  startPin?: string;
  completePin?: string;
  jobStartedAt?: string;
  jobCompletedAt?: string;
  paymentStatus?: "pending" | "paid" | "received";
  paidAt?: string | null;
  receivedAt?: string | null;
  commissionAmount?: number | null;
  providerAmount?: number | null;
  ratePerHour?: number | null;
  visitCharge?: number | null;
  createdAt: string;
  updatedAt: string;
  customerProfileImage?: string | null;
  providerProfileImage?: string | null;
  providerProfileColor?: string | null;
  providerArrivedAt?: string;
  customerLat?: number | null;
  customerLng?: number | null;
  providerLat?: number | null;
  providerLng?: number | null;
  providerAccuracy?: number | null;
  providerUpdatedAt?: string | null;
}

export interface BookingAlert {
  type: "booking" | "status";
  title: string;
  message: string;
  booking: Booking;
}

interface BookingContextType {
  bookings: Booking[];
  isLoading: boolean;
  pendingAlerts: BookingAlert[];
  consumeAlerts: () => BookingAlert[];
  pendingRatingBooking: Booking | null;
  clearPendingRating: () => void;
  createBooking: (data: {
    providerId: string;
    service: string;
    serviceIcon: string;
    categorySlug?: string;
    description?: string;
    attachment?: string;
    address: string;
    scheduledDate: string;
    scheduledTime: string;
    price?: number;
    visitCharge?: number;
    pickedLat?: number;
    pickedLng?: number;
    customerLat?: number;
    customerLng?: number;
    addressMode?: string;
  }) => Promise<Booking>;
  updateBookingStatus: (id: string, status: BookingStatus, price?: number) => Promise<void>;
  rateBooking: (id: string, rating: number, review: string) => Promise<void>;
  getMyBookings: (userId: string, role: "customer" | "provider") => Booking[];
  loadBookings: () => Promise<void>;
}

const BookingContext = createContext<BookingContextType | null>(null);

const SEEN_BOOKINGS_KEY = "athoo_seen_booking_ids";
const SEEN_STATUSES_KEY = "athoo_seen_booking_statuses";
const SEEN_ARRIVED_KEY = "athoo_seen_booking_arrivals";
const BOOKING_POLL_INTERVAL_MS = 120_000;

async function getSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_BOOKINGS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

async function markIdsSeen(ids: string[]): Promise<void> {
  try {
    const existing = await getSeenIds();
    ids.forEach((id) => existing.add(id));
    const arr = Array.from(existing);
    const trimmed = arr.slice(-200);
    await AsyncStorage.setItem(SEEN_BOOKINGS_KEY, JSON.stringify(trimmed));
  } catch {}
}

async function getSeenStatuses(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_STATUSES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveSeenStatuses(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_STATUSES_KEY, JSON.stringify(map));
  } catch {}
}

async function getSeenArrivals(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_ARRIVED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveSeenArrivals(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_ARRIVED_KEY, JSON.stringify(map));
  } catch {}
}

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAlerts, setPendingAlerts] = useState<BookingAlert[]>([]);
  const [pendingRatingBooking, setPendingRatingBooking] = useState<Booking | null>(null);

  const clearPendingRating = useCallback(() => {
    setPendingRatingBooking(null);
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const consumeAlerts = useCallback((): BookingAlert[] => {
    const copy: BookingAlert[] = [];
    setPendingAlerts((prev) => {
      copy.push(...prev);
      return [];
    });
    return copy;
  }, []);

  const loadBookings = useCallback(async () => {
    if (!user) {
      setBookings([]);
      setPendingAlerts([]);
      setPendingRatingBooking(null);
      return;
    }
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;
    setIsLoading(true);
    try {
      const res = await api.getBookings();
      setBookings(res.bookings as Booking[]);
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (!msg.includes("401") && !msg.includes("Unauthorized") && !msg.toLowerCase().includes("timeout")) {
        appLogger.warn("bookings", "Failed to load bookings:", e);
      }
    } finally {
      loadInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (nextState === "active" && user) {
        void loadBookings();
      }
    });
    return () => sub.remove();
  }, [user, loadBookings]);

  useEffect(() => {
    if (!user) {
      setPendingAlerts([]);
      setPendingRatingBooking(null);
      initializedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [user]);

  const pollForNewBookings = useCallback(async () => {
    if (!user) return;
    if (appStateRef.current !== "active") return;
    if (pollInFlightRef.current) return;

    pollInFlightRef.current = true;
    try {
      const res = await api.getBookings();
      const fresh: Booking[] = res.bookings as Booking[];

      if (user.role === "provider") {
        const seenIds = await getSeenIds();
        const myNewPending = fresh.filter(
          (b) =>
            b.providerId === user.id &&
            b.status === "pending" &&
            !seenIds.has(b.id)
        );

        if (myNewPending.length > 0) {
          const newAlerts: BookingAlert[] = [];

          for (const b of myNewPending) {
            const title = "📋 New Booking Request!";
            const message = `${b.customerName} needs ${b.service} at ${b.address}`;
            newAlerts.push({ type: "booking", title, message, booking: b });
          }
          await notificationService.playRealtimeFallback("booking").catch(() => {});

          setPendingAlerts((prev) => [...prev, ...newAlerts]);
          await markIdsSeen(myNewPending.map((b) => b.id));
        }
      }

      if (user.role === "customer") {
        const seenStatuses = await getSeenStatuses();
        const seenArrivals = await getSeenArrivals();
        const myBookings = fresh.filter((b) => b.customerId === user.id);
        const changedStatuses: Record<string, string> = { ...seenStatuses };
        const changedArrivals: Record<string, string> = { ...seenArrivals };
        let notified = false;

        const statusAlerts: BookingAlert[] = [];

        for (const b of myBookings) {
          const prev = seenStatuses[b.id];
          if (prev && prev !== b.status) {
            let title = "";
            let message = "";

            if (b.status === "accepted") {
              title = "✅ Booking Accepted!";
              message = `${b.providerName} accepted your ${b.service} request`;
            } else if (b.status === "cancelled") {
              title = "❌ Booking Cancelled";
              message = `Your ${b.service} booking was cancelled`;
            } else if (b.status === "in_progress") {
              title = "🔧 Work Started";
              message = `${b.providerName} has started working on your ${b.service}`;
            } else if (b.status === "completed") {
              title = "🎉 Job Completed!";
              message = `${b.providerName} completed your ${b.service}. Don't forget to rate!`;
            }

            if (title) {
              statusAlerts.push({ type: "status", title, message, booking: b });
              notified = true;
            }
          }

          const arrivedAt = (b as any).providerArrivedAt ? String((b as any).providerArrivedAt) : "";
          if (arrivedAt && seenArrivals[b.id] !== arrivedAt) {
            const title = "📍 Provider Arrived";
            const message = `${b.providerName} has arrived near your location for ${b.service}`;
            statusAlerts.push({ type: "status", title, message, booking: b });
            notified = true;
            changedArrivals[b.id] = arrivedAt;
          } else if (arrivedAt) {
            changedArrivals[b.id] = arrivedAt;
          }

          changedStatuses[b.id] = b.status;
        }

        if (statusAlerts.length > 0) {
          setPendingAlerts((prev) => [...prev, ...statusAlerts]);
        }

        if (notified) {
          await notificationService.playRealtimeFallback("status").catch(() => {});
          await saveSeenStatuses(changedStatuses);
          await saveSeenArrivals(changedArrivals);
        } else if (
          Object.keys(changedStatuses).length > Object.keys(seenStatuses).length ||
          Object.keys(changedArrivals).length > Object.keys(seenArrivals).length
        ) {
          await saveSeenStatuses(changedStatuses);
          await saveSeenArrivals(changedArrivals);
        }
      }

      setBookings(fresh);
    } catch {
      // Silent: polling must never destabilize auth/session state.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      initializedRef.current = false;
      return;
    }

    notificationService.init();

    if (!initializedRef.current) {
      initializedRef.current = true;
      (async () => {
        const res = await api.getBookings().catch(() => null);
        if (!res) return;

        const fresh: Booking[] = res.bookings;

        if (user.role === "provider") {
          const pending = fresh.filter(
            (b) => b.providerId === user.id && b.status === "pending"
          );
          await markIdsSeen(pending.map((b) => b.id));
        }

        if (user.role === "customer") {
          const map: Record<string, string> = {};
          const arrivals: Record<string, string> = {};
          fresh
            .filter((b) => b.customerId === user.id)
            .forEach((b: any) => {
              map[b.id] = b.status;
              if (b.providerArrivedAt) {
                arrivals[b.id] = String(b.providerArrivedAt);
              }
            });
          await saveSeenStatuses(map);
          await saveSeenArrivals(arrivals);
        }
      })();
    }

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollRef.current = setInterval(pollForNewBookings, BOOKING_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user, pollForNewBookings]);

  useEffect(() => {
    const off = realtime.on((msg) => {
      // Live provider location — update coords without a full reload.
      if (msg.type === "booking:location") {
        const { bookingId, providerLat, providerLng, providerAccuracy, providerUpdatedAt } = msg.payload || {};
        if (!bookingId) return;
        setBookings((prev) =>
          prev.map((b) =>
            b.id === bookingId
              ? { ...b, providerLat: providerLat ?? b.providerLat, providerLng: providerLng ?? b.providerLng, providerAccuracy: providerAccuracy ?? b.providerAccuracy, providerUpdatedAt: providerUpdatedAt ?? b.providerUpdatedAt }
              : b
          )
        );
        return;
      }

      // Any booking mutation — merge the fresh booking into state immediately so
      // the customer sees the OTP, status change, arrival flag, etc. without
      // waiting for the next 20-second poll cycle.
      const BOOKING_EVENTS = new Set([
        "booking:updated",
        "booking:accepted",
        "booking:started",
        "booking:completed",
        "booking:cancelled",
        "booking:arrived",
        "booking:new",
        "booking:status",
      ]);
      if (BOOKING_EVENTS.has(msg.type)) {
        const fresh = (msg.payload as any)?.booking as Booking | undefined;
        if (!fresh?.id) return;
        setBookings((prev) => {
          const exists = prev.some((b) => b.id === fresh.id);
          if (exists) return prev.map((b) => (b.id === fresh.id ? { ...b, ...fresh } : b));
          return [fresh, ...prev];
        });
        if (msg.type === "booking:new" && user?.role === "provider") {
          notificationService.playRealtimeFallback("booking").catch(() => {});
        }
      }
    });
    return off;
  }, []);

  const createBooking = useCallback(
    async (data: {
      providerId: string;
      service: string;
      serviceIcon: string;
      categorySlug?: string;
      description?: string;
      attachment?: string;
      address: string;
      scheduledDate: string;
      scheduledTime: string;
      price?: number;
      visitCharge?: number;
      pickedLat?: number;
      pickedLng?: number;
      customerLat?: number;
      customerLng?: number;
      addressMode?: string;
    }): Promise<Booking> => {
      const res = await api.createBooking({
        providerId: data.providerId,
        service: data.service,
        serviceIcon: data.serviceIcon,
        categorySlug: data.categorySlug,
        description: data.description,
        attachment: data.attachment,
        address: data.address,
        scheduledDate: data.scheduledDate,
        scheduledTime: data.scheduledTime,
        price: data.price,
        visitCharge: data.visitCharge,
        pickedLat: data.pickedLat,
        pickedLng: data.pickedLng,
        customerLat: data.customerLat,
        customerLng: data.customerLng,
        addressMode: data.addressMode,
      });

      const booking = res.booking as Booking;
      setBookings((prev) => [booking, ...prev]);
      return booking;
    },
    []
  );

  const updateBookingStatus = useCallback(
    async (id: string, status: BookingStatus, price?: number) => {
      const res = await api.updateBookingStatus(id, status, price);
      const updated = res.booking as Booking;
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
    },
    []
  );

  const rateBooking = useCallback(
    async (id: string, rating: number, review: string) => {
      const res = await api.rateBooking(id, rating, review);
      const updated = res.booking as Booking;
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
    },
    []
  );

  const getMyBookings = useCallback(
    (userId: string, role: "customer" | "provider") => {
      return bookings.filter((b) =>
        role === "customer" ? b.customerId === userId : b.providerId === userId
      );
    },
    [bookings]
  );

  return (
    <BookingContext.Provider
      value={{
        bookings,
        isLoading,
        pendingAlerts,
        consumeAlerts,
        pendingRatingBooking,
        clearPendingRating,
        createBooking,
        updateBookingStatus,
        rateBooking,
        getMyBookings,
        loadBookings,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBookings must be used within BookingProvider");
  return ctx;
}
