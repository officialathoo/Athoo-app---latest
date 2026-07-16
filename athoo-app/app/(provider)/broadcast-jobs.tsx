import { Icon } from "@/components/ui/Icon";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { router, useFocusEffect } from "expo-router";
import { getDistanceKm, formatDistanceKm } from "@/utils/distance";
import React, { useCallback, useEffect, useRef, useState , useMemo} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { api, realtime } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";

function TimeLeft({ expiresAt }: { expiresAt: string }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  useEffect(() => {
    if (secs <= 0) return;
    const t = setInterval(() => setSecs((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [secs]);
  if (secs <= 0) return <Text style={[styles.timer, { color: theme.colors.textMuted }]}>Expired</Text>;
  const m = Math.floor(secs / 60), s = secs % 60;
  return <Text style={[styles.timer, secs < 120 && { color: theme.colors.danger }]}>{m}:{String(s).padStart(2, "0")}</Text>;
}

export default function BroadcastJobsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();
  const { showError } = useToast();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [offerInput, setOfferInput] = useState<{ [id: string]: string }>({});
  const [messageInput, setMessageInput] = useState<{ [id: string]: string }>({});
  const [travelInput, setTravelInput] = useState<{ [id: string]: string }>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getBroadcastRequests({ status: "open" });
      setRequests(res.requests || []);
    } catch (e: any) {
      if (!silent) showError("Unable to load requests", apiErrorToMessage(e, "We couldn't load broadcast requests. Please try again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    pollRef.current = setInterval(() => load(true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  useEffect(() => {
    const off = realtime.on((msg) => {
      if (msg.type === "broadcast:new" || msg.type === "broadcast:cancelled" || msg.type === "broadcast:accepted") {
        load(true);
      }
    });
    return off;
  }, [load]);

  const myResponseForRequest = (req: any) => {
    if (!user) return null;
    const responses: any[] = req.responses || [];
    return responses.find((r: any) => r.providerId === user.id) ?? null;
  };

  const defaultProviderRate = user?.ratePerHour ? String(user.ratePerHour) : "";

  const handleRespond = async (requestId: string) => {
    const priceStr = offerInput[requestId] || defaultProviderRate || "";
    const msg = messageInput[requestId] || "";
    const parsedOffer = priceStr.trim() ? parseInt(priceStr, 10) : undefined;

    setSubmittingId(requestId);
    try {
      const req = requests.find((r) => r.id === requestId);
      const travelStr = travelInput[requestId] ?? String(req?.travellingCharge ?? 500);
      const parsedTravel = parseInt(String(travelStr).replace(/[^0-9]/g, ""), 10);
      await api.respondToBroadcast(requestId, {
        providerOffer: parsedOffer && parsedOffer > 0 ? parsedOffer : undefined,
        providerTravellingCharge: Number.isFinite(parsedTravel) ? Math.max(0, parsedTravel) : 500,
        message: msg.trim() || undefined,
      });
      setRespondingId(null);
      setOfferInput((p) => ({ ...p, [requestId]: "" }));
      setMessageInput((p) => ({ ...p, [requestId]: "" }));
      setTravelInput((p) => ({ ...p, [requestId]: "" }));
      load(true);
    } catch (e: any) {
      showError("Unable to submit response", apiErrorToMessage(e, "We couldn't submit your response. Please try again."));
    } finally {
      setSubmittingId(null);
    }
  };

  const handleWithdraw = (requestId: string) => {
    Alert.alert("Withdraw Response", "Remove your response to this request?", [
      { text: "Cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: async () => {
          try {
            await api.withdrawBroadcastResponse(requestId);
            load(true);
          } catch (e: any) {
            showError("Unable to withdraw", apiErrorToMessage(e, "We couldn't withdraw your response. Please try again."));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
        <Text style={{ color: theme.colors.textSecondary, marginTop: 12 }}>Loading broadcast requests...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Video playback modal */}
      <Modal
        visible={!!playingVideoUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPlayingVideoUrl(null)}
      >
        <View style={styles.videoModalOverlay}>
          <View style={styles.videoModalBox}>
            <View style={styles.videoModalHeader}>
              <Text style={styles.videoModalTitle}>Customer&apos;s Video</Text>
              <Pressable onPress={() => setPlayingVideoUrl(null)} style={styles.videoModalClose}>
                <Icon name="x" size={20} color={theme.colors.text} />
              </Pressable>
            </View>
            {playingVideoUrl ? <VideoPlayer uri={playingVideoUrl} style={styles.fullscreenVideo} /> : null}
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Broadcast Jobs</Text>
          <Text style={styles.headerSub}>Nearby open requests · tap to respond</Text>
        </View>
        {requests.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{requests.length}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={theme.colors.secondary}
          />
        }
      >
        {requests.length === 0 && (
          <View style={styles.emptyCard}>
            <Icon name="radio" size={36} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No Open Requests</Text>
            <Text style={styles.emptyText}>
              When customers broadcast a request in your service area, it will appear here. Pull to refresh.
            </Text>
          </View>
        )}

        {requests.map((req, i) => {
          const myResp = myResponseForRequest(req);
          const isResponding = respondingId === req.id;
          const isSubmitting = submittingId === req.id;

          return (
            <View key={`${req.id}-${i}`} style={styles.reqCard}>
              {(() => {
                const distKm: number | null = req.distanceKm != null
                  ? req.distanceKm
                  : (() => {
                      const uLat = (user as any)?.latitude;
                      const uLng = (user as any)?.longitude;
                      if (uLat && uLng && req.latitude && req.longitude) {
                        const d = getDistanceKm(parseFloat(uLat), parseFloat(uLng), req.latitude, req.longitude);
                        return Number.isFinite(d) ? Math.round(d * 10) / 10 : null;
                      }
                      return null;
                    })();
                return (
                  <View style={styles.reqHeader}>
                    <View style={[styles.reqCatIcon, { backgroundColor: theme.colors.secondary + "20" }]}>
                      <Icon name="tool" size={18} color={theme.colors.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqService}>{req.serviceLabel}</Text>
                      <View style={styles.reqMeta}>
                        <Icon name="map-pin" size={11} color={theme.colors.textMuted} />
                        <Text style={styles.reqMetaText} numberOfLines={1}>{req.address}</Text>
                      </View>
                      {distKm != null && (
                        <View style={[styles.reqMeta, { marginTop: 2 }]}>
                          <Icon name="navigation" size={11} color={theme.colors.primary} />
                          <Text style={[styles.reqMetaText, { color: theme.colors.primary, fontWeight: "700" }]}>{formatDistanceKm(distKm)}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.timerBox}>
                      <Icon name="clock" size={11} color={theme.colors.textMuted} />
                      <TimeLeft expiresAt={req.expiresAt} />
                    </View>
                  </View>
                );
              })()}

              <View style={styles.reqDetails}>
                <View style={styles.detailRow}>
                  <Icon name="calendar" size={12} color={theme.colors.primary} />
                  <Text style={styles.detailText}>{req.scheduledDate} at {req.scheduledTime}</Text>
                </View>
                {req.description ? (
                  <View style={styles.detailRow}>
                    <Icon name="file-text" size={12} color={theme.colors.primary} />
                    <Text style={styles.detailText} numberOfLines={2}>{req.description}</Text>
                  </View>
                ) : null}
                {req.videoUrl ? (
                  <Pressable style={styles.detailRow} onPress={() => setPlayingVideoUrl(req.videoUrl)}>
                    <Icon name="video" size={12} color={theme.colors.success} />
                    <Text style={[styles.detailText, { color: theme.colors.success, fontWeight: "600" }]}>▶ Play customer video</Text>
                  </Pressable>
                ) : null}
              </View>

              {req.customerOffer ? (
                <View style={styles.customerOfferBox}>
                  <Text style={styles.offerLabel}>Customer hourly offer</Text>
                  <Text style={styles.offerAmt}>Rs. {req.customerOffer.toLocaleString()} / hour</Text>
                  <Text style={styles.openPriceText}>Per-hour labor/service rate only. Travel charges are separate; final invoice uses actual job time.</Text>
                </View>
              ) : (
                <View style={styles.openPriceBox}>
                  <Icon name="tag" size={12} color={theme.colors.textMuted} />
                  <Text style={styles.openPriceText}>Open hourly rate — enter your per-hour labor/service rate</Text>
                </View>
              )}

              <View style={styles.reqResponseCount}>
                <Icon name="users" size={12} color={theme.colors.textMuted} />
                <Text style={styles.respCountText}>{(req.responses || []).length} provider(s) responded</Text>
              </View>

              {myResp ? (
                <View style={styles.myRespBox}>
                  <View style={styles.myRespHeader}>
                    <Icon name="check-circle" size={16} color={theme.colors.success} />
                    <Text style={styles.myRespTitle}>You responded</Text>
                    {myResp.providerOffer && (
                      <Text style={styles.myRespPrice}>Rs. {myResp.providerOffer.toLocaleString()}</Text>
                    )}
                  </View>
                  {myResp.message ? (
                    <Text style={styles.myRespMsg}>"{myResp.message}"</Text>
                  ) : null}
                  <Pressable style={styles.withdrawBtn} onPress={() => handleWithdraw(req.id)}>
                    <Icon name="x" size={13} color={theme.colors.danger} />
                    <Text style={styles.withdrawText}>Withdraw Response</Text>
                  </Pressable>
                </View>
              ) : isResponding ? (
                <View style={styles.respondForm}>
                  <Text style={styles.formLabel}>Your hourly rate / counter-offer (per hour)</Text>
                  <View style={styles.formPriceRow}>
                    <Text style={styles.formRs}>Rs.</Text>
                    <TextInput
                      style={styles.formPriceInput}
                      value={offerInput[req.id] ?? defaultProviderRate}
                      onChangeText={(v) => setOfferInput((p) => ({ ...p, [req.id]: v.replace(/[^0-9]/g, "") }))}
                      placeholder={defaultProviderRate || (req.customerOffer ? String(req.customerOffer) : "PKR per hour")}
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>
                  <Text style={styles.formLabel}>Travel charges (separate from hourly rate)</Text>
                  <View style={styles.formPriceRow}>
                    <Text style={styles.formRs}>Rs.</Text>
                    <TextInput
                      style={styles.formPriceInput}
                      value={travelInput[req.id] ?? String(req.travellingCharge ?? 500)}
                      onChangeText={(v) => setTravelInput((p) => ({ ...p, [req.id]: v.replace(/[^0-9]/g, "") }))}
                      placeholder="Travelling charges"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>
                  <Text style={styles.formLabel}>Message (optional)</Text>
                  <TextInput
                    style={styles.formMsgInput}
                    value={messageInput[req.id] || ""}
                    onChangeText={(v) => setMessageInput((p) => ({ ...p, [req.id]: v }))}
                    placeholder="E.g. I have 10 years experience with this..."
                    placeholderTextColor={theme.colors.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                    <Pressable style={styles.cancelFormBtn} onPress={() => setRespondingId(null)}>
                      <Text style={styles.cancelFormText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                      onPress={() => handleRespond(req.id)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting
                        ? <ActivityIndicator size="small" color={theme.colors.onBrand} />
                        : <><Icon name="send" size={14} color={theme.colors.onBrand} /><Text style={styles.submitText}>Submit Response</Text></>}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={styles.respondBtn} onPress={() => setRespondingId(req.id)}>
                  <Icon name="send" size={15} color={theme.colors.onBrand} />
                  <Text style={styles.respondBtnText}>
                    {req.customerOffer ? `Accept / Counter Rs. ${req.customerOffer.toLocaleString()} / hour` : "Submit Hourly Quote"}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  headerSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },

  countBadge: {
    backgroundColor: theme.colors.secondary, width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  countBadgeText: { fontSize: 13, fontWeight: "800", color: theme.colors.onBrand },

  emptyCard: {
    alignItems: "center", padding: 40, gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  emptyText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 },

  reqCard: {
    backgroundColor: theme.colors.surface, borderRadius: 18, padding: 16, gap: 12,
    borderWidth: 1, borderColor: theme.colors.border,
    shadowColor: theme.colors.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },

  reqHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  reqCatIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  reqService: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  reqMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  reqMetaText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary },
  timerBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  timer: { fontSize: 13, fontWeight: "700", color: theme.colors.warning },

  reqDetails: { gap: 6 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 },

  customerOfferBox: {
    flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start",
    backgroundColor: theme.colors.secondary + "12", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.colors.secondary + "30",
  },
  offerLabel: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary },
  offerAmt: { fontSize: 22, fontWeight: "800", color: theme.colors.secondary, flexShrink: 1, flexWrap: "wrap" },

  openPriceBox: {
    flexDirection: "row", alignItems: "center", gap: 6, padding: 10,
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 10,
  },
  openPriceText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "600", lineHeight: 17, flexShrink: 1 },

  reqResponseCount: { flexDirection: "row", alignItems: "center", gap: 6 },
  respCountText: { fontSize: 12, color: theme.colors.textMuted },

  myRespBox: {
    backgroundColor: theme.colors.success + "10", borderRadius: 12, padding: 12, gap: 8,
    borderWidth: 1, borderColor: theme.colors.success + "30",
  },
  myRespHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  myRespTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: theme.colors.success },
  myRespPrice: { fontSize: 15, fontWeight: "800", color: theme.colors.success },
  myRespMsg: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: "italic" },
  withdrawBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  withdrawText: { fontSize: 12, fontWeight: "700", color: theme.colors.danger },

  respondForm: { gap: 8 },
  formLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  formPriceRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, borderWidth: 1.5,
    borderColor: theme.colors.secondary, paddingHorizontal: 12, paddingVertical: 4,
  },
  formRs: { fontSize: 18, fontWeight: "800", color: theme.colors.secondary },
  formPriceInput: { flex: 1, fontSize: 22, fontWeight: "800", color: theme.colors.text, paddingVertical: 8 },
  formMsgInput: {
    backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.border,
    padding: 12, fontSize: 13, color: theme.colors.text, textAlignVertical: "top", minHeight: 72,
  },
  cancelFormBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.border,
  },
  cancelFormText: { fontSize: 14, fontWeight: "700", color: theme.colors.textSecondary },
  submitBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.secondary, borderRadius: 12, paddingVertical: 12,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: 14, fontWeight: "800", color: theme.colors.onBrand },

  respondBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.secondary, borderRadius: 12, paddingVertical: 14,
  },
  respondBtnText: { fontSize: 14, fontWeight: "800", color: theme.colors.onBrand },
  videoModalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.text,
    justifyContent: "center",
    alignItems: "stretch",
    padding: 0,
  },
  videoModalBox: {
    flex: 1,
    width: "100%",
    backgroundColor: theme.colors.text,
    borderRadius: 0,
    overflow: "hidden",
  },
  fullscreenVideo: { flex: 1, aspectRatio: undefined, borderRadius: 0 },
  videoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.text,
    backgroundColor: theme.colors.text,
  },
  videoModalTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.onBrand },
  videoModalClose: { padding: 4 },
});
