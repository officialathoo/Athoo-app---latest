import { Icon } from "@/components/ui/Icon";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";
import { api } from "@/services/api";
import { uploadPickedImage, PrivateImage } from "@/services/storage";
import * as ImagePicker from "expo-image-picker";
import { pickFromCamera, pickFromGallery } from "@/utils/mediaPicker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,

  KeyboardAvoidingView,
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

interface PaymentAccount {
  id: string;
  label: string;
  bankName?: string;
  accountTitle: string;
  accountNumber: string;
  iban?: string;
  instructions?: string;
}

interface SubmittedPayment {
  id: string;
  amount: number;
  status: string;
  reference?: string;
  note?: string;
  createdAt: string;
  rejectionNote?: string;
}

function currency(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusColor(s: string) {
  if (s === "approved") return Colors.success;
  if (s === "rejected") return Colors.error;
  if (s === "in_process") return "#3B82F6";
  if (s === "submitted_for_approval") return "#6366F1";
  return Colors.warning;
}

function statusLabel(s: string) {
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  if (s === "in_process") return "In Process";
  if (s === "submitted_for_approval") return "Submitted";
  return "Pending Review";
}

export default function PayCommissionScreen() {
  const insets = useSafeAreaInsets();
  const { showError, showSuccess } = useToast();
  const { user, refreshUser } = useAuth();
  const { settings: platformSettings } = useSettings();

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [history, setHistory] = useState<SubmittedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [availableToSubmit, setAvailableToSubmit] = useState(0);
  const requestIdRef = useRef<string | null>(null);

  const pendingDues = user?.pendingCommission ?? 0;
  const commissionLimit = platformSettings.defaultCommissionLimit || user?.commissionLimit || 5000;
  const duesProgress = Math.min(1, pendingDues / commissionLimit);

  async function load(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    try {
      const [acctRes, payRes] = await Promise.all([
        api.getPaymentAccounts(),
        api.getMyPayments(),
        refreshUser().catch(() => {}),
      ]);
      setAccounts((acctRes?.accounts || []) as PaymentAccount[]);
      setHistory((payRes?.payments || []) as SubmittedPayment[]);
      setAvailableToSubmit(Number(payRes?.availableToSubmit || 0));
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function pickScreenshot() {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const result = await pickFromGallery({
      mediaTypes: "images" as const,
      quality: 0.7,
      allowsEditing: false,
      aspect: [4, 3],
    });
    if (!result || result.canceled || !result.assets?.[0]) return;
    {
      const asset = result.assets[0];
      try {
        const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase();
        const contentType = ext === "png" ? "image/png" : "image/jpeg";
        const objectPath = await uploadPickedImage(asset.uri, `screenshot.${ext}`, contentType);
        setScreenshot(objectPath);
      } catch (e) {
        showError("Upload Failed", apiErrorToMessage(e, "Could not upload screenshot. Please try again."));
      }
    }
  }

  async function handleSubmit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showError("Invalid Amount", "Please enter a valid amount greater than zero.");
      return;
    }
    if (amt > availableToSubmit) {
      showError("Amount Too High", `Amount cannot exceed commission available for submission (${currency(availableToSubmit)}).`);
      return;
    }
    if (!selectedAccount) {
      showError("Select Account", "Please select the Athoo payment account you paid to.");
      return;
    }
    if (!reference.trim()) {
      showError("Reference Required", "Please enter the transaction reference number or TID from your bank receipt.");
      return;
    }
    if (!screenshot) {
      showError("Screenshot Required", "Please upload the payment receipt screenshot.");
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = `commission-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    setSubmitting(true);
    try {
      await api.submitCommissionPayment({
        amount: amt,
        accountId: selectedAccount.id,
        reference: reference.trim(),
        screenshotUrl: screenshot,
        note: note.trim() || undefined,
        clientRequestId: requestIdRef.current,
      });
      requestIdRef.current = null;
      showSuccess("Payment Submitted", "Your commission payment is under review. You'll be notified once approved.");
      resetForm();
      load();
    } catch (e) {
      showError("Submission Failed", apiErrorToMessage(e, "Something went wrong. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setAmount("");
    setReference("");
    setNote("");
    setScreenshot(null);
    setSelectedAccount(null);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <Icon name="loader" size={28} color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: 10, fontSize: 14 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        {/* Header */}
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Pay Commission Dues</Text>

          {/* Dues summary */}
          <View style={styles.duesSummary}>
            <View style={styles.duesRow}>
              <View style={styles.duesStat}>
                <Text style={styles.duesVal}>{currency(pendingDues)}</Text>
                <Text style={styles.duesLbl}>Pending Dues</Text>
              </View>
              <View style={styles.duesDivider} />
              <View style={styles.duesStat}>
                <Text style={styles.duesVal}>{currency(commissionLimit)}</Text>
                <Text style={styles.duesLbl}>Credit Limit</Text>
              </View>
              <View style={styles.duesDivider} />
              <View style={styles.duesStat}>
                <Text style={[styles.duesVal, { color: pendingDues > commissionLimit * 0.8 ? "#FDE68A" : "#86efac" }]}>
                  {Math.round(duesProgress * 100)}%
                </Text>
                <Text style={styles.duesLbl}>Used</Text>
              </View>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, {
                width: `${Math.round(duesProgress * 100)}%`,
                backgroundColor: duesProgress > 0.8 ? "#EF4444" : "#86efac",
              }]} />
            </View>
          </View>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          {pendingDues === 0 ? (
            <View style={styles.noDues}>
              <Icon name="check-circle" size={48} color={Colors.success} />
              <Text style={styles.noDuesTitle}>No Dues Outstanding</Text>
              <Text style={styles.noDuesSub}>Your commission account is clear. Keep completing jobs!</Text>
            </View>
          ) : (
            <>
              {/* How to pay instructions */}
              <View style={styles.infoBox}>
                <Icon name="info" size={15} color={Colors.primary} />
                <Text style={styles.infoText}>
                  Transfer your dues to one of the Athoo accounts below, then fill in the details and attach your payment screenshot.
                  Your account will be unblocked once the payment is approved.
                </Text>
              </View>

              {/* Payment accounts */}
              <Text style={styles.sectionTitle}>1. Select Athoo Payment Account</Text>
              {accounts.length === 0 ? (
                <View style={styles.noAccountsBox}>
                  <Icon name="alert-circle" size={20} color={Colors.warning} />
                  <Text style={styles.noAccountsText}>
                    No payment accounts configured. Please contact support at support@athoo.pk for payment instructions.
                  </Text>
                </View>
              ) : (
                accounts.map((acct) => (
                  <Pressable
                    key={acct.id}
                    style={[styles.accountCard, selectedAccount?.id === acct.id && styles.accountCardSelected]}
                    onPress={() => setSelectedAccount(acct)}
                  >
                    <View style={styles.accountLeft}>
                      <View style={[styles.accountRadio, selectedAccount?.id === acct.id && styles.accountRadioSelected]}>
                        {selectedAccount?.id === acct.id && <View style={styles.accountRadioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.accountLabel}>{acct.label}</Text>
                        {acct.bankName && <Text style={styles.accountBank}>{acct.bankName}</Text>}
                        <Text style={styles.accountDetail}>Account Title: <Text style={styles.bold}>{acct.accountTitle}</Text></Text>
                        <Text style={styles.accountDetail}>Account #: <Text style={styles.bold}>{acct.accountNumber}</Text></Text>
                        {acct.iban && <Text style={styles.accountDetail}>IBAN: <Text style={styles.bold}>{acct.iban}</Text></Text>}
                      </View>
                    </View>
                    {acct.instructions && (
                      <Text style={styles.accountInstructions}>{acct.instructions}</Text>
                    )}
                  </Pressable>
                ))
              )}

              {/* Form */}
              <Text style={styles.sectionTitle}>2. Fill in Payment Details</Text>
              <View style={styles.formCard}>
                {/* Amount */}
                <View style={styles.field}>
                  <Text style={styles.label}>Amount Paid (PKR) <Text style={styles.required}>*</Text></Text>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputPrefix}>Rs.</Text>
                    <TextInput
                      style={styles.inputAmount}
                      placeholder={`Max ${currency(pendingDues)}`}
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      value={amount}
                      onChangeText={setAmount}
                      returnKeyType="next"
                    />
                  </View>
                  <Pressable
                    style={styles.payFullBtn}
                    onPress={() => setAmount(String(pendingDues))}
                  >
                    <Text style={styles.payFullText}>Pay full dues ({currency(pendingDues)})</Text>
                  </Pressable>
                </View>

                {/* Reference */}
                <View style={styles.field}>
                  <Text style={styles.label}>Transaction Reference / TID <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. TXN123456789"
                    placeholderTextColor={Colors.textMuted}
                    value={reference}
                    onChangeText={setReference}
                    autoCapitalize="characters"
                    returnKeyType="next"
                  />
                </View>

                {/* Screenshot */}
                <View style={styles.field}>
                  <Text style={styles.label}>Payment Screenshot <Text style={styles.optional}>(recommended)</Text></Text>
                  <Pressable style={styles.photoBtn} onPress={pickScreenshot}>
                    {screenshot ? (
                      <View style={styles.photoPreviewRow}>
                        <PrivateImage objectPath={screenshot} style={styles.photoPreview} />
                        <Pressable
                          style={styles.photoRemove}
                          onPress={() => setScreenshot(null)}
                        >
                          <Icon name="x" size={14} color={Colors.error} />
                          <Text style={styles.photoRemoveText}>Remove</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.photoBtnInner}>
                        <Icon name="image" size={22} color={Colors.primary} />
                        <Text style={styles.photoBtnText}>Attach Payment Screenshot</Text>
                        <Text style={styles.photoBtnSub}>Tap to select from gallery</Text>
                      </View>
                    )}
                  </Pressable>
                </View>

                {/* Note */}
                <View style={styles.field}>
                  <Text style={styles.label}>Note <Text style={styles.optional}>(optional)</Text></Text>
                  <TextInput
                    style={[styles.input, styles.inputMulti]}
                    placeholder="Any additional details about this payment..."
                    placeholderTextColor={Colors.textMuted}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>

              {/* Submit */}
              <Pressable
                style={[styles.submitBtn, (submitting || !amount || !reference || !selectedAccount) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting || !amount || !reference || !selectedAccount}
              >
                {submitting ? (
                  <Icon name="loader" size={18} color="#fff" />
                ) : (
                  <Icon name="send" size={18} color="#fff" />
                )}
                <Text style={styles.submitBtnText}>
                  {submitting ? "Submitting..." : "Submit Payment for Review"}
                </Text>
              </Pressable>
            </>
          )}

          {/* Payment history */}
          {history.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Payment History</Text>
              {history.map((p) => (
                <View key={p.id} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <View style={styles.historyLeft}>
                      <Icon name="credit-card" size={16} color={statusColor(p.status)} />
                      <View>
                        <Text style={styles.historyAmt}>{currency(p.amount)}</Text>
                        <Text style={styles.historyDate}>{formatDate(p.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) + "20" }]}>
                      <Text style={[styles.statusText, { color: statusColor(p.status) }]}>
                        {statusLabel(p.status)}
                      </Text>
                    </View>
                  </View>
                  {p.reference && (
                    <Text style={styles.historyRef}>Ref: {p.reference}</Text>
                  )}
                  {p.rejectionNote && (
                    <View style={styles.rejectionBox}>
                      <Icon name="alert-circle" size={13} color={Colors.error} />
                      <Text style={styles.rejectionText}>{p.rejectionNote}</Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff", marginBottom: 16 },
  duesSummary: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    gap: 10,
  },
  duesRow: { flexDirection: "row", alignItems: "center" },
  duesStat: { flex: 1, alignItems: "center", gap: 2 },
  duesVal: { fontSize: 15, fontWeight: "800", color: "#fff" },
  duesLbl: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  duesDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.25)" },
  progressBg: { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },

  scroll: { padding: 16, gap: 12 },

  noDues: { alignItems: "center", paddingVertical: 60, gap: 12 },
  noDuesTitle: { fontSize: 20, fontWeight: "700", color: Colors.text },
  noDuesSub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },

  infoBox: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: Colors.primary + "12", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.primary, lineHeight: 18 },

  sectionTitle: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },

  noAccountsBox: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: Colors.warning + "15", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.warning + "40",
  },
  noAccountsText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 },

  accountCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: Colors.border, gap: 6,
  },
  accountCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + "06" },
  accountLeft: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  accountRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  accountRadioSelected: { borderColor: Colors.primary },
  accountRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  accountLabel: { fontSize: 15, fontWeight: "700", color: Colors.text, marginBottom: 2 },
  accountBank: { fontSize: 12, color: Colors.primary, fontWeight: "600", marginBottom: 4 },
  accountDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  accountInstructions: {
    fontSize: 12, color: Colors.textMuted, fontStyle: "italic",
    backgroundColor: Colors.surface, borderRadius: 8, padding: 8, lineHeight: 16,
  },
  bold: { fontWeight: "700", color: Colors.text },

  formCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 16, gap: 16, borderWidth: 1, borderColor: Colors.border },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  required: { color: Colors.error },
  optional: { color: Colors.textMuted, fontWeight: "400" },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    backgroundColor: Colors.background, overflow: "hidden",
  },
  inputPrefix: { paddingHorizontal: 14, fontSize: 14, fontWeight: "700", color: Colors.textSecondary, borderRightWidth: 1, borderRightColor: Colors.border, paddingVertical: 12 },
  inputAmount: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: "700", color: Colors.text },
  payFullBtn: { alignSelf: "flex-start" },
  payFullText: { fontSize: 12, color: Colors.primary, fontWeight: "600", textDecorationLine: "underline" },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text, backgroundColor: Colors.background,
  },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },

  photoBtn: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    borderStyle: "dashed", overflow: "hidden",
    backgroundColor: Colors.background,
  },
  photoBtnInner: { padding: 20, alignItems: "center", gap: 6 },
  photoBtnText: { fontSize: 14, fontWeight: "600", color: Colors.primary },
  photoBtnSub: { fontSize: 12, color: Colors.textMuted },
  photoPreviewRow: { padding: 10, gap: 8 },
  photoPreview: { width: "100%", height: 160, borderRadius: 8, resizeMode: "cover" },
  photoRemove: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  photoRemoveText: { fontSize: 12, color: Colors.error, fontWeight: "600" },

  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 20, marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  historyCard: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  historyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  historyAmt: { fontSize: 15, fontWeight: "700", color: Colors.text },
  historyDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "700" },
  historyRef: { fontSize: 12, color: Colors.textSecondary },
  rejectionBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: Colors.error + "10", borderRadius: 8, padding: 8,
  },
  rejectionText: { flex: 1, fontSize: 12, color: Colors.error, lineHeight: 16 },
});
