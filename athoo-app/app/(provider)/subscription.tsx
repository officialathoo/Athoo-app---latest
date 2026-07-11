import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  audience: "provider" | "customer" | "both";
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

type Sub = {
  id: string;
  planId: string;
  billingPeriod: "monthly" | "yearly";
  status: "pending" | "active" | "expired" | "cancelled" | "rejected";
  amount: number;
  paymentReference: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeSub, setActiveSub] = useState<Sub | null>(null);
  const [history, setHistory] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [payRef, setPayRef] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, subRes] = await Promise.all([
        api.getSubscriptionPlans("provider"),
        api.getMySubscription(),
      ]);
      const allPlans: Plan[] = (plansRes as any).plans ?? [];
      setPlans(allPlans.filter((p) => p.audience === "provider" || p.audience === "both"));
      setActiveSub(subRes.active ?? null);
      setHistory(subRes.history ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load subscription data.");
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function handleSubscribe() {
    if (!selectedPlan) return;
    if (!payRef.trim()) {
      Alert.alert("Required", "Please enter your payment reference / transaction ID.");
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = `subscription-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setSubscribing(true);
    try {
      await api.subscribeToPlan({ planId: selectedPlan.id, billingPeriod: billing, paymentReference: payRef.trim(), clientRequestId: requestIdRef.current });
      showSuccess("Submitted!", "Your subscription request is pending admin approval.");
      requestIdRef.current = null;
      setShowModal(false);
      setPayRef("");
      await load();
    } catch (e: any) {
      showError("Failed", e?.message || "Could not submit subscription.");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCancel() {
    Alert.alert("Cancel Subscription", "Are you sure you want to cancel your current plan?", [
      { text: "Keep Plan", style: "cancel" },
      {
        text: "Cancel Plan",
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            await api.cancelMySubscription();
            showSuccess("Cancelled", "Your subscription has been cancelled.");
            await load();
          } catch (e: any) {
            showError("Failed", e?.message || "Could not cancel subscription.");
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  };

  const STATUS_COLORS: Record<string, string> = {
    active: Colors.success,
    pending: Colors.warning,
    expired: Colors.error,
    cancelled: Colors.textMuted,
    rejected: Colors.error,
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Premium Plans</Text>
          <Text style={styles.headerSub}>Boost your visibility & unlock features</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Icon name="alert-circle" size={40} color={Colors.error} />
          <Text style={{ color: Colors.error, marginTop: 12, fontSize: 15, fontWeight: "700" }}>Failed to Load</Text>
          <Text style={{ color: Colors.textSecondary, marginTop: 6, fontSize: 13, textAlign: "center", paddingHorizontal: 32, lineHeight: 18 }}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: 18, paddingVertical: 11, paddingHorizontal: 32, backgroundColor: Colors.primary, borderRadius: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>

          {/* Active subscription banner */}
          {activeSub && activeSub.status === "active" && (
            <AnimatedCard delay={60}>
              <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.activeBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <View style={styles.activeBannerLeft}>
                  <Icon name="crown" size={22} color="#fff" />
                  <View>
                    <Text style={styles.activeBannerTitle}>Premium Active</Text>
                    <Text style={styles.activeBannerSub}>Expires {formatDate(activeSub.expiresAt)} · {activeSub.billingPeriod}</Text>
                  </View>
                </View>
                <Pressable style={styles.cancelBtn} onPress={handleCancel} disabled={cancelling}>
                  {cancelling ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.cancelBtnText}>Cancel</Text>}
                </Pressable>
              </LinearGradient>
            </AnimatedCard>
          )}

          {activeSub && activeSub.status === "pending" && (
            <AnimatedCard delay={60}>
              <View style={styles.pendingBanner}>
                <Icon name="clock" size={18} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingTitle}>Pending Approval</Text>
                  <Text style={styles.pendingSub}>Your payment is being reviewed. We'll notify you once it's approved.</Text>
                </View>
              </View>
            </AnimatedCard>
          )}

          {/* Billing toggle */}
          <AnimatedCard delay={100}>
            <View style={styles.billingToggle}>
              <Pressable onPress={() => setBilling("monthly")} style={[styles.billingBtn, billing === "monthly" && styles.billingBtnActive]}>
                <Text style={[styles.billingText, billing === "monthly" && styles.billingTextActive]}>Monthly</Text>
              </Pressable>
              <Pressable onPress={() => setBilling("yearly")} style={[styles.billingBtn, billing === "yearly" && styles.billingBtnActive]}>
                <Text style={[styles.billingText, billing === "yearly" && styles.billingTextActive]}>
                  Yearly
                  <Text style={styles.saveBadge}> · Save 20%</Text>
                </Text>
              </Pressable>
            </View>
          </AnimatedCard>

          {/* Plans */}
          {plans.length === 0 ? (
            <AnimatedCard delay={140}>
              <View style={styles.emptyBox}>
                <Icon name="crown" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No plans available</Text>
                <Text style={styles.emptyText}>Premium plans will be available soon.</Text>
              </View>
            </AnimatedCard>
          ) : (
            plans.map((plan, i) => {
              const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
              const isActive = activeSub?.status === "active" && activeSub?.planId === plan.id;
              return (
                <AnimatedCard key={plan.id} delay={140 + i * 60}>
                  <View style={[styles.planCard, isActive && styles.planCardActive]}>
                    {isActive && (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>CURRENT PLAN</Text>
                      </View>
                    )}
                    <View style={styles.planHeader}>
                      <View style={styles.planIconWrap}>
                        <Icon name="crown" size={20} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        {plan.description ? <Text style={styles.planDesc}>{plan.description}</Text> : null}
                      </View>
                      <View style={styles.priceWrap}>
                        <Text style={styles.priceVal}>Rs. {price.toLocaleString()}</Text>
                        <Text style={styles.pricePer}>/{billing === "monthly" ? "mo" : "yr"}</Text>
                      </View>
                    </View>

                    {Array.isArray(plan.features) && plan.features.length > 0 && (
                      <View style={styles.featureList}>
                        {plan.features.map((f, fi) => (
                          <View key={fi} style={styles.featureRow}>
                            <Icon name="check-circle" size={14} color={Colors.success} />
                            <Text style={styles.featureText}>{f}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {!isActive && (!activeSub || activeSub.status !== "pending") && (
                      <Pressable
                        style={styles.subscribeBtn}
                        onPress={() => { setSelectedPlan(plan); setShowModal(true); }}
                      >
                        <Icon name="crown" size={16} color="#fff" />
                        <Text style={styles.subscribeBtnText}>Subscribe for Rs. {price.toLocaleString()}/{billing === "monthly" ? "mo" : "yr"}</Text>
                      </Pressable>
                    )}
                  </View>
                </AnimatedCard>
              );
            })
          )}

          {/* Subscription history */}
          {history.length > 0 && (
            <AnimatedCard delay={300}>
              <View style={styles.historySection}>
                <Text style={styles.historySectionTitle}>Subscription History</Text>
                {history.map((h) => (
                  <View key={h.id} style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyAmt}>Rs. {h.amount.toLocaleString()} · {h.billingPeriod}</Text>
                      <Text style={styles.historyDate}>{formatDate(h.createdAt)}</Text>
                    </View>
                    <View style={[styles.historyStatus, { backgroundColor: (STATUS_COLORS[h.status] ?? Colors.textMuted) + "18" }]}>
                      <Text style={[styles.historyStatusText, { color: STATUS_COLORS[h.status] ?? Colors.textMuted }]}>{h.status.toUpperCase()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </AnimatedCard>
          )}

          {/* Info note */}
          <AnimatedCard delay={360}>
            <View style={styles.noteBox}>
              <Icon name="info" size={14} color={Colors.primary} />
              <Text style={styles.noteText}>
                After subscribing, send payment via EasyPaisa / JazzCash to our official number and enter the transaction ID. Admin will activate your plan within 24 hours.
              </Text>
            </View>
          </AnimatedCard>

        </ScrollView>
      )}

      {/* Subscribe Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Subscribe to {selectedPlan?.name}</Text>
              <Pressable onPress={() => setShowModal(false)} style={styles.modalCloseBtn}>
                <Icon name="x" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                <View style={styles.modalPriceRow}>
                  <Text style={styles.modalPriceLabel}>Amount Due</Text>
                  <Text style={styles.modalPriceVal}>
                    Rs. {(billing === "monthly" ? (selectedPlan?.priceMonthly ?? 0) : (selectedPlan?.priceYearly ?? 0)).toLocaleString()}
                    <Text style={styles.modalPricePer}>/{billing === "monthly" ? "month" : "year"}</Text>
                  </Text>
                </View>

                <View style={styles.payInstructions}>
                  <Text style={styles.payInstrTitle}>How to pay</Text>
                  <Text style={styles.payInstrText}>1. Send payment to EasyPaisa / JazzCash: <Text style={styles.payInstrBold}>0300-1234567</Text></Text>
                  <Text style={styles.payInstrText}>2. Copy the transaction / reference ID</Text>
                  <Text style={styles.payInstrText}>3. Paste it below and tap Submit</Text>
                </View>

                <Text style={styles.inputLabel}>Transaction / Reference ID</Text>
                <TextInput
                  style={styles.refInput}
                  value={payRef}
                  onChangeText={setPayRef}
                  placeholder="e.g. EP1234567890"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />

                <Pressable
                  style={[styles.submitBtn, (!payRef.trim() || subscribing) && styles.btnDisabled]}
                  onPress={handleSubscribe}
                  disabled={!payRef.trim() || subscribing}
                >
                  {subscribing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="crown" size={18} color="#fff" />
                      <Text style={styles.submitBtnText}>Submit for Approval</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 14 },

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

  activeBanner: {
    borderRadius: 16, padding: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  activeBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  activeBannerTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  activeBannerSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  cancelBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  pendingBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.warning + "15", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.warning + "30",
  },
  pendingTitle: { fontSize: 14, fontWeight: "700", color: Colors.warning },
  pendingSub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 2 },

  billingToggle: {
    flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  billingBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 11 },
  billingBtnActive: { backgroundColor: Colors.white, shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 },
  billingText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  billingTextActive: { color: Colors.primary },
  saveBadge: { fontSize: 11, color: Colors.success, fontWeight: "700" },

  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },

  planCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 18,
    borderWidth: 1.5, borderColor: Colors.border, gap: 14,
  },
  planCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "06" },
  activePill: {
    alignSelf: "flex-start", backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  activePillText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  planIconWrap: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.primary + "12",
    alignItems: "center", justifyContent: "center",
  },
  planName: { fontSize: 16, fontWeight: "800", color: Colors.text },
  planDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  priceWrap: { alignItems: "flex-end" },
  priceVal: { fontSize: 18, fontWeight: "900", color: Colors.primary },
  pricePer: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },

  featureList: { gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 13, color: Colors.text, lineHeight: 18 },

  subscribeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  subscribeBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },

  historySection: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  historySectionTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  historyAmt: { fontSize: 13, fontWeight: "700", color: Colors.text },
  historyDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  historyStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  historyStatusText: { fontSize: 11, fontWeight: "700" },

  noteBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.primary + "0D",
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.primary + "25",
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 18, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "85%", overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  modalBody: { padding: 20, gap: 16 },

  modalPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.primary + "0D", borderRadius: 14, padding: 14 },
  modalPriceLabel: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  modalPriceVal: { fontSize: 22, fontWeight: "900", color: Colors.primary },
  modalPricePer: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },

  payInstructions: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, gap: 6 },
  payInstrTitle: { fontSize: 13, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  payInstrText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  payInstrBold: { fontWeight: "700", color: Colors.text },

  inputLabel: { fontSize: 14, fontWeight: "700", color: Colors.text },
  refInput: {
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontWeight: "700", color: Colors.text,
    letterSpacing: 1,
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16,
  },
  submitBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  btnDisabled: { opacity: 0.5 },
});
