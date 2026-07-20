import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import { uploadPickedImage } from "@/services/storage";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { apiErrorToMessage } from "@/lib/apiError";

const REQUIRED = [
  { type: "cnic_front", label: "CNIC Front", expiring: true, cameraOnly: false },
  { type: "cnic_back", label: "CNIC Back", expiring: true, cameraOnly: false },
  { type: "selfie", label: "Live Selfie with CNIC", expiring: false, cameraOnly: true },
  { type: "police", label: "Police Verification Letter", expiring: true, cameraOnly: false },
] as const;

type RequiredItem = (typeof REQUIRED)[number];
type ExpiringType = "cnic_front" | "cnic_back" | "police";
type ProviderDocument = {
  id: string;
  type: string;
  label?: string | null;
  status: string;
  rejectionNote?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  expiryNotApplicable?: boolean;
};
type RenewalRequest = {
  id: string;
  documentType: ExpiringType;
  status: "pending" | "approved" | "rejected" | "cancelled";
  rejectionNote?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  expiryNotApplicable?: boolean;
  createdAt?: string | null;
};
type Compliance = {
  status: "active" | "action_required" | "warning" | "grace" | "renewal_pending" | "suspended";
  reason?: string | null;
  graceEndsAt?: string | null;
  suspendedAt?: string | null;
  nearestExpiryAt?: string | null;
};

type ValidityDraft = {
  item: RequiredItem;
  issuedAt: string;
  expiresAt: string;
  lifetime: boolean;
};

function dateOnly(value?: string | null): string {
  return value ? String(value).slice(0, 10) : "";
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDate(value?: string | null): string {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? dateOnly(value) : parsed.toLocaleDateString("en-PK");
}

export default function VerificationDocumentsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [requests, setRequests] = useState<RenewalRequest[]>([]);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [validityDraft, setValidityDraft] = useState<ValidityDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getDocumentRenewals();
      setDocuments(result.documents || []);
      setRequests(result.requests || []);
      setCompliance(result.compliance || null);
      await refreshUser();
    } catch (error) {
      Alert.alert("Could not load documents", apiErrorToMessage(error, "We couldn't load your documents. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const byType = useMemo(() => new Map(documents.map((doc) => [doc.type, doc])), [documents]);
  const pendingByType = useMemo(() => {
    const map = new Map<string, RenewalRequest>();
    for (const request of requests) if (request.status === "pending") map.set(request.documentType, request);
    return map;
  }, [requests]);

  const openValidity = useCallback((item: RequiredItem) => {
    if (!item.expiring) {
      void chooseSourceAndUpload(item, { issuedAt: "", expiresAt: "", lifetime: false });
      return;
    }
    const current = byType.get(item.type);
    setValidityDraft({
      item,
      issuedAt: item.type === "police" ? dateOnly(current?.issuedAt) : "",
      expiresAt: dateOnly(current?.expiresAt) || (item.type.startsWith("cnic") ? dateOnly(user?.cnicExpiry) : ""),
      lifetime: item.type.startsWith("cnic") && Boolean(current?.expiryNotApplicable || user?.cnicLifetime),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byType, user?.cnicExpiry, user?.cnicLifetime]);

  const validateDraft = useCallback((draft: ValidityDraft): boolean => {
    const today = new Date().toISOString().slice(0, 10);
    if (draft.item.type === "police") {
      if (!validDateOnly(draft.issuedAt) || !validDateOnly(draft.expiresAt)) {
        Alert.alert("Validity dates required", "Enter the issue and valid-until dates in YYYY-MM-DD format.");
        return false;
      }
      if (draft.issuedAt > today || draft.expiresAt < today || draft.issuedAt > draft.expiresAt) {
        Alert.alert("Invalid dates", "The issue date cannot be in the future, and the certificate must still be valid.");
        return false;
      }
      return true;
    }
    if (draft.lifetime) return true;
    if (!validDateOnly(draft.expiresAt) || draft.expiresAt < today) {
      Alert.alert("CNIC validity required", "Enter a current CNIC valid-until date in YYYY-MM-DD format, or select Lifetime CNIC.");
      return false;
    }
    return true;
  }, []);

  const pickImage = useCallback(async (item: RequiredItem, source: "camera" | "gallery") => {
    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error(`Please allow ${source === "camera" ? "camera" : "photo library"} access and try again.`);
    }
    return source === "camera"
      ? ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85, allowsEditing: true, aspect: item.cameraOnly ? [1, 1] : [4, 3] })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85, allowsEditing: true, aspect: [4, 3] });
  }, []);

  const uploadSelected = useCallback(async (
    item: RequiredItem,
    validity: { issuedAt: string; expiresAt: string; lifetime: boolean },
    source: "camera" | "gallery",
  ) => {
    if (uploadingType) return;
    try {
      setUploadingType(item.type);
      const result = await pickImage(item, source);
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const objectPath = await uploadPickedImage(result.assets[0].uri, `${item.type}.jpg`, "image/jpeg", undefined, "private");
      const existing = byType.get(item.type);
      const shouldRenew = item.expiring && Boolean(
        user?.documentSuspendedAt ||
        (existing && (existing.status === "approved" || user?.verificationStatus === "approved")),
      );
      const validityPayload = item.type === "police"
        ? { issuedAt: validity.issuedAt, expiresAt: validity.expiresAt, expiryNotApplicable: false }
        : item.type.startsWith("cnic")
          ? { expiresAt: validity.lifetime ? undefined : validity.expiresAt, expiryNotApplicable: validity.lifetime }
          : {};

      if (shouldRenew) {
        await api.createDocumentRenewal({
          documentType: item.type as ExpiringType,
          label: item.label,
          url: objectPath,
          ...validityPayload,
        });
      } else {
        await api.postDocument({ type: item.type, label: item.label, url: objectPath, ...validityPayload });
      }
      await load();
      Alert.alert("Submitted", `${item.label} was sent for administrator review.`);
    } catch (error) {
      Alert.alert("Upload failed", apiErrorToMessage(error, "We couldn't upload this document. Please try again."));
    } finally {
      setUploadingType(null);
    }
  }, [byType, load, pickImage, uploadingType, user?.documentSuspendedAt, user?.verificationStatus]);

  const chooseSourceAndUpload = useCallback(async (
    item: RequiredItem,
    validity: { issuedAt: string; expiresAt: string; lifetime: boolean },
  ) => {
    if (item.cameraOnly) {
      await uploadSelected(item, validity, "camera");
      return;
    }
    Alert.alert("Choose document source", `Upload ${item.label} using:`, [
      { text: "Camera", onPress: () => void uploadSelected(item, validity, "camera") },
      { text: "Gallery", onPress: () => void uploadSelected(item, validity, "gallery") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [uploadSelected]);

  const continueValidity = useCallback(() => {
    if (!validityDraft || !validateDraft(validityDraft)) return;
    const current = validityDraft;
    setValidityDraft(null);
    void chooseSourceAndUpload(current.item, current);
  }, [chooseSourceAndUpload, validateDraft, validityDraft]);

  const cancelPending = useCallback(async (request: RenewalRequest) => {
    Alert.alert("Cancel renewal request?", "The submitted replacement will no longer be reviewed.", [
      { text: "Keep request", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: async () => {
          try {
            await api.cancelDocumentRenewal(request.id);
            await load();
          } catch (error) {
            Alert.alert("Could not cancel", apiErrorToMessage(error, "Please try again."));
          }
        },
      },
    ]);
  }, [load]);

  const complianceTone = compliance?.status === "suspended" || compliance?.status === "grace"
    ? theme.colors.danger
    : compliance?.status === "warning" || compliance?.status === "action_required"
      ? theme.colors.warning
      : theme.colors.primary;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]} testID="provider-verification-documents">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Identity & Police Verification</Text>
          <Text style={styles.subtitle}>Keep validity dates current and submit replacements securely.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}>
        {compliance && compliance.status !== "active" ? (
          <View style={[styles.complianceBox, { borderColor: complianceTone + "55", backgroundColor: complianceTone + "12" }]}>
            <Icon name={compliance.status === "suspended" ? "shield-x" : "alert-circle"} size={20} color={complianceTone} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.complianceTitle, { color: complianceTone }]}>{compliance.status.replace("_", " ").toUpperCase()}</Text>
              <Text style={styles.complianceText}>{compliance.reason}</Text>
              {compliance.graceEndsAt && compliance.status === "grace" ? (
                <Text style={styles.deadline}>Update by {formatDate(compliance.graceEndsAt)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {user?.verificationNote && !compliance?.reason ? (
          <View style={styles.noteBox}>
            <Icon name="alert-circle" size={18} color={theme.colors.danger} />
            <Text style={styles.noteText}>{user.verificationNote}</Text>
          </View>
        ) : null}

        {REQUIRED.map((item) => {
          const document = byType.get(item.type);
          const pending = pendingByType.get(item.type);
          const rejectedRequest = requests.find((request) => request.documentType === item.type && request.status === "rejected");
          const rejected = document?.status === "rejected" || Boolean(rejectedRequest);
          const approved = document?.status === "approved";
          return (
            <View key={item.type} style={styles.card} testID={`verification-document-${item.type}`}>
              <View style={[styles.statusIcon, rejected && styles.statusIconRejected]}>
                <Icon
                  name={approved ? "check" : rejected ? "x" : pending || document ? "clock" : "upload"}
                  size={18}
                  color={approved ? theme.colors.success : rejected ? theme.colors.danger : theme.colors.primary}
                />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.cardStatus}>
                  {pending ? "Replacement pending review" : document ? document.status.replace("_", " ") : "Not uploaded"}
                </Text>
                {item.expiring ? (
                  <Text style={styles.validityText}>
                    {document?.expiryNotApplicable ? "Lifetime validity" : `Valid until: ${formatDate(document?.expiresAt)}`}
                  </Text>
                ) : null}
                {document?.rejectionNote || rejectedRequest?.rejectionNote ? (
                  <Text style={styles.rejection}>{document?.rejectionNote || rejectedRequest?.rejectionNote}</Text>
                ) : null}
              </View>
              {pending ? (
                <Pressable onPress={() => void cancelPending(pending)} style={styles.secondaryButton} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => openValidity(item)}
                  disabled={!!uploadingType}
                  accessibilityRole="button"
                  accessibilityLabel={`${document ? "Update" : "Upload"} ${item.label}`}
                  style={[styles.uploadButton, uploadingType === item.type && { opacity: 0.55 }]}
                >
                  {uploadingType === item.type ? <ActivityIndicator size="small" color={theme.colors.onBrand} /> : (
                    <Text style={styles.uploadText}>{document ? "Update" : "Upload"}</Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}

        <View style={styles.policyBox}>
          <Icon name="info" size={17} color={theme.colors.primary} />
          <Text style={styles.policyText}>
            Athoo uses the exact validity printed on each document. Police-certificate validity can depend on the issuing authority and receiving organization, so no fixed period is assumed.
          </Text>
        </View>

        <Pressable onPress={() => void load()} disabled={loading} style={styles.refreshButton} testID="provider-verification-refresh">
          {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Icon name="refresh-cw" size={16} color={theme.colors.primary} />}
          <Text style={styles.refreshText}>{loading ? "Refreshing…" : "Refresh review status"}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={Boolean(validityDraft)} transparent animationType="fade" onRequestClose={() => setValidityDraft(null)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setValidityDraft(null)} />
          {validityDraft ? (
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Update {validityDraft.item.label}</Text>
              <Text style={styles.modalText}>Enter the dates exactly as printed on the replacement document.</Text>

              {validityDraft.item.type.startsWith("cnic") ? (
                <Pressable
                  style={styles.checkRow}
                  onPress={() => setValidityDraft((current) => current ? { ...current, lifetime: !current.lifetime, expiresAt: !current.lifetime ? "" : current.expiresAt } : current)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: validityDraft.lifetime }}
                >
                  <View style={[styles.checkbox, validityDraft.lifetime && styles.checkboxChecked]}>
                    {validityDraft.lifetime ? <Icon name="check" size={14} color={theme.colors.onBrand} /> : null}
                  </View>
                  <Text style={styles.checkText}>This CNIC has lifetime validity</Text>
                </Pressable>
              ) : (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Issue date</Text>
                  <TextInput
                    value={validityDraft.issuedAt}
                    onChangeText={(value) => setValidityDraft((current) => current ? { ...current, issuedAt: value.replace(/[^0-9-]/g, "").slice(0, 10) } : current)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    style={styles.input}
                  />
                </View>
              )}

              {!validityDraft.lifetime ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Valid until</Text>
                  <TextInput
                    value={validityDraft.expiresAt}
                    onChangeText={(value) => setValidityDraft((current) => current ? { ...current, expiresAt: value.replace(/[^0-9-]/g, "").slice(0, 10) } : current)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    style={styles.input}
                  />
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable style={styles.secondaryAction} onPress={() => setValidityDraft(null)}>
                  <Text style={styles.secondaryActionText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryAction} onPress={continueValidity}>
                  <Text style={styles.primaryActionText}>Choose Document</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, backgroundColor: theme.colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backButton: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
  title: { color: theme.colors.text, fontSize: 19, fontWeight: "800" },
  subtitle: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  content: { padding: 18, gap: 12 },
  complianceBox: { flexDirection: "row", gap: 11, padding: 15, borderRadius: 16, borderWidth: 1 },
  complianceTitle: { fontSize: 12, fontWeight: "900" },
  complianceText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 3 },
  deadline: { color: theme.colors.danger, fontSize: 12, fontWeight: "800", marginTop: 7 },
  noteBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: theme.colors.danger + "12", borderWidth: 1, borderColor: theme.colors.danger + "30" },
  noteText: { flex: 1, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14 },
  statusIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary + "12" },
  statusIconRejected: { backgroundColor: theme.colors.danger + "12" },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
  cardStatus: { color: theme.colors.textSecondary, fontSize: 12, textTransform: "capitalize" },
  validityText: { color: theme.colors.textMuted, fontSize: 11 },
  rejection: { color: theme.colors.danger, fontSize: 11, lineHeight: 15 },
  uploadButton: { minWidth: 76, minHeight: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  uploadText: { color: theme.colors.onBrand, fontSize: 12, fontWeight: "700", textAlign: "center" },
  secondaryButton: { minWidth: 68, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  secondaryText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: "700", textAlign: "center" },
  policyBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: theme.colors.primary + "0D", borderWidth: 1, borderColor: theme.colors.primary + "25" },
  policyText: { flex: 1, color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  refreshButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 6 },
  refreshText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
  overlay: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.58)" },
  modalCard: { width: "100%", maxWidth: 460, alignSelf: "center", borderRadius: 22, padding: 22, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  modalTitle: { color: theme.colors.text, fontSize: 19, fontWeight: "800" },
  modalText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 17 },
  field: { gap: 7, marginTop: 12 },
  fieldLabel: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  input: { minHeight: 49, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, color: theme.colors.text, paddingHorizontal: 14, fontSize: 15 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: theme.colors.primary },
  checkText: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 22 },
  secondaryAction: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceAlt },
  secondaryActionText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: "700" },
  primaryAction: { flex: 1.3, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary },
  primaryActionText: { color: theme.colors.onBrand, fontSize: 14, fontWeight: "800" },
});
