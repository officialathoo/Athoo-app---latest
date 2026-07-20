import { Icon } from "@/components/ui/Icon";
import { BookingProgress, ProviderJobChecklist, ProviderCompletionSummary } from "@/components/design";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { brandConfig } from "@/config/brand";
import { openExternalMap, openExternalMapSearch } from "@/services/externalMaps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useBookings, Booking } from "@/context/BookingContext";
import { useChat } from "@/context/ChatContext";
import { useCall } from "@/context/CallContext";
import { useNotifications } from "@/context/NotificationContext";
import { api } from "@/services/api";
import { getDistanceKm } from "@/utils/distance";
import { shareBookingInvoice } from "@/utils/bookingInvoicePdf";
import { OpenStreetMapPreview } from "@/components/maps/OpenStreetMapPreview";
import { getDirections } from "@/services/maps";
import { getFastForegroundLocation, cacheForegroundLocation } from "@/services/location";
import { apiErrorToMessage } from "@/lib/apiError";

type LiveCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  updatedAt?: string;
};

function formatElapsed(startedAt?: string) {
  if (!startedAt) return "00:00";

  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  );

  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;

  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m ${s
      .toString()
      .padStart(2, "0")}s`;
  }

  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function isValidLatLng(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getBookingLatLng(booking: any) {
  const latCandidates = [
    booking?.customerLat,
    booking?.customerLatitude,
    booking?.lat,
    booking?.latitude,
    booking?.pickedLat,
  ];

  const lngCandidates = [
    booking?.customerLng,
    booking?.customerLongitude,
    booking?.lng,
    booking?.longitude,
    booking?.pickedLng,
  ];

  const lat = latCandidates.map(toNumber).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toNumber).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidLatLng(lat, lng)) {
    return { lat: lat as number, lng: lng as number };
  }

  return null;
}

function getProviderLatLng(booking: any) {
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

  const lat = latCandidates.map(toNumber).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toNumber).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidLatLng(lat, lng)) {
    return { latitude: lat as number, longitude: lng as number };
  }

  return null;
}

function formatLastUpdated(updatedAt?: string) {
  if (!updatedAt) return "Not synced yet";
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return "Not synced yet";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function openCoordsInMaps(latitude: number, longitude: number, label?: string) {
  const opened = await openExternalMap({ latitude, longitude, label });
  if (!opened) {
    Alert.alert("Unable to Open Maps", "No external map destination is configured for this device.");
  }
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

export default function JobDetailScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useAuth();
  const { bookings, updateBookingStatus, loadBookings } = useBookings();
  const { getOrCreateChat } = useChat();
  const { startOutgoingCall } = useCall();
  const { addNotification } = useNotifications();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [showArriveOtp, setShowArriveOtp] = useState(false);
  const [showCompleteOtp, setShowCompleteOtp] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGenCompletePin, setIsGenCompletePin] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [isCountering, setIsCountering] = useState(false);
  const [isLoadingBooking, setIsLoadingBooking] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [isMarkingReceived, setIsMarkingReceived] = useState(false);

  const [providerLiveCoords, setProviderLiveCoords] = useState<LiveCoords | null>(null);
  const [roadPolyline, setRoadPolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeEtaMin, setRouteEtaMin] = useState<number | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [liveSyncing, setLiveSyncing] = useState(false);
  const [enRoute, setEnRoute] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<TextInput>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  const syncBooking = useCallback(
    async (preferred?: Booking | null) => {
      if (preferred) {
        setBooking(preferred);
        const existingProviderCoords = getProviderLatLng(preferred);
        if (existingProviderCoords) {
          setProviderLiveCoords((prev) => ({
            latitude: existingProviderCoords.latitude,
            longitude: existingProviderCoords.longitude,
            accuracy: prev?.accuracy ?? null,
            updatedAt: (preferred as any)?.providerUpdatedAt || prev?.updatedAt || new Date().toISOString(),
          }));
        }
        return;
      }

      if (!bookingId) return;
      setIsLoadingBooking(true);
      try {
        const res = await api.getBooking(String(bookingId));
        const fresh = res.booking as Booking;
        setBooking(fresh);

        const existingProviderCoords = getProviderLatLng(fresh);
        if (existingProviderCoords) {
          setProviderLiveCoords((prev) => ({
            latitude: existingProviderCoords.latitude,
            longitude: existingProviderCoords.longitude,
            accuracy: prev?.accuracy ?? null,
            updatedAt: (fresh as any)?.providerUpdatedAt || prev?.updatedAt || new Date().toISOString(),
          }));
        }
      } catch (e) {
        // silent fail — booking stays in last known state
      } finally {
        setIsLoadingBooking(false);
      }
    },
    [bookingId]
  );


  useEffect(() => {
    const foundBooking = bookings.find((item) => item.id === bookingId);
    if (foundBooking) {
      syncBooking(foundBooking);
    } else if (bookingId) {
      syncBooking();
    }
  }, [bookings, bookingId, syncBooking]);

  useEffect(() => {
    if (!bookingId) return;

    const tick = () => {
      if (AppState.currentState === "active") {
        loadBookings();
      }
    };

    pollRef.current = setInterval(tick, 15000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [bookingId, loadBookings]);

  useFocusEffect(
    useCallback(() => {
      loadBookings();
      syncBooking();
      return undefined;
    }, [loadBookings, syncBooking])
  );

  useEffect(() => {
    if (showArriveOtp || showCompleteOtp) {
      setOtpInput("");
      setOtpError("");

      setTimeout(() => {
        otpInputRef.current?.focus();

        if (Platform.OS === "android") {
          Keyboard.dismiss();
        }

        setTimeout(() => otpInputRef.current?.focus(), 150);
      }, 100);
    }
  }, [showArriveOtp, showCompleteOtp]);

  useEffect(() => {
    if (booking?.status === "in_progress" && booking.jobStartedAt) {
      setElapsed(formatElapsed(booking.jobStartedAt));

      timerRef.current = setInterval(() => {
        setElapsed(formatElapsed(booking.jobStartedAt));
      }, 1000);
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

  // Scheduled jobs (have scheduledDate/Time set) should only start live GPS
  // sharing once the provider explicitly taps "Go to Customer". Instant jobs
  // and any in-progress job always track.
  const isScheduledJob = !!(booking?.scheduledDate || booking?.scheduledTime);
  const shouldTrackLive =
    booking?.status === "in_progress" ||
    (booking?.status === "accepted" && (!isScheduledJob || enRoute));

  const syncProviderLocationToBackend = async (
    currentBookingId: string,
    coords: LiveCoords
  ) => {
    try {
      await api.updateBookingLiveLocation(currentBookingId, {
        providerLat: coords.latitude,
        providerLng: coords.longitude,
        providerAccuracy: coords.accuracy ?? null,
      });
    } catch {
      // silent fail — retry on next interval
    }
  };

  useEffect(() => {
    let mounted = true;

    const startLiveTracking = async () => {
      if (!shouldTrackLive || !booking?.id || Platform.OS === "web") {
        if (locationSubRef.current) {
          locationSubRef.current.remove();
          locationSubRef.current = null;
        }
        return;
      }

      try {
        const initialResult = await getFastForegroundLocation({
          timeoutMs: 8_000,
          requiredAccuracy: 75,
          freshAccuracy: "highest",
          preferFresh: true,
          rationaleTitle: "Location access needed",
          rationaleBody: "Athoo uses your location while this job is active so the customer can follow your arrival.",
        });
        if (!mounted) return;

        if (initialResult.permission !== "granted" || !initialResult.location) {
          setLocationPermission("denied");
          return;
        }

        setLocationPermission("granted");

        const firstCoords: LiveCoords = {
          latitude: initialResult.location.latitude,
          longitude: initialResult.location.longitude,
          accuracy: initialResult.location.accuracy,
          updatedAt: new Date().toISOString(),
        };

        setProviderLiveCoords(firstCoords);
        setLiveSyncing(true);
        await syncProviderLocationToBackend(booking.id, firstCoords);
        setLiveSyncing(false);

        if (locationSubRef.current) {
          locationSubRef.current.remove();
          locationSubRef.current = null;
        }

        locationSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 10000,
            distanceInterval: 10,
          },
          async (position) => {
            const nextCoords: LiveCoords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              updatedAt: new Date().toISOString(),
            };

            setProviderLiveCoords(nextCoords);
            void cacheForegroundLocation(position);
            setLiveSyncing(true);
            await syncProviderLocationToBackend(booking.id, nextCoords);
            setLiveSyncing(false);
          }
        );
      } catch (e) {
        // silent fail — tracking skipped until next mount
      }
    };

    startLiveTracking();

    return () => {
      mounted = false;
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
    };
  }, [shouldTrackLive, booking?.id]);

  const customerCoords = useMemo(() => {
    if (!booking) return null;
    return getBookingLatLng(booking);
  }, [booking]);

  const providerCoords = useMemo((): LiveCoords | null => {
    if (providerLiveCoords) return providerLiveCoords;
    if (!booking) return null;
    const staticCoords = getProviderLatLng(booking);
    if (!staticCoords) return null;
    return {
      latitude: staticCoords.latitude,
      longitude: staticCoords.longitude,
      accuracy: null,
      updatedAt: undefined,
    };
  }, [providerLiveCoords, booking]);

  const providerDistanceKm = useMemo(() => {
    if (!customerCoords || !providerCoords) return null;
    return getDistanceKm(
      customerCoords.lat,
      customerCoords.lng,
      providerCoords.latitude,
      providerCoords.longitude
    );
  }, [customerCoords, providerCoords]);

  // Fetch road-following polyline whenever provider position changes significantly.
  // Debounced to avoid hammering the geo API on every location update.
  const _lastPolylineFetch = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!providerCoords || !customerCoords) return;
    const prev = _lastPolylineFetch.current;
    // Only re-fetch if moved > 50 m (avoids redundant API calls while stationary)
    if (prev) {
      const d = getDistanceKm(prev.lat, prev.lng, providerCoords.latitude, providerCoords.longitude);
      if (d < 0.05) return;
    }
    _lastPolylineFetch.current = { lat: providerCoords.latitude, lng: providerCoords.longitude };
    getDirections(
      providerCoords.latitude,
      providerCoords.longitude,
      customerCoords.lat,
      customerCoords.lng,
    ).then((result) => {
      if (result.polyline.length >= 2) setRoadPolyline(result.polyline);
      if (result.durationMin !== null) setRouteEtaMin(result.durationMin);
    }).catch(() => undefined);
  }, [providerCoords?.latitude, providerCoords?.longitude, customerCoords]);

  const handleOpenLocation = async () => {
    if (!booking) return;

    const coords = getBookingLatLng(booking);
    const address = booking.address?.trim();
    const opened = coords
      ? await openExternalMap({ latitude: coords.lat, longitude: coords.lng, label: address || "Customer Job Location" })
      : address
        ? await openExternalMapSearch(address)
        : false;

    if (!opened) {
      Alert.alert(
        coords || address ? "Unable to Open Maps" : "Location Missing",
        coords || address
          ? "No external map destination is configured for this device."
          : "Customer location is not available for this booking.",
      );
    }
  };

  const handleOpenMyLiveLocation = async () => {
    if (!providerCoords) {
      Alert.alert("Location Unavailable", "Your current live location is not available yet.");
      return;
    }

    await openCoordsInMaps(
      providerCoords.latitude,
      providerCoords.longitude,
      "My Live Location"
    );
  };

  const handleCounter = async () => {
    if (!booking) return;
    const amt = parseInt(counterAmount.replace(/[^0-9]/g, ""), 10);
    if (!amt || amt < 50) {
      Alert.alert("Invalid Amount", "Please enter a valid amount (minimum Rs. 50).");
      return;
    }
    try {
      setIsCountering(true);
      await api.counterBooking(booking.id, amt, counterMessage.trim());
      setShowCounterModal(false);
      setCounterAmount("");
      setCounterMessage("");
      Alert.alert("Counter Sent", "Your counter offer has been sent to the customer.");
    } catch (e: any) {
      Alert.alert("Unable to send offer", apiErrorToMessage(e, "We couldn't send your counter offer. Please try again."));
    } finally {
      setIsCountering(false);
    }
  };

  const handleAccept = () => {
    if (!booking) return;

    Alert.alert("Accept Job", "Accept this booking?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Accept",
        onPress: async () => {
          try {
            setIsAccepting(true);
            const res = await api.updateBookingStatus(booking.id, "accepted");
            const updated = res.booking as Booking;
            await loadBookings();
            await syncBooking(updated);

            addNotification({
              type: "booking",
              title: "Booking Accepted",
              body: `${
                booking.providerName || user?.name || "Provider"
              } accepted your booking for ${booking.service}.`,
              data: {
                role: "customer",
                bookingId: booking.id,
              },
            });
          } catch (e: any) {
            Alert.alert("Unable to accept", apiErrorToMessage(e, "We couldn't accept this booking. Please try again."));
          } finally {
            setIsAccepting(false);
          }
        },
      },
    ]);
  };

  const handleDecline = () => {
    if (!booking) return;

    Alert.alert("Decline Job", "Decline this booking?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            setIsDeclining(true);
            await updateBookingStatus(booking.id, "cancelled");
            await loadBookings();
            router.back();
          } catch (e: any) {
            Alert.alert("Unable to decline", apiErrorToMessage(e, "We couldn't decline this booking. Please try again."));
          } finally {
            setIsDeclining(false);
          }
        },
      },
    ]);
  };

  const handleArrived = async () => {
    if (!booking) return;

    try {
      await api.markProviderArrived(booking.id);
      const res = await api.generateStartPin(booking.id);
      const updated = res.booking as Booking;
      await syncBooking(updated);
      await loadBookings();
      setShowArriveOtp(true);
    } catch (e: any) {
      Alert.alert(
        "Start Code Error",
        apiErrorToMessage(e, "We couldn't prepare the start code for this booking.")
      );
    }
  };

  const handleVerifyArriveOtp = async () => {
    if (!booking) return;

    if (otpInput.length < 4) {
      setOtpError("Enter the 4-digit code from the customer");
      return;
    }

    setIsVerifying(true);
    setOtpError("");

    try {
      const res = await api.verifyStartPin(booking.id, otpInput);
      const updated = res.booking as Booking;

      setBooking(updated);
      setShowArriveOtp(false);
      setOtpInput("");

      await loadBookings();
      await syncBooking(updated);

      addNotification({
        type: "system",
        title: "Job Started",
        body: `${booking.service} has started at your location.`,
        data: {
          role: "customer",
          bookingId: booking.id,
        },
      });
    } catch (e: any) {
      setOtpError(
        apiErrorToMessage(e, "The PIN is incorrect. Ask the customer for the correct code.")
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRequestComplete = async () => {
    if (!booking) return;

    setIsGenCompletePin(true);

    try {
      const res = await api.generateCompletePin(booking.id);
      const updated = res.booking as Booking;

      setBooking(updated);
      await loadBookings();
      await syncBooking(updated);

      setOtpInput("");
      setOtpError("");
      setShowCompleteOtp(true);
    } catch {
      Alert.alert("Error", "Failed to generate completion PIN");
    } finally {
      setIsGenCompletePin(false);
    }
  };

  const handleVerifyCompleteOtp = async () => {
    if (!booking) return;

    if (otpInput.length < 4) {
      setOtpError("Enter the 4-digit code from the customer");
      return;
    }

    setIsVerifying(true);
    setOtpError("");

    try {
      const res = await api.verifyCompletePin(booking.id, otpInput);
      const updated = res.booking as Booking;

      setBooking(updated);
      setShowCompleteOtp(false);
      setOtpInput("");

      await loadBookings();
      await syncBooking(updated);

      addNotification({
        type: "success",
        title: "Job Completed",
        body: `${booking.service} has been completed successfully.`,
        data: {
          role: "customer",
          bookingId: booking.id,
        },
      });
    } catch (e: any) {
      setOtpError(
        apiErrorToMessage(e, "The PIN is incorrect. Ask the customer for the correct code.")
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleMarkReceived = async () => {
    if (!booking) return;
    setIsMarkingReceived(true);
    try {
      const res = await api.markBookingReceived(booking.id);
      const updated = res.booking as Booking;
      setBooking(updated);
      await loadBookings();
      setShowInvoiceModal(false);
      addNotification({
        type: "success",
        title: "Cash Received",
        body: `You've confirmed receiving Rs. ${(booking.price || 0) + VISIT_CHARGE} for ${booking.service}.`,
        data: { role: "provider", bookingId: booking.id },
      });
    } catch (e: any) {
      Alert.alert("Unable to update payment", apiErrorToMessage(e, "We couldn't mark the payment as received. Please try again."));
    } finally {
      setIsMarkingReceived(false);
    }
  };

  const handleChat = async () => {
    if (!user || !booking) return;

    const chat = await getOrCreateChat(
      user.id,
      user.name,
      booking.customerId,
      booking.customerName,
      booking.id,
      booking.service
    );

    router.push({
      pathname: "/(provider)/chat-room",
      params: {
        chatId: chat.id,
        otherUserId: booking.customerId,
        otherUserName: booking.customerName,
        otherUserImage: booking.customerProfileImage || undefined,
        otherUserColor: undefined,
      },
    });
  };

  const handleCall = async () => {
    if (!booking || !user) return;

    await startOutgoingCall(
      booking.customerId,
      booking.customerName,
      booking.service,
      theme.colors.secondary
    );
  };

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.notFound}>
          {isLoadingBooking ? <ActivityIndicator size="large" color={theme.colors.primary} /> : null}
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const STATUS_CONFIG = {
    pending: { label: "Pending", color: theme.colors.warning, bg: theme.colors.warningSoft },
    accepted: { label: "Accepted", color: theme.colors.info, bg: theme.colors.infoSoft },
    in_progress: { label: "In Progress", color: theme.colors.accent, bg: theme.colors.accentSoft },
    completed: { label: "Completed", color: theme.colors.success, bg: theme.colors.successSoft },
    cancelled: { label: "Cancelled", color: theme.colors.danger, bg: theme.colors.dangerSoft },
  } as const;

  const status =
    STATUS_CONFIG[booking.status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.pending;

  const VISIT_CHARGE = (booking as any).visitCharge ?? 0;
  const rawHourlyRate = (booking as any).ratePerHour ?? user?.ratePerHour ?? null;
  const hasHourlyRate = typeof rawHourlyRate === "number" && rawHourlyRate > 0;
  const hourlyRate = hasHourlyRate ? rawHourlyRate : 0;
  const jobStarted = booking.jobStartedAt ? new Date(booking.jobStartedAt) : null;
  const elapsedMinutes = jobStarted
    ? Math.ceil((Date.now() - jobStarted.getTime()) / 60000)
    : 0;
  const timeCharge = hasHourlyRate ? Math.round((elapsedMinutes / 60) * hourlyRate) : 0;
  const totalAmount = VISIT_CHARGE + timeCharge;
  const hasLocation = !!getBookingLatLng(booking) || !!booking.address?.trim();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={theme.colors.text} />
          </Pressable>

          <Text style={styles.title}>Job Details</Text>

          <Pressable
            style={styles.backBtn}
            onPress={() =>
              shareBookingInvoice(booking as any, { role: "provider", onState: setSharingPdf })
            }
            disabled={sharingPdf}
          >
            <Icon name={sharingPdf ? "loader" : "share-2"} size={18} color={theme.colors.primary} />
          </Pressable>

          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
          <BookingProgress
            compact
            activeIndex={Math.max(0, ["pending", "accepted", "in_progress", "completed"].indexOf(booking.status))}
            steps={[
              { key: "pending", label: "Request", icon: "inbox" },
              { key: "accepted", label: "Accepted", icon: "check-circle" },
              { key: "in_progress", label: "Working", icon: "tool" },
              { key: "completed", label: "Complete", icon: "flag" },
            ]}
            testID="provider-job-progress"
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}
          keyboardShouldPersistTaps="handled"
        >
          <ProviderJobChecklist status={booking.status} />

          {booking.status === "completed" ? (
            <ProviderCompletionSummary
              amount={Number(booking.price || 0) + Number((booking as any).visitCharge || 0)}
              paymentStatus={(booking as any).paymentStatus}
              rating={(booking as any).rating}
            />
          ) : null}

          <View style={styles.card}>
            <View style={styles.serviceRow}>
              <View style={styles.serviceIcon}>
                <Icon
                  name={booking.serviceIcon as any}
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{booking.service}</Text>
                <Text style={styles.bookingId}>
                  Job #{booking.id.slice(-6).toUpperCase()}
                </Text>
              </View>

              {booking.status !== "pending" &&
              booking.status !== "completed" &&
              booking.status !== "cancelled" ? (
                <Pressable style={styles.chatBtn} onPress={handleChat}>
                  <Icon name="message-circle" size={18} color={theme.colors.secondary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Customer</Text>

            <View style={styles.customerRow}>
              <View style={styles.custAvatar}>
                <Text style={styles.custAvatarTxt}>
                  {booking.customerName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.custName}>{booking.customerName}</Text>
                <Text style={styles.custPhone}>via in-app chat & call</Text>
              </View>

              {booking.status !== "pending" &&
              booking.status !== "completed" &&
              booking.status !== "cancelled" ? (
                <Pressable style={styles.callBtn} onPress={handleCall}>
                  <Icon name="phone" size={16} color={theme.colors.success} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {shouldTrackLive && (
            <View style={styles.card}>
              <View style={styles.liveHeader}>
                <Text style={styles.cardTitle}>Live Tracking</Text>
                <View style={styles.liveBadge}>
                  <View style={[styles.liveBadgeDot, {
                    backgroundColor: locationPermission === "granted" ? theme.colors.success : theme.colors.warning,
                  }]} />
                  <Text style={styles.liveBadgeText}>
                    {locationPermission === "granted" ? (liveSyncing ? "Syncing…" : "Sharing") :
                     locationPermission === "denied" ? "Permission needed" : "Waiting"}
                  </Text>
                </View>
              </View>

              {/* OpenStreetMap live preview — job site, provider location, and road route. */}
              {customerCoords ? (
                <OpenStreetMapPreview
                  height={260}
                  markers={[
                    {
                      id: "job-site",
                      latitude: customerCoords.lat,
                      longitude: customerCoords.lng,
                      kind: "job",
                      label: booking.address || "Customer address",
                    },
                    ...(providerCoords ? [{
                      id: "provider-location",
                      latitude: providerCoords.latitude,
                      longitude: providerCoords.longitude,
                      kind: "provider" as const,
                      label: "Your live GPS",
                    }] : []),
                  ]}
                  polyline={
                    roadPolyline.length >= 2
                      ? roadPolyline
                      : providerCoords
                        ? [
                            { latitude: providerCoords.latitude, longitude: providerCoords.longitude },
                            { latitude: customerCoords.lat, longitude: customerCoords.lng },
                          ]
                        : []
                  }
                />
              ) : null}

              {/* Compact stats row */}
              <View style={styles.liveInfoRow}>
                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>Distance to site</Text>
                  <Text style={styles.liveInfoValue}>
                    {providerDistanceKm != null ? `${providerDistanceKm.toFixed(1)} km` : "--"}
                  </Text>
                </View>
                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>ETA</Text>
                  <Text style={styles.liveInfoValue}>
                    {routeEtaMin != null ? `~${routeEtaMin} min` : providerDistanceKm != null ? `~${Math.round(providerDistanceKm * 3)} min` : "--"}
                  </Text>
                </View>
                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>Last sync</Text>
                  <Text style={styles.liveInfoValue}>
                    {formatLastUpdated(providerCoords?.updatedAt)}
                  </Text>
                </View>
                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>Accuracy</Text>
                  <Text style={styles.liveInfoValue}>
                    {providerCoords?.accuracy != null ? `${Math.round(providerCoords.accuracy)} m` : "--"}
                  </Text>
                </View>
              </View>

              <View style={styles.liveActionRow}>
                <Pressable style={styles.liveActionBtn} onPress={handleOpenMyLiveLocation}>
                  <Icon name="navigation" size={15} color={theme.colors.primary} />
                  <Text style={styles.liveActionText}>My Location</Text>
                </Pressable>
                <Pressable style={styles.liveActionBtn} onPress={handleOpenLocation}>
                  <Icon name="map-pin" size={15} color={theme.colors.primary} />
                  <Text style={styles.liveActionText}>Job Site</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Job Info</Text>

            <View style={styles.infoList}>
              <View style={styles.infoRow}>
                <Icon name="calendar" size={15} color={theme.colors.secondary} />
                <Text style={styles.infoLabel}>Date</Text>
                <Text style={styles.infoVal}>{booking.scheduledDate}</Text>
              </View>

              <View style={styles.infoRow}>
                <Icon name="clock" size={15} color={theme.colors.secondary} />
                <Text style={styles.infoLabel}>Time</Text>
                <Text style={styles.infoVal}>{booking.scheduledTime}</Text>
              </View>

              <View style={styles.infoRow}>
                <Icon name="map-pin" size={15} color={theme.colors.secondary} />
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoVal} numberOfLines={2}>
                  {booking.address}
                </Text>
              </View>

              {booking.price ? (
                <View style={styles.infoRow}>
                  <Icon name="tag" size={15} color={theme.colors.secondary} />
                  <Text style={styles.infoLabel}>Price</Text>
                  <Text style={styles.infoVal}>Rs. {booking.price}</Text>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <Icon name="home" size={15} color={theme.colors.secondary} />
                <Text style={styles.infoLabel}>Visit Charge</Text>
                <Text style={[styles.infoVal, { color: theme.colors.primary, fontWeight: "700" }]}>Rs. {VISIT_CHARGE}</Text>
              </View>

              {providerDistanceKm != null ? (
                <View style={styles.infoRow}>
                  <Icon name="navigation" size={15} color={theme.colors.warning} />
                  <Text style={styles.infoLabel}>Distance</Text>
                  <Text style={[styles.infoVal, { color: theme.colors.warning, fontWeight: "700" }]}>{providerDistanceKm.toFixed(1)} km away</Text>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <Icon name="file-text" size={15} color={theme.colors.secondary} />
                <Text style={styles.infoLabel}>Details</Text>
                <Text style={[styles.infoVal, !booking.description && { color: theme.colors.textMuted, fontStyle: "italic" }]}>
                  {booking.description || "No additional details provided."}
                </Text>
              </View>
            </View>

            {hasLocation ? (
              <Pressable style={styles.locationBtn} onPress={handleOpenLocation}>
                <Icon name="navigation" size={16} color={theme.colors.primary} />
                <Text style={styles.locationBtnText}>Open Customer Location</Text>
              </Pressable>
            ) : null}

            {booking.videoUrl ? (
              <View style={{ marginTop: 14 }}>
                <View style={styles.photoLabelRow}>
                  <Icon name="video" size={15} color={theme.colors.secondary} />
                  <Text style={styles.photoLabel}>Customer&apos;s Video</Text>
                </View>
                <VideoPlayer uri={booking.videoUrl} />
              </View>
            ) : null}

            {booking.attachment ? (
              <View style={{ marginTop: 14 }}>
                <View style={styles.photoLabelRow}>
                  <Icon name="image" size={15} color={theme.colors.secondary} />
                  <Text style={styles.photoLabel}>Customer&apos;s Photo</Text>
                </View>

                <Image
                  source={{ uri: booking.attachment.startsWith("data:") ? booking.attachment : `data:image/jpeg;base64,${booking.attachment}` }}
                  style={styles.attachmentImage}
                  resizeMode="cover"
                />
              </View>
            ) : null}
          </View>

          {booking.status === "in_progress" ? (
            <View style={styles.timerCard}>
              <View style={styles.timerHeader}>
                <View style={styles.timerLiveDot} />
                <Text style={styles.timerLiveText}>LIVE TIMER</Text>
              </View>

              <Text style={styles.timerDisplay}>{elapsed}</Text>

              <View style={styles.billingRow}>
                <View style={styles.billingItem}>
                  <Text style={styles.billingLabel}>Visit</Text>
                  <Text
                    style={[styles.billingVal, { color: theme.colors.secondary }]}
                  >
                    Rs. {VISIT_CHARGE}
                  </Text>
                </View>

                <View style={styles.billingDivider} />

                <View style={styles.billingItem}>
                  <Text style={styles.billingLabel}>Time ({elapsedMinutes}m)</Text>
                  {hasHourlyRate ? (
                    <Text style={[styles.billingVal, { color: theme.colors.primary }]}>
                      Rs. {timeCharge}
                    </Text>
                  ) : (
                    <Text style={[styles.billingVal, { color: theme.colors.danger, fontSize: 13 }]}>
                      —
                    </Text>
                  )}
                </View>

                <View style={styles.billingDivider} />

                <View style={styles.billingItem}>
                  <Text
                    style={[styles.billingVal, { color: theme.colors.success, fontSize: 18 }]}
                  >
                    Rs. {totalAmount}
                  </Text>
                  <Text style={styles.billingLabel}>Total</Text>
                </View>
              </View>
              {!hasHourlyRate ? (
                <Text style={styles.rateMissingNote}>
                  Your hourly rate isn&apos;t set, so time charges can&apos;t be calculated. Please contact Athoo admin to set your hourly rate.
                </Text>
              ) : null}
            </View>
          ) : null}

          {booking.status === "pending" ? (
            <View style={{ gap: 10 }}>
              <View style={styles.actionRowWrap}>
                <Button
                  title={isDeclining ? "..." : "Decline"}
                  variant="outline"
                  onPress={handleDecline}
                  disabled={isAccepting || isDeclining || isCountering}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Counter"
                  variant="outline"
                  onPress={() => {
                    setCounterAmount(String(booking.price ?? ""));
                    setCounterMessage("");
                    setShowCounterModal(true);
                  }}
                  disabled={isAccepting || isDeclining || isCountering}
                  style={{ flex: 1, borderColor: theme.colors.warning }}
                />
                <Button
                  title={isAccepting ? "..." : "Accept"}
                  onPress={handleAccept}
                  disabled={isAccepting || isDeclining || isCountering}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}

          {booking.status === "accepted" ? (
            <View style={styles.arrivedSection}>
              {/* For scheduled jobs, show a "Go to Customer" button first */}
              {isScheduledJob && !enRoute && (
                <View style={{ marginBottom: 12 }}>
                  <View style={[styles.otpInfo, { backgroundColor: theme.colors.premiumSoft, borderColor: theme.colors.warningSoft }]}>
                    <Icon name="clock" size={16} color={theme.colors.secondary} />
                    <Text style={[styles.otpInfoText, { color: theme.colors.secondaryPressed }]}>
                      Scheduled job — tap below when you're heading to the customer.
                      Live tracking will start only then.
                    </Text>
                  </View>
                  <Button
                    title="Go to Customer"
                    onPress={() => setEnRoute(true)}
                    fullWidth
                    variant="secondary"
                  />
                </View>
              )}

              {(!isScheduledJob || enRoute) && (
                <>
                  <View style={styles.otpInfo}>
                    <Icon name="shield" size={16} color={theme.colors.primary} />
                    <Text style={styles.otpInfoText}>
                      Ask the customer for their 4-digit start code, then enter it to
                      begin the job.
                    </Text>
                  </View>
                  <Button
                    title={isAccepting ? "Please wait..." : "I've Arrived – Enter Start Code"}
                    onPress={handleArrived}
                    disabled={isAccepting}
                    fullWidth
                  />
                </>
              )}
            </View>
          ) : null}

          {booking.status === "in_progress" ? (
            <View style={styles.arrivedSection}>
              <View style={styles.otpInfo}>
                <Icon name="shield" size={16} color={theme.colors.success} />
                <Text style={[styles.otpInfoText, { color: theme.colors.success }]}>
                  Job in progress. When done, get the completion code from the
                  customer.
                </Text>
              </View>

              <Button
                title={
                  isGenCompletePin
                    ? "Please wait..."
                    : "Job Done – Enter Completion Code"
                }
                onPress={handleRequestComplete}
                disabled={isGenCompletePin}
                fullWidth
              />
            </View>
          ) : null}

          {booking.status === "completed" ? (
            <View style={styles.completedBox}>
              <Icon name="check-circle" size={32} color={theme.colors.success} style={{ alignSelf: "center" } as any} />
              <Text style={styles.completedTitle}>Job Completed!</Text>
              <Text style={styles.completedText}>Great work! This job has been marked as complete.</Text>

              <View style={styles.invoiceSummaryRow}>
                <View style={styles.invoiceSummaryItem}>
                  <Text style={styles.invoiceSummaryLabel}>Service Charge</Text>
                  <Text style={styles.invoiceSummaryValue}>Rs. {(booking.price || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.invoiceSummaryItem}>
                  <Text style={styles.invoiceSummaryLabel}>Visit Charge</Text>
                  <Text style={styles.invoiceSummaryValue}>Rs. {VISIT_CHARGE}</Text>
                </View>
                <View style={[styles.invoiceSummaryItem, styles.invoiceTotalItem]}>
                  <Text style={styles.invoiceTotalLabel}>Total to Collect</Text>
                  <Text style={styles.invoiceTotalValue}>Rs. {((booking.price || 0) + VISIT_CHARGE).toLocaleString()}</Text>
                </View>
              </View>

              {booking.paymentStatus === "received" ? (
                <View style={styles.paymentConfirmedBadge}>
                  <Icon name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.paymentConfirmedText}>Cash Received ✓</Text>
                </View>
              ) : (
                <Button
                  title={isMarkingReceived ? "Confirming..." : "Mark Cash as Received"}
                  onPress={handleMarkReceived}
                  loading={isMarkingReceived}
                  fullWidth
                  style={{ marginTop: 4 }}
                />
              )}

              <Button
                title="View Full Invoice"
                onPress={() => setShowInvoiceModal(true)}
                variant="outline"
                fullWidth
                style={{ marginTop: 4 }}
              />
            </View>
          ) : null}
        </ScrollView>

        {/* ── Invoice / Job Summary Modal ── */}
        <Modal visible={showInvoiceModal} animationType="slide" transparent onRequestClose={() => setShowInvoiceModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: "85%" }]}>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: theme.colors.successSoft }]}>
                  <Icon name="file-text" size={22} color={theme.colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Job Invoice</Text>
                  <Text style={styles.modalSubtitle}>{booking?.service} · {booking?.scheduledDate}</Text>
                </View>
                <Pressable onPress={() => setShowInvoiceModal(false)}>
                  <Icon name="x" size={22} color={theme.colors.text} />
                </Pressable>
              </View>

              <View style={{ gap: 8 }}>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Customer</Text>
                  <Text style={styles.invoiceModalValue}>{booking?.customerName}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Phone</Text>
                  <Text style={styles.invoiceModalValue}>{booking?.customerPhone}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Address</Text>
                  <Text style={[styles.invoiceModalValue, { flex: 1, textAlign: "right" }]}>{booking?.address}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Scheduled</Text>
                  <Text style={styles.invoiceModalValue}>{booking?.scheduledDate} at {booking?.scheduledTime}</Text>
                </View>
                <View style={[styles.invoiceModalRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8 }]}>
                  <Text style={styles.invoiceModalLabel}>Service Charge</Text>
                  <Text style={styles.invoiceModalValue}>Rs. {(booking?.price || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Visit Charge</Text>
                  <Text style={styles.invoiceModalValue}>Rs. {VISIT_CHARGE}</Text>
                </View>
                <View style={[styles.invoiceModalRow, { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.invoiceModalLabel, { fontWeight: "800", fontSize: 15 }]}>Total Amount</Text>
                  <Text style={[styles.invoiceModalValue, { fontWeight: "900", fontSize: 17, color: theme.colors.primary }]}>
                    Rs. {((booking?.price || 0) + VISIT_CHARGE).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Platform Commission</Text>
                  <Text style={[styles.invoiceModalValue, { color: theme.colors.danger }]}>- Rs. {booking?.commissionAmount || 0}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={[styles.invoiceModalLabel, { fontWeight: "700" }]}>Your Earnings</Text>
                  <Text style={[styles.invoiceModalValue, { fontWeight: "800", color: theme.colors.success }]}>
                    Rs. {((booking?.price || 0) + VISIT_CHARGE - (booking?.commissionAmount || 0)).toLocaleString()}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 16, gap: 8 }}>
                {booking?.paymentStatus === "received" ? (
                  <View style={[styles.paymentConfirmedBadge, { marginTop: 0 }]}>
                    <Icon name="check-circle" size={16} color={theme.colors.success} />
                    <Text style={styles.paymentConfirmedText}>Cash Confirmed as Received</Text>
                  </View>
                ) : (
                  <Button
                    title={isMarkingReceived ? "Confirming..." : "Mark Cash as Received"}
                    onPress={handleMarkReceived}
                    loading={isMarkingReceived}
                    fullWidth
                  />
                )}
                <Button title="Close" onPress={() => setShowInvoiceModal(false)} variant="outline" fullWidth />
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Counter Offer Modal ── */}
        <Modal visible={showCounterModal} animationType="slide" transparent onRequestClose={() => setShowCounterModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: "75%" }]}>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: theme.colors.warningSoft }]}>
                  <Icon name="dollar-sign" size={22} color={theme.colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Counter Offer</Text>
                  <Text style={styles.modalSubtitle}>Customer offered Rs. {booking?.price ?? "—"}</Text>
                </View>
                <Pressable onPress={() => setShowCounterModal(false)}>
                  <Icon name="x" size={22} color={theme.colors.text} />
                </Pressable>
              </View>

              <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginBottom: 4 }}>Your price (Rs.)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.colors.text, backgroundColor: theme.colors.background }}
                value={counterAmount}
                onChangeText={setCounterAmount}
                keyboardType="numeric"
                placeholder="Enter your price"
                placeholderTextColor={theme.colors.textMuted}
              />

              <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginBottom: 4, marginTop: 12 }}>Message (optional)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.background, minHeight: 72, textAlignVertical: "top" }}
                value={counterMessage}
                onChangeText={setCounterMessage}
                placeholder="E.g. Parts cost extra, materials included…"
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={3}
              />

              <View style={{ marginTop: 16, gap: 8 }}>
                <Button
                  title={isCountering ? "Sending..." : "Send Counter Offer"}
                  onPress={handleCounter}
                  loading={isCountering}
                  fullWidth
                />
                <Button title="Cancel" onPress={() => setShowCounterModal(false)} variant="outline" fullWidth />
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showArriveOtp || showCompleteOtp}
          animationType="slide"
          transparent
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalIcon}>
                    <Icon
                      name="shield"
                      size={24}
                      color={showArriveOtp ? theme.colors.primary : theme.colors.success}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>
                      {showArriveOtp ? "Start Job Code" : "Complete Job Code"}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {showArriveOtp
                        ? "Enter the 4-digit start code from the customer."
                        : "Enter the 4-digit completion code from the customer."}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      setShowArriveOtp(false);
                      setShowCompleteOtp(false);
                      setOtpInput("");
                      setOtpError("");
                    }}
                  >
                    <Icon name="x" size={22} color={theme.colors.text} />
                  </Pressable>
                </View>

                <Pressable onPress={() => otpInputRef.current?.focus()}>
                  <View style={styles.otpInputRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.otpBox,
                          otpInput.length > i && styles.otpBoxFilled,
                          otpInput.length === i && styles.otpBoxActive,
                        ]}
                      >
                        <Text style={styles.otpBoxText}>
                          {otpInput[i] ? "●" : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Pressable>

                <TextInput
                  ref={otpInputRef}
                  style={styles.hiddenInput}
                  value={otpInput}
                  onChangeText={(v) => {
                    setOtpInput(v.replace(/\D/g, "").slice(0, 4));
                    setOtpError("");
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  returnKeyType="done"
                  onSubmitEditing={
                    showArriveOtp
                      ? handleVerifyArriveOtp
                      : handleVerifyCompleteOtp
                  }
                  caretHidden
                />

                {otpError ? <Text style={styles.otpError}>{otpError}</Text> : null}

                <Button
                  title={
                    isVerifying
                      ? "Verifying..."
                      : showArriveOtp
                      ? "Start Job"
                      : "Complete Job"
                  }
                  onPress={
                    showArriveOtp
                      ? handleVerifyArriveOtp
                      : handleVerifyCompleteOtp
                  }
                  fullWidth
                  style={{ marginTop: 8 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },

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

  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    flex: 1,
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  scroll: { flex: 1 },

  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 60,
  },

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

  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: theme.colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
  },

  serviceName: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },

  bookingId: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.secondary + "15",
    alignItems: "center",
    justifyContent: "center",
  },

  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.successSoft,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },

  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  custAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.border,
  },

  custAvatarTxt: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
  },

  custName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },

  custPhone: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },

  liveHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  liveBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  liveBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },

  liveInfoRow: {
    flexDirection: "row",
    gap: 10,
  },

  liveInfoBox: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },

  liveInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },

  liveInfoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
    lineHeight: 17,
  },

  liveActionRow: {
    flexDirection: "row",
    gap: 10,
  },

  liveActionBtn: {
    flex: 1,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
    paddingVertical: 12,
  },

  liveActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
  },

  trackingMap: {
    width: "100%",
    height: 230,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 4,
  },

  liveHint: {
    fontSize: 11,
    lineHeight: 17,
    color: theme.colors.textSecondary,
  },

  infoList: {
    gap: 10,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  infoLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    width: 60,
  },

  infoVal: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    flex: 1,
  },

  locationBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
    paddingVertical: 12,
  },

  locationBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },

  photoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },

  photoLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },

  attachmentImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },

  timerCard: {
    backgroundColor: theme.dark ? theme.colors.accentSoft : theme.colors.primaryPressed,
    borderRadius: 18,
    padding: 20,
    gap: 16,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },

  timerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

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

  billingRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
  },

  billingItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },

  rateMissingNote: {
    marginTop: 12,
    fontSize: 12,
    color: theme.colors.danger,
    textAlign: "center",
    lineHeight: 17,
    fontWeight: "600",
  },
  billingLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "600",
  },

  billingVal: {
    fontSize: 14,
    fontWeight: "800",
  },

  billingDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  actionRowWrap: {
    flexDirection: "row",
    gap: 12,
  },

  arrivedSection: {
    gap: 12,
  },

  otpInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: theme.colors.primary + "10",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
  },

  otpInfoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.primary,
    lineHeight: 18,
    fontWeight: "500",
  },

  pinHintBox: {
    backgroundColor: theme.colors.primary + "10",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + "25",
  },

  pinHintLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  pinHintValue: {
    fontSize: 26,
    fontWeight: "900",
    color: theme.colors.text,
    letterSpacing: 3,
    marginBottom: 6,
  },

  pinHintText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },

  completedBox: {
    backgroundColor: theme.colors.successSoft,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },

  invoiceSummaryRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.successSoft,
    paddingTop: 10,
    marginTop: 4,
    gap: 6,
  },

  invoiceSummaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  invoiceSummaryLabel: {
    fontSize: 13,
    color: theme.colors.success,
  },

  invoiceSummaryValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.success,
  },

  invoiceTotalItem: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.successSoft,
    paddingTop: 6,
    marginTop: 2,
  },

  invoiceTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.success,
  },

  invoiceTotalValue: {
    fontSize: 15,
    fontWeight: "900",
    color: theme.colors.primary,
  },

  paymentConfirmedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.successSoft,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },

  paymentConfirmedText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.success,
  },

  invoiceModalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },

  invoiceModalLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    minWidth: 110,
  },

  invoiceModalValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "right",
    flexShrink: 1,
  },

  completedTitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.success,
  },

  completedText: {
    textAlign: "center",
    fontSize: 13,
    color: theme.colors.success,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },

  modalBox: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.text,
  },

  modalSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  otpInputRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },

  otpBox: {
    width: 60,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },

  otpBoxFilled: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "10",
  },

  otpBoxActive: {
    borderColor: theme.colors.primary,
    borderWidth: 2.5,
  },

  otpBoxText: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
  },

  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },

  otpError: {
    textAlign: "center",
    fontSize: 13,
    color: theme.colors.danger,
    fontWeight: "600",
  },
});
