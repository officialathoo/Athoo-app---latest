import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import { uploadPickedImage } from "@/services/storage";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiErrorToMessage } from "@/lib/apiError";

const REQUIRED = [
  { type: "cnic_front", label: "CNIC Front", cameraOnly: false },
  { type: "cnic_back", label: "CNIC Back", cameraOnly: false },
  { type: "selfie", label: "Live Selfie with CNIC", cameraOnly: true },
  { type: "police", label: "Police Verification Letter", cameraOnly: false },
] as const;

type ProviderDocument = { id: string; type: string; label?: string | null; status: string; rejectionNote?: string | null };

export default function VerificationDocumentsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getDocuments();
      setDocuments(result.documents || []);
      await refreshUser();
    } catch (error) {
      Alert.alert("Could not load documents", apiErrorToMessage(error, "We couldn't load your documents. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byType = useMemo(() => new Map(documents.map((doc) => [doc.type, doc])), [documents]);

  const chooseAndUpload = useCallback(async (item: typeof REQUIRED[number]) => {
    if (uploadingType) return;
    try {
      setUploadingType(item.type);
      const permission = item.cameraOnly
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission required", `Please allow ${item.cameraOnly ? "camera" : "photo library"} access and try again.`);
        return;
      }
      const result = item.cameraOnly
        ? await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85, allowsEditing: true, aspect: [4, 3] });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const objectPath = await uploadPickedImage(result.assets[0].uri, `${item.type}.jpg`, "image/jpeg", undefined, "private");
      await api.postDocument({ type: item.type, label: item.label, url: objectPath });
      await load();
      Alert.alert("Uploaded", `${item.label} was submitted for review.`);
    } catch (error) {
      Alert.alert("Upload failed", apiErrorToMessage(error, "We couldn't upload this document. Please try again."));
    } finally {
      setUploadingType(null);
    }
  }, [load, uploadingType]);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]} testID="provider-verification-documents">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Verification Documents</Text>
          <Text style={styles.subtitle}>Replace missing or rejected documents, then wait for Athoo review.</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}>
        {user?.verificationNote ? (
          <View style={styles.noteBox}>
            <Icon name="alert-circle" size={18} color={theme.colors.danger} />
            <Text style={styles.noteText}>{user.verificationNote}</Text>
          </View>
        ) : null}
        {REQUIRED.map((item) => {
          const document = byType.get(item.type);
          const rejected = document?.status === "rejected";
          return (
            <View key={item.type} style={styles.card} testID={`verification-document-${item.type}`}>
              <View style={[styles.statusIcon, rejected && styles.statusIconRejected]}>
                <Icon name={document?.status === "approved" ? "check" : rejected ? "x" : document ? "clock" : "upload"} size={18} color={document?.status === "approved" ? theme.colors.success : rejected ? theme.colors.danger : theme.colors.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.cardStatus}>{document ? document.status.replace("_", " ") : "Not uploaded"}</Text>
                {document?.rejectionNote ? <Text style={styles.rejection}>{document.rejectionNote}</Text> : null}
              </View>
              <Pressable
                onPress={() => chooseAndUpload(item)}
                disabled={!!uploadingType}
                accessibilityRole="button"
                accessibilityLabel={`${document ? "Replace" : "Upload"} ${item.label}`}
                style={[styles.uploadButton, uploadingType === item.type && { opacity: 0.55 }]}
              >
                <Text style={styles.uploadText}>{uploadingType === item.type ? "Uploading…" : document ? "Replace" : "Upload"}</Text>
              </Pressable>
            </View>
          );
        })}
        <Pressable onPress={load} disabled={loading} style={styles.refreshButton} testID="provider-verification-refresh">
          <Icon name="refresh-cw" size={16} color={theme.colors.primary} />
          <Text style={styles.refreshText}>{loading ? "Refreshing…" : "Refresh review status"}</Text>
        </Pressable>
      </ScrollView>
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
  noteBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: theme.colors.danger + "12", borderWidth: 1, borderColor: theme.colors.danger + "30" },
  noteText: { flex: 1, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14 },
  statusIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary + "12" },
  statusIconRejected: { backgroundColor: theme.colors.danger + "12" },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
  cardStatus: { color: theme.colors.textSecondary, fontSize: 12, textTransform: "capitalize" },
  rejection: { color: theme.colors.danger, fontSize: 11, lineHeight: 15 },
  uploadButton: { minWidth: 76, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.colors.primary },
  uploadText: { color: theme.colors.onBrand, fontSize: 12, fontWeight: "700", textAlign: "center" },
  refreshButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 6 },
  refreshText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
});
