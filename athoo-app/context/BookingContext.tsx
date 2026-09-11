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
  locationCity?: string | null;
  locationArea?: string | null;
  locationProvince?: string | null;
  locationCountryCode?: string | null;
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
  promotionId?: string | null;
  promoCode?: string | null;
  promoDiscountType?: "fixed" | "percentage" | null;
  promoDiscountValue?: number | null;
  promoUsageReservedAt?: string | null;
  promoUsageReleasedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customerProfileImage?: string | null;
  customerProfileColor?: string | null;
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
  hasMore: boolean;
  isLoadingMore: boolean;
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
    promoCode?: string;
    pickedLat?: number;
    pickedLng?: number;
    customerLat?: number;
    customerLng?: number;
    locationCity: string;
    locationArea: string;
    locationProvince?: string;
    locationCountryCode: string;
    locationSource: string;
    locationAccuracy?: number | null;
    locationConfirmedAt: string;
    addressMode?: string;
  }) => Promise<Booking>;
  updateBookingStatus: (id: string, status: BookingStatus, price?: number) => Promise<void>;
  rateBooking: (id: string, rating: number, review: string) => Promise<void>;
  getMyBookings: (userId: string, role: "customer" | "provider") => Booking[];
  loadBookings: (opts?: { silent?: boolean }) => Promise<void>;
  loadMoreBookings: () => Promise<void>;
}

const BookingContext = createContext<BookingContextType | null>(null);

const SEEN_BOOKINGS_KEY = "athoo_seen_booking_ids";
const SEEN_STATUSES_KEY = "athoo_seen_booking_statuses";
const SEEN_ARRIVED_KEY = "athoo_seen_booking_arrivals";
const BOOKING_POLL_INTERVAL_MS = 120_000;
const BOOKING_FOREGROUND_REFRESH_COOLDOWN_MS = 60_000;
const BOOKING_CACHE_VERSION = 1;
const BOOKING_CACHE_MAX_ROWS = 250;
const BOOKING_PAGE_SIZE = 60;
const BOOKING_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface BookingCacheEnvelope {
  version: number;
  savedAt: number;
  bookings: Booking[];
}

function bookingCacheKey(userId: string): string {
  return `athoo:bookings:${BOOKING_CACHE_VERSION}:${userId}`;
}

function safeBookingForCache(booking: Booking): Booking {
  return {
    ...booking,
    customerPhone: "",
    providerPhone: "",
    startPin: undefined,
    completePin: undefined,
  };
}

function bookingTimestamp(booking: Booking): number {
  const updated = Date.parse(String(booking.updatedAt || booking.createdAt || ""));
  return Number.isFinite(updated) ? updated : 0;
}

function mergeBookings(...groups: Booking[][]): Booking[] {
  const byId = new Map<string, Booking>();
  for (const group of groups) {
    for (const booking of group) {
      if (!booking?.id) continue;
      byId.set(booking.id, { ...(byId.get(booking.id) || {}), ...booking });
    }
  }
  return [...byId.values()].sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a) || b.id.localeCompare(a.id));
}

async function readBookingCache(userId: string): Promise<Booking[]> {
  try {
    const raw = await AsyncStorage.getItem(bookingCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BookingCacheEnvelope;
    if (parsed.version !== BOOKING_CACHE_VERSION || !Array.isArray(parsed.bookings)) return [];
    if (Date.now() - Number(parsed.savedAt || 0) > BOOKING_CACHE_MAX_AGE_MS) return [];
    return parsed.bookings;
  } catch {
    return [];
  }
}

async function writeBookingCache(userId: string, rows: Booking[]): Promise<void> {
  try {
    const envelope: BookingCacheEnvelope = {
      version: BOOKING_CACHE_VERSION,
      savedAt: Date.now(),
      bookings: rows.slice(0, BOOKING_CACHE_MAX_ROWS).map(safeBookingForCache),
    };
    await AsyncStorage.setItem(bookingCacheKey(userId), JSON.stringify(envelope));
  } catch {
    // Cache failures must never block live booking data.
  }
}

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
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
  const bookingsRef = useRef<Booking[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const loadMoreInFlightRef = useRef(false);
  const lastFullLoadAtRef = useRef(0);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const consumeAlerts = useCallback((): BookingAlert[] => {
    const copy: BookingAlert[] = [];
    setPendingAlerts((prev) => {
      copy.push(...prev);
      return [];
    });
    return copy;
  }, []);

  const loadBookings = useCallback(async (opts?: { silent?: boolean }) => {
    const currentUser = user;
    if (!currentUser) {
      setBookings([]);
      setPendingAlerts([]);
      setPendingRatingBooking(null);
      return;
    }
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;
    const showLoader = opts?.silent !== true && bookingsRef.current.length === 0;
    if (showLoader) setIsLoading(true);
    try {
      const res = await api.getBookings({ limit: BOOKING_PAGE_SIZE });
      const fresh = Array.isArray(res?.bookings) ? (res.bookings as Booking[]) : [];
      const merged = mergeBookings(bookingsRef.current, fresh);
      setBookings(merged);
      bookingsRef.current = merged;
      nextCursorRef.current = res.nextCursor || null;
      setHasMore(Boolean(res.hasMore && res.nextCursor));
      lastFullLoadAtRef.current = Date.now();
      void writeBookingCache(currentUser.id, merged);
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (!msg.includes("401") && !msg.includes("Unauthorized") && !msg.toLowerCase().includes("timeout")) {
        appLogger.warn("bookings", "Failed to load bookings:", e);
      }
    } finally {
      loadInFlightRef.current = false;
      if (showLoader) setIsLoading(false);
    }
  }, [user?.id]);

  const loadMoreBookings = useCallback(async () => {
    const currentUser = user;
    const cursor = nextCursorRef.current;
    if (!currentUser || !cursor || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    setIsLoadingMore(true);
    try {
      const res = await api.getBookings({ limit: BOOKING_PAGE_SIZE, cursor });
      const page = Array.isArray(res?.bookings) ? (res.bookings as Booking[]) : [];
      const merged = mergeBookings(bookingsRef.current, page);
      setBookings(merged);
      bookingsRef.current = merged;
      nextCursorRef.current = res.nextCursor || null;
      setHasMore(Boolean(res.hasMore && res.nextCursor));
      lastFullLoadAtRef.current = Date.now();
      void writeBookingCache(currentUser.id, merged);
    } catch (error) {
      appLogger.warn("bookings", "Failed to load older bookings:", error);
    } finally {
      loadMoreInFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    initializedRef.current = false;
    if (!user) {
      setBookings([]);
      bookingsRef.current = [];
      nextCursorRef.current = null;
      setHasMore(false);
      return;
    }

    setBookings([]);
    bookingsRef.current = [];
    nextCursorRef.current = null;
    setHasMore(false);
    void (async () => {
      const cached = await readBookingCache(user.id);
      if (cancelled) return;
      if (cached.length > 0) {
        setBookings(cached);
        bookingsRef.current = cached;
      }
      await loadBookings({ silent: cached.length > 0 });
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, loadBookings]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (
        nextState === "active" &&
        user &&
        Date.now() - lastFullLoadAtRef.current >=
          BOOKING_FOREGROUND_REFRESH_COOLDOWN_MS
      ) {
        void loadBookings({ silent: true });
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
      const latestTimestamp = bookingsRef.current.reduce((max, booking) => Math.max(max, bookingTimestamp(booking)), 0);
      const updatedSince = latestTimestamp > 0 ? new Date(Math.max(0, latestTimestamp - 1000)).toISOString() : null;
      const fresh: Booking[] = [];
      let deltaCursor: string | null = null;
      let deltaPages = 0;
      do {
        const res = await api.getBookings({ limit: 100, updatedSince, cursor: deltaCursor });
        if (Array.isArray(res.bookings)) fresh.push(...(res.bookings as Booking[]));
        deltaCursor = res.hasMore ? res.nextCursor || null : null;
        deltaPages += 1;
      } while (deltaCursor && deltaPages < 10);

      // A single poll is bounded to 1,000 changed records. If an installation
      // exceeds that during one interval, the next foreground/full refresh
      // reconciles the first page without blocking the UI.
      const merged = mergeBookings(bookingsRef.current, fresh);

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

      setBookings(merged);
      bookingsRef.current = merged;
      void writeBookingCache(user.id, merged);
    } catch {
      // Silent: polling must never destabilize auth/session state.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user || initializedRef.current || bookings.length === 0) return;
    initializedRef.current = true;
    void (async () => {
      if (user.role === "provider") {
        const pending = bookings.filter((b) => b.providerId === user.id && b.status === "pending");
        await markIdsSeen(pending.map((b) => b.id));
      } else {
        const statuses: Record<string, string> = {};
        const arrivals: Record<string, string> = {};
        bookings
          .filter((b) => b.customerId === user.id)
          .forEach((b) => {
            statuses[b.id] = b.status;
            if (b.providerArrivedAt) arrivals[b.id] = String(b.providerArrivedAt);
          });
        await saveSeenStatuses(statuses);
        await saveSeenArrivals(arrivals);
      }
    })();
  }, [user?.id, user?.role, bookings]);

  useEffect(() => {
    if (!user) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      initializedRef.current = false;
      return;
    }

    notificationService.init();

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
      // Live provider location — update coordinates without a full reload.
      if (msg.type === "booking:location") {
        const { bookingId, providerLat, providerLng, providerAccuracy, providerUpdatedAt } = msg.payload || {};
        if (!bookingId) return;
        setBookings((prev) => {
          const next = prev.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  providerLat: providerLat ?? b.providerLat,
                  providerLng: providerLng ?? b.providerLng,
                  providerAccuracy: providerAccuracy ?? b.providerAccuracy,
                  providerUpdatedAt: providerUpdatedAt ?? b.providerUpdatedAt,
                }
              : b
          );
          bookingsRef.current = next;
          if (user?.id) void writeBookingCache(user.id, next);
          return next;
        });
        return;
      }

      // Merge booking mutations immediately so status, OTP, arrival and other
      // server-authoritative fields appear without a manual refresh.
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
          const next = exists
            ? prev.map((b) => (b.id === fresh.id ? { ...b, ...fresh } : b))
            : [fresh, ...prev];
          bookingsRef.current = next;
          if (user?.id) void writeBookingCache(user.id, next);
          return next;
        });
        if (msg.type === "booking:new" && user?.role === "provider") {
          notificationService.playRealtimeFallback("booking").catch(() => {});
        }
      }
    });
    return off;
  }, [user?.id, user?.role]);

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
      promoCode?: string;
      pickedLat?: number;
      pickedLng?: number;
      customerLat?: number;
      customerLng?: number;
      locationCity: string;
      locationArea: string;
      locationProvince?: string;
      locationCountryCode: string;
      locationSource: string;
      locationAccuracy?: number | null;
      locationConfirmedAt: string;
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
        promoCode: data.promoCode,
        pickedLat: data.pickedLat,
        pickedLng: data.pickedLng,
        customerLat: data.customerLat,
        customerLng: data.customerLng,
        locationCity: data.locationCity,
        locationArea: data.locationArea,
        locationProvince: data.locationProvince,
        locationCountryCode: data.locationCountryCode,
        locationSource: data.locationSource,
        locationAccuracy: data.locationAccuracy,
        locationConfirmedAt: data.locationConfirmedAt,
        addressMode: data.addressMode,
      });

      const booking = res.booking as Booking;
      setBookings((prev) => {
        const next = [booking, ...prev.filter((item) => item.id !== booking.id)];
        bookingsRef.current = next;
        if (user?.id) void writeBookingCache(user.id, next);
        return next;
      });
      return booking;
    },
    [user?.id]
  );

  const updateBookingStatus = useCallback(
    async (id: string, status: BookingStatus, price?: number) => {
      const res = await api.updateBookingStatus(id, status, price);
      const updated = res.booking as Booking;
      setBookings((prev) => {
        const next = prev.map((b) => (b.id === id ? updated : b));
        bookingsRef.current = next;
        if (user?.id) void writeBookingCache(user.id, next);
        return next;
      });
    },
    [user?.id]
  );

  const rateBooking = useCallback(
    async (id: string, rating: number, review: string) => {
      const res = await api.rateBooking(id, rating, review);
      const updated = res.booking as Booking;
      setBookings((prev) => {
        const next = prev.map((b) => (b.id === id ? updated : b));
        bookingsRef.current = next;
        if (user?.id) void writeBookingCache(user.id, next);
        return next;
      });
    },
    [user?.id]
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
        hasMore,
        isLoadingMore,
        pendingAlerts,
        consumeAlerts,
        pendingRatingBooking,
        clearPendingRating,
        createBooking,
        updateBookingStatus,
        rateBooking,
        getMyBookings,
        loadBookings,
        loadMoreBookings,
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
