import { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";
import { api } from "@/services/api";
import { uploadPickedImage, PrivateImage } from "@/services/storage";
import { pickImageWithSourceChoice } from "@/utils/mediaPicker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState, useMemo } from "react";
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

function statusColor(s: string, theme: AthooTheme) {
  if (s === "approved") return theme.colors.success;
  if (s === "rejected") return theme.colors.danger;
  if (s === "in_process") return theme.colors.info;
  if (s === "submitted_for_approval") return theme.colors.accent;
  return theme.colors.warning;
}

function statusLabel(s: string) {
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  if (s === "in_process") return "In Process";
  if (s === "submitted_for_approval") return "Submitted";
  return "Pending Review";
}

export default function PayCommissionScreen() {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate: formatLocalizedDate, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const insets = useSafeAreaInsets();
  const { showError, showSuccess } = useToast();
  const { user, refreshUser } = useAuth();
  const { settings: platformSettings } = useSettings();

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [history, setHistory] = useState<SubmittedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    setLoadError(null);
    try {
      const [acctRes, payRes] = await Promise.all([
        api.getPaymentAccounts(),
        api.getMyPayments(),
        refreshUser().catch(() => {}),
      ]);
      setAccounts((acctRes?.accounts || []) as PaymentAccount[]);
      setHistory((payRes?.payments || []) as SubmittedPayment[]);
      setAvailableToSubmit(Number(payRes?.availableToSubmit || 0));
    } catch (error) {
      setLoadError(apiErrorToMessage(error, tr("We couldn't load commission payment details. Please try again.")));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function pickScreenshot() {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const result = await pickImageWithSourceChoice(
      { mediaTypes: "images" as const, quality: 0.7, allowsEditing: false, aspect: [4, 3] },
      { title: tr("Add payment screenshot"), message: tr("Take a new photo or choose one from your gallery."), camera: tr("Camera"), gallery: tr("Gallery"), cancel: tr("Cancel") },
    );
    if (!result || result.canceled || !result.assets?.[0]) return;
    {
      const asset = result.assets[0];
      try {
        const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase();
        const contentType = ext === "png" ? "image/png" : "image/jpeg";
        const objectPath = await uploadPickedImage(asset.uri, `screenshot.${ext}`, contentType);
        setScreenshot(objectPath);
      } catch (e) {
        showError(tr("Upload Failed"), apiErrorToMessage(e, tr("We couldn't upload the screenshot. Please try again.")));
      }
    }
  }

  async function handleSubmit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showError(tr("Invalid Amount"), tr("Please enter a valid amount greater than zero."));
      return;
    }
    if (amt > availableToSubmit) {
      showError(tr("Amount Too High"), tr("Amount cannot exceed the available commission amount ({{amount}}).", { amount: formatCurrency(availableToSubmit) }));
      return;
    }
    if (!selectedAccount) {
      showError(tr("Select Account"), tr("Please select the Athoo payment account you paid to."));
      return;
    }
    if (!reference.trim()) {
      showError(tr("Reference Required"), tr("Please enter the transaction reference number or TID from your receipt."));
      return;
    }
    if (!screenshot) {
      showError(tr("Screenshot Required"), tr("Please add the payment receipt screenshot."));
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
      showSuccess(tr("Payment Submitted"), tr("Your commission payment is under review. You'll be notified once approved."));
      resetForm();
      load();
    } catch (e) {
      showError(tr("Submission Failed"), apiErrorToMessage(e, tr("We couldn't submit this payment. Please try again.")));
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.background }}>
        <Icon name="loader" size={28} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.textSecondary, marginTop: 10, fontSize: 14 }}>{tr("Loading...")}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        {/* Header */}
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr("Back")}>
            <Icon name={isUrdu ? "arrow-right" : "arrow-left"} size={20} color={theme.colors.onBrand} />
          </Pressable>
          <Text style={styles.headerTitle}>{tr("Pay Commission Dues")}</Text>

          {/* Dues summary */}
          <View style={styles.duesSummary}>
            <View style={styles.duesRow}>
              <View style={styles.duesStat}>
                <Text style={styles.duesVal}>{formatCurrency(pendingDues)}</Text>
                <Text style={styles.duesLbl}>{tr("Pending Dues")}</Text>
              </View>
              <View style={styles.duesDivider} />
              <View style={styles.duesStat}>
                <Text style={styles.duesVal}>{formatCurrency(commissionLimit)}</Text>
                <Text style={styles.duesLbl}>{tr("Credit Limit")}</Text>
              </View>
              <View style={styles.duesDivider} />
              <View style={styles.duesStat}>
                <Text style={[styles.duesVal, { color: pendingDues > commissionLimit * 0.8 ? theme.colors.warning : theme.colors.success }]}>
                  {Math.round(duesProgress * 100)}%
                </Text>
                <Text style={styles.duesLbl}>{tr("Used")}</Text>
              </View>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, {
                width: `${Math.round(duesProgress * 100)}%`,
                backgroundColor: duesProgress > 0.8 ? theme.colors.danger : theme.colors.success,
              }]} />
            </View>
          </View>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />}
        >
          {loadError ? (
            <View style={styles.errorCard} accessibilityRole="alert">
              <Icon name="alert-circle" size={20} color={theme.colors.danger} />
              <View style={{ flex: 1 }}><Text style={styles.errorTitle}>{tr("Payment details unavailable")}</Text><Text style={styles.errorText}>{loadError}</Text></View>
              <Pressable onPress={() => load()} style={styles.retryBtn}><Text style={styles.retryText}>{tr("Retry")}</Text></Pressable>
            </View>
          ) : null}
          {pendingDues === 0 ? (
            <View style={styles.noDues}>
              <Icon name="check-circle" size={48} color={theme.colors.success} />
              <Text style={styles.noDuesTitle}>{tr("No Dues Outstanding")}</Text>
              <Text style={styles.noDuesSub}>{tr("Your commission account is clear. Keep completing jobs!")}</Text>
            </View>
          ) : (
            <>
              {/* How to pay instructions */}
              <View style={styles.infoBox}>
                <Icon name="info" size={15} color={theme.colors.primary} />
                <Text style={styles.infoText}>
                  {tr("Transfer your dues to one of the Athoo accounts below, then fill in the details and attach your payment screenshot. Your account will be unblocked once the payment is approved.")}
                </Text>
              </View>

              {/* Payment accounts */}
              <Text style={styles.sectionTitle}>{tr("1. Select Athoo Payment Account")}</Text>
              {accounts.length === 0 ? (
                <View style={styles.noAccountsBox}>
                  <Icon name="alert-circle" size={20} color={theme.colors.warning} />
                  <Text style={styles.noAccountsText}>
                    {tr("No payment accounts are available right now. Please contact Athoo Support for payment instructions.")}
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
                        <Text style={styles.accountDetail}>{tr("Account Title")}: <Text style={styles.bold}>{acct.accountTitle}</Text></Text>
                        <Text style={styles.accountDetail}>{tr("Account Number")}: <Text style={styles.bold}>{acct.accountNumber}</Text></Text>
                        {acct.iban && <Text style={styles.accountDetail}>{tr("IBAN")}: <Text style={styles.bold}>{acct.iban}</Text></Text>}
                      </View>
                    </View>
                    {acct.instructions && (
                      <Text style={styles.accountInstructions}>{acct.instructions}</Text>
                    )}
                  </Pressable>
                ))
              )}

              {/* Form */}
              <Text style={styles.sectionTitle}>{tr("2. Fill in Payment Details")}</Text>
              <View style={styles.formCard}>
                {/* Amount */}
                <View style={styles.field}>
                  <Text style={styles.label}>{tr("Amount Paid (PKR)")} <Text style={styles.required}>*</Text></Text>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputPrefix}>Rs.</Text>
                    <TextInput
                      style={styles.inputAmount}
                      placeholder={tr("Maximum {{amount}}", { amount: formatCurrency(pendingDues) })}
                      placeholderTextColor={theme.colors.textMuted}
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
                    <Text style={styles.payFullText}>{tr("Pay full dues ({{amount}})", { amount: formatCurrency(pendingDues) })}</Text>
                  </Pressable>
                </View>

                {/* Reference */}
                <View style={styles.field}>
                  <Text style={styles.label}>{tr("Transaction Reference / TID")} <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    placeholder={tr("e.g. TXN123456789")}
                    placeholderTextColor={theme.colors.textMuted}
                    value={reference}
                    onChangeText={setReference}
                    autoCapitalize="characters"
                    returnKeyType="next"
                  />
                </View>

                {/* Screenshot */}
                <View style={styles.field}>
                  <Text style={styles.label}>{tr("Payment Screenshot")} <Text style={styles.optional}>({tr("required")})</Text></Text>
                  <Pressable style={styles.photoBtn} onPress={pickScreenshot} accessibilityRole="button" accessibilityLabel={tr("Add payment screenshot")}>
                    {screenshot ? (
                      <View style={styles.photoPreviewRow}>
                        <PrivateImage objectPath={screenshot} style={styles.photoPreview} />
                        <Pressable
                          style={styles.photoRemove}
                          onPress={() => setScreenshot(null)}
                        >
                          <Icon name="x" size={14} color={theme.colors.danger} />
                          <Text style={styles.photoRemoveText}>{tr("Remove")}</Text>
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
                </View>

                {/* Note */}
                <View style={styles.field}>
                  <Text style={styles.label}>{tr("Note")} <Text style={styles.optional}>({tr("optional")})</Text></Text>
                  <TextInput
                    style={[styles.input, styles.inputMulti]}
                    placeholder={tr("Any additional details about this payment…")}
                    placeholderTextColor={theme.colors.textMuted}
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
                  <Icon name="loader" size={18} color={theme.colors.onBrand} />
                ) : (
                  <Icon name="send" size={18} color={theme.colors.onBrand} />
                )}
                <Text style={styles.submitBtnText}>
                  {submitting ? tr("Submitting…") : tr("Submit Payment for Review")}
                </Text>
              </Pressable>
            </>
          )}

          {/* Payment history */}
          {history.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{tr("Payment History")}</Text>
              {history.map((p) => (
                <View key={p.id} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <View style={styles.historyLeft}>
                      <Icon name="credit-card" size={16} color={statusColor(p.status, theme)} />
                      <View>
                        <Text style={styles.historyAmt}>{formatCurrency(p.amount)}</Text>
                        <Text style={styles.historyDate}>{formatLocalizedDate(p.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status, theme) + "20" }]}>
                      <Text style={[styles.statusText, { color: statusColor(p.status, theme) }]}>
                        {tr(statusLabel(p.status))}
                      </Text>
                    </View>
                  </View>
                  {p.reference && (
                    <Text style={styles.historyRef}>{tr("Reference")}: {p.reference}</Text>
                  )}
                  {p.rejectionNote && (
                    <View style={styles.rejectionBox}>
                      <Icon name="alert-circle" size={13} color={theme.colors.danger} />
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

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
  backBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.onBrand, marginBottom: 16 },
  duesSummary: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    gap: 10,
  },
  duesRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center" },
  duesStat: { flex: 1, alignItems: "center", gap: 2 },
  duesVal: { fontSize: 15, fontWeight: "800", color: theme.colors.onBrand },
  duesLbl: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  duesDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.25)" },
  progressBg: { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },

  scroll: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, gap: 12 },

  errorCard: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, backgroundColor: theme.colors.dangerSoft, borderWidth: 1, borderColor: theme.colors.danger },
  errorTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text, textAlign: isUrdu ? "right" : "left" },
  errorText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, textAlign: isUrdu ? "right" : "left" },
  retryBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  retryText: { color: theme.colors.white, fontWeight: "700" },
  noDues: { alignItems: "center", paddingVertical: 60, gap: 12 },
  noDuesTitle: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  noDuesSub: { fontSize: 14, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 },

  infoBox: {
    flexDirection: isUrdu ? "row-reverse" : "row", gap: 10, alignItems: "flex-start",
    backgroundColor: theme.colors.primary + "12", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.colors.primary + "30",
  },
  infoText: { flex: 1, fontSize: 13, color: theme.colors.primary, lineHeight: 18 },

  sectionTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },

  noAccountsBox: {
    flexDirection: isUrdu ? "row-reverse" : "row", gap: 10, alignItems: "flex-start",
    backgroundColor: theme.colors.warning + "15", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.colors.warning + "40",
  },
  noAccountsText: { flex: 1, fontSize: 13, color: theme.colors.warning, lineHeight: 18 },

  accountCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: theme.colors.border, gap: 6,
  },
  accountCardSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "06" },
  accountLeft: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 12 },
  accountRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  accountRadioSelected: { borderColor: theme.colors.primary },
  accountRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  accountLabel: { fontSize: 15, fontWeight: "700", color: theme.colors.text, marginBottom: 2 },
  accountBank: { fontSize: 12, color: theme.colors.primary, fontWeight: "600", marginBottom: 4 },
  accountDetail: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  accountInstructions: {
    fontSize: 12, color: theme.colors.textMuted, fontStyle: "italic",
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 8, padding: 8, lineHeight: 16,
  },
  bold: { fontWeight: "700", color: theme.colors.text },

  formCard: { backgroundColor: theme.colors.surface, borderRadius: 18, padding: 16, gap: 16, borderWidth: 1, borderColor: theme.colors.border },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  required: { color: theme.colors.danger },
  optional: { color: theme.colors.textMuted, fontWeight: "400" },
  inputRow: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center",
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
    backgroundColor: theme.colors.background, overflow: "hidden",
  },
  inputPrefix: { paddingHorizontal: 14, fontSize: 14, fontWeight: "700", color: theme.colors.textSecondary, borderRightWidth: 1, borderRightColor: theme.colors.border, paddingVertical: 12 },
  inputAmount: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: "700", color: theme.colors.text },
  payFullBtn: { alignSelf: "flex-start" },
  payFullText: { fontSize: 12, color: theme.colors.primary, fontWeight: "600", textDecorationLine: "underline" },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.background,
  },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },

  photoBtn: {
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 12,
    borderStyle: "dashed", overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  photoBtnInner: { padding: 20, alignItems: "center", gap: 6 },
  photoBtnText: { fontSize: 14, fontWeight: "600", color: theme.colors.primary },
  photoBtnSub: { fontSize: 12, color: theme.colors.textMuted },
  photoPreviewRow: { padding: 10, gap: 8 },
  photoPreview: { width: "100%", height: 160, borderRadius: 8, resizeMode: "cover" },
  photoRemove: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  photoRemoveText: { fontSize: 12, color: theme.colors.danger, fontWeight: "600" },

  submitBtn: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.primary, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 20, marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: "700", color: theme.colors.onBrand },

  historyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.colors.border, gap: 6,
  },
  historyTop: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" },
  historyLeft: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 10 },
  historyAmt: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  historyDate: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "700" },
  historyRef: { fontSize: 12, color: theme.colors.textSecondary },
  rejectionBox: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 6,
    backgroundColor: theme.colors.danger + "10", borderRadius: 8, padding: 8,
  },
  rejectionText: { flex: 1, fontSize: 12, color: theme.colors.danger, lineHeight: 16 },
  });
}

