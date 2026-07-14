import { AthooMapFallback } from "@/components/maps/AthooMapFallback";
import { BookingPriceSummary, BookingProgress } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { pickFromCamera, pickFromGallery } from "@/utils/mediaPicker";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { type ServiceCategory } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { uploadPickedImage, type UploadProgress } from "@/services/storage";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { searchAddress, reverseGeocode } from "@/services/maps";
import { getFastForegroundLocation } from "@/services/location";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LIVE_LOCATION_CONSENT_KEY = "athoo_live_location_consent_v1";
const MATERIALS_DISCLAIMER_KEY = "athoo_materials_disclaimer_v1";
import { TimePicker, formatTimeValue, type TimeValue } from "@/components/ui/TimePicker";
import { isPastOrTooSoon } from "@/utils/dateTime";
import { apiErrorToMessage } from "@/lib/apiError";

function getDates() {
  const dates = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push({
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : days[d.getDay()],
      date: `${year}-${month}-${day}`,
      dayNum: d.getDate(),
      monthAbbr: months[d.getMonth()],
    });
  }
  return dates;
}


const STEPS = ["Category", "Location", "Details", "Schedule", "Offer"];

export default function BookServiceScreen() {
  const {
    serviceId: paramServiceId,
    pickedAddress: paramPickedAddress,
    pickedLat: paramPickedLat,
    pickedLng: paramPickedLng,
    negotiatedHourlyRate: paramNegotiatedHourlyRate,
    providerId: paramProviderId,
    providerName: paramProviderName,
    providerRate: paramProviderRate,
    serviceName: paramServiceName,
    prefillAddress: paramPrefillAddress,
    prefillDescription: paramPrefillDescription,
    previousBookingId: paramPreviousBookingId,
  } = useLocalSearchParams<{
    serviceId?: string;
    pickedAddress?: string;
    pickedLat?: string;
    pickedLng?: string;
    negotiatedHourlyRate?: string;
    providerId?: string;
    providerName?: string;
    providerRate?: string;
    serviceName?: string;
    prefillAddress?: string;
    prefillDescription?: string;
    previousBookingId?: string;
  }>();

  const isDirectBooking = !!paramProviderId;

  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();
  const { showError } = useToast();
  const { categories, getCategoryBySlug } = useCategories();

  const [step, setStep] = useState(paramProviderId ? 1 : paramServiceId ? 1 : 0);
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);

  useEffect(() => {
    if (categories.length === 0 || selectedCategory) return;
    const foundBySlug = paramServiceId ? getCategoryBySlug(paramServiceId) : null;
    const normalizedServiceName = String(paramServiceName || "").trim().toLowerCase();
    const foundByName = normalizedServiceName
      ? categories.find((category) => String(category.name || "").trim().toLowerCase() === normalizedServiceName)
      : null;
    const found = foundBySlug || foundByName;
    if (found) setSelectedCategory(found as ServiceCategory);
  }, [paramServiceId, paramServiceName, categories, getCategoryBySlug, selectedCategory]);

  const initialAddress = paramPickedAddress || paramPrefillAddress || "";
  const [address, setAddress] = useState(initialAddress);
  const [addressQuery, setAddressQuery] = useState(initialAddress);
  const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; lat: number; lng: number; useAsTyped?: boolean }[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    paramPickedLat && paramPickedLng
      ? { latitude: parseFloat(paramPickedLat), longitude: parseFloat(paramPickedLng) }
      : null
  );
  const [savedAddresses, setSavedAddresses] = useState<{ id: string; label: string; address: string; latitude?: number | null; longitude?: number | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    api.getAddresses().then((res) => {
      if (res?.addresses?.length > 0) setSavedAddresses(res.addresses);
    }).catch(() => {});
  }, [user]);

  const [description, setDescription] = useState(paramPrefillDescription || "");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState("booking-video.mp4");
  const [videoMimeType, setVideoMimeType] = useState("video/mp4");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<UploadProgress | null>(null);

  const dates = getDates();
  const [selectedDate, setSelectedDate] = useState(dates[0].date);
  const [timeValue, setTimeValue] = useState<TimeValue>({ hour: 8, minute: 0, period: "AM" });
  const selectedTime = formatTimeValue(timeValue);

  const [resolvedProviderRate, setResolvedProviderRate] = useState<number>(Number(paramProviderRate || 0));
  const [offerHourlyRate, setOfferHourlyRate] = useState(
    paramNegotiatedHourlyRate ? String(paramNegotiatedHourlyRate) : paramProviderRate ? String(paramProviderRate) : ""
  );

  useEffect(() => {
    if (!paramProviderId || resolvedProviderRate > 0) return;
    let cancelled = false;
    api.getProvider(String(paramProviderId))
      .then((res: any) => {
        const rate = Number(res?.provider?.ratePerHour || res?.provider?.hourlyRate || 0);
        if (!cancelled && rate > 0) {
          setResolvedProviderRate(rate);
          setOfferHourlyRate((prev) => prev.trim() ? prev : String(rate));
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [paramProviderId, resolvedProviderRate]);
  const getCategorySuggestedHourlyRate = React.useCallback(() => {
    const cat: any = selectedCategory || {};
    const directRate = Number(resolvedProviderRate || paramProviderRate || 0);
    if (directRate > 0) return directRate;
    const avg = Number(cat.averageHourlyRate || cat.average_hourly_rate || cat.avgHourlyRate || cat.avg_hourly_rate || cat.ratePerHour || cat.rate_per_hour || 0);
    if (avg > 0) return avg;
    const min = Number(cat.minHourlyRate || cat.min_hourly_rate || 0);
    const max = Number(cat.maxHourlyRate || cat.max_hourly_rate || 0);
    if (min > 0 && max > 0) return Math.round((min + max) / 2);
    if (min > 0) return min;
    if (max > 0) return max;
    return 500;
  }, [selectedCategory, paramProviderRate, resolvedProviderRate]);

  useEffect(() => {
    const defaultRate = paramNegotiatedHourlyRate || resolvedProviderRate || paramProviderRate || getCategorySuggestedHourlyRate();
    if (defaultRate && !offerHourlyRate.trim()) setOfferHourlyRate(String(defaultRate));
  }, [paramNegotiatedHourlyRate, paramProviderRate, resolvedProviderRate, selectedCategory, getCategorySuggestedHourlyRate]);
  const [travelCharge, setTravelCharge] = useState("500");
  const [manualDetails, setManualDetails] = useState("");
  const [reversingGeo, setReversingGeo] = useState(false);
  const [gpsAccuracyText, setGpsAccuracyText] = useState("");
  const mapRef = useRef<any | null>(null);

  const [promoCode, setPromoCode] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountType: "fixed" | "percent"; discountValue: number; description: string | null } | null>(null);
  const [promoError, setPromoError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const directBookingRequestIdRef = useRef<string | null>(null);
  const broadcastRequestIdRef = useRef<string | null>(null);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!addressQuery.trim() || addressQuery.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingAddress(true);
      const results = await searchAddress(addressQuery);
      setAddressSuggestions(results);
      setSearchingAddress(false);
    }, 500);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [addressQuery]);

  const detectCurrentLocation = async () => {
    setLoadingAddress(true);
    setGpsAccuracyText("Acquiring GPS…");
    try {
      const result = await getFastForegroundLocation({
        timeoutMs: 8_000,
        requiredAccuracy: 1_000,
        rationaleTitle: "Location permission",
        rationaleBody: "ATHOO uses your location to auto-detect your address so the provider can find you.",
      });
      setGpsAccuracyText("");
      if (!result.location) {
        showError("Location Error", "Could not detect your location. Please check GPS or search your address manually.");
        return;
      }

      if (result.location.accuracy != null) {
        setGpsAccuracyText(`GPS: ±${Math.round(result.location.accuracy)} m${result.stale ? " (cached)" : ""}`);
      }
      const coords = { latitude: result.location.latitude, longitude: result.location.longitude };
      setUserLocation(coords);

      const { label: resolved } = await smartReverseGeocode(coords.latitude, coords.longitude);
      setAddress(resolved);
      setAddressQuery(resolved);
      setAddressSuggestions([]);
    } catch {
      showError("Location Error", "Could not detect your location.");
    } finally {
      setGpsAccuracyText("");
      setLoadingAddress(false);
    }
  };

  /**
   * Return true if a geocoded label is too vague to be a usable job address.
   * Triggers the "please add house/street" prompt.
   */
  const isCityOnly = (label: string): boolean => {
    if (!label) return true;
    // Raw coordinate strings (e.g. "33.73621, 73.20715")
    if (/^\d+\.\d+,\s*\d+\.\d+$/.test(label.trim())) return true;
    if (!label.includes(",")) return true;
    const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) return false; // road + area + city = good
    // All parts identical → city repeated
    const unique = new Set(parts.map((p) => p.toLowerCase()));
    if (unique.size === 1) return true;
    // All parts are admin-area words
    const adminWords = /territory|province|capital|district|division|region|islamabad|lahore|karachi|rawalpindi|faisalabad|peshawar|quetta/i;
    if (parts.every((p) => adminWords.test(p))) return true;
    return false;
  };

  /**
   * Reverse geocode with the best source available on the device.
   *
   * Priority:
   *  1. Device OS geocoder — the device geocoder available on the operating system.
   *     These both have real street/neighbourhood data for Pakistan.
   *  2. Server Nominatim proxy — fallback when OS geocoder is too vague.
   *  3. Raw coordinates — last resort; always prompts for manual entry.
   */
  const smartReverseGeocode = async (
    lat: number,
    lng: number,
  ): Promise<{ label: string; cityOnly: boolean }> => {
    // 1. Device OS geocoder — best on-device map data (device)
    try {
      const deviceLabel = await deviceReversGeocode(lat, lng);
      if (deviceLabel && !isCityOnly(deviceLabel)) {
        return { label: deviceLabel, cityOnly: false };
      }
      // Device returned only city; try server Nominatim for more detail
      const serverLabel = await reverseGeocode(lat, lng);
      const serverIsCoords = serverLabel ? /^\d+\.\d+/.test(serverLabel.trim()) : true;
      if (serverLabel && !isCityOnly(serverLabel) && !serverIsCoords) {
        return { label: serverLabel, cityOnly: false };
      }
      // Both sources vague — use device result (cleaner) + flag for manual prompt
      const best = deviceLabel && !serverIsCoords ? deviceLabel : serverLabel ?? deviceLabel;
      if (best && !serverIsCoords) return { label: best, cityOnly: true };
      if (deviceLabel) return { label: deviceLabel, cityOnly: true };
    } catch { /* fall through */ }

    // 2. Server-only fallback
    try {
      const serverLabel = await reverseGeocode(lat, lng);
      if (serverLabel && !/^\d+\.\d+/.test(serverLabel.trim())) {
        return { label: serverLabel, cityOnly: isCityOnly(serverLabel) };
      }
    } catch { /* fall through */ }

    // 3. Raw coordinates
    return { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, cityOnly: true };
  };

  /**
   * Build a clean label from the device's OS geocoder (the device geocoder).
   * Skips name when it duplicates the city to avoid "Islamabad, Islamabad".
   */
  const deviceReversGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (!geo.length) return null;
      const g = geo[0];
      const parts: string[] = [];
      if (g.streetNumber && g.street) parts.push(`${g.streetNumber} ${g.street}`);
      else if (g.street) parts.push(g.street);
      // Add name only if it adds info (not just the city repeated)
      const nameIsCity = g.name && g.city && g.name.trim().toLowerCase() === g.city.trim().toLowerCase();
      if (g.name && !nameIsCity && !/^\d/.test(g.name) && !parts.includes(g.name)) parts.push(g.name);
      const area = g.district && g.district !== g.city ? g.district : null;
      if (area && !parts.includes(area)) parts.push(area);
      if (g.city && !parts.includes(g.city)) parts.push(g.city);
      const label = [...new Set(parts.filter(Boolean))].join(", ");
      return label.length >= 3 ? label : null;
    } catch {
      return null;
    }
  };

  const onPinDragEnd = async (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setUserLocation({ latitude, longitude });
    setReversingGeo(true);
    try {
      const { label } = await smartReverseGeocode(latitude, longitude);
      setAddress(label);
      setAddressQuery(label);
    } catch { /* keep old address label */ }
    finally { setReversingGeo(false); }
  };

  const pickVideo = async (fromCamera: boolean) => {
    const options = {
      mediaTypes: "videos" as any,
      videoMaxDuration: 30,
      allowsEditing: false,
      quality: 0.55,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    } as any;
    const result = fromCamera ? await pickFromCamera(options) : await pickFromGallery(options);
    if (!result || result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.duration && asset.duration > 30000) {
      Alert.alert("Too Long", "Please select a video under 30 seconds.");
      return;
    }
    const inferredName = (asset as any).fileName || (asset.uri?.split("/").pop()) || "booking-video.mp4";
    const inferredType = (asset as any).mimeType || (inferredName.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
    setVideoFileName(inferredName);
    setVideoMimeType(inferredType);
    setVideoUri(asset.uri);
    setVideoUploadProgress(null);
  };

  const canProceed = () => {
    if (step === 0) return !!selectedCategory;
    if (step === 1) return address.trim().length > 5;
    return true;
  };

  const addressIsCityOnly = isCityOnly(address) && !manualDetails.trim();

  const validatePromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoValidating(true);
    setPromoError("");
    setAppliedPromo(null);
    try {
      const offerVal = offerHourlyRate.trim() ? parseInt(offerHourlyRate, 10) : 0;
      const res = await api.validatePromo(code, offerVal);
      if (res.promo) {
        setAppliedPromo({ code: res.promo.code, discountType: res.promo.discountType, discountValue: res.promo.discountValue, description: res.promo.description });
      } else {
        setPromoError("Invalid or expired promo code.");
      }
    } catch (e: any) {
      setPromoError(apiErrorToMessage(e, "This promo code is invalid or expired."));
    } finally {
      setPromoValidating(false);
    }
  };

  const [showLiveConsent, setShowLiveConsent] = useState(false);
  const pendingSubmitRef = React.useRef<null | (() => void)>(null);

  const [showMaterialsDisclaimer, setShowMaterialsDisclaimer] = useState(false);
  const [materialsAccepted, setMaterialsAccepted] = useState(false);
  const materialsResolveRef = React.useRef<((v: boolean) => void) | null>(null);

  const ensureMaterialsDisclaimer = async (): Promise<boolean> => {
    try {
      const stored = await AsyncStorage.getItem(MATERIALS_DISCLAIMER_KEY);
      if (stored === "1") return true;
    } catch {}
    return new Promise<boolean>((resolve) => {
      materialsResolveRef.current = resolve;
      setMaterialsAccepted(false);
      setShowMaterialsDisclaimer(true);
    });
  };

  const acceptMaterialsDisclaimer = async () => {
    try { await AsyncStorage.setItem(MATERIALS_DISCLAIMER_KEY, "1"); } catch {}
    setShowMaterialsDisclaimer(false);
    const fn = materialsResolveRef.current;
    materialsResolveRef.current = null;
    if (fn) fn(true);
  };

  const declineMaterialsDisclaimer = () => {
    setShowMaterialsDisclaimer(false);
    const fn = materialsResolveRef.current;
    materialsResolveRef.current = null;
    if (fn) fn(false);
  };

  const ensureLiveLocationConsent = async (): Promise<boolean> => {
    try {
      const stored = await AsyncStorage.getItem(LIVE_LOCATION_CONSENT_KEY);
      if (stored === "1") return true;
    } catch {
      // If storage fails, fall through and ask — better safe.
    }
    return new Promise<boolean>((resolve) => {
      pendingSubmitRef.current = () => resolve(true);
      // Store decline path on the modal buttons themselves via state.
      (pendingSubmitRef as any).reject = () => resolve(false);
      setShowLiveConsent(true);
    });
  };

  const acceptLiveConsent = async () => {
    try { await AsyncStorage.setItem(LIVE_LOCATION_CONSENT_KEY, "1"); } catch {}
    setShowLiveConsent(false);
    const fn = pendingSubmitRef.current;
    pendingSubmitRef.current = null;
    if (fn) fn();
  };

  const declineLiveConsent = () => {
    setShowLiveConsent(false);
    const reject = (pendingSubmitRef as any).reject as (() => void) | undefined;
    pendingSubmitRef.current = null;
    (pendingSubmitRef as any).reject = null;
    if (reject) reject();
  };

  const handleSubmit = async () => {
    if (!user) { showError("Login Required", "Please log in to continue."); return; }
    if (!selectedCategory) { showError("Error", "No category selected."); return; }
    if (!address.trim()) { showError("Error", "Please enter your address."); return; }
    const dateTimeError = isPastOrTooSoon(selectedDate, selectedTime, 20);
    if (dateTimeError) {
      showError("Invalid booking time", dateTimeError);
      return;
    }

    // First-time live-location consent — explicit modal before the user's
    // first ever booking so they understand the provider will be able to see
    // their location while the job is active. Stored locally; only asked once.
    const disclaimerAccepted = await ensureMaterialsDisclaimer();
    if (!disclaimerAccepted) {
      showError("Agreement required", "Please read and accept the materials & spare parts disclaimer to continue.");
      return;
    }

    const consented = await ensureLiveLocationConsent();
    if (!consented) {
      showError("Consent required", "Live location sharing is needed so providers can find you. You can revisit this any time from Settings.");
      return;
    }

    setSubmitting(true);

    let videoUrl: string | undefined;
    if (videoUri) {
      try {
        setUploadingVideo(true);
        setVideoUploadProgress({ loaded: 0, percent: 0, stage: "preparing" });
        videoUrl = await uploadPickedImage(videoUri, videoFileName, videoMimeType, setVideoUploadProgress);
      } catch (e: any) {
        showError("Video not uploaded", apiErrorToMessage(e, "We couldn't upload the video. You can continue without it."));
        videoUrl = undefined;
      } finally {
        setUploadingVideo(false);
        setVideoUploadProgress(null);
      }
    }

    try {
      const parsedOffer = offerHourlyRate.trim() ? parseInt(offerHourlyRate, 10) : undefined;

      const parsedTravelCharge = travelCharge.trim() ? Math.max(0, parseInt(travelCharge, 10) || 0) : 500;

      const finalAddress = [address.trim(), manualDetails.trim()].filter(Boolean).join(" — ");

      if (isDirectBooking && paramProviderId) {
        if (!directBookingRequestIdRef.current) {
          directBookingRequestIdRef.current = `booking-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
        await api.createBooking({
          clientRequestId: directBookingRequestIdRef.current,
          providerId: paramProviderId,
          service: selectedCategory.name,
          categorySlug: (selectedCategory as any).slug || selectedCategory.id,
          description: description.trim() || undefined,
          videoUrl,
          address: finalAddress,
          pickedLat: userLocation?.latitude,
          pickedLng: userLocation?.longitude,
          scheduledDate: selectedDate,
          scheduledTime: selectedTime,
          price: parsedOffer && parsedOffer >= 100 ? parsedOffer : undefined,
          visitCharge: parsedTravelCharge,
          promoCode: appliedPromo?.code,
        });
        directBookingRequestIdRef.current = null;
        Alert.alert(
          "Booking Sent!",
          `Your request has been sent directly to ${paramProviderName || "the provider"}. You'll be notified once they accept.`,
          [{ text: "OK", onPress: () => router.replace("/(customer)/(tabs)/bookings" as any) }]
        );
      } else {
        if (!broadcastRequestIdRef.current) {
          broadcastRequestIdRef.current = `broadcast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
        const res = await api.createBroadcastRequest({
          clientRequestId: broadcastRequestIdRef.current,
          service: selectedCategory.id,
          serviceLabel: selectedCategory.name,
          serviceIcon: selectedCategory.icon,
          description: description.trim() || undefined,
          videoUrl,
          address: finalAddress,
          latitude: userLocation?.latitude,
          longitude: userLocation?.longitude,
          scheduledDate: selectedDate,
          scheduledTime: selectedTime,
          customerOffer: parsedOffer && parsedOffer >= 100 ? parsedOffer : undefined,
          travellingCharge: parsedTravelCharge,
        });
        broadcastRequestIdRef.current = null;
        setBroadcastId(res.request.id);
      }
    } catch (e: any) {
      const msg = apiErrorToMessage(e, "We couldn't submit your request. Please try again.");
      Alert.alert("Request not submitted", msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (broadcastId) {
    return (
      <View style={[styles.container, styles.successWrap, { paddingTop: topPad }]}>
        <View style={styles.successCircle}>
          <Icon name="send" size={40} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Request Broadcast!</Text>
        <Text style={styles.successSub}>
          Your {selectedCategory?.name} request has been sent to nearby providers. Responses will arrive shortly.
        </Text>
        <Pressable
          style={styles.viewResponsesBtn}
          onPress={() =>
            router.replace({ pathname: "/(customer)/broadcast-status", params: { requestId: broadcastId } } as any)
          }
        >
          <Icon name="users" size={18} color="#fff" />
          <Text style={styles.btnText}>View Provider Responses</Text>
        </Pressable>
        <Pressable style={styles.homeBtn} onPress={() => router.replace("/(customer)/(tabs)/home" as any)}>
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => (step > 0 ? setStep(step - 1) : router.back())}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Book a Service</Text>
          <Text style={styles.headerSub}>{STEPS[step]} · Step {step + 1} of {STEPS.length}</Text>
        </View>
        <View style={{ width: 190 }}>
          <BookingProgress
            compact
            activeIndex={step}
            steps={STEPS.map((label, index) => ({
              key: label.toLowerCase(),
              label,
              icon: ["grid", "map-pin", "file-text", "calendar", "dollar-sign"][index],
            }))}
            testID="customer-booking-progress"
          />
        </View>
      </View>

      {paramPreviousBookingId ? (
        <View style={styles.repeatNotice} testID="repeat-booking-prefill-notice">
          <Icon name="repeat" size={16} color={Colors.primary} />
          <Text style={styles.repeatNoticeText}>
            Reviewing a repeat booking{paramServiceName ? ` for ${paramServiceName}` : ""}. Confirm the date, time, address, and price before submitting.
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>What service do you need?</Text>
            <Text style={styles.sub}>Select the type of work</Text>
            <View style={styles.grid}>
              {categories.map((cat) => {
                const sel = selectedCategory?.id === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    style={[styles.catCard, { borderColor: sel ? cat.color : Colors.border }, sel && styles.catCardActive]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <View style={[styles.catIcon, { backgroundColor: sel ? cat.color : cat.bgColor }]}>
                      <Icon name={cat.icon as any} size={22} color={sel ? "#fff" : cat.color} />
                    </View>
                    <Text style={[styles.catName, sel && { color: cat.color, fontWeight: "800" }]}>{cat.name}</Text>
                    <Text style={styles.catDesc} numberOfLines={2}>{cat.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Where's the job?</Text>
            <Text style={styles.sub}>Search or pick a saved address</Text>

            {savedAddresses.length > 0 && (
              <View style={styles.savedSection}>
                <Text style={styles.savedLabel}>Saved Addresses</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                    {savedAddresses.map((sa) => {
                      const isActive = address === sa.address;
                      return (
                        <Pressable
                          key={sa.id}
                          style={[styles.savedChip, isActive && styles.savedChipActive]}
                          onPress={() => {
                            setAddress(sa.address);
                            setAddressQuery(sa.address);
                            setAddressSuggestions([]);
                            if (sa.latitude && sa.longitude) {
                              setUserLocation({ latitude: sa.latitude, longitude: sa.longitude });
                            }
                          }}
                        >
                          <Icon name="bookmark" size={12} color={isActive ? "#fff" : Colors.primary} />
                          <Text style={[styles.savedChipText, isActive && styles.savedChipTextActive]} numberOfLines={1}>
                            {sa.label || sa.address}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={styles.searchBar}>
              <Icon name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={addressQuery}
                onChangeText={(v) => { setAddressQuery(v); setAddress(v); }}
                placeholder="Search area, street, landmark..."
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
              {searchingAddress && <ActivityIndicator size="small" color={Colors.primary} />}
              {addressQuery.length > 0 && !searchingAddress && (
                <Pressable onPress={() => { setAddressQuery(""); setAddress(""); setAddressSuggestions([]); setUserLocation(null); }}>
                  <Icon name="x" size={15} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>

            {addressSuggestions.length > 0 && (
              <View style={styles.suggestBox}>
                {addressSuggestions.map((s, i) => (
                  <Pressable
                    key={i}
                    style={[styles.suggestRow, i < addressSuggestions.length - 1 && styles.suggestBorder, s.useAsTyped && styles.suggestRowTyped]}
                    onPress={() => {
                      setAddress(s.label);
                      setAddressQuery(s.label);
                      if (s.lat !== 0 || s.lng !== 0) {
                        setUserLocation({ latitude: s.lat, longitude: s.lng });
                      }
                      setAddressSuggestions([]);
                    }}
                  >
                    <Icon name={s.useAsTyped ? "edit-2" : "map-pin"} size={13} color={s.useAsTyped ? Colors.textSecondary : Colors.primary} />
                    <View style={{ flex: 1 }}>
                      {s.useAsTyped && (
                        <Text style={styles.suggestTypedHint}>Use as typed address</Text>
                      )}
                      <Text style={[styles.suggestText, s.useAsTyped && styles.suggestTextTyped]} numberOfLines={2}>{s.label}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable style={styles.detectBtn} onPress={detectCurrentLocation} disabled={loadingAddress}>
              {loadingAddress
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Icon name="navigation" size={15} color={Colors.primary} />}
              <Text style={styles.detectText}>
                {loadingAddress ? (gpsAccuracyText || "Detecting location…") : "Use Current Location"}
              </Text>
            </Pressable>

            {userLocation && (
              <View style={styles.mapCard}>
                <View style={styles.mapCardHeader}>
                  <Icon name="map-pin" size={13} color={Colors.primary} />
                  <Text style={styles.mapCardTitle}>Confirm Job Location</Text>
                  {reversingGeo && <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: "auto" }} />}
                </View>
                <Text style={styles.mapCardHint}>Drag the pin to fine-tune your exact location</Text>
                <View style={styles.mapWrap}>
                  <AthooMapFallback latitude={userLocation.latitude} longitude={userLocation.longitude} draggable onCoordinateChange={(latitude, longitude) => void onPinDragEnd({ nativeEvent: { coordinate: { latitude, longitude } } })} />
                </View>
                <View style={styles.addrPreview}>
                  <Icon name="check-circle" size={13} color={Colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addrLabel}>
                      {reversingGeo ? "Updating address…" : "Detected address"}
                    </Text>
                    <Text style={styles.addrText}>{address}</Text>
                    <Text style={styles.coordsText}>
                      {userLocation.latitude.toFixed(5)}, {userLocation.longitude.toFixed(5)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Manual address details — always shown when a location is set */}
            {(userLocation || address.trim().length > 5) && (
              <View style={styles.manualCard}>
                <View style={styles.manualCardHeader}>
                  <Icon name="edit-3" size={13} color={Colors.secondary} />
                  <Text style={styles.manualCardTitle}>
                    Add House / Street / Landmark
                  </Text>
                  <Text style={styles.optionalTag}> optional</Text>
                </View>
                <Text style={styles.manualCardHint}>
                  e.g. "House 12, Street 3" · "Near Rehan School" · "2nd floor, Azizabad"
                </Text>
                <TextInput
                  style={styles.manualInput}
                  value={manualDetails}
                  onChangeText={setManualDetails}
                  placeholder="House no., street, floor, shop name, landmark…"
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  maxLength={120}
                />
                {addressIsCityOnly && (
                  <View style={styles.cityOnlyWarn}>
                    <Icon name="alert-triangle" size={12} color={Colors.warning} />
                    <Text style={styles.cityOnlyWarnText}>
                      Address looks like only a city name. Adding house/street details helps the provider find you.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {address.trim().length > 0 && !userLocation && (
              <View style={styles.addrPreviewNoMap}>
                <Icon name="alert-circle" size={13} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrLabel}>Address entered (no GPS pin)</Text>
                  <Text style={styles.addrText}>{address}</Text>
                  <Text style={styles.addrHintText}>Tap "Use Current Location" or pick from suggestions to set exact coordinates.</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Describe the work</Text>
            <Text style={styles.sub}>Give providers detail to quote accurately (optional)</Text>
            <View style={styles.textAreaWrap}>
              <TextInput
                style={styles.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder={"E.g. \"Kitchen pipe is leaking under the sink, started 2 days ago...\""}
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.fieldLabel}>Attach a Video (optional · max 30s)</Text>
            <Text style={styles.fieldHint}>A short clip helps providers understand the job better</Text>

            {videoUri ? (
              <View>
                <View style={styles.videoChosen}>
                  <Icon name="video" size={18} color={Colors.success} />
                  <Text style={styles.videoChosenText}>Video attached</Text>
                  <Pressable onPress={() => { setVideoUri(null); setVideoUploadProgress(null); }} style={{ padding: 4 }}>
                    <Icon name="x" size={16} color={Colors.error} />
                  </Pressable>
                </View>
                {videoUploadProgress ? (
                  <View style={styles.uploadProgressWrap}>
                    <View style={styles.uploadProgressTrack}>
                      <View style={[styles.uploadProgressFill, { width: `${videoUploadProgress.percent ?? 8}%` }]} />
                    </View>
                    <Text style={styles.uploadProgressText}>
                      {videoUploadProgress.stage === "preparing" ? "Preparing upload" : videoUploadProgress.stage === "processing" ? "Processing video" : `Uploading video ${videoUploadProgress.percent ?? 0}%`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.videoBtns}>
                <Pressable style={styles.videoBtn} onPress={() => pickVideo(true)}>
                  <Icon name="camera" size={17} color={Colors.primary} />
                  <Text style={styles.videoBtnText}>Record</Text>
                </Pressable>
                <Pressable style={styles.videoBtn} onPress={() => pickVideo(false)}>
                  <Icon name="film" size={17} color={Colors.primary} />
                  <Text style={styles.videoBtnText}>Gallery</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View style={styles.section}>
            <Text style={styles.heading}>When do you need it?</Text>
            <Text style={styles.sub}>Schedule up to 7 days ahead</Text>

            <Text style={styles.fieldLabel}>Select Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {dates.map((d) => (
                  <Pressable
                    key={d.date}
                    onPress={() => setSelectedDate(d.date)}
                    style={[styles.dateCard, selectedDate === d.date && styles.dateCardActive]}
                  >
                    <Text style={[styles.dayLbl, selectedDate === d.date && styles.dateActiveText]}>{d.label}</Text>
                    <Text style={[styles.dateNum, selectedDate === d.date && styles.dateActiveText]}>{d.dayNum}</Text>
                    <Text style={[styles.monthLbl, selectedDate === d.date && styles.dateActiveText]}>{d.monthAbbr}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Select Time</Text>
            <TimePicker value={timeValue} onChange={setTimeValue} />
          </View>
        )}

        {step === 4 && (
          <View style={styles.section}>
            {/* Materials & spare parts notice */}
            <View style={styles.materialsWarning}>
              <View style={styles.materialsWarningHeader}>
                <Icon name="alert-triangle" size={15} color="#92400E" />
                <Text style={styles.materialsWarningTitle}>Important — Materials Not Included</Text>
              </View>
              <Text style={styles.materialsWarningText}>
                The service price covers <Text style={{ fontWeight: "700" }}>labor/service charges only</Text>. Materials, spare parts, gas refilling, consumables, and replacement items are <Text style={{ fontWeight: "700" }}>not included</Text>. Any material arrangements are directly between you and the provider. Athoo is not responsible for material payments, warranties, or disputes.
              </Text>
            </View>

            {/* Hourly rate info card — rate comes from the provider's profile, never a platform/category default */}
            {(() => {
              const providerRateNum = paramProviderRate ? parseInt(paramProviderRate, 10) : 0;
              if (isDirectBooking) {
                if (providerRateNum > 0) {
                  return (
                    <View style={styles.chargesCard}>
                      <Text style={styles.chargesTitle}>Provider Rate</Text>
                      <View style={[styles.chargesRow, { borderBottomWidth: 0 }]}>
                        <View style={[styles.chargesIcon, { backgroundColor: Colors.primary + "18" }]}>
                          <Icon name="clock" size={13} color={Colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.chargesLabel}>Hourly Rate</Text>
                          <Text style={styles.chargesSub}>Rate set by this provider</Text>
                        </View>
                        <Text style={[styles.chargesAmt, { color: Colors.primary }]}>
                          Rs. {providerRateNum.toLocaleString()}/hr
                        </Text>
                      </View>
                      <View style={styles.chargesNote}>
                        <Icon name="info" size={12} color={Colors.textMuted} />
                        <Text style={styles.chargesNoteText}>
                          Hourly rate applies to actual work time only. Your offer below is a per-hour labor/service rate, not the full job price.
                        </Text>
                      </View>
                    </View>
                  );
                }
                return (
                  <View style={styles.chargesCard}>
                    <Text style={styles.chargesTitle}>Provider Rate</Text>
                    <View style={styles.chargesNote}>
                      <Icon name="alert-triangle" size={12} color={Colors.warning} />
                      <Text style={styles.chargesNoteText}>
                        This provider hasn&apos;t set an hourly rate yet. Please contact Athoo support or choose another provider.
                      </Text>
                    </View>
                  </View>
                );
              }
              return (
                <View style={styles.chargesCard}>
                  <Text style={styles.chargesTitle}>Provider Rates</Text>
                  <View style={styles.chargesNote}>
                    <Icon name="info" size={12} color={Colors.textMuted} />
                    <Text style={styles.chargesNoteText}>
                      Each provider sets their own hourly rate. You&apos;ll see every provider&apos;s rate when they respond to your request.
                    </Text>
                  </View>
                </View>
              );
            })()}

            <Text style={styles.heading}>Set your per-hour offer rate</Text>
            <Text style={styles.sub}>Enter the hourly labor/service rate only. Do not enter the full service total here. Final invoice = hourly rate × actual job time + travel charges.</Text>

            <View style={styles.offerWrap}>
              <Text style={styles.rsSign}>Rs.</Text>
              <TextInput
                style={styles.offerInput}
                value={offerHourlyRate}
                onChangeText={(v) => setOfferHourlyRate(v.replace(/[^0-9]/g, ""))}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>

            <View style={styles.quickRow}>
              {Array.from(new Set([getCategorySuggestedHourlyRate(), 500, 1000, 1500, 2000, 3000, 5000].filter(Boolean))).map((p) => (
                <Pressable
                  key={p}
                  style={[styles.quickChip, offerHourlyRate === String(p) && styles.quickChipActive]}
                  onPress={() => setOfferHourlyRate(String(p))}
                >
                  <Text style={[styles.quickText, offerHourlyRate === String(p) && styles.quickTextActive]}>
                    Rs. {p.toLocaleString()}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.quickChip, offerHourlyRate === "" && styles.quickChipActive]}
                onPress={() => setOfferHourlyRate("")}
              >
                <Text style={[styles.quickText, offerHourlyRate === "" && styles.quickTextActive]}>Open Hourly Rate</Text>
              </Pressable>
            </View>

            {/* Travelling Charges */}
            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Travelling Charges / Call-out Fee</Text>
            <Text style={styles.fieldHint}>Default Rs. 500. Provider can accept it or send a different travel counter.</Text>
            <View style={styles.offerWrap}>
              <Text style={styles.rsSign}>Rs.</Text>
              <TextInput
                style={styles.offerInput}
                value={travelCharge}
                onChangeText={(v) => setTravelCharge(v.replace(/[^0-9]/g, ""))}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
            <View style={styles.quickRow}>
              {[0, 100, 150, 200, 300, 500].map((p) => (
                <Pressable
                  key={p}
                  style={[styles.quickChip, travelCharge === String(p) && styles.quickChipActive]}
                  onPress={() => setTravelCharge(String(p))}
                >
                  <Text style={[styles.quickText, travelCharge === String(p) && styles.quickTextActive]}>
                    {p === 0 ? "Free" : `Rs. ${p}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Promo Code */}
            <View style={styles.promoSection}>
              <Text style={styles.fieldLabel}>Promo Code <Text style={styles.optionalTag}>(optional)</Text></Text>
              <View style={styles.promoRow}>
                <TextInput
                  style={[styles.promoInput, appliedPromo ? styles.promoInputApplied : null]}
                  value={promoCode}
                  onChangeText={(v) => {
                    setPromoCode(v.toUpperCase());
                    setPromoError("");
                    setAppliedPromo(null);
                  }}
                  placeholder="Enter promo code"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  onSubmitEditing={validatePromo}
                  editable={!appliedPromo}
                />
                {appliedPromo ? (
                  <Pressable
                    style={styles.promoRemoveBtn}
                    onPress={() => { setAppliedPromo(null); setPromoCode(""); setPromoError(""); }}
                  >
                    <Icon name="x" size={16} color={Colors.error} />
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.promoBtn, (!promoCode.trim() || promoValidating) && styles.btnDisabled]}
                    onPress={validatePromo}
                    disabled={!promoCode.trim() || promoValidating}
                  >
                    {promoValidating
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.promoBtnText}>Apply</Text>
                    }
                  </Pressable>
                )}
              </View>
              {appliedPromo && (
                <View style={styles.promoSuccess}>
                  <Icon name="check-circle" size={15} color={Colors.success} />
                  <Text style={styles.promoSuccessText}>
                    {appliedPromo.discountType === "fixed"
                      ? `Rs. ${appliedPromo.discountValue.toLocaleString()} discount applied!`
                      : `${appliedPromo.discountValue}% discount applied!`}
                    {appliedPromo.description ? `  · ${appliedPromo.description}` : ""}
                  </Text>
                </View>
              )}
              {promoError ? (
                <View style={styles.promoErrorRow}>
                  <Icon name="alert-circle" size={13} color={Colors.error} />
                  <Text style={styles.promoErrorText}>{promoError}</Text>
                </View>
              ) : null}
            </View>

            <BookingPriceSummary
              hourlyRate={offerHourlyRate ? Number(offerHourlyRate) : 0}
              travelCharge={Number(travelCharge || 0)}
              discount={appliedPromo
                ? appliedPromo.discountType === "fixed"
                  ? appliedPromo.discountValue
                  : Math.round(((Number(offerHourlyRate || 0) + Number(travelCharge || 0)) * appliedPromo.discountValue) / 100)
                : 0}
              openOffer={!offerHourlyRate}
              title={isDirectBooking ? "Estimated booking total" : "Your broadcast offer"}
              testID="customer-booking-price-summary"
            />

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Booking Summary</Text>
              {[
                { icon: "tool", label: "Service", val: selectedCategory?.name ?? "" },
                { icon: "map-pin", label: "Address", val: address },
                { icon: "calendar", label: "When", val: `${selectedDate} · ${selectedTime}` },
                {
                  icon: "dollar-sign",
                  label: "Offer",
                  val: offerHourlyRate ? `Rs. ${parseInt(offerHourlyRate).toLocaleString()}` : "Open (let providers quote)",
                  highlight: !!offerHourlyRate,
                },
              ].map((row) => (
                <View key={row.label} style={styles.summaryRow}>
                  <Icon name={row.icon as any} size={13} color={Colors.primary} />
                  <Text style={styles.summaryLbl}>{row.label}</Text>
                  <Text style={[styles.summaryVal, row.highlight && { color: Colors.secondary, fontWeight: "800" }]} numberOfLines={2}>
                    {row.val}
                  </Text>
                </View>
              ))}
              {description.trim() && (
                <View style={styles.summaryRow}>
                  <Icon name="file-text" size={13} color={Colors.primary} />
                  <Text style={styles.summaryLbl}>Details</Text>
                  <Text style={styles.summaryVal} numberOfLines={2}>{description}</Text>
                </View>
              )}
              {videoUri && (
                <View style={styles.summaryRow}>
                  <Icon name="video" size={13} color={Colors.success} />
                  <Text style={styles.summaryLbl}>Video</Text>
                  <Text style={[styles.summaryVal, { color: Colors.success }]}>Attached</Text>
                </View>
              )}
              {appliedPromo && (
                <View style={styles.summaryRow}>
                  <Icon name="tag" size={13} color={Colors.success} />
                  <Text style={styles.summaryLbl}>Promo</Text>
                  <Text style={[styles.summaryVal, { color: Colors.success, fontWeight: "800" }]}>
                    {appliedPromo.code} ·{" "}
                    {appliedPromo.discountType === "fixed"
                      ? `Rs. ${appliedPromo.discountValue.toLocaleString()} off`
                      : `${appliedPromo.discountValue}% off`}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.noteBox}>
              <Icon name="info" size={13} color={Colors.primary} />
              <Text style={styles.noteText}>
                Your request will be broadcast to all nearby {selectedCategory?.name}s. You'll receive responses within minutes and pick your preferred provider — just like InDrive.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
        {step < STEPS.length - 1 ? (
          <Pressable
            style={[styles.primaryBtn, !canProceed() && styles.btnDisabled]}
            onPress={() => canProceed() && setStep(step + 1)}
            disabled={!canProceed()}
          >
            <Text style={styles.btnText}>Continue</Text>
            <Icon name="arrow-right" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.broadcastBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.btnText}>{uploadingVideo ? `Uploading video ${videoUploadProgress?.percent ?? 0}%` : isDirectBooking ? "Booking..." : "Broadcasting..."}</Text>
              </>
            ) : (
              <>
                <Icon name="send" size={18} color="#fff" />
                <Text style={styles.btnText}>Broadcast Request</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {showMaterialsDisclaimer ? (
        <View style={liveConsentStyles.backdrop}>
          <View style={[liveConsentStyles.card, { maxHeight: "85%" }]}>
            <View style={[liveConsentStyles.iconBox, { backgroundColor: "#D97706" }]}>
              <Icon name="alert-triangle" size={22} color="#fff" />
            </View>
            <Text style={liveConsentStyles.title}>Important Notice</Text>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              <Text style={[liveConsentStyles.body, { marginBottom: 8 }]}>
                The service price displayed on Athoo covers <Text style={{ fontWeight: "700" }}>service/labor charges only</Text>.
              </Text>
              <Text style={[liveConsentStyles.body, { marginBottom: 8 }]}>
                Materials, spare parts, replacement components, accessories, consumables, gas refilling, wiring, plumbing parts, paint, hardware, and other items are <Text style={{ fontWeight: "700" }}>not included</Text> in the service price unless explicitly stated.
              </Text>
              <Text style={[liveConsentStyles.body, { marginBottom: 8 }]}>
                If additional materials are required, the customer and provider may discuss and arrange them <Text style={{ fontWeight: "700" }}>directly</Text>.
              </Text>
              <Text style={liveConsentStyles.body}>
                Any agreement, purchase, warranty, quality, quantity, pricing, payment, refund, replacement, or dispute relating to materials is <Text style={{ fontWeight: "700" }}>solely between the customer and the provider</Text>. Athoo is not responsible for any material-related transactions or disputes.
              </Text>
            </ScrollView>
            <Pressable
              style={[
                styles.materialsCheckRow,
                materialsAccepted && styles.materialsCheckRowActive,
              ]}
              onPress={() => setMaterialsAccepted(!materialsAccepted)}
            >
              <View style={[styles.materialsCheckbox, materialsAccepted && styles.materialsCheckboxChecked]}>
                {materialsAccepted && <Icon name="check" size={12} color="#fff" />}
              </View>
              <Text style={styles.materialsCheckLabel}>I Understand and Agree</Text>
            </Pressable>
            <View style={liveConsentStyles.row}>
              <Pressable onPress={declineMaterialsDisclaimer} style={[liveConsentStyles.btn, liveConsentStyles.btnGhost]}>
                <Text style={liveConsentStyles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={materialsAccepted ? acceptMaterialsDisclaimer : undefined}
                style={[liveConsentStyles.btn, liveConsentStyles.btnPrimary, !materialsAccepted && styles.btnDisabled]}
              >
                <Text style={liveConsentStyles.btnPrimaryText}>Proceed</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {showLiveConsent ? (
        <View style={liveConsentStyles.backdrop}>
          <View style={liveConsentStyles.card}>
            <View style={liveConsentStyles.iconBox}>
              <Icon name="map-pin" size={22} color="#fff" />
            </View>
            <Text style={liveConsentStyles.title}>Share live location with the provider?</Text>
            <Text style={liveConsentStyles.body}>
              While your booking is active, ATHOO shares your live location with the assigned provider so they can find you and so you can both see each other on the map. Sharing stops automatically when the job ends or is cancelled.
            </Text>
            <Text style={liveConsentStyles.body}>
              We only ask this once. You can revoke location access at any time from your device Settings.
            </Text>
            <View style={liveConsentStyles.row}>
              <Pressable onPress={declineLiveConsent} style={[liveConsentStyles.btn, liveConsentStyles.btnGhost]}>
                <Text style={liveConsentStyles.btnGhostText}>Not now</Text>
              </Pressable>
              <Pressable onPress={acceptLiveConsent} style={[liveConsentStyles.btn, liveConsentStyles.btnPrimary]}>
                <Text style={liveConsentStyles.btnPrimaryText}>Allow & continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const liveConsentStyles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: 20, justifyContent: "center", zIndex: 200 },
  card: { backgroundColor: Colors.white, borderRadius: 20, padding: 22, gap: 12 },
  iconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "800", color: Colors.text },
  body: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  row: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  btnGhostText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 13 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  repeatNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30" },
  repeatNoticeText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "600" },

  successWrap: { alignItems: "center", justifyContent: "center", padding: 32 },
  uploadProgressWrap: { width: "100%", gap: 8, marginTop: 12 },
  uploadProgressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: "hidden" },
  uploadProgressFill: { height: "100%", borderRadius: 4, backgroundColor: Colors.primary },
  uploadProgressText: { fontSize: 12, color: Colors.textSecondary, textAlign: "center", fontWeight: "600" },
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.success, alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.text, textAlign: "center" },
  successSub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 8 },
  viewResponsesBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24,
    marginTop: 24, width: "100%",
  },
  homeBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8, width: "100%" },
  homeBtnText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },

  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  dots: { flexDirection: "row", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 20 },
  dotDone: { backgroundColor: Colors.primary + "60" },

  section: { padding: 20, gap: 14 },
  heading: { fontSize: 22, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 13, color: Colors.textSecondary, marginTop: -8 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  catCard: {
    width: "47%", backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: Colors.border, gap: 8, alignItems: "flex-start",
  },
  catCardActive: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10,
    shadowRadius: 12, elevation: 5,
  },
  catIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  catName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  catDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1.5,
    borderColor: Colors.primary + "50", paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  suggestBox: {
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    overflow: "hidden", marginTop: -4,
  },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  suggestRowTyped: { backgroundColor: "#f8f8f8" },
  suggestBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  suggestText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },
  suggestTextTyped: { color: Colors.textSecondary, fontStyle: "italic" },
  suggestTypedHint: { fontSize: 10, color: Colors.textSecondary, marginBottom: 1, textTransform: "uppercase", letterSpacing: 0.4 },

  detectBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start",
    backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  detectText: { fontSize: 13, fontWeight: "700", color: Colors.primary },

  savedSection: { marginBottom: 12 },
  savedLabel: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  savedChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 200,
  },
  savedChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  savedChipText: { fontSize: 12, fontWeight: "600", color: Colors.primary },
  savedChipTextActive: { color: "#fff" },

  mapCard: {
    borderRadius: 16, borderWidth: 1.5, borderColor: Colors.primary + "35",
    backgroundColor: Colors.white, overflow: "hidden",
  },
  mapCardHeader: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2,
  },
  mapCardTitle: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  mapCardHint: {
    fontSize: 11, color: Colors.textMuted, paddingHorizontal: 14, paddingBottom: 8,
  },
  mapWrap: { height: 200, marginHorizontal: 0 },
  map: { flex: 1 },

  addrPreview: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.success + "10", padding: 12,
    borderTopWidth: 1, borderTopColor: Colors.success + "30",
  },
  addrPreviewNoMap: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.warning + "10", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.warning + "30",
  },
  addrLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  addrText: { fontSize: 13, color: Colors.text, lineHeight: 18, marginTop: 2 },
  coordsText: { fontSize: 11, color: Colors.textMuted, marginTop: 3, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  addrHintText: { fontSize: 11, color: Colors.warning, marginTop: 4, lineHeight: 15 },
  gpsPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.primary + "15", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
  },
  gpsPillText: { fontSize: 10, fontWeight: "700", color: Colors.primary },

  manualCard: {
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.secondary + "40",
    backgroundColor: Colors.white, padding: 14, gap: 8,
  },
  manualCardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  manualCardTitle: { fontSize: 13, fontWeight: "700", color: Colors.secondary },
  manualCardHint: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: -4 },
  manualInput: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 13, color: Colors.text,
  },
  cityOnlyWarn: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: Colors.warning + "12", borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: Colors.warning + "40",
  },
  cityOnlyWarnText: { flex: 1, fontSize: 11, color: Colors.warning, lineHeight: 16, fontWeight: "600" },

  textAreaWrap: {
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, padding: 14,
  },
  textArea: { fontSize: 14, color: Colors.text, minHeight: 120, textAlignVertical: "top", lineHeight: 22 },

  fieldLabel: { fontSize: 15, fontWeight: "700", color: Colors.text },
  fieldHint: { fontSize: 12, color: Colors.textMuted, marginTop: -8 },

  videoChosen: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.success + "12",
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.success + "30",
  },
  videoChosenText: { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.success },
  videoBtns: { flexDirection: "row", gap: 12 },
  videoBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingVertical: 14,
  },
  videoBtnText: { fontSize: 13, fontWeight: "600", color: Colors.primary },

  dateCard: {
    width: 70, alignItems: "center", padding: 12, borderRadius: 14,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border,
  },
  dateCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayLbl: { fontSize: 10, fontWeight: "600", color: Colors.textSecondary, textTransform: "uppercase" },
  dateNum: { fontSize: 22, fontWeight: "800", color: Colors.text, marginTop: 2 },
  monthLbl: { fontSize: 10, color: Colors.textMuted },
  dateActiveText: { color: "#fff" },

  chargesCard: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1.5,
    borderColor: Colors.border, overflow: "hidden",
  },
  chargesTitle: {
    fontSize: 11, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase",
    letterSpacing: 0.8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  chargesRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  chargesIcon: {
    width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  chargesLabel: { fontSize: 13, fontWeight: "700", color: Colors.text },
  chargesSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  chargesAmt: { fontSize: 15, fontWeight: "900" },
  chargesNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.surface, paddingHorizontal: 14, paddingVertical: 10,
  },
  chargesNoteText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 16 },

  offerWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.white,
    borderRadius: 16, borderWidth: 2, borderColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 4, gap: 8,
  },
  rsSign: { fontSize: 20, fontWeight: "800", color: Colors.primary },
  offerInput: { flex: 1, fontSize: 28, fontWeight: "800", color: Colors.text, paddingVertical: 12 },

  promoSection: { gap: 8 },
  optionalTag: { fontSize: 12, fontWeight: "400", color: Colors.textMuted },
  promoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  promoInput: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: "700", color: Colors.text, letterSpacing: 1,
  },
  promoInputApplied: { borderColor: Colors.success, backgroundColor: Colors.success + "08" },
  promoBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13,
  },
  promoBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  promoRemoveBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.error + "12",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.error + "30",
  },
  promoSuccess: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.success + "12",
    borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.success + "30",
  },
  promoSuccessText: { flex: 1, fontSize: 12, color: Colors.success, fontWeight: "700", lineHeight: 16 },
  promoErrorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  promoErrorText: { fontSize: 12, color: Colors.error, fontWeight: "600" },

  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
  },
  quickChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickText: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  quickTextActive: { color: "#fff" },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: Colors.text, marginBottom: 12 },
  summaryRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  summaryLbl: { width: 56, fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  summaryVal: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.text },

  noteBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.primary + "10",
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.primary + "25",
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 18, fontWeight: "600" },

  materialsWarning: { padding: 14, backgroundColor: "#FEF3C7", borderRadius: 12, borderWidth: 1, borderColor: "#F59E0B", gap: 8 },
  materialsWarningHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 7 },
  materialsWarningTitle: { fontSize: 13.5, fontWeight: "800" as const, color: "#92400E", flex: 1 },
  materialsWarningText: { fontSize: 12.5, color: "#78350F", lineHeight: 18 },
  materialsCheckRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  materialsCheckRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" },
  materialsCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: "center" as const, justifyContent: "center" as const },
  materialsCheckboxChecked: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  materialsCheckLabel: { flex: 1, fontSize: 13.5, fontWeight: "700" as const, color: Colors.text },

  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: Colors.white,
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16,
  },
  broadcastBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.secondary, borderRadius: 16, paddingVertical: 16,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
