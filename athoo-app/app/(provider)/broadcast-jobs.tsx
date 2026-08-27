import { Icon } from "@/components/ui/Icon";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getDistanceKm, formatDistanceKm } from "@/utils/distance";
import React, { useCallback, useEffect, useRef, useState , useMemo} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
import { radius } from "@/design/tokens";
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
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const { showError } = useToast();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [offerInput, setOfferInput] = useState<{ [id: string]: string }>({});
  const [messageInput, setMessageInput] = useState<{ [id: string]: string }>({});
  const [travelInput, setTravelInput] = useState<{ [id: string]: string }>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadRequestInFlightRef = useRef(false);
  const requestsLoadedRef = useRef(false);
  const responseRequestIdsRef = useRef<Record<string, string>>({});

  const responseRequestId = (requestId: string, revision: number, action: "accept" | "counter") => {
    const key = `${requestId}:${revision}:${action}`;
    if (!responseRequestIdsRef.current[key]) {
      responseRequestIdsRef.current[key] = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return { key, value: responseRequestIdsRef.current[key]! };
  };

  const load = useCallback(async (
    mode: "initial" | "refresh" | "silent" | "mutation" = "initial"
  ) => {
    if (loadRequestInFlightRef.current) return;

    loadRequestInFlightRef.current = true;
    if (mode === "initial" && !requestsLoadedRef.current) {
      setLoading(true);
    } else if (mode === "refresh") {
      setRefreshing(true);
    }

    if (mode !== "silent") {
      setLoadError("");
    }

    try {
      const res = await api.getBroadcastRequests({ status: "open" });
      const next = Array.isArray(res.requests) ? [...res.requests] : [];
      if (requestId) {
        next.sort((a, b) => Number(b?.id === requestId) - Number(a?.id === requestId));
      }
      setRequests(next);
      requestsLoadedRef.current = true;
      setLoadError("");
    } catch (e: any) {
      if (mode !== "silent") {
        setLoadError(
          apiErrorToMessage(
            e,
            "We couldn't load broadcast requests. Please try again."
          )
        );
      }
    } finally {
      loadRequestInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestId]);

  useFocusEffect(useCallback(() => {
    if (!requestsLoadedRef.current) {
      void load("initial");
    } else {
      void load("silent");
    }

    pollRef.current = setInterval(() => {
      void load("silent");
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
      if (msg.type === "broadcast:new" || msg.type === "broadcast:cancelled" || msg.type === "broadcast:accepted") {
        void load("silent");
      }
    });
    return off;
  }, [load]);

  const myResponseForRequest = (req: any) => {
    if (!user || !req) return null;
    if (req.myResponse?.providerId === user.id) return req.myResponse;
    const responses: any[] = req.responses || [];
    return responses.find((r: any) => r.providerId === user.id) ?? null;
  };

  const defaultProviderRate = user?.ratePerHour ? String(user.ratePerHour) : "";

  const openCounter = (req: any) => {
    const previous = myResponseForRequest(req);
    setOfferInput((current) => ({
      ...current,
      [req.id]: current[req.id] ?? String(previous?.providerOffer ?? defaultProviderRate ?? ""),
    }));
    setTravelInput((current) => ({
      ...current,
      [req.id]: current[req.id] ?? String(previous?.providerTravellingCharge ?? req.travellingCharge ?? 0),
    }));
    setRespondingId(req.id);
  };

  const handleCounter = async (requestId: string) => {
    const priceStr = offerInput[requestId] || defaultProviderRate || "";
    const msg = messageInput[requestId] || "";
    const parsedOffer = priceStr.trim() ? parseInt(priceStr, 10) : undefined;

    setSubmittingId(requestId);
    try {
      const req = requests.find((r) => r.id === requestId);
      const myResponse = myResponseForRequest(req);
      const travelStr = travelInput[requestId] ?? String(req?.travellingCharge ?? 500);
      const parsedTravel = parseInt(String(travelStr).replace(/[^0-9]/g, ""), 10);
      if (!parsedOffer || parsedOffer <= 0 || !Number.isFinite(parsedTravel)) {
        showError("Invalid counter", "Enter valid whole-rupee hourly and travel amounts.");
        return;
      }
      if (parsedOffer === req?.customerOffer && parsedTravel === Number(req?.travellingCharge || 0)) {
        showError("Use Accept Offer", "Your amounts match the customer’s offer. Accept it to confirm the booking immediately.");
        return;
      }
      const requestKey = responseRequestId(requestId, Number(myResponse?.revision || 0) + 1, "counter");
      await api.respondToBroadcast(requestId, {
        action: "counter",
        providerOffer: parsedOffer,
        providerTravellingCharge: Math.max(0, parsedTravel),
        message: msg.trim() || undefined,
        clientRequestId: requestKey.value,
      });
      delete responseRequestIdsRef.current[requestKey.key];
      setRespondingId(null);
      setOfferInput((p) => ({ ...p, [requestId]: "" }));
      setMessageInput((p) => ({ ...p, [requestId]: "" }));
      setTravelInput((p) => ({ ...p, [requestId]: "" }));
      void load("mutation");
    } catch (e: any) {
      showError("Unable to submit response", apiErrorToMessage(e, "We couldn't submit your response. Please try again."));
    } finally {
      setSubmittingId(null);
    }
  };

  const handleAccept = async (req: any) => {
    if (!req?.customerOffer || submittingId) return;
    const myResponse = myResponseForRequest(req);
    const requestKey = responseRequestId(req.id, Number(myResponse?.revision || 0) + 1, "accept");
    setSubmittingId(req.id);
    try {
      const result = await api.respondToBroadcast(req.id, {
        action: "accept",
        providerTravellingCharge: Number(req.travellingCharge || 0),
        clientRequestId: requestKey.value,
      });
      if (!result.booking) throw new Error("Booking confirmation was not returned");
      delete responseRequestIdsRef.current[requestKey.key];
      setRequests((current) => current.filter((item) => item.id !== req.id));
      Alert.alert(
        "Job Accepted",
        "The booking is confirmed. The customer has been notified—no second acceptance is required.",
        [
          { text: "Stay Here", style: "cancel" },
          { text: "View Booking", onPress: () => router.replace({ pathname: "/(provider)/job-detail", params: { bookingId: result.booking.id } } as any) },
        ],
      );
    } catch (e) {
      showError("Unable to accept job", apiErrorToMessage(e, "This job may have been accepted by another provider. Refresh and try again."));
      void load("mutation");
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
            void load("mutation");
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

  if (loadError && !requestsLoadedRef.current) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }]}>
        <Icon name="alert-circle" size={40} color={theme.colors.danger} />
        <Text style={{ color: theme.colors.text, fontSize: 16, marginTop: 12, fontWeight: "700", textAlign: "center" }}>
          Unable to load broadcast jobs
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginTop: 8, textAlign: "center" }}>
          {loadError}
        </Text>
        <Pressable
          onPress={() => void load("refresh")}
          style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 }}
          accessibilityRole="button"
          testID="provider-broadcast-jobs-load-retry"
        >
          <Text style={{ color: theme.colors.secondary, fontWeight: "700" }}>Retry</Text>
        </Pressable>
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

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 80 }}
        data={requests}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor={theme.colors.secondary}
          />
        }
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        ListHeaderComponent={
          loadError && requestsLoadedRef.current ? (
            <View style={[styles.emptyCard, { borderColor: theme.colors.danger }]}>
              <Icon name="alert-circle" size={28} color={theme.colors.danger} />
              <Text style={[styles.emptyTitle, { color: theme.colors.danger }]}>Refresh Failed</Text>
              <Text style={styles.emptyText}>{loadError}</Text>
              <Pressable onPress={() => void load("refresh")} accessibilityRole="button">
                <Text style={{ color: theme.colors.secondary, fontWeight: "700" }}>Retry</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          requests.length === 0 && !loadError ? (
            <View style={styles.emptyCard}>
              <Icon name="radio" size={36} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No Open Requests</Text>
              <Text style={styles.emptyText}>
                When customers broadcast a request in your service area, it will appear here. Pull to refresh.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: req }) => {
          const myResp = myResponseForRequest(req);
          const isResponding = respondingId === req.id;
          const isSubmitting = submittingId === req.id;
          const canRevise = Number(myResp?.revision || 0) < Number(req.responseRevisionLimit || 3);

          return (
            <View key={req.id} style={styles.reqCard}>
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
                <Text style={styles.respCountText}>{req.responseCount ?? (req.responses || []).length} provider(s) responded</Text>
              </View>

              {myResp?.status === "pending" ? (
                <View style={styles.myRespBox}>
                  <View style={styles.myRespHeader}>
                    <Icon name="check-circle" size={16} color={theme.colors.success} />
                    <Text style={styles.myRespTitle}>Counter sent · awaiting customer</Text>
                    <Text style={styles.revisionText}>Rev. {myResp.revision ?? 1}</Text>
                  </View>
                  <Text style={styles.myRespPrice}>
                    Rs. {(myResp.providerOffer ?? req.customerOffer ?? 0).toLocaleString()} / hour
                  </Text>
                  <Text style={styles.responseTravelText}>
                    Travel: Rs. {(myResp.providerTravellingCharge ?? req.travellingCharge ?? 0).toLocaleString()}
                  </Text>
                  {myResp.message ? (
                    <Text style={styles.myRespMsg}>"{myResp.message}"</Text>
                  ) : null}
                  <Pressable style={styles.withdrawBtn} onPress={() => handleWithdraw(req.id)}>
                    <Icon name="x" size={13} color={theme.colors.danger} />
                    <Text style={styles.withdrawText}>Withdraw Response</Text>
                  </Pressable>
                </View>
              ) : myResp?.status === "rejected_by_customer" && !isResponding ? (
                <View style={styles.rejectedResponseBox}>
                  <View style={styles.myRespHeader}>
                    <Icon name="x-circle" size={16} color={theme.colors.danger} />
                    <Text style={styles.rejectedResponseTitle}>Customer declined your counter</Text>
                  </View>
                  <Text style={styles.rejectedResponseText}>
                    {canRevise
                      ? "Change the hourly or travel amount and send a revised counter. You can also accept the customer's original offer to confirm the booking immediately."
                      : "The response revision limit has been reached for this request."}
                  </Text>
                  {canRevise ? (
                    <View style={styles.responseActionRow}>
                      {req.customerOffer ? (
                        <Pressable
                          style={[styles.acceptOfferBtn, isSubmitting && styles.submitBtnDisabled]}
                          onPress={() => handleAccept(req)}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <ActivityIndicator size="small" color={theme.colors.onBrand} />
                          ) : (
                            <Text style={styles.acceptOfferText}>Accept Original</Text>
                          )}
                        </Pressable>
                      ) : null}
                      <Pressable style={styles.counterOfferBtn} onPress={() => openCounter(req)} disabled={isSubmitting}>
                        <Text style={styles.counterOfferText}>Revise Counter</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : isResponding ? (
                <View style={styles.respondForm}>
                  <Text style={styles.formTitle}>{myResp ? "Revise your counter" : "Send a counter-offer"}</Text>
                  <Text style={styles.formHint}>The customer can accept or reject this counter. Acceptance confirms the booking immediately.</Text>
                  <Text style={styles.formLabel}>Hourly labor/service rate</Text>
                  <View style={styles.formPriceRow}>
                    <Text style={styles.formRs}>Rs.</Text>
                    <TextInput
                      style={styles.formPriceInput}
                      value={offerInput[req.id] ?? ""}
                      onChangeText={(v) => setOfferInput((p) => ({ ...p, [req.id]: v.replace(/[^0-9]/g, "") }))}
                      placeholder={String(myResp?.providerOffer ?? defaultProviderRate ?? req.customerOffer ?? "PKR per hour")}
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
                      onPress={() => handleCounter(req.id)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting
                        ? <ActivityIndicator size="small" color={theme.colors.onBrand} />
                        : <><Icon name="send" size={14} color={theme.colors.onBrand} /><Text style={styles.submitText}>{myResp ? "Send Revision" : "Send Counter"}</Text></>}
                    </Pressable>
                  </View>
                </View>
              ) : myResp ? (
                <View style={styles.closedResponseBox}>
                  <Icon name="info" size={15} color={theme.colors.textMuted} />
                  <Text style={styles.closedResponseText}>Your response is {String(myResp.status || "closed").replace(/_/g, " ")} and cannot be changed.</Text>
                </View>
              ) : (
                <View style={styles.initialActions}>
                  {req.customerOffer ? (
                    <>
                      <Text style={styles.acceptanceHint}>Accepting confirms the booking now—there is no second provider acceptance.</Text>
                      <View style={styles.responseActionRow}>
                        <Pressable
                          style={[styles.acceptOfferBtn, isSubmitting && styles.submitBtnDisabled]}
                          onPress={() => handleAccept(req)}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <ActivityIndicator size="small" color={theme.colors.onBrand} />
                          ) : (
                            <><Icon name="check-circle" size={15} color={theme.colors.onBrand} /><Text style={styles.acceptOfferText}>Accept Offer</Text></>
                          )}
                        </Pressable>
                        <Pressable style={styles.counterOfferBtn} onPress={() => openCounter(req)} disabled={isSubmitting}>
                          <Text style={styles.counterOfferText}>Counter</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <Pressable style={styles.respondBtn} onPress={() => openCounter(req)}>
                      <Icon name="send" size={15} color={theme.colors.onBrand} />
                      <Text style={styles.respondBtnText}>Send Hourly Quote</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: redesign.layout.cardGap,
    borderBottomWidth: redesign.visual.cardBorderWidth,
    borderBottomColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  backBtn: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },
  headerTitle: { ...theme.typography.h2, color: theme.colors.text },
  headerSub: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 1 },

  countBadge: {
    backgroundColor: theme.colors.secondary,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { fontSize: 13, fontWeight: "800", color: theme.colors.onBrand },

  emptyCard: {
    alignItems: "center",
    padding: 28,
    gap: redesign.layout.cardGap,
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  emptyText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 },

  reqCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    padding: redesign.layout.fieldGap,
    gap: 10,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },

  reqHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  reqCatIcon: {
    width: redesign.control.compactHeight,
    height: redesign.control.compactHeight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  reqService: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  reqMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  reqMetaText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary },
  timerBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  timer: { fontSize: 13, fontWeight: "700", color: theme.colors.warning },

  reqDetails: { gap: 6 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 },

  customerOfferBox: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    backgroundColor: theme.colors.premiumSoft,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.secondary + "30",
  },
  offerLabel: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary },
  offerAmt: { fontSize: 20, fontWeight: "800", color: theme.colors.secondary, flexShrink: 1, flexWrap: "wrap" },

  openPriceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },
  openPriceText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "600", lineHeight: 17, flexShrink: 1 },

  reqResponseCount: { flexDirection: "row", alignItems: "center", gap: 6 },
  respCountText: { fontSize: 12, color: theme.colors.textMuted },

  myRespBox: {
    backgroundColor: theme.colors.successSoft,
    borderRadius: radius.md,
    padding: 10,
    gap: 7,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.success + "30",
  },
  myRespHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  myRespTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: theme.colors.success },
  myRespPrice: { fontSize: 17, fontWeight: "800", color: theme.colors.success },
  revisionText: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted },
  responseTravelText: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary },
  myRespMsg: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: "italic" },
  withdrawBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  withdrawText: { fontSize: 12, fontWeight: "700", color: theme.colors.danger },

  rejectedResponseBox: {
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: radius.md,
    padding: 10,
    gap: 8,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.danger + "30",
  },
  rejectedResponseTitle: { flex: 1, fontSize: 13, fontWeight: "800", color: theme.colors.danger },
  rejectedResponseText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  responseActionRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  acceptOfferBtn: {
    flex: 1.35,
    minHeight: redesign.control.standardHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: theme.colors.success,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    ...theme.shadows.sm,
  },
  acceptOfferText: { fontSize: 13, fontWeight: "800", color: theme.colors.onBrand, textAlign: "center" },
  counterOfferBtn: {
    flex: 1,
    minHeight: redesign.control.standardHeight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: radius.md,
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.secondary,
    paddingHorizontal: 10,
  },
  counterOfferText: { fontSize: 13, fontWeight: "800", color: theme.colors.secondary, textAlign: "center" },
  initialActions: { gap: 9 },
  acceptanceHint: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 16, textAlign: "center" },
  closedResponseBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },
  closedResponseText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 },

  respondForm: { gap: 7},
  formTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  formHint: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
  formLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  formPriceRow: {
    minHeight: redesign.control.standardHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.input,
    borderRadius: radius.md,
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  formRs: { fontSize: 18, fontWeight: "800", color: theme.colors.secondary },
  formPriceInput: { flex: 1, fontSize: 20, fontWeight: "800", color: theme.colors.text, paddingVertical: 8 },
  formMsgInput: {
    backgroundColor: theme.colors.input,
    borderRadius: radius.md,
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.border,
    padding: 10,
    fontSize: 13,
    color: theme.colors.text,
    textAlignVertical: "top",
    minHeight: 72,
  },
  cancelFormBtn: {
    flex: 1,
    minHeight: redesign.control.standardHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },
  cancelFormText: { fontSize: 14, fontWeight: "700", color: theme.colors.textSecondary },
  submitBtn: {
    flex: 2,
    minHeight: redesign.control.standardHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.secondary,
    borderRadius: radius.md,
    ...theme.shadows.sm,
  },
  submitBtnDisabled: { opacity: redesign.visual.disabledOpacity },
  submitText: { fontSize: 14, fontWeight: "800", color: theme.colors.onBrand },

  respondBtn: {
    minHeight: redesign.control.standardHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.secondary,
    borderRadius: radius.md,
    ...theme.shadows.sm,
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
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingVertical: 12,
    borderBottomWidth: redesign.visual.cardBorderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.text,
  },
  videoModalTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.onBrand },
  videoModalClose: { padding: 4 },
});
