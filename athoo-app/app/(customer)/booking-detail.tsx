import { AthooMapFallback } from "@/components/maps/AthooMapFallback";
import { BookingTrustPanel, PostServiceCare } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { brandConfig } from "@/config/brand";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useBookings, Booking } from "@/context/BookingContext";
import { useChat } from "@/context/ChatContext";
import { useCall } from "@/context/CallContext";
import { getDistanceKm } from "@/utils/distance";
import { api, realtime, getToken } from "@/services/api";
import { shareBookingInvoice } from "@/utils/bookingInvoicePdf";
import { buildRepeatBookingParams } from "@/utils/repeatBooking";
import { apiErrorToMessage } from "@/lib/apiError";
import { getFastForegroundLocation } from "@/services/location";
import { getDirections } from "@/services/maps";
import { openExternalMap } from "@/services/externalMaps";

// Road routing is resolved through the Athoo API map provider layer.
async function fetchRoadRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<{ coords: Array<{ latitude: number; longitude: number }>; distanceKm: number; etaMin: number } | null> {
  const result = await getDirections(from.latitude, from.longitude, to.latitude, to.longitude);
  if (!result.polyline.length) return null;
  return {
    coords: result.polyline,
    distanceKm: result.distanceKm ?? 0,
    etaMin: result.durationMin ?? 0,
  };
}

function formatElapsed(startedAt?: string) {
  if (!startedAt) return "00:00:00";
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const sec = diffSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `00:${mm}:${ss}`;
}

function getStatusConfig(theme: AthooTheme) {
  return {
    pending: { label: "Pending", color: theme.colors.warning, bg: theme.colors.warningSoft, icon: "clock" },
    accepted: { label: "Accepted", color: theme.colors.info, bg: theme.colors.infoSoft, icon: "check-circle" },
    in_progress: { label: "In Progress", color: theme.colors.accent, bg: theme.colors.accentSoft, icon: "tool" },
    completed: { label: "Completed", color: theme.colors.success, bg: theme.colors.successSoft, icon: "check-square" },
    cancelled: { label: "Cancelled", color: theme.colors.danger, bg: theme.colors.dangerSoft, icon: "x-circle" },
  } as const;
}

function toCoord(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isValidCoordPair(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 && longitude <= 180
  );
}

function getCustomerCoords(booking: any) {
  const latCandidates = [
    booking?.customerLat,
    booking?.customerLatitude,
    booking?.pickedLat,
    booking?.lat,
    booking?.latitude,
  ];
  const lngCandidates = [
    booking?.customerLng,
    booking?.customerLongitude,
    booking?.pickedLng,
    booking?.lng,
    booking?.longitude,
  ];

  const lat = latCandidates.map(toCoord).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toCoord).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidCoordPair(lat, lng)) {
    return { latitude: lat, longitude: lng };
  }

  return null;
}

function getProviderCoords(booking: any) {
  const latCandidates = [
    booking?.providerLat,
    booking?.providerLatitude,
    booking?.liveProviderLat,
    booking?.currentProviderLat,
    booking?.workerLat,
  ];
  const lngCandidates = [
    booking?.providerLng,
    booking?.providerLongitude,
    booking?.liveProviderLng,
    booking?.currentProviderLng,
    booking?.workerLng,
  ];

  const lat = latCandidates.map(toCoord).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toCoord).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidCoordPair(lat, lng)) {
    return { latitude: lat, longitude: lng };
  }

  return null;
}

async function openMapsAt(latitude: number, longitude: number, label?: string) {
  return openExternalMap({ latitude, longitude, label });
}

// ── Custom map markers ────────────────────────────────────────────────────────

function AthooMarker() {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: theme.colors.primary,
        alignItems: "center", justifyContent: "center",
        borderWidth: 3, borderColor: theme.colors.white,
        shadowColor: theme.colors.shadow, shadowOpacity: 0.35, shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 }, elevation: 10,
        overflow: "hidden",
      }}>
        <Image
          source={brandConfig.assets.mark}
          style={{ width: 38, height: 38 }}
          resizeMode="contain"
        />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 16,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderTopColor: theme.colors.primary, marginTop: -3,
      }} />
    </View>
  );
}

function JobSiteMarker() {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: theme.colors.secondary,
        alignItems: "center", justifyContent: "center",
        borderWidth: 3, borderColor: theme.colors.white,
        shadowColor: theme.colors.shadow, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
      }}>
        <Icon name="home" size={18} color={theme.colors.white} />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 11,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderTopColor: theme.colors.secondary, marginTop: -2,
      }} />
    </View>
  );
}

export default function BookingDetailScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useAuth();
  const { bookings, updateBookingStatus, rateBooking, loadBookings } = useBookings();
  const { getOrCreateChat } = useChat();
  const { startOutgoingCall } = useCall();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const mapRef = useRef<any | null>(null);

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [sharingPdf, setSharingPdf] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRateThanks, setShowRateThanks] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [realtimeProviderCoords, setRealtimeProviderCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isUpdatingJobLocation, setIsUpdatingJobLocation] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const providerAnimCoords = useRef({
    setValue: (_value: any) => undefined,
    timing: (_value: any) => ({ start: () => undefined }),
  }).current;
  const hasAnimInit = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const booking = bookings.find((b) => b.id === bookingId) as Booking | undefined;

  useEffect(() => {
    if (!bookingId) return;

    const tick = () => {
      if (AppState.currentState === "active") {
        loadBookings().catch(() => undefined);
      }
    };

    // Realtime booking events are the primary update path. Refresh once on
    // entry and keep a conservative fallback poll for missed connections.
    tick();
    const shouldPoll = !booking || !["completed", "cancelled"].includes(booking.status);
    if (shouldPoll) {
      pollRef.current = setInterval(tick, 30_000);
    }

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });

    return () => {
      appStateSubscription.remove();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [bookingId, booking?.status, loadBookings]);

  useEffect(() => {
    if (!bookingId) return;
    const off = realtime.on((msg) => {
      if (msg.type === "booking:location" && msg.payload?.bookingId === bookingId) {
        const { providerLat, providerLng } = msg.payload;
        if (typeof providerLat === "number" && typeof providerLng === "number") {
          setRealtimeProviderCoords({ latitude: providerLat, longitude: providerLng });
        }
      }
    });
    return off;
  }, [bookingId]);

  // Pulsing "Live" dot animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Animate the provider marker smoothly when new real-time coords arrive
  useEffect(() => {
    if (!realtimeProviderCoords) return;
    if (!hasAnimInit.current) {
      providerAnimCoords.setValue({
        latitude: realtimeProviderCoords.latitude,
        longitude: realtimeProviderCoords.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      hasAnimInit.current = true;
      return;
    }
    (providerAnimCoords as any).timing({
      latitude: realtimeProviderCoords.latitude,
      longitude: realtimeProviderCoords.longitude,
      duration: 1000,
      useNativeDriver: false,
    }).start();
    // Smoothly re-frame the camera to keep both pins visible
    if (mapRef.current) {
      const customerC = getCustomerCoords(booking);
      if (customerC) {
        mapRef.current.fitToCoordinates(
          [realtimeProviderCoords, customerC],
          { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true }
        );
      }
    }
  }, [realtimeProviderCoords]);

  useEffect(() => {
    if (booking?.status === "in_progress" && booking.jobStartedAt) {
      setElapsed(formatElapsed(booking.jobStartedAt));
      timerRef.current = setInterval(
        () => setElapsed(formatElapsed(booking.jobStartedAt)),
        1000
      );
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [booking?.status, booking?.jobStartedAt]);

  const handleMarkPaid = async () => {
    if (!booking) return;
    setIsMarkingPaid(true);
    try {
      const res = await api.markBookingPaid(booking.id);
      const updated = res.booking as Booking;
      await loadBookings();
      setShowInvoiceModal(false);
      showToast(`Cash payment confirmed for ${updated.service}.`);
    } catch (e: any) {
      showToast(apiErrorToMessage(e, "We couldn't mark this booking as paid. Please try again."));
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleUpdateJobLocation = async () => {
    if (!booking || !bookingId) return;
    setIsUpdatingJobLocation(true);
    try {
      const result = await getFastForegroundLocation({
        timeoutMs: 8_000,
        requiredAccuracy: 800,
        rationaleTitle: "Location permission",
        rationaleBody: "Athoo uses your location to update the job pin for the provider.",
      });
      if (!result.location) {
        showToast("Could not get a usable location. Please check GPS and try again.");
        return;
      }
      await api.updateCustomerLocation(bookingId, result.location.latitude, result.location.longitude);
      await loadBookings();
      showToast("Job location updated to your current position.");
    } catch {
      showToast("Could not update location. Try again.");
    } finally {
      setIsUpdatingJobLocation(false);
    }
  };

  const customerCoords = useMemo(() => getCustomerCoords(booking), [booking]);
  const dbProviderCoords = useMemo(() => getProviderCoords(booking), [booking]);
  const providerCoords = realtimeProviderCoords ?? dbProviderCoords;

  // Staleness: if providerUpdatedAt is more than 5 min old and no live WS yet
  const isProviderStale = useMemo(() => {
    if (realtimeProviderCoords) return false;
    const updatedAt = (booking as any)?.providerUpdatedAt;
    if (!updatedAt) return !!dbProviderCoords; // has coords but no timestamp → treat as stale
    return Date.now() - new Date(updatedAt).getTime() > 5 * 60 * 1000;
  }, [realtimeProviderCoords, dbProviderCoords, booking]);

  // Road-route state (replaces straight-line distance)
  const [routeCoords, setRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaMin, setRouteEtaMin] = useState<number | null>(null);

  useEffect(() => {
    if (!providerCoords || !customerCoords || isProviderStale) {
      setRouteCoords([]);
      setRouteDistanceKm(null);
      setRouteEtaMin(null);
      return;
    }
    let cancelled = false;
    fetchRoadRoute(providerCoords, customerCoords).then((result) => {
      if (cancelled) return;
      if (result) {
        setRouteCoords(result.coords);
        setRouteDistanceKm(result.distanceKm);
        setRouteEtaMin(result.etaMin);
      } else {
        // fallback: straight-line distance
        setRouteCoords([providerCoords, customerCoords]);
        setRouteDistanceKm(
          getDistanceKm(providerCoords.latitude, providerCoords.longitude,
            customerCoords.latitude, customerCoords.longitude)
        );
        setRouteEtaMin(null);
      }
    });
    return () => { cancelled = true; };
  }, [providerCoords, customerCoords, isProviderStale]);

  useEffect(() => {
    if (!mapRef.current || !customerCoords) return;

    if (providerCoords) {
      mapRef.current.fitToCoordinates([customerCoords, providerCoords], {
        edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion(
        {
          latitude: customerCoords.latitude,
          longitude: customerCoords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    }
  }, [customerCoords, providerCoords]);

  if (!booking) {
    return (
      <View style={styles.notFound}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const status = getStatusConfig(theme)[booking.status];
  const providerName = booking.providerName || "Provider";
  // For scheduled jobs, only show the map once the provider has started sharing
  // their location (i.e. dbProviderCoords is set). For instant/in-progress
  // jobs show it as soon as the status allows.
  const isScheduledBooking = !!(booking.scheduledDate || booking.scheduledTime);
  const providerHasSharedLocation = !!dbProviderCoords || !!realtimeProviderCoords;
  const showTrackingMap =
    booking.status === "in_progress"
      ? !!customerCoords && isValidCoordPair(customerCoords?.latitude, customerCoords?.longitude)
      : booking.status === "accepted" &&
        !!customerCoords &&
        isValidCoordPair(customerCoords?.latitude, customerCoords?.longitude) &&
        (!isScheduledBooking || providerHasSharedLocation);

  const TIMELINE = [
    { label: "Booking Placed", done: true },
    {
      label: "Provider Accepted",
      done: ["accepted", "in_progress", "completed"].includes(booking.status),
    },
    {
      label: "Service In Progress",
      done: ["in_progress", "completed"].includes(booking.status),
    },
    { label: "Service Completed", done: booking.status === "completed" },
  ];

  const handleCancel = () => setShowCancelModal(true);

  const confirmCancel = () => {
    setShowCancelModal(false);
    updateBookingStatus(booking.id, "cancelled");
    router.back();
  };

  const handleRate = async () => {
    if (rating === 0) return;
    setSubmittingRating(true);
    await rateBooking(booking.id, rating, review);
    setSubmittingRating(false);
    setShowRateThanks(true);
    setTimeout(() => setShowRateThanks(false), 3000);
  };

  const handleChat = async () => {
    if (!user) return;
    router.push({
      pathname: "/(customer)/chat-room",
      params: {
        otherUserId: booking.providerId,
        otherUserName: providerName,
        otherUserImage: booking.providerProfileImage || undefined,
        otherUserColor: booking.providerProfileColor || undefined,
      },
    });
    getOrCreateChat(user.id, user.name, booking.providerId, providerName, booking.id, booking.service).catch(() => {});
  };

  const handleCall = async () => {
    if (!user) return;
    startOutgoingCall(booking.providerId, providerName, booking.service, theme.colors.primary).catch(() => {});
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleReport = async () => {
    if (!reportCategory.trim() || !reportDescription.trim()) {
      showToast("Please select a category and describe the issue.");
      return;
    }
    setSubmittingReport(true);
    try {
      await api.reportIssue({
        bookingId: booking.id,
        reportedId: booking.providerId,
        reportedName: providerName,
        category: reportCategory,
        description: reportDescription,
      });
      setShowReportModal(false);
      setReportCategory("");
      setReportDescription("");
      showToast("Report submitted. Our team will review it.");
    } catch {
      showToast("Failed to submit report. Please try again.");
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title}>Booking Details</Text>
        <Pressable
          style={styles.backBtn}
          onPress={() =>
            shareBookingInvoice(booking as any, { role: "customer", onState: setSharingPdf })
          }
          disabled={sharingPdf}
        >
          <Icon name={sharingPdf ? "loader" : "share-2"} size={18} color={theme.colors.primary} />
        </Pressable>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.serviceHeader}>
            <View style={styles.serviceIcon}>
              <Icon name={booking.serviceIcon as any} size={24} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.serviceName}>{booking.service}</Text>
              <Text style={styles.bookingId}>
                {booking.publicId || `Booking #${booking.id.slice(-6).toUpperCase()}`}
              </Text>
            </View>
          </View>
        </View>

        <BookingTrustPanel
          status={booking.status}
          paymentStatus={(booking as any).paymentStatus}
          providerName={booking.providerName}
          onSupport={() => router.push({ pathname: "/(customer)/contact-support", params: { bookingId: booking.id } } as any)}
        />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Provider</Text>
          <View style={styles.providerRow}>
            <View style={styles.provAvatar}>
              <Text style={styles.provAvatarTxt}>
                {booking.providerName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.provName}>{booking.providerName}</Text>
              <Text style={styles.provPhone}>{booking.providerPhone}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable style={styles.chatBtn} onPress={handleChat}>
                <Icon name="message-circle" size={18} color={theme.colors.primary} />
              </Pressable>
              {(booking.status === "accepted" || booking.status === "in_progress") && (
                <Pressable
                  style={[
                    styles.chatBtn,
                    { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successSoft },
                  ]}
                  onPress={handleCall}
                >
                  <Icon name="phone" size={16} color={theme.colors.success} />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {showTrackingMap && (
          <View style={styles.card}>
            <View style={styles.trackHeader}>
              <Text style={styles.cardTitle}>Live Tracking</Text>
              <View style={styles.trackBadge}>
                <View
                  style={[
                    styles.trackDot,
                    { backgroundColor: providerCoords ? theme.colors.success : theme.colors.warning },
                  ]}
                />
                <Text style={styles.trackBadgeText}>
                  {providerCoords ? "Live" : "Awaiting provider location"}
                </Text>
              </View>
            </View>

            <AthooMapFallback />

            {/* Map legend */}
            <View style={styles.mapLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.secondary }]} />
                <Text style={styles.legendText}>Job site</Text>
              </View>
              <View style={styles.legendSep} />
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={styles.legendText}>Provider</Text>
              </View>
              {realtimeProviderCoords && (
                <>
                  <View style={styles.legendSep} />
                  <Animated.View style={[styles.legendLiveDot, { opacity: pulseAnim }]} />
                  <Text style={styles.legendText}>Live</Text>
                </>
              )}
            </View>

            <View style={styles.trackInfoRow}>
              <View style={styles.trackInfoBox}>
                <Text style={styles.trackInfoLabel}>Job Site</Text>
                <Text style={styles.trackInfoValue} numberOfLines={1}>
                  {booking.address ? booking.address.split(",")[0] : "Pinned"}
                </Text>
              </View>

              <View style={styles.trackInfoBox}>
                <Text style={styles.trackInfoLabel}>Provider</Text>
                <Text style={[styles.trackInfoValue, isProviderStale && { color: theme.colors.warning }]}>
                  {realtimeProviderCoords
                    ? "● Live"
                    : isProviderStale
                    ? "Updating…"
                    : providerCoords
                    ? "● Recent"
                    : "Not shared"}
                </Text>
              </View>

              <View style={styles.trackInfoBox}>
                <Text style={styles.trackInfoLabel}>Distance</Text>
                <Text style={styles.trackInfoValue}>
                  {routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km` : "--"}
                </Text>
              </View>

              <View style={styles.trackInfoBox}>
                <Text style={styles.trackInfoLabel}>ETA</Text>
                <Text style={styles.trackInfoValue}>
                  {routeEtaMin != null ? `~${routeEtaMin} min` : "--"}
                </Text>
              </View>
            </View>

            <View style={styles.trackActions}>
              <Pressable
                style={styles.trackActionBtn}
                onPress={() =>
                  customerCoords &&
                  openMapsAt(
                    customerCoords.latitude,
                    customerCoords.longitude,
                    "Customer Location"
                  )
                }
              >
                <Icon name="map-pin" size={15} color={theme.colors.primary} />
                <Text style={styles.trackActionText}>Open Address</Text>
              </Pressable>

              {providerCoords ? (
                <Pressable
                  style={styles.trackActionBtn}
                  onPress={() =>
                    openMapsAt(
                      providerCoords.latitude,
                      providerCoords.longitude,
                      providerName
                    )
                  }
                >
                  <Icon name="navigation" size={15} color={theme.colors.primary} />
                  <Text style={styles.trackActionText}>Open Provider</Text>
                </Pressable>
              ) : null}

              {["pending", "accepted", "in_progress"].includes(booking.status) && (
                <Pressable
                  style={[styles.trackActionBtn, isUpdatingJobLocation && { opacity: 0.5 }]}
                  onPress={handleUpdateJobLocation}
                  disabled={isUpdatingJobLocation}
                >
                  <Icon name="crosshair" size={15} color={theme.colors.primary} />
                  <Text style={styles.trackActionText}>
                    {isUpdatingJobLocation ? "Updating…" : "My Location"}
                  </Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.trackHint}>
              Tap "My Location" to move the job-site pin to your current GPS position.
            </Text>
          </View>
        )}

        {booking.status === "accepted" && !customerCoords && (
          <View style={styles.card}>
            <View style={styles.trackHeader}>
              <Text style={styles.cardTitle}>Live Tracking</Text>
              <View style={styles.trackBadge}>
                <View style={[styles.trackDot, { backgroundColor: theme.colors.danger }]} />
                <Text style={styles.trackBadgeText}>Location missing</Text>
              </View>
            </View>

            <Text style={styles.trackHint}>
              This booking does not have saved customer coordinates yet, so live tracking
              cannot be shown for this older booking. Create a new booking with current or
              picked location to use tracking.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Booking Info</Text>
          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Icon name="calendar" size={15} color={theme.colors.primary} />
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoVal}>{booking.scheduledDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Icon name="clock" size={15} color={theme.colors.primary} />
              <Text style={styles.infoLabel}>Time</Text>
              <Text style={styles.infoVal}>{booking.scheduledTime}</Text>
            </View>
            <View style={styles.infoRow}>
              <Icon name="map-pin" size={15} color={theme.colors.primary} />
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoVal} numberOfLines={2}>
                {booking.address}
              </Text>
            </View>
            {booking.price && (
              <View style={styles.infoRow}>
                <Icon name="dollar-sign" size={15} color={theme.colors.primary} />
                <Text style={styles.infoLabel}>Price</Text>
                <Text
                  style={[
                    styles.infoVal,
                    { color: theme.colors.primary, fontWeight: "700" },
                  ]}
                >
                  Rs. {booking.price}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Progress</Text>
          <View style={styles.timeline}>
            {TIMELINE.map((t, i) => (
              <View key={i} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, t.done && styles.timelineDotDone]}>
                    {t.done && <Icon name="check" size={10} color={theme.colors.white} />}
                  </View>
                  {i < TIMELINE.length - 1 && (
                    <View style={[styles.timelineLine, t.done && styles.timelineLineDone]} />
                  )}
                </View>
                <Text style={[styles.timelineLabel, t.done && styles.timelineLabelDone]}>
                  {t.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {booking.status === "accepted" && booking.startPin && (
          <View style={styles.pinDisplayCard}>
            <View style={styles.pinDisplayHeader}>
              <Icon name="shield" size={20} color={theme.colors.primary} />
              <Text style={styles.pinDisplayTitle}>Provider Start Code</Text>
            </View>
            <Text style={styles.pinDisplayDesc}>
              Share this code with your provider when they arrive to start the job:
            </Text>
            <View style={styles.pinValueBox}>
              <Text style={styles.pinValue}>{booking.startPin.split("").join("  ")}</Text>
            </View>
            <Text style={styles.pinHint}>
              Do not share this code until the provider is at your location.
            </Text>
          </View>
        )}

        {booking.status === "in_progress" && (
          <View style={styles.timerCard}>
            <View style={styles.timerHeader}>
              <View style={styles.timerLiveDot} />
              <Text style={styles.timerLiveText}>JOB IN PROGRESS</Text>
            </View>
            <Text style={styles.timerDisplay}>{elapsed}</Text>
            {!!booking.ratePerHour && !!booking.jobStartedAt && (() => {
              const elapsedHrs = Math.max(0, (Date.now() - new Date(booking.jobStartedAt).getTime()) / 3600000);
              const liveAmt = Math.round(booking.ratePerHour * elapsedHrs);
              return (
                <Text style={{ color: theme.colors.accent, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: 4 }}>
                  Live est. amount: Rs. {liveAmt.toLocaleString()} (Rs. {booking.ratePerHour}/hr)
                </Text>
              );
            })()}
          </View>
        )}

        {booking.status === "in_progress" && booking.completePin && (
          <View
            style={[
              styles.pinDisplayCard,
              { borderColor: theme.colors.successSoft, backgroundColor: theme.colors.successSoft },
            ]}
          >
            <View style={styles.pinDisplayHeader}>
              <Icon name="check-circle" size={20} color={theme.colors.success} />
              <Text style={[styles.pinDisplayTitle, { color: theme.colors.success }]}>
                Job Completion Code
              </Text>
            </View>
            <Text style={[styles.pinDisplayDesc, { color: theme.colors.success }]}>
              Share this code with your provider to confirm the job is complete:
            </Text>
            <View
              style={[
                styles.pinValueBox,
                { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successSoft },
              ]}
            >
              <Text style={[styles.pinValue, { color: theme.colors.success }]}>
                {booking.completePin.split("").join("  ")}
              </Text>
            </View>
            <Text style={[styles.pinHint, { color: theme.colors.success }]}>
              Only share after the provider has finished all the work.
            </Text>
          </View>
        )}

        {booking.status === "completed" && (
          <View style={[styles.card, { borderColor: theme.colors.successSoft, borderWidth: 1, backgroundColor: theme.colors.successSoft }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Icon name="check-circle" size={22} color={theme.colors.success} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: theme.colors.success }}>Job Completed</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Service</Text>
              <Text style={styles.invoiceValue}>{booking.service}</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Date</Text>
              <Text style={styles.invoiceValue}>{booking.scheduledDate} {booking.scheduledTime}</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Provider</Text>
              <Text style={styles.invoiceValue}>{booking.providerName}</Text>
            </View>
            <View style={styles.invoiceDivider} />
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Agreed Amount</Text>
              <Text style={styles.invoiceValue}>Rs. {(booking.price || 0).toLocaleString()}</Text>
            </View>
            {!!((booking as any).visitCharge) && (
              <View style={styles.invoiceRow}>
                <Text style={styles.invoiceLabel}>Visit Charge</Text>
                <Text style={styles.invoiceValue}>Rs. {Number((booking as any).visitCharge).toLocaleString()}</Text>
              </View>
            )}
            <View style={[styles.invoiceRow, { marginTop: 4 }]}>
              <Text style={[styles.invoiceLabel, { fontWeight: "800", color: theme.colors.text, fontSize: 15 }]}>Total</Text>
              <Text style={[styles.invoiceValue, { fontWeight: "900", color: theme.colors.primary, fontSize: 16 }]}>
                Rs. {((booking.price || 0) + ((booking as any).visitCharge || 0)).toLocaleString()}
              </Text>
            </View>
            {booking.paymentStatus === "paid" || booking.paymentStatus === "received" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: theme.colors.successSoft, borderRadius: 10, padding: 10 }}>
                <Icon name="check-circle" size={16} color={theme.colors.success} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.success }}>
                  {booking.paymentStatus === "received" ? "Cash Paid & Confirmed by Provider" : "Cash Payment Confirmed"}
                </Text>
              </View>
            ) : (
              <Button
                title={isMarkingPaid ? "Confirming..." : "Mark Cash as Paid"}
                onPress={handleMarkPaid}
                loading={isMarkingPaid}
                fullWidth
                style={{ marginTop: 8 }}
              />
            )}
          </View>
        )}

        {booking.status === "completed" && !booking.rating && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Rate this Service</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable key={i} onPress={() => setRating(i)}>
                  <Icon
                    name="star"
                    size={32}
                    color={i <= rating ? theme.colors.accent : theme.colors.border}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.reviewInput}
              placeholder="Write a review (optional)..."
              value={review}
              onChangeText={setReview}
              multiline
              numberOfLines={3}
              placeholderTextColor={theme.colors.textMuted}
            />
            <Button
              title="Submit Review"
              onPress={handleRate}
              loading={submittingRating}
              fullWidth
            />
          </View>
        )}

        {booking.status === "completed" && (
          <PostServiceCare
            rated={Boolean(booking.rating)}
            paymentConfirmed={["paid", "received"].includes(String((booking as any).paymentStatus || ""))}
            onInvoice={() => setShowInvoiceModal(true)}
            onSupport={() => router.push({ pathname: "/(customer)/contact-support", params: { bookingId: booking.id } } as any)}
            onBookAgain={() => router.push({ pathname: "/(customer)/book-service", params: buildRepeatBookingParams(booking) } as any)}
          />
        )}

        {booking.rating && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Review</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Icon
                  key={i}
                  name="star"
                  size={20}
                  color={i <= booking.rating! ? theme.colors.accent : theme.colors.border}
                />
              ))}
            </View>
            {booking.review && <Text style={styles.existingReview}>{booking.review}</Text>}
          </View>
        )}

        {booking.status === "pending" && (
          <Button
            title="Cancel Booking"
            onPress={handleCancel}
            variant="danger"
            fullWidth
          />
        )}

        {booking.status !== "pending" && (
          <Pressable style={styles.reportBtn} onPress={() => setShowReportModal(true)}>
            <Icon name="flag" size={15} color={theme.colors.danger} />
            <Text style={styles.reportBtnText}>Report an Issue</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Cancel Confirmation Modal */}
      <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { gap: 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cancel Booking</Text>
              <Pressable onPress={() => setShowCancelModal(false)}>
                <Icon name="x" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 }}>
              Are you sure you want to cancel this booking? This action cannot be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignItems: "center" }}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={{ fontWeight: "700", color: theme.colors.text, fontSize: 14 }}>Keep Booking</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: theme.colors.danger, alignItems: "center" }}
                onPress={confirmCancel}
              >
                <Text style={{ fontWeight: "700", color: theme.colors.onBrand, fontSize: 14 }}>Yes, Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Report Issue Modal */}
      <Modal visible={showReportModal} transparent animationType="slide" onRequestClose={() => setShowReportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report an Issue</Text>
              <Pressable onPress={() => setShowReportModal(false)}>
                <Icon name="x" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalLabel}>Category</Text>
            {["Unprofessional Behavior", "Work Quality Issue", "No-Show / Late Arrival", "Overcharging", "Safety Concern", "Other"].map(cat => (
              <Pressable
                key={cat}
                style={[styles.catOption, reportCategory === cat && styles.catOptionSelected]}
                onPress={() => setReportCategory(cat)}
              >
                <Text style={[styles.catOptionText, reportCategory === cat && styles.catOptionTextSelected]}>{cat}</Text>
              </Pressable>
            ))}
            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Description</Text>
            <TextInput
              style={styles.reportInput}
              placeholder="Describe the issue in detail..."
              placeholderTextColor={theme.colors.textMuted}
              value={reportDescription}
              onChangeText={setReportDescription}
              multiline
              numberOfLines={4}
            />
            <Button
              title={submittingReport ? "Submitting..." : "Submit Report"}
              onPress={handleReport}
              loading={submittingReport}
              fullWidth
            />
          </View>
        </View>
      </Modal>

      {/* Rating thanks banner */}
      {showRateThanks && (
        <View style={styles.toastBanner}>
          <Icon name="check-circle" size={16} color={theme.colors.success} />
          <Text style={styles.toastBannerText}>Thank you! Your review has been submitted.</Text>
        </View>
      )}

      {/* General toast */}
      {toastMsg && (
        <View style={styles.toastBanner}>
          <Icon name="info" size={16} color={theme.colors.primary} />
          <Text style={styles.toastBannerText}>{toastMsg}</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  serviceHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceName: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  bookingId: { fontSize: 12, color: theme.colors.textSecondary },
  cardTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  provAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  provAvatarTxt: { fontSize: 14, fontWeight: "700", color: theme.colors.primary },
  provName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  provPhone: { fontSize: 12, color: theme.colors.textSecondary },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
  },
  trackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  trackBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  trackingMap: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
  },
  mapLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  legendSep: { width: 1, height: 10, backgroundColor: theme.colors.border, marginHorizontal: 4 },
  legendText: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: "600" },
  trackInfoRow: {
    flexDirection: "row",
    gap: 8,
  },
  trackInfoBox: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  trackInfoLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  trackInfoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  trackActions: {
    flexDirection: "row",
    gap: 10,
  },
  trackActionBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  trackActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  trackHint: {
    fontSize: 11,
    lineHeight: 17,
    color: theme.colors.textSecondary,
  },
  infoList: { gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoLabel: { fontSize: 13, color: theme.colors.textSecondary, width: 60 },
  infoVal: { fontSize: 13, fontWeight: "600", color: theme.colors.text, flex: 1 },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineLeft: { alignItems: "center", width: 20 },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  timelineLine: { width: 2, height: 28, backgroundColor: theme.colors.border },
  timelineLineDone: { backgroundColor: theme.colors.primary },
  timelineLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingVertical: 2,
    fontWeight: "500",
  },
  timelineLabelDone: { color: theme.colors.text, fontWeight: "700" },
  starsRow: { flexDirection: "row", gap: 8 },
  reviewInput: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: "top",
    minHeight: 80,
  },
  existingReview: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  pinDisplayCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 2,
    borderColor: theme.colors.primary + "40",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  pinDisplayHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  pinDisplayTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.primary },
  pinDisplayDesc: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20 },
  pinValueBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
  },
  pinValue: { fontSize: 38, fontWeight: "900", color: theme.colors.text, letterSpacing: 8 },
  pinHint: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  timerCard: {
    backgroundColor: theme.dark ? theme.colors.accentSoft : theme.colors.primaryPressed,
    borderRadius: 18,
    padding: 20,
    gap: 10,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  timerHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  timerLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.danger,
  },
  timerLiveText: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 2,
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: "800",
    color: theme.colors.onBrand,
    textAlign: "center",
    letterSpacing: 4,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.danger + "40",
    backgroundColor: theme.colors.danger + "08",
  },
  reportBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.danger },

  toastBanner: {
    position: "absolute",
    bottom: 28,
    left: 20,
    right: 20,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: theme.colors.text,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toastBannerText: { fontSize: 13, color: theme.colors.text, fontWeight: "600", flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    gap: 8,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  modalLabel: { fontSize: 13, fontWeight: "700", color: theme.colors.textSecondary, marginBottom: 4 },
  catOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    marginBottom: 4,
  },
  catOptionSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "10" },
  catOptionText: { fontSize: 13, color: theme.colors.text },
  catOptionTextSelected: { color: theme.colors.primary, fontWeight: "700" },
  reportInput: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: "top",
    minHeight: 90,
    marginBottom: 8,
  },
  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  invoiceLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  invoiceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "right",
    flexShrink: 1,
  },
  invoiceDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
});
