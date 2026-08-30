import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState , useMemo} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { realtime } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";

function RatingStars({ rating }: { rating: number }) {
  const { theme } = useTheme();
  const stars = Math.round((rating || 0) / 10);
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Icon key={s} name="star" size={11} color={s <= stars ? theme.colors.warning : theme.colors.border} />
      ))}
    </View>
  );
}

function TimeLeft({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [secs, setSecs] = useState(() => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });
  const firedRef = useRef(false);

  useEffect(() => {
    if (secs <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
      return;
    }
    const t = setInterval(() => setSecs((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [secs, onExpire]);

  if (secs <= 0) return <Text style={styles.expiredText}>Expired</Text>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <Text style={[styles.timerText, secs < 30 && { color: theme.colors.danger }]}>
      {m}:{String(s).padStart(2, "0")} left
    </Text>
  );
}

export default function BroadcastStatusScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();
  const { showError } = useToast();

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selecting, setSelecting] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showExpireModal, setShowExpireModal] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestInFlightRef = useRef(false);
  const requestLoadedRef = useRef(false);
  const requestStatusRef = useRef<string | null>(null);

  const load = useCallback(async (
    mode: "initial" | "refresh" | "silent" = "initial"
  ) => {
    if (!requestId || requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    if (mode === "initial" && !requestLoadedRef.current) {
      setLoading(true);
    } else if (mode === "refresh") {
      setRefreshing(true);
    }

    if (mode !== "silent") {
      setLoadError("");
    }

    try {
      const res = await api.getBroadcastRequest(requestId);
      setRequest(res.request);
      requestLoadedRef.current = true;
      requestStatusRef.current = res.request?.status ?? null;
    } catch (e: any) {
      if (mode !== "silent") {
        setLoadError(
          apiErrorToMessage(
            e,
            "We couldn't load this broadcast request. Please try again."
          )
        );
      }
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestId]);

  useFocusEffect(useCallback(() => {
    if (!requestLoadedRef.current) {
      void load("initial");
    } else {
      void load("silent");
    }

    pollRef.current = setInterval(() => {
      if (requestStatusRef.current === "open") {
        void load("silent");
      }
    }, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [load]));

  useEffect(() => {
    const off = realtime.on((msg) => {
      if (msg.type === "broadcast:response" && msg.payload?.requestId === requestId) {
        void load("silent");
      }
      if (
        (msg.type === "broadcast:accepted" || msg.type === "broadcast:cancelled")
        && (!msg.payload?.requestId || msg.payload.requestId === requestId)
      ) {
        void load("silent");
      }
    });
    return off;
  }, [requestId, load]);

  const handleSelect = async (responseId: string) => {
    if (!requestId) return;
    setSelecting(responseId);
    try {
      const res = await api.selectBroadcastResponse(requestId, responseId);
      setRequest((current: any) => ({
        ...current,
        ...(res.request || {}),
        status: "accepted",
        bookingId: res.booking.id,
        acceptedResponseId: responseId,
      }));
      requestStatusRef.current = "accepted";
      Alert.alert(
        "Booking Confirmed! 🎉",
        "Your provider has been notified and your booking is confirmed.",
        [
          {
            text: "View Booking",
            onPress: () =>
              router.replace({
                pathname: "/(customer)/booking-detail",
                params: { bookingId: res.booking.id },
              } as any),
          },
        ]
      );
    } catch (e: any) {
      showError("Unable to confirm provider", apiErrorToMessage(e, "We couldn't confirm this provider. Please try again."));
    } finally {
      setSelecting(null);
    }
  };

  const handleReject = (responseId: string, providerName: string) => {
    if (!requestId || selecting || rejecting) return;
    Alert.alert(
      "Reject Counter",
      `Reject ${providerName || "this provider"}'s counter? The broadcast will stay open and the provider may send a different amount.`,
      [
        { text: "Keep Counter", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setRejecting(responseId);
            try {
              const result = await api.rejectBroadcastResponse(requestId, responseId);
              setRequest((current: any) => ({
                ...current,
                responses: (current?.responses || []).map((response: any) =>
                  response.id === responseId ? { ...response, status: "rejected_by_customer" } : response
                ),
              }));
              Alert.alert(
                "Counter Rejected",
                result.canRevise
                  ? "The provider has been notified and may send a revised counter."
                  : "The provider has been notified. The response revision limit has been reached.",
              );
            } catch (e: any) {
              showError("Unable to reject counter", apiErrorToMessage(e, "We couldn't reject this counter. Please try again."));
              void load("silent");
            } finally {
              setRejecting(null);
            }
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    Alert.alert("Cancel Broadcast", "Are you sure you want to cancel this request?", [
      { text: "No" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          if (!requestId) return;
          setCancelling(true);
          try {
            await api.cancelBroadcastRequest(requestId);
            setRequest((p: any) => ({ ...p, status: "cancelled" }));
            requestStatusRef.current = "cancelled";
          } catch (e: any) {
            showError("Unable to cancel", apiErrorToMessage(e, "We couldn't cancel this request. Please try again."));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.textSecondary, marginTop: 12 }}>Loading responses...</Text>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }]}>
        <Icon name="alert-circle" size={40} color={theme.colors.danger} />
        <Text style={{ color: theme.colors.text, fontSize: 16, marginTop: 12, fontWeight: "700", textAlign: "center" }}>
          {loadError ? "Unable to load broadcast" : "Request not found"}
        </Text>
        {loadError ? (
          <>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginTop: 8, textAlign: "center" }}>
              {loadError}
            </Text>
            <Pressable
              onPress={() => void load("refresh")}
              style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 }}
              accessibilityRole="button"
              testID="broadcast-status-load-retry"
            >
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Go Back</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const responses: any[] = request.responses || [];
  const pendingResponses = responses.filter((r: any) => r.status === "pending");
  const isOpen = request.status === "open";
  const isAccepted = request.status === "accepted";
  const isCancelled = request.status === "cancelled" || request.status === "expired";

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Broadcast Expired — Continue or Cancel modal */}
      <Modal visible={showExpireModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowExpireModal(false)}>
        <View style={styles.expireOverlay}>
          <View style={styles.expireCard}>
            <View style={styles.expireIconWrap}>
              <Icon name="clock" size={28} color={theme.colors.warning} />
            </View>
            <Text style={styles.expireTitle}>Time's Up!</Text>
            <Text style={styles.expireSub}>
              Your broadcast has expired. No provider accepted yet. What would you like to do?
            </Text>
            <Pressable
              style={styles.expandBtn}
              onPress={() => {
                setShowExpireModal(false);
                router.replace({
                  pathname: "/(customer)/book-service",
                  params: { serviceId: request?.service ?? "" },
                } as any);
              }}
            >
              <Icon name="radio" size={16} color={theme.colors.onBrand} />
              <Text style={styles.expandBtnText}>Continue Searching (Expand Radius)</Text>
            </Pressable>
            <Pressable
              style={styles.expireCancelBtn}
              onPress={async () => {
                setShowExpireModal(false);
                try {
                  await api.cancelBroadcastRequest(requestId);
                } catch {}
                router.replace("/(customer)/(tabs)/home" as any);
              }}
            >
              <Text style={styles.expireCancelText}>Cancel — Go Home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={theme.colors.onBrand} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{request.serviceLabel}</Text>
          <Text style={styles.headerSub}>Broadcast Request</Text>
        </View>
        {isOpen && (
          <View style={styles.timerWrap}>
            <Icon name="clock" size={13} color="rgba(255,255,255,0.7)" />
            <TimeLeft
              expiresAt={request.expiresAt}
              onExpire={() => {
                if (request.status === "open") setShowExpireModal(true);
              }}
            />
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} />
        }
      >
        {/* Status banner */}
        {isAccepted && (
          <View style={[styles.acceptedBanner, { backgroundColor: theme.colors.success + "20", borderColor: theme.colors.success + "40" }]}>
            <View style={styles.statusBannerRow}>
              <Icon name="check-circle" size={20} color={theme.colors.success} />
              <Text style={[styles.statusBannerText, { color: theme.colors.success }]}>
                Provider accepted. Your booking is confirmed—no second acceptance is needed.
              </Text>
            </View>
            {request.bookingId ? (
              <Pressable
                style={styles.viewBookingBtn}
                onPress={() => router.replace({
                  pathname: "/(customer)/booking-detail",
                  params: { bookingId: request.bookingId },
                } as any)}
              >
                <Text style={styles.viewBookingText}>View Booking</Text>
                <Icon name="arrow-right" size={14} color={theme.colors.onBrand} />
              </Pressable>
            ) : null}
          </View>
        )}
        {isCancelled && (
          <View style={[styles.statusBanner, { backgroundColor: theme.colors.danger + "15", borderColor: theme.colors.danger + "30" }]}>
            <Icon name="x-circle" size={20} color={theme.colors.danger} />
            <Text style={[styles.statusBannerText, { color: theme.colors.danger }]}>
              This broadcast request was {request.status}.
            </Text>
          </View>
        )}

        {/* Job summary card */}
        <View style={styles.jobCard}>
          <View style={styles.jobRow}>
            <Icon name="map-pin" size={14} color={theme.colors.primary} />
            <Text style={styles.jobText} numberOfLines={2}>{request.address}</Text>
          </View>
          <View style={styles.jobRow}>
            <Icon name="calendar" size={14} color={theme.colors.primary} />
            <Text style={styles.jobText}>{request.scheduledDate} at {request.scheduledTime}</Text>
          </View>
          {request.description && (
            <View style={styles.jobRow}>
              <Icon name="file-text" size={14} color={theme.colors.primary} />
              <Text style={styles.jobText} numberOfLines={3}>{request.description}</Text>
            </View>
          )}
          {request.travellingCharge != null && (
            <View style={styles.jobRow}>
              <Icon name="navigation" size={14} color={theme.colors.primary} />
              <Text style={styles.jobText}>Travel charges separate: Rs. {(request.travellingCharge ?? 500).toLocaleString()}</Text>
            </View>
          )}
          {request.customerOffer && (
            <View style={styles.jobRow}>
              <Icon name="dollar-sign" size={14} color={theme.colors.secondary} />
              <Text style={[styles.jobText, { color: theme.colors.secondary, fontWeight: "700" }]}>
                Your hourly offer: Rs. {request.customerOffer.toLocaleString()} / hour
              </Text>
            </View>
          )}
        </View>

        {/* Provider responses */}
        <Text style={styles.sectionTitle}>
          {pendingResponses.length > 0
            ? `${pendingResponses.length} Provider${pendingResponses.length > 1 ? "s" : ""} Responded`
            : isOpen
            ? "Waiting for providers..."
            : "No responses"}
        </Text>

        {isOpen && pendingResponses.length === 0 && (
          <View style={styles.waitingCard}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.waitingText}>
              Broadcasting to nearby providers. Pull to refresh or wait — responses appear here automatically.
            </Text>
          </View>
        )}

        {pendingResponses.map((resp: any, index: number) => {
          const price = resp.providerOffer ?? request.customerOffer;
          const isSelecting = selecting === resp.id;
          const isRejecting = rejecting === resp.id;
          const isCountered = resp.providerOffer != null && request.customerOffer != null && resp.providerOffer !== request.customerOffer;

          return (
            <View key={`${resp.id || "response"}-${index}`} style={styles.responseCard}>
              <View style={styles.respHeader}>
                <View style={[styles.respAvatar, { backgroundColor: theme.colors.primary + "20" }]}>
                  {resp.providerProfileImage ? (
                    <Icon name="user" size={20} color={theme.colors.primary} />
                  ) : (
                    <Text style={styles.respAvatarText}>
                      {resp.providerName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.respName}>{resp.providerName}</Text>
                    {resp.providerIsVerified && (
                      <Icon name="check-circle" size={13} color={theme.colors.primary} />
                    )}
                  </View>
                  <RatingStars rating={resp.providerRating} />
                  <Text style={styles.respJobs}>{resp.providerTotalJobs || 0} jobs done</Text>
                </View>
                {isCountered && (
                  <View style={styles.counterBadge}>
                    <Text style={styles.counterBadgeText}>Counter</Text>
                  </View>
                )}
              </View>

              <View style={styles.priceRow}>
                <View style={styles.priceBox}>
                  <Text style={styles.priceLabel}>Provider Hourly Rate</Text>
                  <Text style={[styles.priceVal, { color: isCountered ? theme.colors.secondary : theme.colors.success }]}>
                    Rs. {(price || 0).toLocaleString()} / hour
                  </Text>
                  <Text style={styles.originalPrice}>
                    Travel charges: Rs. {(resp.providerTravellingCharge ?? request.travellingCharge ?? 500).toLocaleString()}
                  </Text>
                  {isCountered && request.customerOffer && (
                    <Text style={styles.originalPrice}>
                      vs your hourly offer Rs. {request.customerOffer.toLocaleString()}
                    </Text>
                  )}
                </View>
                {!isCountered && (
                  <View style={styles.matchBadge}>
                    <Icon name="check" size={12} color={theme.colors.success} />
                    <Text style={styles.matchText}>Matches your price</Text>
                  </View>
                )}
              </View>

              {resp.message ? (
                <Text style={styles.respMessage}>"{resp.message}"</Text>
              ) : null}

              {isOpen && (
                <View style={styles.offerActionRow}>
                  <Pressable
                    style={[styles.rejectBtn, (isRejecting || !!selecting) && styles.selectBtnDisabled]}
                    onPress={() => handleReject(resp.id, resp.providerName)}
                    disabled={isRejecting || !!selecting || !!rejecting}
                  >
                    {isRejecting ? (
                      <ActivityIndicator size="small" color={theme.colors.danger} />
                    ) : (
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.selectBtn, (isSelecting || !!rejecting) && styles.selectBtnDisabled]}
                    onPress={() => handleSelect(resp.id)}
                    disabled={isSelecting || !!selecting || !!rejecting}
                  >
                    {isSelecting ? (
                      <ActivityIndicator size="small" color={theme.colors.onBrand} />
                    ) : (
                      <>
                        <Icon name="check-circle" size={16} color={theme.colors.onBrand} />
                        <Text style={styles.selectBtnText}>{isCountered ? "Accept Counter" : "Confirm Provider"}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {/* Cancel button */}
        {isOpen && (
          <Pressable
            style={[styles.cancelBtn, cancelling && styles.cancelBtnDisabled]}
            onPress={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel Broadcast</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingBottom: 20,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  backBtn: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },

  headerContent: { flex: 1 },

  headerTitle: { ...theme.typography.h2, color: theme.colors.onBrand, letterSpacing: -0.25 },
  headerSub: { ...theme.typography.caption, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  timerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    minHeight: 32,
    borderRadius: theme.radius.pill,
  },

  timerText: { ...theme.typography.caption, color: theme.colors.onBrand, fontFamily: theme.typography.label.fontFamily },
  expiredText: { ...theme.typography.caption, color: "rgba(255,255,255,0.6)" },

  scroll: { flex: 1 },
  scrollContent: { padding: redesign.layout.horizontalPadding, gap: 14, paddingBottom: 80 },

  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
  },
  acceptedBanner: {
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
  },
  statusBannerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusBannerText: { ...theme.typography.label, flex: 1 },
  viewBookingBtn: {
    minHeight: redesign.control.compactHeight, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    backgroundColor: theme.colors.success, borderRadius: theme.radius.md, paddingHorizontal: 14,
  },
  viewBookingText: { ...theme.typography.label, color: theme.colors.onBrand },

  jobCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 10,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  jobRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  jobText: { flex: 1, ...theme.typography.body, color: theme.colors.textSecondary },

  sectionTitle: { ...theme.typography.h3, color: theme.colors.text, marginTop: 4 },

  waitingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  waitingText: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  responseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 12,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },

  respHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },

  respAvatar: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  respAvatarText: { ...theme.typography.h3, color: theme.colors.primary },
  respName: { ...theme.typography.h3, color: theme.colors.text },
  respJobs: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },

  counterBadge: {
    backgroundColor: theme.colors.secondary + "20",
    paddingHorizontal: 8,
    minHeight: 26,
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.secondary + "40",
  },
  counterBadgeText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.secondary },

  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceBox: { gap: 2, flex: 1 },
  priceLabel: { ...theme.typography.caption, color: theme.colors.textMuted, fontFamily: theme.typography.label.fontFamily },
  priceVal: { ...theme.typography.h2 },
  originalPrice: { ...theme.typography.caption, color: theme.colors.textMuted },

  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: 10,
    minHeight: 30,
    borderRadius: theme.radius.pill,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.success + "30",
  },
  matchText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.success },

  respMessage: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    backgroundColor: theme.colors.surfaceAlt,
    padding: 10,
    borderRadius: theme.radius.md,
  },

  selectBtn: {
    flex: 1.65,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    minHeight: redesign.control.standardHeight,
    paddingHorizontal: 12,
  },
  selectBtnDisabled: { opacity: redesign.visual.disabledOpacity },
  selectBtnText: { ...theme.typography.label, color: theme.colors.onBrand },
  offerActionRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  rejectBtn: {
    flex: 1, minHeight: redesign.control.standardHeight, alignItems: "center", justifyContent: "center",
    borderRadius: theme.radius.md, borderWidth: redesign.visual.inputBorderWidth, borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft, paddingHorizontal: 10,
  },
  rejectBtnText: { ...theme.typography.label, color: theme.colors.danger },

  expireOverlay: {
    flex: 1, backgroundColor: theme.colors.overlay,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
  },
  expireCard: {
    backgroundColor: theme.colors.elevated, borderRadius: theme.radius.xl, padding: 24,
    width: "100%", alignItems: "center", gap: 14,
    borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border,
    ...theme.shadows.md,
  },
  expireIconWrap: {
    width: 64, height: 64, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.warningSoft, alignItems: "center", justifyContent: "center",
  },
  expireTitle: { ...theme.typography.h2, color: theme.colors.text },
  expireSub: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center" },
  expandBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, minHeight: redesign.control.standardHeight,
    paddingHorizontal: 20, width: "100%", justifyContent: "center",
  },
  expandBtnText: { ...theme.typography.label, color: theme.colors.onBrand },
  expireCancelBtn: {
    minHeight: redesign.control.standardHeight, width: "100%", alignItems: "center", justifyContent: "center",
    borderRadius: theme.radius.md, borderWidth: redesign.visual.inputBorderWidth, borderColor: theme.colors.border,
  },
  expireCancelText: { ...theme.typography.label, color: theme.colors.textSecondary },

  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: redesign.control.standardHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.danger + "25",
    marginTop: 8,
  },
  cancelBtnDisabled: { opacity: redesign.visual.disabledOpacity },
  cancelBtnText: { ...theme.typography.label, color: theme.colors.danger },
});
