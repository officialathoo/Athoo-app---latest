import { AthooMapFallback } from "@/components/maps/AthooMapFallback";
import { BookingTrustPanel, PostServiceCare } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useBookings, Booking } from "@/context/BookingContext";
import { useChat } from "@/context/ChatContext";
import { useCall } from "@/context/CallContext";
import { getDistanceKm } from "@/utils/distance";
import { api, realtime, getToken } from "@/services/api";
import { shareBookingInvoice } from "@/utils/bookingInvoicePdf";
import { buildRepeatBookingParams } from "@/utils/repeatBooking";

// ── OSRM road-route helper ─────────────────────────────────────────────────
async function fetchOsrmRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<{ coords: Array<{ latitude: number; longitude: number }>; distanceKm: number; etaMin: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?geometries=geojson&overview=full`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    const coords = (route.geometry?.coordinates as [number, number][]).map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));
    return {
      coords,
      distanceKm: route.distance / 1000,
      etaMin: Math.ceil(route.duration / 60),
    };
  } catch {
    return null;
  }
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

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "#F59E0B", bg: "#FFFBEB", icon: "clock" },
  accepted: { label: "Accepted", color: "#3B82F6", bg: "#EFF6FF", icon: "check-circle" },
  in_progress: { label: "In Progress", color: "#8B5CF6", bg: "#F5F3FF", icon: "tool" },
  completed: { label: "Completed", color: "#22C55E", bg: "#F0FDF4", icon: "check-square" },
  cancelled: { label: "Cancelled", color: "#EF4444", bg: "#FEF2F2", icon: "x-circle" },
} as const;

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

function openMapsAt(latitude: number, longitude: number, label?: string) {
  const encodedLabel = encodeURIComponent(label || `${latitude},${longitude}`);
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const appleUrl = `http://maps.apple.com/?ll=${latitude},${longitude}&q=${encodedLabel}`;
  const geoUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`;

  if (Platform.OS === "android") {
    Linking.canOpenURL(geoUrl)
      .then((ok) => (ok ? Linking.openURL(geoUrl) : Linking.openURL(googleUrl)))
      .catch(() => Linking.openURL(googleUrl));
    return;
  }

  if (Platform.OS === "ios") {
    Linking.canOpenURL(appleUrl)
      .then((ok) => (ok ? Linking.openURL(appleUrl) : Linking.openURL(googleUrl)))
      .catch(() => Linking.openURL(googleUrl));
    return;
  }

  Linking.openURL(googleUrl).catch(() => {});
}

// ── Custom map markers ────────────────────────────────────────────────────────

function AthooMarker() {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: Colors.primary,
        alignItems: "center", justifyContent: "center",
        borderWidth: 3, borderColor: "#fff",
        shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 }, elevation: 10,
        overflow: "hidden",
      }}>
        <Image
          source={require("@/assets/images/logo.png")}
          style={{ width: 38, height: 38 }}
          resizeMode="contain"
        />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 16,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderTopColor: Colors.primary, marginTop: -3,
      }} />
    </View>
  );
}

function JobSiteMarker() {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: Colors.secondary,
        alignItems: "center", justifyContent: "center",
        borderWidth: 3, borderColor: "#fff",
        shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
      }}>
        <Icon name="home" size={18} color="#fff" />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 11,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderTopColor: Colors.secondary, marginTop: -2,
      }} />
    </View>
  );
}

export default function BookingDetailScreen() {
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
      showToast(e?.message || "Could not mark as paid. Try again.");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleUpdateJobLocation = async () => {
    if (!booking || !bookingId) return;
    setIsUpdatingJobLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Please allow location access to update job location.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const { latitude, longitude } = loc.coords;
      await api.updateCustomerLocation(bookingId, latitude, longitude);
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
    fetchOsrmRoute(providerCoords, customerCoords).then((result) => {
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

  const status = STATUS_CONFIG[booking.status];
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
    startOutgoingCall(booking.providerId, providerName, booking.service, "#1A6EE0").catch(() => {});
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
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Booking Details</Text>
        <Pressable
          style={styles.backBtn}
          onPress={() =>
            shareBookingInvoice(booking as any, { role: "customer", onState: setSharingPdf })
          }
          disabled={sharingPdf}
        >
          <Icon name={sharingPdf ? "loader" : "share-2"} size={18} color={Colors.primary} />
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
              <Icon name={booking.serviceIcon as any} size={24} color={Colors.primary} />
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
                <Icon name="message-circle" size={18} color={Colors.primary} />
              </Pressable>
              {(booking.status === "accepted" || booking.status === "in_progress") && (
                <Pressable
                  style={[
                    styles.chatBtn,
                    { backgroundColor: "#F0FDF4", borderColor: "#22C55E30" },
                  ]}
                  onPress={handleCall}
                >
                  <Icon name="phone" size={16} color="#22C55E" />
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
                    { backgroundColor: providerCoords ? "#22C55E" : "#F59E0B" },
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
                <View style={[styles.legendDot, { backgroundColor: Colors.secondary }]} />
                <Text style={styles.legendText}>Job site</Text>
              </View>
              <View style={styles.legendSep} />
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
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
                <Text style={[styles.trackInfoValue, isProviderStale && { color: "#F59E0B" }]}>
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
                <Icon name="map-pin" size={15} color={Colors.primary} />
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
                  <Icon name="navigation" size={15} color={Colors.primary} />
                  <Text style={styles.trackActionText}>Open Provider</Text>
                </Pressable>
              ) : null}

              {["pending", "accepted", "in_progress"].includes(booking.status) && (
                <Pressable
                  style={[styles.trackActionBtn, isUpdatingJobLocation && { opacity: 0.5 }]}
                  onPress={handleUpdateJobLocation}
                  disabled={isUpdatingJobLocation}
                >
                  <Icon name="crosshair" size={15} color={Colors.primary} />
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
                <View style={[styles.trackDot, { backgroundColor: "#EF4444" }]} />
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
              <Icon name="calendar" size={15} color={Colors.primary} />
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoVal}>{booking.scheduledDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Icon name="clock" size={15} color={Colors.primary} />
              <Text style={styles.infoLabel}>Time</Text>
              <Text style={styles.infoVal}>{booking.scheduledTime}</Text>
            </View>
            <View style={styles.infoRow}>
              <Icon name="map-pin" size={15} color={Colors.primary} />
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoVal} numberOfLines={2}>
                {booking.address}
              </Text>
            </View>
            {booking.price && (
              <View style={styles.infoRow}>
                <Icon name="dollar-sign" size={15} color={Colors.primary} />
                <Text style={styles.infoLabel}>Price</Text>
                <Text
                  style={[
                    styles.infoVal,
                    { color: Colors.primary, fontWeight: "700" },
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
                    {t.done && <Icon name="check" size={10} color={Colors.white} />}
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
              <Icon name="shield" size={20} color={Colors.primary} />
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
                <Text style={{ color: "#8B5CF6", fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: 4 }}>
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
              { borderColor: "#22C55E40", backgroundColor: "#F0FDF4" },
            ]}
          >
            <View style={styles.pinDisplayHeader}>
              <Icon name="check-circle" size={20} color="#22C55E" />
              <Text style={[styles.pinDisplayTitle, { color: "#16A34A" }]}>
                Job Completion Code
              </Text>
            </View>
            <Text style={[styles.pinDisplayDesc, { color: "#166534" }]}>
              Share this code with your provider to confirm the job is complete:
            </Text>
            <View
              style={[
                styles.pinValueBox,
                { backgroundColor: "#DCFCE7", borderColor: "#22C55E40" },
              ]}
            >
              <Text style={[styles.pinValue, { color: "#16A34A" }]}>
                {booking.completePin.split("").join("  ")}
              </Text>
            </View>
            <Text style={[styles.pinHint, { color: "#166534" }]}>
              Only share after the provider has finished all the work.
            </Text>
          </View>
        )}

        {booking.status === "completed" && (
          <View style={[styles.card, { borderColor: "#22C55E40", borderWidth: 1, backgroundColor: "#F0FDF4" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Icon name="check-circle" size={22} color="#22C55E" />
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#16A34A" }}>Job Completed</Text>
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
              <Text style={[styles.invoiceLabel, { fontWeight: "800", color: Colors.text, fontSize: 15 }]}>Total</Text>
              <Text style={[styles.invoiceValue, { fontWeight: "900", color: Colors.primary, fontSize: 16 }]}>
                Rs. {((booking.price || 0) + ((booking as any).visitCharge || 0)).toLocaleString()}
              </Text>
            </View>
            {booking.paymentStatus === "paid" || booking.paymentStatus === "received" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "#DCFCE7", borderRadius: 10, padding: 10 }}>
                <Icon name="check-circle" size={16} color="#16A34A" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#16A34A" }}>
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
                    color={i <= rating ? Colors.accent : Colors.border}
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
              placeholderTextColor={Colors.textMuted}
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
                  color={i <= booking.rating! ? Colors.accent : Colors.border}
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
            <Icon name="flag" size={15} color={Colors.error} />
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
                <Icon name="x" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 14, color: Colors.textSecondary, lineHeight: 20 }}>
              Are you sure you want to cancel this booking? This action cannot be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: Colors.surface, alignItems: "center" }}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={{ fontWeight: "700", color: Colors.text, fontSize: 14 }}>Keep Booking</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: Colors.error, alignItems: "center" }}
                onPress={confirmCancel}
              >
                <Text style={{ fontWeight: "700", color: "#fff", fontSize: 14 }}>Yes, Cancel</Text>
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
                <Icon name="x" size={20} color={Colors.textSecondary} />
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
              placeholderTextColor={Colors.textMuted}
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
          <Icon name="check-circle" size={16} color="#22C55E" />
          <Text style={styles.toastBannerText}>Thank you! Your review has been submitted.</Text>
        </View>
      )}

      {/* General toast */}
      {toastMsg && (
        <View style={styles.toastBanner}>
          <Icon name="info" size={16} color={Colors.primary} />
          <Text style={styles.toastBannerText}>{toastMsg}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    shadowColor: Colors.shadow,
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
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceName: { fontSize: 18, fontWeight: "800", color: Colors.text },
  bookingId: { fontSize: 12, color: Colors.textSecondary },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  provAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  provAvatarTxt: { fontSize: 14, fontWeight: "700", color: Colors.primary },
  provName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  provPhone: { fontSize: 12, color: Colors.textSecondary },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
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
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  trackBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
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
  legendLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  legendSep: { width: 1, height: 10, backgroundColor: Colors.border, marginHorizontal: 4 },
  legendText: { fontSize: 11, color: Colors.textSecondary, fontWeight: "600" },
  trackInfoRow: {
    flexDirection: "row",
    gap: 8,
  },
  trackInfoBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  trackInfoLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  trackInfoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  trackActions: {
    flexDirection: "row",
    gap: 10,
  },
  trackActionBtn: {
    flex: 1,
    backgroundColor: Colors.primary + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  trackActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  trackHint: {
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textSecondary,
  },
  infoList: { gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, width: 60 },
  infoVal: { fontSize: 13, fontWeight: "600", color: Colors.text, flex: 1 },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineLeft: { alignItems: "center", width: 20 },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timelineLine: { width: 2, height: 28, backgroundColor: Colors.border },
  timelineLineDone: { backgroundColor: Colors.primary },
  timelineLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingVertical: 2,
    fontWeight: "500",
  },
  timelineLabelDone: { color: Colors.text, fontWeight: "700" },
  starsRow: { flexDirection: "row", gap: 8 },
  reviewInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: "top",
    minHeight: 80,
  },
  existingReview: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  pinDisplayCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 2,
    borderColor: Colors.primary + "40",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  pinDisplayHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  pinDisplayTitle: { fontSize: 16, fontWeight: "800", color: Colors.primary },
  pinDisplayDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  pinValueBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  pinValue: { fontSize: 38, fontWeight: "900", color: Colors.text, letterSpacing: 8 },
  pinHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  timerCard: {
    backgroundColor: "#1e1b4b",
    borderRadius: 18,
    padding: 20,
    gap: 10,
    shadowColor: "#8B5CF6",
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
    backgroundColor: "#EF4444",
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
    color: "#fff",
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
    borderColor: Colors.error + "40",
    backgroundColor: Colors.error + "08",
  },
  reportBtnText: { fontSize: 13, fontWeight: "600", color: Colors.error },

  toastBanner: {
    position: "absolute",
    bottom: 28,
    left: 20,
    right: 20,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toastBannerText: { fontSize: 13, color: Colors.text, fontWeight: "600", flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    gap: 8,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  modalLabel: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, marginBottom: 4 },
  catOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: 4,
  },
  catOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" },
  catOptionText: { fontSize: 13, color: Colors.text },
  catOptionTextSelected: { color: Colors.primary, fontWeight: "700" },
  reportInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.textSecondary,
    flex: 1,
  },
  invoiceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "right",
    flexShrink: 1,
  },
  invoiceDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
});
