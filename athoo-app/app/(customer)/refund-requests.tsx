import { Icon } from "@/components/ui/Icon";
import { Colors } from "@/constants/colors";
import { api } from "@/services/api";
import { useToast } from "@/context/ToastContext";
import { apiErrorToMessage } from "@/lib/apiError";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { pickFromCamera, pickFromGallery } from "@/utils/mediaPicker";
import React, { useCallback, useEffect, useState } from "react";
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: "Pending Review", color: "#D97706", bg: "#FEF3C7", icon: "clock" },
  approved: { label: "Approved", color: "#059669", bg: "#D1FAE5", icon: "check-circle" },
  rejected: { label: "Declined", color: "#DC2626", bg: "#FEE2E2", icon: "x-circle" },
  paid: { label: "Refund Paid", color: "#047857", bg: "#D1FAE5", icon: "check-circle" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

function currency(n: number) {
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

export default function RefundRequestsScreen() {
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
      setError(e?.message || "Failed to load refund requests. Pull down to retry.");
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
        (b: any) => b.status === "completed" || b.status === "cancelled"
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

  async function handleSubmit() {
    if (!bookingId) {
      showError("Select Booking", "Please select the booking you want a refund for.");
      return;
    }
    if (!reason.trim() || reason.trim().length < 10) {
      showError("Reason Required", "Please describe the reason (at least 10 characters).");
      return;
    }
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      showError("Invalid Amount", "Please enter a valid refund amount.");
      return;
    }
    setSubmitting(true);
    try {
      const requestId = refundRequestId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!refundRequestId) setRefundRequestId(requestId);
      await api.requestRefund({ bookingId, reason: reason.trim(), amountRequested: amt, evidenceUrl: evidencePhoto || undefined, clientRequestId: requestId });
      showSuccess("Refund Submitted", "Our team will review your request within 24-48 hours.");
      setShowForm(false);
      setBookingId("");
      setReason("");
      setAmount("");
      setEvidencePhoto(null);
      setSelectedBooking(null);
      setRefundRequestId(null);
      load();
    } catch (e) {
      showError("Could not submit", apiErrorToMessage(e, "Failed to submit refund request."));
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
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Refund Requests</Text>
          <Text style={styles.headerSub}>Request a refund for completed bookings</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[Colors.primary]} />}
          keyboardShouldPersistTaps="handled"
        >
          {!showForm ? (
            <Pressable
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
              onPress={openForm}
            >
              <Icon name="rotate-ccw" size={18} color="#fff" />
              <Text style={styles.newBtnText}>New Refund Request</Text>
            </Pressable>
          ) : (
            <View style={styles.form}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Request a Refund</Text>
                <Pressable onPress={() => setShowForm(false)}>
                  <Icon name="x" size={20} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Select Booking *</Text>
                <Pressable
                  style={styles.input}
                  onPress={() => setShowBookingPicker(!showBookingPicker)}
                >
                  <Text style={selectedBooking ? styles.inputText : styles.inputPlaceholder}>
                    {selectedBooking ? `${selectedBooking.service} — ${currency(selectedBooking.price)}` : "Tap to select booking"}
                  </Text>
                  <Icon name={showBookingPicker ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
                </Pressable>
                {showBookingPicker && (
                  <View style={styles.bookingPicker}>
                    <TextInput
                      style={styles.pickerSearch}
                      placeholder="Search by service..."
                      value={bookingSearch}
                      onChangeText={setBookingSearch}
                    />
                    {loadingBookings ? (
                      <ActivityIndicator color={Colors.primary} style={{ padding: 16 }} />
                    ) : filteredBookings.length === 0 ? (
                      <Text style={styles.pickerEmpty}>No eligible bookings (completed/cancelled only)</Text>
                    ) : (
                      filteredBookings.map((b) => (
                        <Pressable
                          key={b.id}
                          style={[styles.pickerItem, bookingId === b.id && styles.pickerItemSelected]}
                          onPress={() => {
                            setBookingId(b.id);
                            setSelectedBooking(b);
                            setAmount(String(b.price || ""));
                            setShowBookingPicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemTitle}>{b.service}</Text>
                          <Text style={styles.pickerItemSub}>{currency(b.price)} · {b.status} · {formatDate(b.createdAt || b.scheduledAt)}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Refund Amount (Rs.) *</Text>
                <TextInput
                  style={styles.inputText2}
                  placeholder="Enter amount to refund"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Reason *</Text>
                <TextInput
                  style={[styles.inputText2, styles.textarea]}
                  placeholder="Describe why you need a refund (minimum 10 characters)"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Photo Evidence (optional)</Text>
                <Pressable
                  style={styles.photoBtn}
                  onPress={async () => {
                    await new Promise<void>((resolve) => setTimeout(resolve, 200));
                    const result = await pickFromGallery({
                      mediaTypes: "images" as const,
                      quality: 0.7,
                      base64: true,
                      allowsEditing: false,
                      aspect: [4, 3],
                    });
                    if (!result || result.canceled || !result.assets?.[0]) return;
                    {
                      const asset = result.assets[0];
                      const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase();
                      setEvidencePhoto(`data:image/${ext};base64,${asset.base64}`);
                    }
                  }}
                >
                  {evidencePhoto ? (
                    <View style={styles.photoPreviewRow}>
                      <Image source={{ uri: evidencePhoto }} style={styles.photoPreview} />
                      <Pressable onPress={() => setEvidencePhoto(null)} style={styles.photoRemove}>
                        <Icon name="x" size={14} color={Colors.error} />
                        <Text style={styles.photoRemoveText}>Remove</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.photoBtnInner}>
                      <Icon name="camera" size={20} color={Colors.primary} />
                      <Text style={styles.photoBtnText}>Attach Photo Evidence</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.infoBox}>
                <Icon name="info" size={14} color="#2563EB" />
                <Text style={styles.infoText}>Refunds are processed within 3-5 business days after approval. You'll receive a notification when reviewed.</Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Icon name="send" size={16} color="#fff" />
                    <Text style={styles.submitBtnText}>Submit Refund Request</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>Loading refunds…</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIcon, { backgroundColor: "#FEE2E2" }]}>
                <Icon name="alert-circle" size={32} color={Colors.error} />
              </View>
              <Text style={[styles.emptyTitle, { color: Colors.error }]}>Failed to Load</Text>
              <Text style={styles.emptySub}>{error}</Text>
              <Pressable onPress={load} style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 28, backgroundColor: Colors.primary, borderRadius: 12 }}>
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Retry</Text>
              </Pressable>
            </View>
          ) : refunds.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <Icon name="rotate-ccw" size={32} color={Colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No Refund Requests</Text>
              <Text style={styles.emptySub}>Submit a refund request if you have an issue with a completed booking</Text>
            </View>
          ) : (
            <View style={styles.list}>
              <Text style={styles.sectionLabel}>Refund History</Text>
              {refunds.map((r) => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                return (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View>
                        <Text style={styles.cardAmount}>{currency(r.amountRequested)}</Text>
                        <Text style={styles.cardDate}>{formatDate(r.createdAt)}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Icon name={cfg.icon as never} size={12} color={cfg.color} />
                        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <View style={styles.cardDetails}>
                      <Icon name="file-text" size={14} color={Colors.textSecondary} />
                      <Text style={styles.cardDetailText} numberOfLines={2}>{r.reason}</Text>
                    </View>
                    {r.resolutionNote && (
                      <View style={[styles.noteBox, { backgroundColor: r.status === "approved" ? "#ECFDF5" : "#FFF7ED" }]}>
                        <Icon name={r.status === "approved" ? "check-circle" : "alert-circle"} size={13} color={r.status === "approved" ? "#059669" : "#D97706"} />
                        <Text style={[styles.noteText, { color: r.status === "approved" ? "#059669" : "#D97706" }]}>{r.resolutionNote}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: "row",
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
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  newBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  form: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  formTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FAFAFA",
  },
  inputText: { fontSize: 14, color: Colors.text, flex: 1 },
  inputText2: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: "#FAFAFA",
  },
  inputPlaceholder: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  textarea: { height: 100, paddingTop: 11 },
  bookingPicker: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
    marginTop: 4,
    maxHeight: 240,
  },
  pickerSearch: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    color: Colors.text,
  },
  pickerEmpty: { padding: 16, textAlign: "center", fontSize: 13, color: Colors.textSecondary },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  pickerItemSelected: { backgroundColor: "#EFF6FF" },
  pickerItemTitle: { fontSize: 14, fontWeight: "600", color: Colors.text },
  pickerItemSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoText: { fontSize: 12, color: "#1E40AF", flex: 1, lineHeight: 18 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  loadingBox: { alignItems: "center", paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 14, color: Colors.textSecondary },
  emptyBox: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", paddingHorizontal: 32 },
  list: { gap: 12 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardAmount: { fontSize: 20, fontWeight: "800", color: Colors.text },
  cardDate: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardDetails: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  cardDetailText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  noteText: { fontSize: 12, flex: 1, lineHeight: 17 },
  photoBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    borderStyle: "dashed",
    padding: 14,
    backgroundColor: Colors.surface,
  },
  photoBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  photoBtnText: { fontSize: 14, fontWeight: "600", color: Colors.primary },
  photoPreviewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photoPreview: { width: 80, height: 60, borderRadius: 8, backgroundColor: Colors.border },
  photoRemove: { flexDirection: "row", alignItems: "center", gap: 4 },
  photoRemoveText: { fontSize: 13, color: Colors.error, fontWeight: "600" },
});
