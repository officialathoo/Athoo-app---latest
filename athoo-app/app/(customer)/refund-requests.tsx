import { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/services/api";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";
import { uploadPickedImage } from "@/services/storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { pickImageWithSourceChoice } from "@/utils/mediaPicker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

interface Refund {
  id: string;
  bookingId: string;
  reason: string;
  amountRequested: number;
  amountApproved?: number | null;
  status: "pending" | "approved" | "rejected" | "paid";
  resolutionNote?: string | null;
  createdAt: string;
}

type RefundEligibleBooking = Awaited<ReturnType<typeof api.getRefundEligibleBookings>>["eligibleBookings"][number];
type RefundEvidencePhoto = { uri: string; fileName: string; contentType: string };

function getStatusConfig(theme: AthooTheme): Record<string, { label: string; color: string; bg: string; icon: string }> {
  return {
    pending: { label: "Pending Review", color: theme.colors.warning, bg: theme.colors.warningSoft, icon: "clock" },
    approved: { label: "Approved", color: theme.colors.success, bg: theme.colors.successSoft, icon: "check-circle" },
    rejected: { label: "Declined", color: theme.colors.danger, bg: theme.colors.dangerSoft, icon: "x-circle" },
    paid: { label: "Refund Paid", color: theme.colors.success, bg: theme.colors.successSoft, icon: "check-circle" },
  };
}

export default function RefundRequestsScreen() {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate: formatLocalizedDate, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const insets = useSafeAreaInsets();
  const { showError, showSuccess } = useToast();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refundRequestId, setRefundRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRequestInFlightRef = useRef(false);
  const refundsLoadedRef = useRef(false);
  const refundsLastLoadedAtRef = useRef(0);

  const [bookingId, setBookingId] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  const [evidencePhoto, setEvidencePhoto] = useState<RefundEvidencePhoto | null>(null);
  const [uploadedEvidencePath, setUploadedEvidencePath] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [bookings, setBookings] = useState<RefundEligibleBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [showBookingPicker, setShowBookingPicker] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<RefundEligibleBooking | null>(null);

  const load = useCallback(async (
    mode: "initial" | "refresh" | "retry" | "background" | "mutation" = "initial"
  ) => {
    if (loadRequestInFlightRef.current) return;
    loadRequestInFlightRef.current = true;

    const showInitialLoader =
      (mode === "initial" || mode === "retry") && !refundsLoadedRef.current;

    if (showInitialLoader) setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    if (mode !== "background") setError(null);

    try {
      const res = await api.getMyRefunds();
      setRefunds(res.refunds || []);
      refundsLoadedRef.current = true;
      refundsLastLoadedAtRef.current = Date.now();
    } catch (e: any) {
      if (mode !== "background") {
        setError(apiErrorToMessage(e, tr("We couldn't load your refund requests. Please try again.")));
      }
    } finally {
      loadRequestInFlightRef.current = false;
      if (showInitialLoader) setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    }
  }, [tr]);

  async function loadBookings() {
    setLoadingBookings(true);
    try {
      const res = await api.getRefundEligibleBookings(50);
      setBookings(res.eligibleBookings || []);
    } catch (caught) {
      showError(tr("Unable to load eligible bookings"), apiErrorToMessage(caught, tr("We couldn't load bookings that are eligible for a refund.")));
    } finally {
      setLoadingBookings(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!refundsLoadedRef.current) {
        void load("initial");
        return;
      }
      if (Date.now() - refundsLastLoadedAtRef.current >= 30_000) {
        void load("background");
      }
    }, [load])
  );

  useEffect(() => {
    setRefundRequestId(null);
    setUploadedEvidencePath(null);
  }, [bookingId, reason, amount, evidencePhoto?.uri]);

  function openForm() {
    setShowForm(true);
    loadBookings();
  }

  async function pickEvidencePhoto() {
    const result = await pickImageWithSourceChoice(
      { mediaTypes: "images" as const, quality: 0.7, base64: false, allowsEditing: false, aspect: [4, 3] },
      { title: tr("Add photo evidence"), message: tr("Take a new photo or choose one from your gallery."), camera: tr("Camera"), gallery: tr("Gallery"), cancel: tr("Cancel") },
    );
    if (!result || result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    setEvidencePhoto({
      uri: asset.uri,
      contentType: mimeType,
      fileName: asset.fileName || `refund-evidence.${extension}`,
    });
  }

  async function handleSubmit() {
    if (!bookingId) {
      showError(tr("Select Booking"), tr("Please select the booking you want a refund for."));
      return;
    }
    if (!reason.trim() || reason.trim().length < 10) {
      showError(tr("Reason Required"), tr("Please describe the reason (at least 10 characters)."));
      return;
    }
    const amt = Number(amount);
    if (!/^\d{1,9}$/.test(amount) || !Number.isSafeInteger(amt) || amt <= 0) {
      showError(tr("Invalid Amount"), tr("Refund amount must be a positive whole rupee amount."));
      return;
    }
    if (!selectedBooking || amt > selectedBooking.remainingRefundable) {
      showError(tr("Invalid Amount"), tr("Refund amount cannot exceed the available refundable total."));
      return;
    }
    setSubmitting(true);
    try {
      const requestId = refundRequestId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!refundRequestId) setRefundRequestId(requestId);
      let evidencePath = uploadedEvidencePath;
      if (evidencePhoto && !evidencePath) {
        evidencePath = await uploadPickedImage(
          evidencePhoto.uri,
          evidencePhoto.fileName,
          evidencePhoto.contentType,
          (progress) => setUploadProgress(progress.percent ?? null),
          "private",
        );
        setUploadedEvidencePath(evidencePath);
      }
      await api.requestRefund({ bookingId, reason: reason.trim(), amountRequested: amt, evidenceUrl: evidencePath || undefined, clientRequestId: requestId });
      showSuccess(tr("Refund Submitted"), tr("Our team will review your request within 24-48 hours."));
      setShowForm(false);
      setBookingId("");
      setReason("");
      setAmount("");
      setEvidencePhoto(null);
      setUploadedEvidencePath(null);
      setUploadProgress(null);
      setSelectedBooking(null);
      setRefundRequestId(null);
      load();
    } catch (e) {
      showError(tr("Unable to submit refund"), apiErrorToMessage(e, tr("We couldn't submit your refund request. Please try again.")));
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  const filteredBookings = bookings.filter((b) => {
    const q = bookingSearch.toLowerCase();
    return !q || (b.service || "").toLowerCase().includes(q) || b.id.includes(q) || String(b.publicId || "").toLowerCase().includes(q);
  });

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 0 : insets.top }]}>
      <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr("Back")}>
          <Icon name={isUrdu ? "arrow-right" : "arrow-left"} size={20} color={theme.colors.onBrand} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>{tr("Refund Requests")}</Text>
          <Text style={styles.headerSub}>{tr("Request a refund for completed bookings")}</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} colors={[theme.colors.primary]} />}
          keyboardShouldPersistTaps="handled"
        >
          {!showForm ? (
            <Pressable
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
              onPress={openForm}
            >
              <Icon name="rotate-ccw" size={18} color={theme.colors.onBrand} />
              <Text style={styles.newBtnText}>{tr("New Refund Request")}</Text>
            </Pressable>
          ) : (
            <View style={styles.form}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>{tr("Request a Refund")}</Text>
                <Pressable onPress={() => setShowForm(false)}>
                  <Icon name="x" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{tr("Select Booking *")}</Text>
                <Pressable
                  style={styles.input}
                  onPress={() => setShowBookingPicker(!showBookingPicker)}
                >
                  <Text style={selectedBooking ? styles.inputText : styles.inputPlaceholder}>
                    {selectedBooking ? `${selectedBooking.service} — ${formatCurrency(selectedBooking.remainingRefundable)}` : tr("Tap to select booking")}
                  </Text>
                  <Icon name={showBookingPicker ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textSecondary} />
                </Pressable>
                {showBookingPicker && (
                  <View style={styles.bookingPicker}>
                    <TextInput
                      style={styles.pickerSearch}
                      placeholder={tr("Search by service...")}
                      value={bookingSearch}
                      onChangeText={setBookingSearch}
                    />
                    {loadingBookings ? (
                      <ActivityIndicator color={theme.colors.primary} style={{ padding: 16 }} />
                    ) : filteredBookings.length === 0 ? (
                      <Text style={styles.pickerEmpty}>{tr("No eligible paid bookings are available. A booking with an open or fully paid refund is not shown here.")}</Text>
                    ) : (
                      filteredBookings.map((b) => (
                        <Pressable
                          key={b.id}
                          style={[styles.pickerItem, bookingId === b.id && styles.pickerItemSelected]}
                          onPress={() => {
                            setBookingId(b.id);
                            setSelectedBooking(b);
                            setAmount(String(b.remainingRefundable));
                            setShowBookingPicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemTitle}>{b.service}</Text>
                          <Text style={styles.pickerItemSub}>{formatCurrency(b.remainingRefundable)} {tr("available")} · {tr(b.status)} · {formatLocalizedDate(b.scheduledDate || b.createdAt)}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </View>

              {selectedBooking ? (
                <View style={styles.amountBreakdown}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{tr("Service charge")}</Text>
                    <Text style={styles.breakdownValue}>{formatCurrency(selectedBooking.price || 0)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{tr("Travel / visit charge")}</Text>
                    <Text style={styles.breakdownValue}>{formatCurrency(selectedBooking.visitCharge || 0)}</Text>
                  </View>
                  {selectedBooking.paidRefundTotal > 0 ? (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{tr("Already refunded")}</Text>
                      <Text style={styles.breakdownValue}>− {formatCurrency(selectedBooking.paidRefundTotal)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                    <Text style={styles.breakdownTotalLabel}>{tr("Maximum refundable now")}</Text>
                    <Text style={styles.breakdownTotalValue}>{formatCurrency(selectedBooking.remainingRefundable)}</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>{tr("Refund Amount (Rs.) *")}</Text>
                <TextInput
                  style={styles.inputText2}
                  placeholder={tr("Enter amount to refund")}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={(value) => setAmount(value.replace(/\D/g, "").slice(0, 9))}
                  maxLength={9}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{tr("Reason *")}</Text>
                <TextInput
                  style={[styles.inputText2, styles.textarea]}
                  placeholder={tr("Describe why you need a refund (minimum 10 characters)")}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{tr("Photo Evidence (optional)")}</Text>
                <Pressable
                  style={styles.photoBtn}
                  onPress={pickEvidencePhoto}
                  accessibilityRole="button"
                  accessibilityLabel={tr("Add photo evidence")}
                >
                  {evidencePhoto ? (
                    <View style={styles.photoPreviewRow}>
                      <Image source={{ uri: evidencePhoto.uri }} style={styles.photoPreview} />
                      <Pressable onPress={() => setEvidencePhoto(null)} style={styles.photoRemove}>
                        <Icon name="x" size={14} color={theme.colors.danger} />
                        <Text style={styles.photoRemoveText}>{tr("Remove")}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.photoBtnInner}>
                      <Icon name="camera" size={20} color={theme.colors.primary} />
                      <Text style={styles.photoBtnText}>{tr("Attach Photo Evidence")}</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.infoBox}>
                <Icon name="info" size={14} color={theme.colors.info} />
                <Text style={styles.infoText}>{tr("Approved refunds are normally processed within 3–5 business days. We will notify you when your request is reviewed.")}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.onBrand} size="small" />
                ) : (
                  <>
                    <Icon name="send" size={16} color={theme.colors.onBrand} />
                    <Text style={styles.submitBtnText}>{uploadProgress !== null ? tr("Uploading evidence… {{percent}}%").replace("{{percent}}", String(uploadProgress)) : tr("Submit Refund Request")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.colors.primary} size="large" />
              <Text style={styles.loadingText}>{tr("Loading refunds…")}</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.dangerSoft }]}>
                <Icon name="alert-circle" size={32} color={theme.colors.danger} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.danger }]}>{tr("Unable to load refunds")}</Text>
              <Text style={styles.emptySub}>{error}</Text>
              <Pressable onPress={() => void load("retry")} style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 28, backgroundColor: theme.colors.primary, borderRadius: 12 }}>
                <Text style={{ color: theme.colors.white, fontWeight: "600", fontSize: 14 }}>{tr("Retry")}</Text>
              </Pressable>
            </View>
          ) : refunds.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <Icon name="rotate-ccw" size={32} color={theme.colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>{tr("No Refund Requests")}</Text>
              <Text style={styles.emptySub}>{tr("Submit a refund request if you have an issue with a completed booking.")}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              <Text style={styles.sectionLabel}>{tr("Refund History")}</Text>
              {refunds.map((r) => {
                const statusConfig = getStatusConfig(theme);
                const cfg = statusConfig[r.status] || statusConfig.pending;
                return (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View>
                        <Text style={styles.cardAmount}>{formatCurrency(r.amountRequested)}</Text>
                        <Text style={styles.cardDate}>{formatLocalizedDate(r.createdAt)}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Icon name={cfg.icon as never} size={12} color={cfg.color} />
                        <Text style={[styles.statusText, { color: cfg.color }]}>{tr(cfg.label)}</Text>
                      </View>
                    </View>
                    <View style={styles.cardDetails}>
                      <Icon name="file-text" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.cardDetailText} numberOfLines={2}>{r.reason}</Text>
                    </View>
                    {r.resolutionNote && (
                      <View style={[styles.noteBox, { backgroundColor: r.status === "approved" ? theme.colors.successSoft : theme.colors.premiumSoft }]}>
                        <Icon name={r.status === "approved" ? "check-circle" : "alert-circle"} size={13} color={r.status === "approved" ? theme.colors.success : theme.colors.warning} />
                        <Text style={[styles.noteText, { color: r.status === "approved" ? theme.colors.success : theme.colors.warning }]}>{r.resolutionNote}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceAlt },
  header: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingBottom: 20,
    paddingTop: 16,
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
  headerTitle: { ...theme.typography.h2, color: theme.colors.onBrand, letterSpacing: -0.25 },
  headerSub: { ...theme.typography.caption, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  scroll: { width: "100%", maxWidth: 760, alignSelf: "center", flex: 1 },
  scrollContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: redesign.layout.horizontalPadding, gap: 16 },
  newBtn: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    minHeight: redesign.control.standardHeight,
    paddingHorizontal: 16,
    ...theme.shadows.sm,
  },
  newBtnText: { ...theme.typography.label, color: theme.colors.onBrand },
  form: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 18,
    gap: 14,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  formHeader: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" },
  formTitle: { ...theme.typography.h3, color: theme.colors.text },
  field: { gap: 6 },
  label: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    minHeight: redesign.control.standardHeight,
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.input,
  },
  inputText: { ...theme.typography.body, color: theme.colors.text, flex: 1 },
  inputText2: {
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    minHeight: redesign.control.standardHeight,
    ...theme.typography.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.input,
  },
  inputPlaceholder: { ...theme.typography.body, color: theme.colors.textSecondary, flex: 1 },
  textarea: { height: 100, paddingTop: 11 },
  bookingPicker: {
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.elevated,
    overflow: "hidden",
    marginTop: 4,
    maxHeight: 240,
    ...theme.shadows.sm,
  },
  pickerSearch: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutralSoft,
    color: theme.colors.text,
  },
  pickerEmpty: { padding: 16, textAlign: "center", fontSize: 13, color: theme.colors.textSecondary },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.neutralSoft },
  pickerItemSelected: { backgroundColor: theme.colors.infoSoft },
  pickerItemTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  pickerItemSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  amountBreakdown: {
    gap: 8,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
  },
  breakdownRow: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  breakdownLabel: { flex: 1, ...theme.typography.caption, color: theme.colors.textSecondary },
  breakdownValue: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.text },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 9,
    marginTop: 2,
  },
  breakdownTotalLabel: { flex: 1, ...theme.typography.label, color: theme.colors.text },
  breakdownTotalValue: { ...theme.typography.h3, color: theme.colors.primary },
  infoBox: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.info + "30",
  },
  infoText: { ...theme.typography.caption, color: theme.colors.info, flex: 1 },
  submitBtn: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    minHeight: redesign.control.standardHeight,
    paddingHorizontal: 16,
    marginTop: 4,
    ...theme.shadows.sm,
  },
  submitBtnText: { ...theme.typography.label, color: theme.colors.onBrand },
  loadingBox: { alignItems: "center", paddingVertical: 48, gap: 12 },
  loadingText: { ...theme.typography.body, color: theme.colors.textSecondary },
  emptyBox: { alignItems: "center", paddingVertical: 48, gap: 10, backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border, ...theme.shadows.sm },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  emptyTitle: { ...theme.typography.h3, color: theme.colors.text },
  emptySub: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center", paddingHorizontal: 32 },
  list: { gap: 12 },
  sectionLabel: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 8,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  cardTop: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" },
  cardAmount: { ...theme.typography.h2, color: theme.colors.text },
  cardDate: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    minHeight: 28,
    justifyContent: "center",
    borderRadius: theme.radius.pill,
  },
  statusText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily },
  cardDetails: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 6 },
  cardDetailText: { ...theme.typography.body, color: theme.colors.textSecondary, flex: 1 },
  noteBox: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
  },
  noteText: { ...theme.typography.caption, flex: 1 },
  photoBtn: {
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderStyle: "dashed",
    padding: 14,
    backgroundColor: theme.colors.surfaceAlt,
  },
  photoBtnInner: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 10 },
  photoBtnText: { ...theme.typography.label, color: theme.colors.primary },
  photoPreviewRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12 },
  photoPreview: { width: 80, height: 60, borderRadius: 8, backgroundColor: theme.colors.border },
  photoRemove: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 4 },
  photoRemoveText: { fontSize: 13, color: theme.colors.danger, fontWeight: "600" },
  });
}
