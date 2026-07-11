import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { Colors } from "@/constants/colors";
import { api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { realtime } from "@/services/api";
import { notificationService } from "@/services/NotificationService";
import { soundService } from "@/services/SoundService";

function RatingStars({ rating }: { rating: number }) {
  const stars = Math.round((rating || 0) / 10);
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Icon key={s} name="star" size={11} color={s <= stars ? Colors.warning : Colors.border} />
      ))}
    </View>
  );
}

function TimeLeft({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
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
    <Text style={[styles.timerText, secs < 30 && { color: Colors.error }]}>
      {m}:{String(s).padStart(2, "0")} left
    </Text>
  );
}

export default function BroadcastStatusScreen() {
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
      if (!silent) showError("Error", e?.message || "Failed to load request");
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
        notificationService
          .scheduleResponseAlert("Provider responded!", `${providerName} offered ${priceText}`, {
            broadcastRequestId: requestId,
          })
          .catch(() => {});
        soundService.playNotification().catch(() => {});
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
      showError("Failed", e?.message || "Could not confirm this provider");
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
            showError("Failed", e?.message || "Could not cancel");
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
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>Loading responses...</Text>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center" }]}>
        <Icon name="alert-circle" size={40} color={Colors.error} />
        <Text style={{ color: Colors.text, fontSize: 16, marginTop: 12 }}>Request not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary, fontWeight: "700" }}>Go Back</Text>
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
              <Icon name="clock" size={28} color={Colors.warning} />
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
              <Icon name="radio" size={16} color="#fff" />
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

      <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color="#fff" />
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
          <View style={[styles.statusBanner, { backgroundColor: Colors.success + "20", borderColor: Colors.success + "40" }]}>
            <Icon name="check-circle" size={20} color={Colors.success} />
            <Text style={[styles.statusBannerText, { color: Colors.success }]}>
              Provider selected! Booking confirmed.
            </Text>
          </View>
        )}
        {isCancelled && (
          <View style={[styles.statusBanner, { backgroundColor: Colors.error + "15", borderColor: Colors.error + "30" }]}>
            <Icon name="x-circle" size={20} color={Colors.error} />
            <Text style={[styles.statusBannerText, { color: Colors.error }]}>
              This broadcast request was {request.status}.
            </Text>
          </View>
        )}

        {/* Job summary card */}
        <View style={styles.jobCard}>
          <View style={styles.jobRow}>
            <Icon name="map-pin" size={14} color={Colors.primary} />
            <Text style={styles.jobText} numberOfLines={2}>{request.address}</Text>
          </View>
          <View style={styles.jobRow}>
            <Icon name="calendar" size={14} color={Colors.primary} />
            <Text style={styles.jobText}>{request.scheduledDate} at {request.scheduledTime}</Text>
          </View>
          {request.description && (
            <View style={styles.jobRow}>
              <Icon name="file-text" size={14} color={Colors.primary} />
              <Text style={styles.jobText} numberOfLines={3}>{request.description}</Text>
            </View>
          )}
          {request.travellingCharge != null && (
            <View style={styles.jobRow}>
              <Icon name="navigation" size={14} color={Colors.primary} />
              <Text style={styles.jobText}>Travel charges separate: Rs. {(request.travellingCharge ?? 500).toLocaleString()}</Text>
            </View>
          )}
          {request.customerOffer && (
            <View style={styles.jobRow}>
              <Icon name="dollar-sign" size={14} color={Colors.secondary} />
              <Text style={[styles.jobText, { color: Colors.secondary, fontWeight: "700" }]}>
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
            <ActivityIndicator size="small" color={Colors.primary} />
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
                <View style={[styles.respAvatar, { backgroundColor: Colors.primary + "20" }]}>
                  {resp.providerProfileImage ? (
                    <Icon name="user" size={20} color={Colors.primary} />
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
                      <Icon name="check-circle" size={13} color={Colors.primary} />
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
                  <Text style={[styles.priceVal, { color: isCountered ? Colors.secondary : Colors.success }]}>
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
                    <Icon name="check" size={12} color={Colors.success} />
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
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="check-circle" size={16} color="#fff" />
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
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel Broadcast</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

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

  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
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

  timerText: { fontSize: 13, color: "#fff", fontWeight: "700" },
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
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  jobRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  jobText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: Colors.text, marginTop: 4 },

  waitingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  waitingText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  responseCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
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

  respAvatarText: { fontSize: 16, fontWeight: "800", color: Colors.primary },
  respName: { fontSize: 15, fontWeight: "800", color: Colors.text },
  respJobs: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  counterBadge: {
    backgroundColor: Colors.secondary + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.secondary + "40",
  },
  counterBadgeText: { fontSize: 10, fontWeight: "700", color: Colors.secondary },

  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceBox: { gap: 2 },
  priceLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  priceVal: { fontSize: 22, fontWeight: "800" },
  originalPrice: { fontSize: 11, color: Colors.textMuted },

  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.success + "15",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.success + "30",
  },
  matchText: { fontSize: 11, fontWeight: "700", color: Colors.success },

  respMessage: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 18,
    backgroundColor: Colors.surface,
    padding: 10,
    borderRadius: 10,
  },

  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  selectBtnDisabled: { opacity: 0.6 },
  selectBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },

  expireOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
  },
  expireCard: {
    backgroundColor: Colors.white, borderRadius: 22, padding: 24,
    width: "100%", alignItems: "center", gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3, shadowRadius: 24, elevation: 24,
  },
  expireIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.warning + "18", alignItems: "center", justifyContent: "center",
  },
  expireTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  expireSub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  expandBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 20, width: "100%", justifyContent: "center",
  },
  expandBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  expireCancelBtn: {
    paddingVertical: 12, width: "100%", alignItems: "center",
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border,
  },
  expireCancelText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },

  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.error + "10",
    borderWidth: 1,
    borderColor: Colors.error + "25",
    marginTop: 8,
  },
  cancelBtnDisabled: { opacity: 0.6 },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: Colors.error },
});
