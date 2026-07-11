import { Icon } from "@/components/ui/Icon";
import { Colors } from "@/constants/colors";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
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

interface Withdrawal {
  id: string;
  amount: number;
  accountTitle: string;
  accountNumber: string;
  bankName?: string | null;
  iban?: string | null;
  note?: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  rejectionNote?: string | null;
  paymentReference?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: "Pending Review", color: "#D97706", bg: "#FEF3C7", icon: "clock" },
  approved: { label: "Approved", color: "#2563EB", bg: "#DBEAFE", icon: "check-circle" },
  paid: { label: "Paid", color: "#059669", bg: "#D1FAE5", icon: "check-circle" },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2", icon: "x-circle" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

function currency(n: number) {
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

export default function WithdrawalRequestsScreen() {
  const insets = useSafeAreaInsets();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [accountTitle, setAccountTitle] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [note, setNote] = useState("");
  const requestIdRef = useRef<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.getMyWithdrawals();
      setWithdrawals(res.withdrawals || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load withdrawal requests. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt < 500) {
      Alert.alert("Invalid Amount", "Minimum withdrawal amount is Rs. 500");
      return;
    }
    if (!accountTitle.trim()) {
      Alert.alert("Missing Info", "Please enter account title");
      return;
    }
    if (!accountNumber.trim()) {
      Alert.alert("Missing Info", "Please enter account number");
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = `withdrawal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setSubmitting(true);
    try {
      await api.requestWithdrawal({
        amount: amt,
        accountTitle: accountTitle.trim(),
        accountNumber: accountNumber.trim(),
        bankName: bankName.trim() || undefined,
        iban: iban.trim() || undefined,
        note: note.trim() || undefined,
        clientRequestId: requestIdRef.current,
      });
      requestIdRef.current = null;
      Alert.alert("Request Submitted", "Your withdrawal request has been submitted. Admin will review it shortly.");
      setShowForm(false);
      setAmount("");
      setAccountTitle("");
      setAccountNumber("");
      setBankName("");
      setIban("");
      setNote("");
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  const hasPending = withdrawals.some((w) => w.status === "pending");

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 0 : insets.top }]}>
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Withdrawal Requests</Text>
          <Text style={styles.headerSub}>Request your earnings payout</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[Colors.primary]} />}
        >
          {!showForm ? (
            <Pressable
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }, hasPending && styles.newBtnDisabled]}
              onPress={() => {
                if (hasPending) {
                  Alert.alert("Pending Request", "You already have a pending withdrawal request. Please wait for it to be processed.");
                  return;
                }
                setShowForm(true);
              }}
            >
              <Icon name="plus" size={18} color="#fff" />
              <Text style={styles.newBtnText}>New Withdrawal Request</Text>
            </Pressable>
          ) : (
            <View style={styles.form}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>New Withdrawal Request</Text>
                <Pressable onPress={() => setShowForm(false)}>
                  <Icon name="x" size={20} color={Colors.textSecondary} />
                </Pressable>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Amount (Rs.) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Minimum Rs. 500"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Account Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Muhammad Ali"
                  value={accountTitle}
                  onChangeText={setAccountTitle}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Account Number / EasyPaisa / JazzCash *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Account number or mobile wallet number"
                  keyboardType="phone-pad"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Bank Name (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Meezan Bank, EasyPaisa, JazzCash"
                  value={bankName}
                  onChangeText={setBankName}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>IBAN (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="PK36 MEZN 0001 2345 0702 5307"
                  value={iban}
                  onChangeText={setIban}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Any additional information for the admin"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
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
                    <Text style={styles.submitBtnText}>Submit Request</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>Loading withdrawals…</Text>
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
          ) : withdrawals.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <Icon name="credit-card" size={32} color={Colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No Withdrawal Requests</Text>
              <Text style={styles.emptySub}>Submit your first withdrawal request above</Text>
            </View>
          ) : (
            <View style={styles.list}>
              <Text style={styles.sectionLabel}>Request History</Text>
              {withdrawals.map((w) => {
                const cfg = STATUS_CONFIG[w.status] || STATUS_CONFIG.pending;
                return (
                  <View key={w.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View>
                        <Text style={styles.cardAmount}>{currency(w.amount)}</Text>
                        <Text style={styles.cardDate}>{formatDate(w.createdAt)}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Icon name={cfg.icon as never} size={12} color={cfg.color} />
                        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <View style={styles.cardDetails}>
                      <Icon name="credit-card" size={14} color={Colors.textSecondary} />
                      <Text style={styles.cardDetailText}>{w.accountTitle} · {w.bankName ? `${w.bankName} · ` : ""}{w.accountNumber}</Text>
                    </View>
                    {w.iban && (
                      <View style={styles.cardDetails}>
                        <Icon name="hash" size={14} color={Colors.textSecondary} />
                        <Text style={styles.cardDetailText}>{w.iban}</Text>
                      </View>
                    )}
                    {w.status === "rejected" && w.rejectionNote && (
                      <View style={styles.noteBox}>
                        <Icon name="alert-circle" size={13} color="#DC2626" />
                        <Text style={[styles.noteText, { color: "#DC2626" }]}>{w.rejectionNote}</Text>
                      </View>
                    )}
                    {w.status === "paid" && w.paymentReference && (
                      <View style={styles.noteBox}>
                        <Icon name="check-circle" size={13} color="#059669" />
                        <Text style={[styles.noteText, { color: "#059669" }]}>Ref: {w.paymentReference}</Text>
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
  newBtnDisabled: { opacity: 0.5 },
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
    fontSize: 14,
    color: Colors.text,
    backgroundColor: "#FAFAFA",
  },
  textarea: { height: 80, paddingTop: 11 },
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
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
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
  cardDetails: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardDetailText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FFF7ED",
  },
  noteText: { fontSize: 12, flex: 1, lineHeight: 17 },
});
