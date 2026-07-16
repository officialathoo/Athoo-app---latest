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
  const [selecting, setSelecting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showExpireModal, setShowExpireModal] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!requestId) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.getBroadcastRequest(requestId);
      setRequest(res.request);
    } catch (e: any) {
      if (!silent) showError("Unable to load request", apiErrorToMessage(e, "We couldn't load this request. Please try again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    pollRef.current = setInterval(() => load(true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  useEffect(() => {
    const off = realtime.on((msg) => {
      if (msg.type === "broadcast:response" && msg.payload?.requestId === requestId) {
        load(true);
        const resp = msg.payload?.response;
        const providerName = resp?.providerName ?? "A provider";
        const priceText = resp?.providerOffer ? `Rs. ${resp.providerOffer}` : "open price";
      }
      if (msg.type === "broadcast:accepted" || msg.type === "broadcast:cancelled") {
        load(true);
      }
    });
    return off;
  }, [requestId, load]);

  const handleSelect = async (responseId: string) => {
    if (!requestId) return;
    setSelecting(responseId);
    try {
      const res = await api.selectBroadcastResponse(requestId, responseId);
      setRequest({ ...request, status: "accepted" });
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
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center" }]}>
        <Icon name="alert-circle" size={40} color={theme.colors.danger} />
        <Text style={{ color: theme.colors.text, fontSize: 16, marginTop: 12 }}>Request not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Go Back</Text>
        </Pressable>
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
      <Modal visible={showExpireModal} transparent animationType="fade">
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
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        {/* Status banner */}
        {isAccepted && (
          <View style={[styles.statusBanner, { backgroundColor: theme.colors.success + "20", borderColor: theme.colors.success + "40" }]}>
            <Icon name="check-circle" size={20} color={theme.colors.success} />
            <Text style={[styles.statusBannerText, { color: theme.colors.success }]}>
              Provider selected! Booking confirmed.
            </Text>
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
                <Pressable
                  style={[styles.selectBtn, isSelecting && styles.selectBtnDisabled]}
                  onPress={() => handleSelect(resp.id)}
                  disabled={isSelecting || !!selecting}
                >
                  {isSelecting ? (
                    <ActivityIndicator size="small" color={theme.colors.onBrand} />
                  ) : (
                    <>
                      <Icon name="check-circle" size={16} color={theme.colors.onBrand} />
                      <Text style={styles.selectBtnText}>Select This Provider</Text>
                    </>
                  )}
                </Pressable>
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
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerContent: { flex: 1 },

  headerTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.onBrand },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  timerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },

  timerText: { fontSize: 13, color: theme.colors.onBrand, fontWeight: "700" },
  expiredText: { fontSize: 13, color: "rgba(255,255,255,0.6)" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 80 },

  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusBannerText: { fontSize: 14, fontWeight: "700", flex: 1 },

  jobCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  jobRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  jobText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text, marginTop: 4 },

  waitingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  waitingText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },

  responseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  respHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },

  respAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  respAvatarText: { fontSize: 16, fontWeight: "800", color: theme.colors.primary },
  respName: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  respJobs: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },

  counterBadge: {
    backgroundColor: theme.colors.secondary + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "40",
  },
  counterBadgeText: { fontSize: 10, fontWeight: "700", color: theme.colors.secondary },

  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceBox: { gap: 2 },
  priceLabel: { fontSize: 11, color: theme.colors.textMuted, fontWeight: "600" },
  priceVal: { fontSize: 22, fontWeight: "800" },
  originalPrice: { fontSize: 11, color: theme.colors.textMuted },

  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.success + "15",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.success + "30",
  },
  matchText: { fontSize: 11, fontWeight: "700", color: theme.colors.success },

  respMessage: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 18,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 10,
    borderRadius: 10,
  },

  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  selectBtnDisabled: { opacity: 0.6 },
  selectBtnText: { fontSize: 15, fontWeight: "800", color: theme.colors.onBrand },

  expireOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
  },
  expireCard: {
    backgroundColor: theme.colors.surface, borderRadius: 22, padding: 24,
    width: "100%", alignItems: "center", gap: 14,
    shadowColor: theme.colors.text, shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3, shadowRadius: 24, elevation: 24,
  },
  expireIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: theme.colors.warning + "18", alignItems: "center", justifyContent: "center",
  },
  expireTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  expireSub: { fontSize: 14, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 },
  expandBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 20, width: "100%", justifyContent: "center",
  },
  expandBtnText: { fontSize: 14, fontWeight: "800", color: theme.colors.onBrand },
  expireCancelBtn: {
    paddingVertical: 12, width: "100%", alignItems: "center",
    borderRadius: 14, borderWidth: 1.5, borderColor: theme.colors.border,
  },
  expireCancelText: { fontSize: 14, fontWeight: "700", color: theme.colors.textSecondary },

  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.danger + "10",
    borderWidth: 1,
    borderColor: theme.colors.danger + "25",
    marginTop: 8,
  },
  cancelBtnDisabled: { opacity: 0.6 },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: theme.colors.danger },
});
