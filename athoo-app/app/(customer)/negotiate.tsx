import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PrivateImage } from "@/services/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { SuccessModal } from "@/components/ui/SuccessModal";
import { useAuth } from "@/context/AuthContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { useToast } from "@/context/ToastContext";
import { Provider } from "@/data/services";
import { api } from "@/services/api";
import { pickFromGallery } from "@/utils/mediaPicker";
import { uploadPickedImage } from "@/services/storage";
import { reverseGeocode } from "@/services/maps";
import { getFastForegroundLocation } from "@/services/location";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate the next `count` calendar days starting from today (local time). */
function getUpcomingDates(count = 30) {
  const days: { label: string; dayName: string; value: string }[] = [];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push({
      value: `${y}-${m}-${dd}`,
      dayName: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_NAMES[d.getDay()],
      label: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
    });
  }
  return days;
}

/** 30-minute time slots from 7 AM to 10 PM. */
function getTimeSlots() {
  const slots: string[] = [];
  for (let h = 7; h <= 22; h++) {
    const period = h < 12 ? "AM" : "PM";
    const displayH = h <= 12 ? h : h - 12;
    slots.push(`${displayH}:00 ${period}`);
    if (h < 22) slots.push(`${displayH}:30 ${period}`);
  }
  return slots;
}

const SUGGESTED_PRICES = [500, 800, 1000, 1500, 2000, 2500];

function getStatusInfo(theme: AthooTheme, status?: string) {
  if (status === "customer_offer") {
    return {
      label: "Offer Sent",
      color: theme.colors.warning,
      bg: theme.colors.warningSoft,
    };
  }
  if (status === "provider_counter") {
    return {
      label: "Counter Offer",
      color: theme.colors.primary,
      bg: theme.colors.infoSoft,
    };
  }
  if (status === "accepted") {
    return {
      label: "Accepted",
      color: theme.colors.success,
      bg: theme.colors.successSoft,
    };
  }
  if (status === "rejected") {
    return {
      label: "Rejected",
      color: theme.colors.danger,
      bg: theme.colors.dangerSoft,
    };
  }

  return {
    label: "Negotiation",
    color: theme.colors.textSecondary,
    bg: theme.colors.surfaceAlt,
  };
}

export default function NegotiateScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    providerId,
    service,
    negId,
    providerRate,
  } = useLocalSearchParams<{
    providerId?: string;
    service?: string;
    negId?: string;
    providerRate?: string;
  }>();

  const { user } = useAuth();
  const { createNegotiation, getMyNegotiations, acceptOffer, rejectOffer, counterOffer } = useNegotiation();
  const { showError } = useToast();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const isCreateMode = !!providerId;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(isCreateMode);
  const [offerPrice, setOfferPrice] = useState(providerRate ? String(providerRate) : "");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedCounter, setSelectedCounter] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // 3-step wizard state (for create mode)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [address, setAddress] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const UPCOMING_DATES = useMemo(() => getUpcomingDates(30), []);
  const TIME_SLOTS = useMemo(() => getTimeSlots(), []);

  const handleUseCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const result = await getFastForegroundLocation({
        timeoutMs: 8_000,
        rationaleTitle: "Location permission",
        rationaleBody: "Athoo uses your location to fill the service address for this negotiation.",
      });
      if (!result.location) return;
      const resolved = await reverseGeocode(result.location.latitude, result.location.longitude);
      setAddress(resolved || `${result.location.latitude.toFixed(5)}, ${result.location.longitude.toFixed(5)}`);
    } catch {
      showError("Location Error", "Could not get your current location. Please type your address.");
    } finally {
      setIsGettingLocation(false);
    }
  };

  const myNegotiations = user ? getMyNegotiations(user.id) : [];

  const selectedNegotiation = useMemo(() => {
    if (!negId) return null;
    return myNegotiations.find((n) => n.id === negId) || null;
  }, [myNegotiations, negId]);

  useEffect(() => {
    if (!isCreateMode || !providerId) {
      setLoadingProvider(false);
      return;
    }

    setLoadingProvider(true);

    api
      .getProvider(providerId)
      .then((res) => {
        const p = res.provider as Provider;
        setProvider(p);
        const rate = (p as any)?.ratePerHour ?? providerRate;
        if (rate && !offerPrice.trim()) setOfferPrice(String(rate));
      })
      .catch(() => setProvider(null))
      .finally(() => setLoadingProvider(false));
  }, [isCreateMode, providerId]);

  const handleNextStep = () => {
    if (step === 1) {
      if (!address.trim()) {
        showError("Location Required", "Please enter your service address.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!scheduledDate.trim()) {
        showError("Date Required", "Please enter a date (YYYY-MM-DD).");
        return;
      }
      if (!scheduledTime.trim()) {
        showError("Time Required", "Please enter a time (e.g. 10:00 AM).");
        return;
      }
      setStep(3);
    }
  };


  const pickNegotiationMedia = async () => {
    const asset = await pickFromGallery({ mediaTypes: ["images", "videos"] as any, allowsEditing: false, quality: 0.8 });
    if (asset) setMediaAssets((prev) => [...prev, asset].slice(0, 3));
  };

  const handleSubmit = async () => {
    const price = parseInt(offerPrice, 10);

    if (!price || price < 100) {
      showError("Invalid Price", "Enter a valid offer (min Rs. 100)");
      return;
    }

    if (!user || !provider) return;

    setLoading(true);

    try {
      setUploadingMedia(true);
      const mediaUrls: string[] = [];
      for (const asset of mediaAssets) {
        const isVideo = asset.type === "video";
        const ext = isVideo ? "mp4" : "jpg";
        const mime = isVideo ? "video/mp4" : "image/jpeg";
        const url = await uploadPickedImage(asset.uri, `negotiation-${Date.now()}.${ext}`, mime);
        mediaUrls.push(url);
      }
      setUploadingMedia(false);

      await createNegotiation({
        providerId: provider.id,
        providerName: provider.name,
        service: service || provider.services?.[0] || "General Service",
        customerOffer: price,
        address: address.trim(),
        scheduledDate: scheduledDate.trim(),
        scheduledTime: scheduledTime.trim(),
        mediaUrls,
      });

      setShowModal(true);
    } catch (error: any) {
      const raw = String((error as any)?.message || "");
      if (raw.includes('"negotiation"') && raw.includes('active negotiation')) {
        const found = myNegotiations.find((n) =>
          n.providerId === provider.id &&
          n.service === (service || provider.services?.[0] || "General Service") &&
          ["customer_offer", "provider_counter"].includes(n.status)
        );
        if (found) {
          router.replace({ pathname: "/(customer)/negotiate", params: { negId: found.id } });
          return;
        }
      }
      showError("Failed", "Could not send offer. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptSelected = async () => {
    if (!selectedNegotiation) return;
    setActionLoading(true);
    try {
      const finalPrice = selectedNegotiation.providerCounter ?? selectedNegotiation.customerOffer;
      await acceptOffer(selectedNegotiation.id, finalPrice);
    } catch {
      showError("Failed", "Could not accept this offer.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSelected = async () => {
    if (!selectedNegotiation) return;
    setActionLoading(true);
    try {
      await rejectOffer(selectedNegotiation.id);
    } catch {
      showError("Failed", "Could not reject this offer.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCounterSelected = async () => {
    if (!selectedNegotiation || !user) return;
    const amount = parseInt(selectedCounter, 10);
    if (!amount || amount < 100) {
      showError("Invalid Price", "Enter a valid counter offer (min Rs. 100)");
      return;
    }
    setActionLoading(true);
    try {
      await counterOffer(
        selectedNegotiation.id,
        amount,
        `My revised offer is Rs. ${amount}`,
        user.name || "Customer"
      );
      setSelectedCounter("");
    } catch {
      showError("Failed", "Could not send counter offer.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loadingProvider) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (isCreateMode && !provider) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.notFound}>
          <Icon name="alert-circle" size={40} color={theme.colors.danger} />
          <Text style={styles.notFoundText}>Provider not found</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isCreateMode) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.headerGrad}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={theme.colors.onBrand} />
          </Pressable>
          <Text style={styles.headerTitle}>My Negotiations</Text>
          <Text style={styles.headerSubtitle}>Track price offers and counters</Text>
        </LinearGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
        >
          {selectedNegotiation ? (
            <AnimatedCard delay={50}>
              <View style={styles.selectedCard}>
                <View style={styles.selectedHeader}>
                  <View style={styles.selectedIcon}>
                    <Icon name="dollar-sign" size={18} color={theme.colors.secondary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedService}>{selectedNegotiation.service}</Text>
                    <Text style={styles.selectedProvider}>
                      Provider: {selectedNegotiation.providerName}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusInfo(theme, selectedNegotiation.status).bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: getStatusInfo(theme, selectedNegotiation.status).color },
                      ]}
                    >
                      {getStatusInfo(theme, selectedNegotiation.status).label}
                    </Text>
                  </View>
                </View>

                <View style={styles.amountsRow}>
                  <View style={styles.amountBox}>
                    <Text style={styles.amountLabel}>Your Offer</Text>
                    <Text style={[styles.amountValue, { color: theme.colors.primary }]}>
                      Rs. {selectedNegotiation.customerOffer}
                    </Text>
                  </View>

                  {selectedNegotiation.providerCounter !== undefined ? (
                    <View style={styles.amountBox}>
                      <Text style={styles.amountLabel}>Provider Counter</Text>
                      <Text style={[styles.amountValue, { color: theme.colors.secondary }] }>
                        Rs. {selectedNegotiation.providerCounter}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {selectedNegotiation.status === "provider_counter" ? (
                  <View style={styles.selectedActionsWrap}>
                    <View style={styles.counterInputRow}>
                      <TextInput
                        style={styles.counterInputInline}
                        placeholder="Send new counter offer"
                        value={selectedCounter}
                        onChangeText={(v) => setSelectedCounter(v.replace(/[^0-9]/g, ""))}
                        keyboardType="numeric"
                        placeholderTextColor={theme.colors.textMuted}
                      />
                      <Pressable style={styles.inlineBtn} onPress={handleCounterSelected} disabled={actionLoading}>
                        <Text style={styles.inlineBtnText}>Counter</Text>
                      </Pressable>
                    </View>
                    <View style={styles.selectedActionRow}>
                      <Pressable style={[styles.selectedAcceptBtn, actionLoading && styles.disabledBtn]} onPress={handleAcceptSelected} disabled={actionLoading}>
                        <Text style={styles.selectedAcceptText}>Accept</Text>
                      </Pressable>
                      <Pressable style={[styles.selectedRejectBtn, actionLoading && styles.disabledBtn]} onPress={handleRejectSelected} disabled={actionLoading}>
                        <Text style={styles.selectedRejectText}>Reject</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {selectedNegotiation.status === "accepted" ? (
                  <Pressable
                    style={styles.continueBookingBtn}
                    onPress={() => {
                      if (selectedNegotiation.bookingId) {
                        router.push({
                          pathname: "/(customer)/booking-detail",
                          params: { bookingId: selectedNegotiation.bookingId },
                        });
                      } else {
                        router.replace("/(customer)/(tabs)/bookings");
                      }
                    }}
                  >
                    <Text style={styles.continueBookingText}>View Booking</Text>
                  </Pressable>
                ) : null}
              </View>
            </AnimatedCard>
          ) : null}

          {myNegotiations.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Icon name="dollar-sign" size={42} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No Negotiations Yet</Text>
              <Text style={styles.emptySubtitle}>
                When you send price offers to providers, they will appear here.
              </Text>
            </View>
          ) : (
            myNegotiations.map((neg, index) => {
              const statusInfo = getStatusInfo(theme, neg.status);
              const isSelected = neg.id === negId;

              return (
                <AnimatedCard key={`${neg.id}-${index}`} delay={80 + index * 40}>
                  <Pressable
                    style={[
                      styles.listCard,
                      isSelected && styles.listCardSelected,
                    ]}
                    onPress={() =>
                      router.replace({
                        pathname: "/(customer)/negotiate",
                        params: { negId: neg.id },
                      })
                    }
                  >
                    <View style={styles.listHeader}>
                      <View style={styles.listIcon}>
                        <Icon name="dollar-sign" size={16} color={theme.colors.secondary} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.listService}>{neg.service}</Text>
                        <Text style={styles.listProvider}>{neg.providerName}</Text>
                      </View>

                      <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                          {statusInfo.label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.listAmounts}>
                      <Text style={styles.listAmountText}>
                        Your Offer:{" "}
                        <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
                          Rs. {neg.customerOffer}
                        </Text>
                      </Text>

                      {neg.providerCounter !== undefined ? (
                        <Text style={styles.listAmountText}>
                          Counter:{" "}
                          <Text style={{ color: theme.colors.secondary, fontWeight: "800" }}>
                            Rs. {neg.providerCounter}
                          </Text>
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </AnimatedCard>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  const initials = provider!.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

  const serviceLabel = service || provider!.services?.[0] || "General Service";

  const STEPS = ["Location", "Date & Time", "Offer"];

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.headerGrad}>
        <Pressable style={styles.backBtn} onPress={step > 1 ? () => setStep((s) => (s - 1) as 1 | 2 | 3) : () => router.back()}>
          <Icon name="arrow-left" size={20} color={theme.colors.onBrand} />
        </Pressable>
        <Text style={styles.headerTitle}>Make an Offer</Text>
        <Text style={styles.headerSubtitle}>Negotiate with {provider!.name}</Text>

        <View style={styles.providerBadge}>
          {provider!.profileImage ? (
            <PrivateImage objectPath={provider!.profileImage} style={styles.providerBadgeAvatar} />
          ) : (
            <View style={[styles.providerBadgeAvatar, { backgroundColor: (provider!.profileColor || theme.colors.primary) + "30" }]}>
              <Text style={styles.providerBadgeInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.providerBadgeName}>{provider!.name}</Text>
          <Text style={styles.providerBadgeService}>{serviceLabel}</Text>
        </View>
      </LinearGradient>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        {STEPS.map((label, i) => (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, step > i + 1 && styles.stepDotDone, step === i + 1 && styles.stepDotActive]}>
              {step > i + 1
                ? <Icon name="check" size={10} color={theme.colors.onBrand} />
                : <Text style={styles.stepDotNum}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, step === i + 1 && styles.stepLabelActive]}>{label}</Text>
            {i < STEPS.length - 1 && <View style={[styles.stepLine, step > i + 1 && styles.stepLineDone]} />}
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* STEP 1: Location */}
        {step === 1 && (
          <AnimatedCard delay={60}>
            <View style={styles.section}>
              <View style={styles.stepHeaderRow}>
                <Icon name="map-pin" size={20} color={theme.colors.primary} />
                <Text style={styles.sectionTitle}>Where is the service needed?</Text>
              </View>
              <Text style={styles.stepHint}>Use your GPS location or type your address.</Text>

              {/* GPS button */}
              <Pressable
                style={[styles.gpsBtn, isGettingLocation && { opacity: 0.7 }]}
                onPress={handleUseCurrentLocation}
                disabled={isGettingLocation}
              >
                {isGettingLocation ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon name="navigation" size={16} color={theme.colors.primary} />
                )}
                <Text style={styles.gpsBtnText}>
                  {isGettingLocation ? "Getting location…" : "Use My Current Location"}
                </Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or type manually</Text>
                <View style={styles.dividerLine} />
              </View>

              <TextInput
                style={styles.addressInput}
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. House 12, Street 4, F-7/2, Islamabad"
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <Pressable style={[styles.nextBtn, !address.trim() && styles.submitBtnDisabled]} onPress={handleNextStep} disabled={!address.trim()}>
                <Text style={styles.nextBtnText}>Next: Date & Time</Text>
                <Icon name="arrow-right" size={16} color={theme.colors.onBrand} />
              </Pressable>
            </View>
          </AnimatedCard>
        )}

        {/* STEP 2: Date & Time */}
        {step === 2 && (
          <AnimatedCard delay={60}>
            <View style={styles.section}>
              <View style={styles.stepHeaderRow}>
                <Icon name="calendar" size={20} color={theme.colors.primary} />
                <Text style={styles.sectionTitle}>When do you need the service?</Text>
              </View>
              <Text style={styles.stepHint}>Tap a date and time slot below.</Text>

              {/* Date chip picker */}
              <Text style={styles.fieldLabel}>Select Date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll} contentContainerStyle={styles.dateScrollContent}>
                {UPCOMING_DATES.map((d) => {
                  const isSelected = scheduledDate === d.value;
                  return (
                    <Pressable
                      key={d.value}
                      style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                      onPress={() => setScheduledDate(d.value)}
                    >
                      <Text style={[styles.dateChipDay, isSelected && styles.dateChipTextSelected]}>{d.dayName}</Text>
                      <Text style={[styles.dateChipNum, isSelected && styles.dateChipTextSelected]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Time slot grid */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Select Time</Text>
              <View style={styles.timeGrid}>
                {TIME_SLOTS.map((slot) => {
                  const isSelected = scheduledTime === slot;
                  return (
                    <Pressable
                      key={slot}
                      style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                      onPress={() => setScheduledTime(slot)}
                    >
                      <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>{slot}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.nextBtn, (!scheduledDate || !scheduledTime) && styles.submitBtnDisabled]}
                onPress={handleNextStep}
                disabled={!scheduledDate || !scheduledTime}
              >
                <Text style={styles.nextBtnText}>
                  {scheduledDate && scheduledTime ? `Next – ${scheduledDate} at ${scheduledTime}` : "Next: Offer Amount"}
                </Text>
                <Icon name="arrow-right" size={16} color={theme.colors.onBrand} />
              </Pressable>
            </View>
          </AnimatedCard>
        )}

        {/* STEP 3: Offer Amount */}
        {step === 3 && (
          <>
            <AnimatedCard delay={60}>
              <View style={styles.section}>
                <View style={styles.stepHeaderRow}>
                  <Icon name="dollar-sign" size={20} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>Your Offer</Text>
                </View>
                {/* Summary of previous steps */}
                <View style={styles.summaryBox}>
                  <View style={styles.summaryRow}>
                    <Icon name="map-pin" size={13} color={theme.colors.textSecondary} />
                    <Text style={styles.summaryText} numberOfLines={2}>{address}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Icon name="calendar" size={13} color={theme.colors.textSecondary} />
                    <Text style={styles.summaryText}>{scheduledDate} at {scheduledTime}</Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Quick Suggestions</Text>
                <View style={styles.suggestionsGrid}>
                  {SUGGESTED_PRICES.map((p) => (
                    <Pressable
                      key={p}
                      style={[styles.suggestionChip, offerPrice === String(p) && styles.suggestionChipActive]}
                      onPress={() => setOfferPrice(String(p))}
                    >
                      <Text style={[styles.suggestionText, offerPrice === String(p) && styles.suggestionTextActive]}>
                        Rs. {p.toLocaleString()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Enter Amount</Text>
                <View style={styles.priceInputWrapper}>
                  <Text style={styles.pricePrefix}>Rs.</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={offerPrice}
                    onChangeText={(v) => setOfferPrice(v.replace(/[^0-9]/g, ""))}
                    placeholder="Enter amount"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </AnimatedCard>

            <AnimatedCard delay={120}>
              <View style={styles.tipsSection}>
                <Icon name="trending-up" size={14} color={theme.colors.success} />
                <Text style={styles.tipText}>
                  A fair offer gets accepted faster. Providers value respectful negotiations.
                </Text>
              </View>
            </AnimatedCard>

            <Pressable style={styles.mediaBtn} onPress={pickNegotiationMedia} disabled={loading}>
              <Icon name="file-text" size={16} color={theme.colors.primary} />
              <Text style={styles.mediaBtnText}>{mediaAssets.length ? `${mediaAssets.length} attachment(s) selected` : "Add photo/video for provider"}</Text>
            </Pressable>

            <Pressable
              style={[styles.submitBtn, (!offerPrice || loading) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!offerPrice || loading}
            >
              <LinearGradient
                colors={[theme.colors.secondary, theme.colors.secondaryPressed]}
                style={styles.submitGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.onBrand} />
                ) : (
                  <>
                    <Icon name="send" size={18} color={theme.colors.onBrand} />
                    <Text style={styles.submitText}>
                      Send Offer – Rs.{" "}
                      {offerPrice ? parseInt(offerPrice, 10).toLocaleString() : "0"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </>
        )}
      </ScrollView>

      <SuccessModal
        visible={showModal}
        title="Offer Sent!"
        subtitle={`Your offer of Rs. ${parseInt(offerPrice || "0", 10).toLocaleString()} was sent to ${provider!.name}. You'll be notified when they respond.`}
        primaryAction={{
          label: "Done",
          onPress: () => {
            setShowModal(false);
            router.replace("/(customer)/negotiate");
          },
        }}
        onClose={() => {
          setShowModal(false);
          router.replace("/(customer)/negotiate");
        }}
      />
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  notFoundText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: "600",
  },

  backLink: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "700",
  },

  headerGrad: {
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 20,
    gap: 4,
    alignItems: "center",
  },

  backBtn: {
    position: "absolute",
    top: 16,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.onBrand,
    marginTop: 16,
  },

  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },

  providerBadge: {
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },

  providerBadgeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },

  providerBadgeInitials: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.onBrand,
  },

  providerBadgeName: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.onBrand,
  },

  providerBadgeService: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
  },

  scroll: { flex: 1 },

  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 60,
  },

  howSection: {
    backgroundColor: theme.colors.primary + "10",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary + "25",
    gap: 8,
  },

  howHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  howTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },

  howText: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 22,
  },

  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },

  // Step wizard styles
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 0,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  stepDotDone: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  stepDotNum: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  stepLabelActive: {
    color: theme.colors.primary,
    fontWeight: "800",
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: theme.colors.border,
    marginHorizontal: 4,
  },
  stepLineDone: {
    backgroundColor: theme.colors.success,
  },
  stepHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  // GPS / location button
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.primary + "12",
    borderWidth: 1.5,
    borderColor: theme.colors.primary + "40",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  gpsBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
  },

  // "or type manually" divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },

  addressInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    minHeight: 80,
  },

  // Date chip row
  dateScroll: { marginHorizontal: -4 },
  dateScrollContent: { paddingHorizontal: 4, gap: 8, paddingVertical: 4 },
  dateChip: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    minWidth: 64,
    gap: 2,
  },
  dateChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dateChipDay: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  dateChipNum: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.text,
  },
  dateChipTextSelected: {
    color: theme.colors.onBrand,
  },

  // Time slot grid
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
  },
  timeChipSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  timeChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  timeChipTextSelected: {
    color: theme.colors.onBrand,
    fontWeight: "700",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.onBrand,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  },
  summaryBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  summaryText: {
    fontSize: 13,
    color: theme.colors.text,
    flex: 1,
    lineHeight: 18,
  },

  suggestionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },

  suggestionChipActive: {
    backgroundColor: theme.colors.secondary + "20",
    borderColor: theme.colors.secondary,
  },

  suggestionText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },

  suggestionTextActive: {
    color: theme.colors.secondary,
  },

  priceInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },

  pricePrefix: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.primary,
  },

  priceInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
  },

  tipsSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: theme.colors.success + "10",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.success + "25",
  },

  tipText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.text,
    lineHeight: 18,
  },

  mediaBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 14, marginTop: 14, backgroundColor: theme.colors.infoSoft },
  mediaBtnText: { color: theme.colors.primary, fontWeight: "800", flex: 1 },
  submitBtn: {
    borderRadius: 16,
    overflow: "hidden",
  },

  submitBtnDisabled: {
    opacity: 0.6,
  },

  submitGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },

  submitText: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.onBrand,
  },

  emptyWrap: {
    alignItems: "center",
    paddingVertical: 70,
    gap: 10,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },

  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 20,
  },

  selectedCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary + "25",
  },

  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  selectedIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
  },

  selectedService: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
  },

  selectedProvider: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },

  amountsRow: {
    flexDirection: "row",
    gap: 10,
  },

  amountBox: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },

  amountLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },

  amountValue: {
    fontSize: 17,
    fontWeight: "800",
  },

  listCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  listCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "06",
  },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  listIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: theme.colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
  },

  listService: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },

  listProvider: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  listAmounts: {
    gap: 4,
  },

  listAmountText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  selectedActionsWrap: {
    gap: 10,
  },

  counterInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },

  counterInputInline: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.colors.text,
    fontWeight: "700",
  },

  inlineBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  inlineBtnText: {
    color: theme.colors.text,
    fontWeight: "800",
  },

  selectedActionRow: {
    flexDirection: "row",
    gap: 10,
  },

  selectedAcceptBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },

  selectedAcceptText: {
    color: theme.colors.onBrand,
    fontWeight: "800",
  },

  selectedRejectBtn: {
    flex: 1,
    backgroundColor: theme.colors.danger + "15",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.danger + "30",
  },

  selectedRejectText: {
    color: theme.colors.danger,
    fontWeight: "800",
  },

  continueBookingBtn: {
    backgroundColor: theme.colors.success,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },

  continueBookingText: {
    color: theme.colors.onBrand,
    fontWeight: "800",
  },

  disabledBtn: {
    opacity: 0.6,
  },
});
