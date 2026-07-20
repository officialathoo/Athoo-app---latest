import { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/services/api";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { pickImageWithSourceChoice } from "@/utils/mediaPicker";
import { uploadPickedImage } from "@/services/storage";
import React, { useCallback, useEffect, useState, useMemo } from "react";
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

  const [bookingId, setBookingId] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  const [evidencePhoto, setEvidencePhoto] = useState<string | null>(null);
  const [evidenceMimeType, setEvidenceMimeType] = useState("image/jpeg");
  const [evidenceFileName, setEvidenceFileName] = useState("refund-evidence.jpg");

  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [showBookingPicker, setShowBookingPicker] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.getMyRefunds();
      setRefunds(res.refunds || []);
    } catch (e: any) {
      setError(apiErrorToMessage(e, tr("We couldn't load your refund requests. Please try again.")));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadBookings() {
    setLoadingBookings(true);
    try {
      const res = await api.getBookings();
      const eligible = (res.bookings || []).filter(
        (b: any) => ["completed", "cancelled"].includes(b.status)
          && ["paid", "received"].includes(b.paymentStatus)
          && Number(b.price || 0) + Number(b.visitCharge || 0) > 0
      );
      setBookings(eligible);
    } catch {
      // ignore
    } finally {
      setLoadingBookings(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    setRefundRequestId(null);
  }, [bookingId, reason, amount, evidencePhoto]);

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
    setEvidencePhoto(asset.uri);
    setEvidenceMimeType(mimeType);
    setEvidenceFileName(asset.fileName || `refund-evidence-${Date.now()}.${extension}`);
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
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      showError(tr("Invalid Amount"), tr("Please enter a valid refund amount."));
      return;
    }
    setSubmitting(true);
    try {
      const requestId = refundRequestId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!refundRequestId) setRefundRequestId(requestId);
      const refundableTotal = Number(selectedBooking?.price || 0) + Number(selectedBooking?.visitCharge || 0);
      if (refundableTotal > 0 && amt > refundableTotal) {
        showError(tr("Invalid Amount"), tr(`The refund amount cannot exceed ${formatCurrency(refundableTotal)}.`));
        return;
      }
      const evidenceUrl = evidencePhoto
        ? await uploadPickedImage(evidencePhoto, evidenceFileName, evidenceMimeType, undefined, "private")
        : undefined;
      await api.requestRefund({ bookingId, reason: reason.trim(), amountRequested: amt, evidenceUrl, clientRequestId: requestId });
      showSuccess(tr("Refund Submitted"), tr("Our team will review your request within 24-48 hours."));
      setShowForm(false);
      setBookingId("");
      setReason("");
      setAmount("");
      setEvidencePhoto(null);
      setEvidenceMimeType("image/jpeg");
      setEvidenceFileName("refund-evidence.jpg");
      setSelectedBooking(null);
      setRefundRequestId(null);
      load();
    } catch (e) {
      showError(tr("Unable to submit refund"), apiErrorToMessage(e, tr("We couldn't submit your refund request. Please try again.")));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredBookings = bookings.filter((b) => {
    const q = bookingSearch.toLowerCase();
    return !q || (b.service || "").toLowerCase().includes(q) || b.id.includes(q);
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[theme.colors.primary]} />}
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
                    {selectedBooking ? `${selectedBooking.service} — ${formatCurrency(Number(selectedBooking.price || 0) + Number(selectedBooking.visitCharge || 0))}` : tr("Tap to select booking")}
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
                      <Text style={styles.pickerEmpty}>{tr("No eligible bookings. Only completed or cancelled bookings can be refunded.")}</Text>
                    ) : (
                      filteredBookings.map((b) => (
                        <Pressable
                          key={b.id}
                          style={[styles.pickerItem, bookingId === b.id && styles.pickerItemSelected]}
                          onPress={() => {
                            setBookingId(b.id);
                            setSelectedBooking(b);
                            setAmount(String(Number(b.price || 0) + Number(b.visitCharge || 0) || ""));
                            setShowBookingPicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemTitle}>{b.service}</Text>
                          <Text style={styles.pickerItemSub}>{formatCurrency(Number(b.price || 0) + Number(b.visitCharge || 0))} · {b.status} · {formatLocalizedDate(b.createdAt || b.scheduledAt)}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{tr("Refund Amount (Rs.) *")}</Text>
                <TextInput
                  style={styles.inputText2}
                  placeholder={tr("Enter amount to refund")}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
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
                      <Image source={{ uri: evidencePhoto }} style={styles.photoPreview} />
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
                    <Text style={styles.submitBtnText}>{tr("Submit Refund Request")}</Text>
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
              <Pressable onPress={load} style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 28, backgroundColor: theme.colors.primary, borderRadius: 12 }}>
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
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.onBrand },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  scroll: { width: "100%", maxWidth: 760, alignSelf: "center", flex: 1 },
  scrollContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, gap: 16 },
  newBtn: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  newBtnText: { fontSize: 15, fontWeight: "700", color: theme.colors.onBrand },
  form: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  formHeader: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" },
  formTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.input,
  },
  inputText: { fontSize: 14, color: theme.colors.text, flex: 1 },
  inputText2: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.input,
  },
  inputPlaceholder: { fontSize: 14, color: theme.colors.textSecondary, flex: 1 },
  textarea: { height: 100, paddingTop: 11 },
  bookingPicker: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
    marginTop: 4,
    maxHeight: 240,
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
  infoBox: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.infoSoft,
  },
  infoText: { fontSize: 12, color: theme.colors.info, flex: 1, lineHeight: 18 },
  submitBtn: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  submitBtnText: { fontSize: 15, fontWeight: "700", color: theme.colors.onBrand },
  loadingBox: { alignItems: "center", paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 14, color: theme.colors.textSecondary },
  emptyBox: { alignItems: "center", paddingVertical: 48, gap: 10 },
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
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  emptySub: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", paddingHorizontal: 32 },
  list: { gap: 12 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" },
  cardAmount: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  cardDate: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardDetails: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 6 },
  cardDetailText: { fontSize: 13, color: theme.colors.textSecondary, flex: 1 },
  noteBox: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  noteText: { fontSize: 12, flex: 1, lineHeight: 17 },
  photoBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderStyle: "dashed",
    padding: 14,
    backgroundColor: theme.colors.surfaceAlt,
  },
  photoBtnInner: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 10 },
  photoBtnText: { fontSize: 14, fontWeight: "600", color: theme.colors.primary },
  photoPreviewRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12 },
  photoPreview: { width: 80, height: 60, borderRadius: 8, backgroundColor: theme.colors.border },
  photoRemove: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 4 },
  photoRemoveText: { fontSize: 13, color: theme.colors.danger, fontWeight: "600" },
  });
}

