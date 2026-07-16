import { apiErrorToMessage } from "@/lib/apiError";
import { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState, useMemo } from "react";
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
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { uploadPickedImage, PrivateImage } from "@/services/storage";
import { pickImageWithSourceChoice } from "@/utils/mediaPicker";

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

type PaymentAccount = {
  id: string;
  label: string;
  bankName?: string | null;
  accountTitle: string;
  accountNumber: string;
  iban?: string | null;
  instructions?: string | null;
};

type Sub = {
  id: string;
  planId: string;
  billingPeriod: "monthly" | "yearly";
  status: "pending" | "active" | "expired" | "cancelled" | "rejected" | "cancellation_scheduled";
  amount: number;
  paymentReference: string | null;
  screenshotUrl?: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export default function SubscriptionScreen() {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate: formatLocalizedDate, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeSub, setActiveSub] = useState<Sub | null>(null);
  const [history, setHistory] = useState<Sub[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [payRef, setPayRef] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const selectedAmount = selectedPlan
    ? (billing === "monthly" ? selectedPlan.priceMonthly : selectedPlan.priceYearly)
    : 0;
  const paymentRequired = selectedAmount > 0;
  const paymentAccountReady = !paymentRequired || paymentAccounts.length > 0;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, subRes, accountsRes] = await Promise.all([
        api.getSubscriptionPlans("provider"),
        api.getMySubscription(),
        api.getPaymentAccounts().catch(() => ({ accounts: [] })),
      ]);
      const allPlans: Plan[] = (plansRes as any).plans ?? [];
      setPlans(allPlans.filter((p) => p.audience === "provider" || p.audience === "both"));
      setActiveSub(subRes.active ?? null);
      setHistory(subRes.history ?? []);
      setPaymentAccounts((accountsRes.accounts ?? []) as PaymentAccount[]);
    } catch (e: any) {
      setError(apiErrorToMessage(e, tr("We couldn't load subscription plans. Please try again.")));
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function pickScreenshot() {
    const result = await pickImageWithSourceChoice(
      { mediaTypes: "images" as const, quality: 0.7, allowsEditing: false, aspect: [4, 3] },
      { title: tr("Add payment screenshot"), message: tr("Take a new photo or choose one from your gallery."), camera: tr("Camera"), gallery: tr("Gallery"), cancel: tr("Cancel") },
    );
    if (!result || result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingScreenshot(true);
    try {
      const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase();
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const objectPath = await uploadPickedImage(asset.uri, `premium-payment-screenshot.${ext}`, contentType, undefined, "private");
      setScreenshot(objectPath);
    } catch (e: any) {
      showError(tr("Upload Failed"), apiErrorToMessage(e, tr("We couldn't upload the screenshot. Please try again.")));
    } finally {
      setUploadingScreenshot(false);
    }
  }

  async function handleSubscribe() {
    if (!selectedPlan) return;
    if (paymentRequired && !paymentAccountReady) {
      Alert.alert(tr("Payment account unavailable"), tr("No Athoo payment account is available right now. Please contact Athoo Support before paying."));
      return;
    }
    if (paymentRequired && !payRef.trim()) {
      Alert.alert(tr("Payment reference required"), tr("Please enter your payment reference or transaction ID."));
      return;
    }
    if (paymentRequired && !screenshot) {
      Alert.alert(tr("Payment screenshot required"), tr("Please add a payment screenshot before submitting."));
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = `subscription-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setSubscribing(true);
    try {
      await api.subscribeToPlan({
        planId: selectedPlan.id,
        billingPeriod: billing,
        paymentReference: paymentRequired ? payRef.trim() : undefined,
        screenshotUrl: paymentRequired ? screenshot ?? undefined : undefined,
        clientRequestId: requestIdRef.current,
      });
      showSuccess(tr("Request submitted"), tr("Your subscription request is pending admin approval."));
      requestIdRef.current = null;
      setShowModal(false);
      setPayRef("");
      setScreenshot(null);
      await load();
    } catch (e: any) {
      showError(tr("Unable to submit request"), apiErrorToMessage(e, tr("We couldn't submit your subscription request. Please try again.")));
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCancel() {
    Alert.alert(tr("Cancel Subscription"), tr("Are you sure you want to cancel your current plan?"), [
      { text: tr("Keep Plan"), style: "cancel" },
      {
        text: tr("Cancel Plan"),
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            await api.cancelMySubscription();
            showSuccess(tr("Subscription cancelled"), tr("Your subscription has been cancelled."));
            await load();
          } catch (e: any) {
            showError(tr("Unable to cancel subscription"), apiErrorToMessage(e, tr("We couldn't cancel your subscription. Please try again.")));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return "–";
    return formatLocalizedDate(iso);
  };

  const STATUS_COLORS: Record<string, string> = {
    active: theme.colors.success,
    pending: theme.colors.warning,
    expired: theme.colors.danger,
    cancelled: theme.colors.textMuted,
    rejected: theme.colors.danger,
    cancellation_scheduled: theme.colors.warning,
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr("Back")}>
          <Icon name={isUrdu ? "arrow-right" : "arrow-left"} size={20} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{tr("Premium Plans")}</Text>
          <Text style={styles.headerSub}>{tr("Boost your visibility & unlock features")}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Icon name="alert-circle" size={40} color={theme.colors.danger} />
          <Text style={{ color: theme.colors.danger, marginTop: 12, fontSize: 15, fontWeight: "700" }}>{tr("Failed to Load")}</Text>
          <Text style={{ color: theme.colors.textSecondary, marginTop: 6, fontSize: 13, textAlign: "center", paddingHorizontal: 32, lineHeight: 18 }}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: 18, paddingVertical: 11, paddingHorizontal: 32, backgroundColor: theme.colors.primary, borderRadius: 12 }}>
            <Text style={{ color: theme.colors.white, fontWeight: "600", fontSize: 14 }}>{tr("Retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>

          {/* Active subscription banner */}
          {activeSub && activeSub.status === "active" && (
            <AnimatedCard delay={60}>
              <LinearGradient colors={[theme.colors.primary, theme.colors.secondary]} style={styles.activeBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <View style={styles.activeBannerLeft}>
                  <Icon name="crown" size={22} color={theme.colors.onBrand} />
                  <View>
                    <Text style={styles.activeBannerTitle}>{tr("Premium Active")}</Text>
                    <Text style={styles.activeBannerSub}>Expires {formatDate(activeSub.expiresAt)} · {activeSub.billingPeriod}</Text>
                  </View>
                </View>
                <Pressable style={styles.cancelBtn} onPress={handleCancel} disabled={cancelling}>
                  {cancelling ? <ActivityIndicator size="small" color={theme.colors.onBrand} /> : <Text style={styles.cancelBtnText}>{tr("Cancel")}</Text>}
                </Pressable>
              </LinearGradient>
            </AnimatedCard>
          )}

          {/* Cancellation scheduled banner — benefits remain active until expiry, no refund */}
          {activeSub && activeSub.status === "cancellation_scheduled" && (
            <AnimatedCard delay={60}>
              <View style={styles.cancelScheduledBanner}>
                <Icon name="clock" size={20} color={theme.colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cancelScheduledTitle}>{tr("Cancellation Scheduled")}</Text>
                  <Text style={styles.cancelScheduledSub}>
                    Your Premium benefits stay active until {formatDate(activeSub.expiresAt)}. No refund is issued for the remaining period, and your plan will not renew.
                  </Text>
                </View>
              </View>
            </AnimatedCard>
          )}

          {activeSub && activeSub.status === "pending" && (
            <AnimatedCard delay={60}>
              <View style={styles.pendingBanner}>
                <Icon name="clock" size={18} color={theme.colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingTitle}>{tr("Pending Approval")}</Text>
                  <Text style={styles.pendingSub}>{tr("Your payment is being reviewed. We will notify you after approval.")}</Text>
                </View>
              </View>
            </AnimatedCard>
          )}

          {/* Billing toggle */}
          <AnimatedCard delay={100}>
            <View style={styles.billingToggle}>
              <Pressable onPress={() => setBilling("monthly")} style={[styles.billingBtn, billing === "monthly" && styles.billingBtnActive]}>
                <Text style={[styles.billingText, billing === "monthly" && styles.billingTextActive]}>{tr("Monthly")}</Text>
              </Pressable>
              <Pressable onPress={() => setBilling("yearly")} style={[styles.billingBtn, billing === "yearly" && styles.billingBtnActive]}>
                <Text style={[styles.billingText, billing === "yearly" && styles.billingTextActive]}>
                  Yearly
                  <Text style={styles.saveBadge}> · {tr("Save 20%")}</Text>
                </Text>
              </Pressable>
            </View>
          </AnimatedCard>

          {/* Plans */}
          {plans.length === 0 ? (
            <AnimatedCard delay={140}>
              <View style={styles.emptyBox}>
                <Icon name="crown" size={36} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>{tr("No plans available")}</Text>
                <Text style={styles.emptyText}>{tr("Premium plans will be available soon.")}</Text>
              </View>
            </AnimatedCard>
          ) : (
            plans.map((plan, i) => {
              const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
              const isActive = (activeSub?.status === "active" || activeSub?.status === "cancellation_scheduled") && activeSub?.planId === plan.id;
              return (
                <AnimatedCard key={plan.id} delay={140 + i * 60}>
                  <View style={[styles.planCard, isActive && styles.planCardActive]}>
                    {isActive && (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>{tr("CURRENT PLAN")}</Text>
                      </View>
                    )}
                    <View style={styles.planHeader}>
                      <View style={styles.planIconWrap}>
                        <Icon name="crown" size={20} color={theme.colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        {plan.description ? <Text style={styles.planDesc}>{plan.description}</Text> : null}
                      </View>
                      <View style={styles.priceWrap}>
                        <Text style={styles.priceVal}>{formatCurrency(price)}</Text>
                        <Text style={styles.pricePer}>/{billing === "monthly" ? "mo" : "yr"}</Text>
                      </View>
                    </View>

                    {Array.isArray(plan.features) && plan.features.length > 0 && (
                      <View style={styles.featureList}>
                        {plan.features.map((f, fi) => (
                          <View key={fi} style={styles.featureRow}>
                            <Icon name="check-circle" size={14} color={theme.colors.success} />
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
                        <Icon name="crown" size={16} color={theme.colors.onBrand} />
                        <Text style={styles.subscribeBtnText}>Subscribe for {formatCurrency(price)}/{billing === "monthly" ? "mo" : "yr"}</Text>
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
                <Text style={styles.historySectionTitle}>{tr("Subscription History")}</Text>
                {history.map((h) => (
                  <View key={h.id} style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyAmt}>{formatCurrency(h.amount)} · {tr(h.billingPeriod === "monthly" ? "Monthly" : "Yearly")}</Text>
                      <Text style={styles.historyDate}>{formatDate(h.createdAt)}</Text>
                    </View>
                    <View style={[styles.historyStatus, { backgroundColor: (STATUS_COLORS[h.status] ?? theme.colors.textMuted) + "18" }]}>
                      <Text style={[styles.historyStatusText, { color: STATUS_COLORS[h.status] ?? theme.colors.textMuted }]}>{tr(h.status.replaceAll("_", " ")).toUpperCase()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </AnimatedCard>
          )}

          {/* Info note */}
          <AnimatedCard delay={360}>
            <View style={styles.noteBox}>
              <Icon name="info" size={14} color={theme.colors.primary} />
              <Text style={styles.noteText}>
                {tr("After subscribing, use one of the active Athoo payment accounts and enter the transaction ID. We will notify you after review.")}
              </Text>
            </View>
          </AnimatedCard>

        </ScrollView>
      )}

      {/* Subscribe Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => { setShowModal(false); setPayRef(""); setScreenshot(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tr("Subscribe to {{plan}}", { plan: selectedPlan?.name ?? "" })}</Text>
              <Pressable onPress={() => { setShowModal(false); setPayRef(""); setScreenshot(null); }} style={styles.modalCloseBtn} accessibilityRole="button" accessibilityLabel={tr("Close")}>
                <Icon name="x" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                <View style={styles.modalPriceRow}>
                  <Text style={styles.modalPriceLabel}>{tr("Amount Due")}</Text>
                  <Text style={styles.modalPriceVal}>
                    {formatCurrency(selectedAmount)}
                    <Text style={styles.modalPricePer}>/{billing === "monthly" ? tr("month") : tr("year")}</Text>
                  </Text>
                </View>

                {paymentRequired ? (
                  <View style={styles.payInstructions}>
                    <Text style={styles.payInstrTitle}>{tr("Athoo Payment Accounts")}</Text>
                    {paymentAccounts.length === 0 ? (
                      <View style={styles.paymentUnavailable} accessibilityRole="alert">
                        <Icon name="alert-circle" size={18} color={theme.colors.warning} />
                        <Text style={styles.paymentUnavailableText}>{tr("No Athoo payment account is available right now. Please contact Athoo Support before paying.")}</Text>
                      </View>
                    ) : (
                      paymentAccounts.map((account) => (
                        <View key={account.id} style={styles.paymentAccountCard}>
                          <View style={styles.paymentAccountHeader}>
                            <Icon name="credit-card" size={17} color={theme.colors.primary} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.paymentAccountLabel}>{account.label}</Text>
                              {account.bankName ? <Text style={styles.paymentAccountBank}>{account.bankName}</Text> : null}
                            </View>
                          </View>
                          <Text style={styles.paymentAccountDetail}>{tr("Account Title")}: <Text style={styles.paymentAccountValue}>{account.accountTitle}</Text></Text>
                          <Text style={styles.paymentAccountDetail}>{tr("Account Number")}: <Text style={styles.paymentAccountValue}>{account.accountNumber}</Text></Text>
                          {account.iban ? <Text style={styles.paymentAccountDetail}>{tr("IBAN")}: <Text style={styles.paymentAccountValue}>{account.iban}</Text></Text> : null}
                          {account.instructions ? <Text style={styles.paymentAccountInstructions}>{account.instructions}</Text> : null}
                        </View>
                      ))
                    )}
                    <Text style={styles.payInstrText}>{tr("After paying, enter the transaction or reference ID and attach the payment screenshot.")}</Text>
                  </View>
                ) : (
                  <View style={styles.freePlanNotice}>
                    <Icon name="check-circle" size={18} color={theme.colors.success} />
                    <Text style={styles.freePlanText}>{tr("No payment is required for this plan.")}</Text>
                  </View>
                )}

                {paymentRequired && (
                  <>
                <Text style={styles.inputLabel}>{tr("Transaction / Reference ID")}</Text>
                <TextInput
                  style={styles.refInput}
                  value={payRef}
                  onChangeText={setPayRef}
                  placeholder={tr("e.g. EP1234567890")}
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="characters"
                />

                <Text style={styles.inputLabel}>{tr("Payment Screenshot")}</Text>
                <Pressable style={styles.photoBtn} onPress={pickScreenshot} disabled={uploadingScreenshot} accessibilityRole="button" accessibilityLabel={tr("Add payment screenshot")} accessibilityState={{ disabled: uploadingScreenshot }}>
                  {uploadingScreenshot ? (
                    <View style={styles.photoBtnInner}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={styles.photoBtnText}>{tr("Uploading…")}</Text>
                    </View>
                  ) : screenshot ? (
                    <View style={styles.photoPreviewRow}>
                      <PrivateImage objectPath={screenshot} style={styles.photoPreview} />
                      <Pressable style={styles.photoRemove} onPress={() => setScreenshot(null)}>
                        <Icon name="x" size={14} color={theme.colors.danger} />
                        <Text style={styles.photoRemoveText}>{tr("Remove & replace")}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.photoBtnInner}>
                      <Icon name="image" size={22} color={theme.colors.primary} />
                      <Text style={styles.photoBtnText}>{tr("Attach Payment Screenshot")}</Text>
                      <Text style={styles.photoBtnSub}>{tr("Camera or gallery")}</Text>
                    </View>
                  )}
                </Pressable>

                  </>
                )}
                <Pressable
                  style={[styles.submitBtn, ((paymentRequired && (!payRef.trim() || !screenshot || !paymentAccountReady)) || subscribing || uploadingScreenshot) && styles.btnDisabled]}
                  onPress={handleSubscribe}
                  disabled={(paymentRequired && (!payRef.trim() || !screenshot || !paymentAccountReady)) || subscribing || uploadingScreenshot}
                >
                  {subscribing ? (
                    <ActivityIndicator size="small" color={theme.colors.onBrand} />
                  ) : (
                    <>
                      <Icon name="crown" size={18} color={theme.colors.onBrand} />
                      <Text style={styles.submitBtnText}>{tr("Submit for Approval")}</Text>
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

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, gap: 14 },

  header: {
    backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  headerSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },

  activeBanner: {
    borderRadius: 16, padding: 16,
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  activeBannerLeft: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, flex: 1 },
  activeBannerTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.onBrand },
  activeBannerSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  cancelBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: theme.colors.onBrand },

  pendingBanner: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 10,
    backgroundColor: theme.colors.warning + "15", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.colors.warning + "30",
  },
  pendingTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.warning },
  pendingSub: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18, marginTop: 2 },

  billingToggle: {
    flexDirection: isUrdu ? "row-reverse" : "row", backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  billingBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 11 },
  billingBtnActive: { backgroundColor: theme.colors.surface, ...theme.shadows.sm },
  billingText: { fontSize: 14, fontWeight: "700", color: theme.colors.textSecondary },
  billingTextActive: { color: theme.colors.primary },
  saveBadge: { fontSize: 11, color: theme.colors.success, fontWeight: "700" },

  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center" },

  planCard: {
    backgroundColor: theme.colors.surface, borderRadius: 18, padding: 18,
    borderWidth: 1.5, borderColor: theme.colors.border, gap: 14,
  },
  planCardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "06" },
  activePill: {
    alignSelf: "flex-start", backgroundColor: theme.colors.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  activePillText: { fontSize: 10, fontWeight: "800", color: theme.colors.onBrand, letterSpacing: 1 },
  planHeader: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12 },
  planIconWrap: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: theme.colors.primary + "12",
    alignItems: "center", justifyContent: "center",
  },
  planName: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  planDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  priceWrap: { alignItems: "flex-end" },
  priceVal: { fontSize: 18, fontWeight: "900", color: theme.colors.primary },
  pricePer: { fontSize: 11, color: theme.colors.textMuted, fontWeight: "600" },

  featureList: { gap: 8 },
  featureRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 13, color: theme.colors.text, lineHeight: 18 },

  subscribeBtn: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  subscribeBtnText: { fontSize: 14, fontWeight: "800", color: theme.colors.onBrand },

  historySection: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: theme.colors.border },
  historySectionTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  historyRow: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  historyAmt: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  historyDate: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  historyStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  historyStatusText: { fontSize: 11, fontWeight: "700" },

  noteBox: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 8, backgroundColor: theme.colors.primary + "0D",
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.primary + "25",
  },
  noteText: { flex: 1, fontSize: 12, color: theme.colors.primary, lineHeight: 18, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end", alignItems: "center" },
  modalBox: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "85%", overflow: "hidden", width: "100%", maxWidth: 760, alignSelf: "center",
  },
  modalHeader: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  modalCloseBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  modalBody: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 20, gap: 16 },

  modalPriceRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.colors.primary + "0D", borderRadius: 14, padding: 14 },
  modalPriceLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.textSecondary },
  modalPriceVal: { fontSize: 22, fontWeight: "900", color: theme.colors.primary },
  modalPricePer: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "600" },

  payInstructions: { backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: theme.colors.border },
  paymentAccountCard: { backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: theme.colors.border },
  paymentAccountHeader: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 4 },
  paymentAccountLabel: { color: theme.colors.text, fontSize: 14, fontWeight: "800", textAlign: isUrdu ? "right" : "left" },
  paymentAccountBank: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 1, textAlign: isUrdu ? "right" : "left" },
  paymentAccountDetail: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: isUrdu ? "right" : "left" },
  paymentAccountValue: { color: theme.colors.text, fontWeight: "700" },
  paymentAccountInstructions: { color: theme.colors.primary, fontSize: 12, lineHeight: 17, marginTop: 4, textAlign: isUrdu ? "right" : "left" },
  paymentUnavailable: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 10, backgroundColor: theme.colors.warning + "16" },
  paymentUnavailableText: { flex: 1, color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: isUrdu ? "right" : "left" },
  freePlanNotice: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 8, padding: 14, borderRadius: 12, backgroundColor: theme.colors.success + "14", borderWidth: 1, borderColor: theme.colors.success + "35" },
  freePlanText: { flex: 1, color: theme.colors.success, fontSize: 13, fontWeight: "700", textAlign: isUrdu ? "right" : "left" },
  payInstrTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  payInstrText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  payInstrBold: { fontWeight: "700", color: theme.colors.text },

  inputLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  refInput: {
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, borderWidth: 1.5, borderColor: theme.colors.border,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontWeight: "700", color: theme.colors.text,
    letterSpacing: 1,
  },
  submitBtn: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 16,
  },
  submitBtnText: { fontSize: 15, fontWeight: "800", color: theme.colors.onBrand },
  btnDisabled: { opacity: 0.5 },

  cancelScheduledBanner: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 10,
    backgroundColor: theme.colors.warning + "15", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.colors.warning + "30",
  },
  cancelScheduledTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.warning },
  cancelScheduledSub: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18, marginTop: 2 },

  photoBtn: {
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 12,
    borderStyle: "dashed", overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
  },
  photoBtnInner: { padding: 20, alignItems: "center", gap: 6 },
  photoBtnText: { fontSize: 14, fontWeight: "600", color: theme.colors.primary },
  photoBtnSub: { fontSize: 12, color: theme.colors.textMuted },
  photoPreviewRow: { padding: 10, gap: 8 },
  photoPreview: { width: "100%", height: 160, borderRadius: 8, resizeMode: "cover" },
  photoRemove: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  photoRemoveText: { fontSize: 12, color: theme.colors.danger, fontWeight: "600" },
  });
}

