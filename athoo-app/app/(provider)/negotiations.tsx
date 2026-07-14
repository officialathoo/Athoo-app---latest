import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
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
import { useAuth } from "@/context/AuthContext";
import { useNegotiation, Negotiation } from "@/context/NegotiationContext";
import { useNotifications } from "@/context/NotificationContext";
import { apiErrorToMessage } from "@/lib/apiError";

export default function ProviderNegotiationsScreen() {
  const { user } = useAuth();
  const { negId, action } = useLocalSearchParams<{ negId?: string; action?: string }>();
  const { getMyNegotiations, acceptOffer, rejectOffer, counterOffer } = useNegotiation();
  const { push } = useNotifications();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const myNegs = user ? getMyNegotiations(user.id) : [];

  const selectedNegotiation = useMemo(() => {
    if (!negId) return null;
    return myNegs.find((n) => n.id === negId) || null;
  }, [myNegs, negId]);

  const getStatusColor = (status: string) => {
    if (status === "customer_offer") {
      return { bg: "#FEF9C3", text: "#CA8A04", label: "New Offer" };
    }
    if (status === "provider_counter") {
      return { bg: "#EFF6FF", text: Colors.primary, label: "Countered" };
    }
    if (status === "accepted") {
      return { bg: "#F0FDF4", text: "#16A34A", label: "Accepted" };
    }
    return { bg: "#FEF2F2", text: "#DC2626", label: "Rejected" };
  };

  const handleAccept = (neg: Negotiation) => {
    Alert.alert(
      "Accept Offer",
      `Accept Rs. ${neg.customerOffer} from ${neg.customerName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            if (processingId) return;
            try {
              setProcessingId(neg.id);
              const res = await acceptOffer(neg.id);
              push({
                type: "success",
                title: "Offer Accepted!",
                message: `You accepted Rs. ${neg.customerOffer} for ${neg.service}`,
                role: "provider",
                negotiationId: neg.id,
              });
              // Navigate to the auto-created booking
              const bookingId = (res as any)?.bookingId ?? neg.bookingId;
              if (bookingId) {
                router.push({ pathname: "/(provider)/job-detail", params: { bookingId } });
              } else {
                router.back();
              }
            } catch (error: any) {
              Alert.alert("Unable to accept", apiErrorToMessage(error, "Could not accept this offer. Please try again."));
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (neg: Negotiation) => {
    Alert.alert("Reject Offer", "Decline this price offer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          if (processingId) return;
          try {
            setProcessingId(neg.id);
            await rejectOffer(neg.id);
            push({
              type: "warning",
              title: "Offer Rejected",
              message: `You declined Rs. ${neg.customerOffer} for ${neg.service}`,
              role: "provider",
              negotiationId: neg.id,
            });
          } catch (error: any) {
            Alert.alert("Unable to reject", apiErrorToMessage(error, "Could not reject this offer. Please try again."));
          } finally {
            setProcessingId(null);
          }
        },
      },
    ]);
  };

  const handleCounter = async (neg: Negotiation) => {
    const amount = parseInt(counterAmounts[neg.id] || "0", 10);

    if (!amount || amount < 100) {
      Alert.alert("Invalid", "Enter a valid counter amount.");
      return;
    }

    if (processingId) return;
    try {
      setProcessingId(neg.id);
      await counterOffer(
      neg.id,
      amount,
      `My counter offer is Rs. ${amount} for ${neg.service}`,
      user?.name || "Provider"
    );

    push({
      type: "negotiation",
      title: "Counter Sent!",
      message: `You countered Rs. ${amount} for ${neg.service}`,
      role: "provider",
      negotiationId: neg.id,
    });

      setCounterAmounts((p) => ({ ...p, [neg.id]: "" }));
    } catch (error: any) {
      Alert.alert("Unable to counter", apiErrorToMessage(error, "Could not send the counter offer. Please try again."));
    } finally {
      setProcessingId(null);
    }
  };

  useEffect(() => {
    if (!selectedNegotiation || !action) return;
    if (selectedNegotiation.status !== "customer_offer") return;

    if (action === "accept") {
      handleAccept(selectedNegotiation);
    } else if (action === "reject") {
      handleReject(selectedNegotiation);
    }
  }, [action, selectedNegotiation]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>My Negotiations</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {myNegs.filter((n) => n.status === "customer_offer").length} new
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}>
        {selectedNegotiation ? (
          <View style={[styles.negCard, styles.selectedCard]}>
            <View style={styles.negHeader}>
              <View style={styles.negServiceIcon}>
                <Icon name="dollar-sign" size={20} color={Colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.negService}>{selectedNegotiation.service}</Text>
                <Text style={styles.negCustomer}>
                  from {selectedNegotiation.customerName}
                </Text>
              </View>
              <View
                style={[
                  styles.negStatusBadge,
                  {
                    backgroundColor: getStatusColor(selectedNegotiation.status).bg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.negStatusText,
                    { color: getStatusColor(selectedNegotiation.status).text },
                  ]}
                >
                  {getStatusColor(selectedNegotiation.status).label}
                </Text>
              </View>
            </View>

            {/* Location, date, time, description details */}
            {(selectedNegotiation.address || selectedNegotiation.scheduledDate || (selectedNegotiation as any).description) && (
              <View style={styles.detailsBox}>
                {selectedNegotiation.address ? (
                  <View style={styles.detailRow}>
                    <Icon name="map-pin" size={13} color={Colors.textSecondary} />
                    <Text style={styles.detailText} numberOfLines={2}>{selectedNegotiation.address}</Text>
                  </View>
                ) : null}
                {selectedNegotiation.scheduledDate ? (
                  <View style={styles.detailRow}>
                    <Icon name="calendar" size={13} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>
                      {selectedNegotiation.scheduledDate}
                      {selectedNegotiation.scheduledTime ? ` at ${selectedNegotiation.scheduledTime}` : ""}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Icon name="file-text" size={13} color={Colors.textSecondary} />
                  <Text style={[styles.detailText, !(selectedNegotiation as any).description && { color: Colors.textMuted, fontStyle: "italic" }]}>
                    {(selectedNegotiation as any).description || "No additional details provided."}
                  </Text>
                </View>
              </View>
            )}

            {Array.isArray((selectedNegotiation as any).mediaUrls) && (selectedNegotiation as any).mediaUrls.length > 0 ? (
              <View style={styles.mediaBox}>
                <Text style={styles.mediaTitle}>Customer Attachments</Text>
                {((selectedNegotiation as any).mediaUrls || []).map((url: string, mediaIndex: number) => (
                  <Text key={`${url}-${mediaIndex}`} style={styles.mediaLink} numberOfLines={1}>Attachment {mediaIndex + 1}</Text>
                ))}
              </View>
            ) : null}

            <View style={styles.offerRow}>
              <View style={styles.offerCard}>
                <Text style={styles.offerLabel}>Customer Offer / hour</Text>
                <Text style={[styles.offerAmt, { color: Colors.primary }]}>
                  Rs. {selectedNegotiation.customerOffer}
                </Text>
              </View>

              {selectedNegotiation.providerCounter != null && (
                <View style={styles.offerCard}>
                  <Text style={styles.offerLabel}>Your Counter / hour</Text>
                  <Text style={[styles.offerAmt, { color: Colors.secondary }]}>
                    Rs. {selectedNegotiation.providerCounter}
                  </Text>
                </View>
              )}

              {selectedNegotiation.finalPrice != null && (
                <View style={styles.offerCard}>
                  <Text style={styles.offerLabel}>Final Hourly Rate</Text>
                  <Text style={[styles.offerAmt, { color: "#22C55E" }]}>
                    Rs. {selectedNegotiation.finalPrice}
                  </Text>
                </View>
              )}
            </View>

            {selectedNegotiation.status === "customer_offer" && (
              <>
                <View style={styles.counterRow}>
                  <TextInput
                    style={styles.counterInput}
                    placeholder="Your counter amount (Rs.)"
                    value={counterAmounts[selectedNegotiation.id] || ""}
                    onChangeText={(v) =>
                      setCounterAmounts((p) => ({
                        ...p,
                        [selectedNegotiation.id]: v.replace(/[^0-9]/g, ""),
                      }))
                    }
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    autoFocus={action === "counter"}
                  />
                  <Pressable
                    style={[styles.counterBtn, processingId === selectedNegotiation.id && { opacity: 0.55 }]}
                    disabled={processingId === selectedNegotiation.id}
                    onPress={() => handleCounter(selectedNegotiation)}
                  >
                    <Icon name="refresh-cw" size={14} color="#fff" />
                    <Text style={styles.counterBtnText}>Counter</Text>
                  </Pressable>
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.acceptBtn, processingId === selectedNegotiation.id && { opacity: 0.55 }]}
                    disabled={processingId === selectedNegotiation.id}
                    onPress={() => handleAccept(selectedNegotiation)}
                  >
                    <Icon name="check" size={15} color="#fff" />
                    <Text style={styles.acceptBtnText}>
                      Accept Rs. {selectedNegotiation.customerOffer}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.rejectBtn, processingId === selectedNegotiation.id && { opacity: 0.55 }]}
                    disabled={processingId === selectedNegotiation.id}
                    onPress={() => handleReject(selectedNegotiation)}
                  >
                    <Icon name="x" size={15} color={Colors.error} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </Pressable>
                </View>
              </>
            )}

            {selectedNegotiation.status === "provider_counter" && (
              <View style={styles.waitingRow}>
                <View style={styles.waitingBadge}>
                  <Icon name="clock" size={13} color={Colors.textMuted} />
                  <Text style={styles.waitingText}>
                    Waiting for customer to respond...
                  </Text>
                </View>

                <Pressable
                  style={styles.cancelBtn}
                  onPress={() =>
                    Alert.alert(
                      "Cancel Negotiation",
                      `Withdraw your counter offer of Rs. ${selectedNegotiation.providerCounter}? The negotiation will be closed.`,
                      [
                        { text: "Keep", style: "cancel" },
                        {
                          text: "Cancel",
                          style: "destructive",
                          onPress: () => {
                            rejectOffer(selectedNegotiation.id);
                            push({
                              type: "warning",
                              title: "Negotiation Cancelled",
                              message: `Negotiation for ${selectedNegotiation.service} cancelled`,
                              role: "provider",
                              negotiationId: selectedNegotiation.id,
                            });
                          },
                        },
                      ]
                    )
                  }
                >
                  <Icon name="x" size={13} color={Colors.textSecondary} />
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            )}

            {(selectedNegotiation.status === "accepted" ||
              selectedNegotiation.status === "rejected") && (
              <View
                style={[
                  styles.closedBadge,
                  selectedNegotiation.status === "accepted"
                    ? styles.closedAccepted
                    : styles.closedRejected,
                ]}
              >
                <Icon
                  name={
                    selectedNegotiation.status === "accepted"
                      ? "check-circle"
                      : "x-circle"
                  }
                  size={14}
                  color={
                    selectedNegotiation.status === "accepted"
                      ? "#16A34A"
                      : Colors.error
                  }
                />
                <Text
                  style={[
                    styles.closedText,
                    {
                      color:
                        selectedNegotiation.status === "accepted"
                          ? "#16A34A"
                          : Colors.error,
                    },
                  ]}
                >
                  {selectedNegotiation.status === "accepted"
                    ? `Deal at Rs. ${selectedNegotiation.finalPrice}`
                    : "Negotiation closed"}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {myNegs.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="dollar-sign" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Negotiations</Text>
            <Text style={styles.emptySub}>Customer price offers will show up here</Text>
          </View>
        ) : (
          myNegs.map((neg, index) => {
            const st = getStatusColor(neg.status);

            return (
              <Pressable
                key={String(neg.id || `neg-${index}`)}
                style={[
                  styles.negCard,
                  neg.id === negId && styles.listSelectedCard,
                ]}
                onPress={() =>
                  router.replace({
                    pathname: "/(provider)/negotiations",
                    params: { negId: neg.id },
                  })
                }
              >
                <View style={styles.negHeader}>
                  <View style={styles.negServiceIcon}>
                    <Icon name="dollar-sign" size={20} color={Colors.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.negService}>{neg.service}</Text>
                    <Text style={styles.negCustomer}>from {neg.customerName}</Text>
                  </View>
                  <View style={[styles.negStatusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.negStatusText, { color: st.text }]}>
                      {st.label}
                    </Text>
                  </View>
                </View>

                {Array.isArray((selectedNegotiation as any).mediaUrls) && (selectedNegotiation as any).mediaUrls.length > 0 ? (
              <View style={styles.mediaBox}>
                <Text style={styles.mediaTitle}>Customer Attachments</Text>
                {((selectedNegotiation as any).mediaUrls || []).map((url: string, mediaIndex: number) => (
                  <Text key={`${url}-${mediaIndex}`} style={styles.mediaLink} numberOfLines={1}>Attachment {mediaIndex + 1}</Text>
                ))}
              </View>
            ) : null}

            <View style={styles.offerRow}>
                  <View style={styles.offerCard}>
                    <Text style={styles.offerLabel}>Customer Offer / hour</Text>
                    <Text style={[styles.offerAmt, { color: Colors.primary }]}>
                      Rs. {neg.customerOffer}
                    </Text>
                  </View>

                  {neg.providerCounter != null && (
                    <View style={styles.offerCard}>
                      <Text style={styles.offerLabel}>Your Counter / hour</Text>
                      <Text style={[styles.offerAmt, { color: Colors.secondary }]}>
                        Rs. {neg.providerCounter}
                      </Text>
                    </View>
                  )}

                  {neg.finalPrice != null && (
                    <View style={styles.offerCard}>
                      <Text style={styles.offerLabel}>Final Hourly Rate</Text>
                      <Text style={[styles.offerAmt, { color: "#22C55E" }]}>
                        Rs. {neg.finalPrice}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  countBadge: {
    backgroundColor: Colors.secondary + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  countText: { fontSize: 12, fontWeight: "700", color: Colors.secondary },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 60 },
  empty: { alignItems: "center", paddingVertical: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  negCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  selectedCard: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "05",
  },
  listSelectedCard: {
    borderColor: Colors.primary,
  },
  negHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  negServiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: Colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  negService: { fontSize: 15, fontWeight: "800", color: Colors.text },
  negCustomer: { fontSize: 12, color: Colors.textSecondary },
  negStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  negStatusText: { fontSize: 11, fontWeight: "700" },
  mediaBox: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, marginTop: 12 },
  mediaTitle: { fontSize: 12, fontWeight: "800", color: Colors.text, marginBottom: 6 },
  mediaLink: { fontSize: 12, color: Colors.primary, marginTop: 3 },
  offerRow: { flexDirection: "row", gap: 8 },
  offerCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  offerLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  offerAmt: { fontSize: 18, fontWeight: "800" },
  counterRow: { flexDirection: "row", gap: 8 },
  counterInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  counterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  counterBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  waitingRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  waitingBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  waitingText: { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.error + "10",
    borderWidth: 1,
    borderColor: Colors.error + "25",
  },
  cancelBtnText: { fontSize: 12, fontWeight: "600", color: Colors.error },
  closedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closedAccepted: { backgroundColor: "#F0FDF4" },
  closedRejected: { backgroundColor: "#FEF2F2" },
  closedText: { fontSize: 13, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 10 },
  acceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#22C55E",
    borderRadius: 12,
    paddingVertical: 12,
  },
  acceptBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.error + "10",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.error + "30",
  },
  rejectBtnText: { fontSize: 13, fontWeight: "700", color: Colors.error },
  detailsBox: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: Colors.text,
    flex: 1,
    lineHeight: 18,
  },
});
