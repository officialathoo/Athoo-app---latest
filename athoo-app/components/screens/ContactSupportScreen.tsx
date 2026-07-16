import * as ImagePicker from "expo-image-picker";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/services/api";
import { uploadPickedImage, type UploadProgress } from "@/services/storage";
import { apiErrorToMessage } from "@/lib/apiError";
import { pickImageWithSourceChoice } from "@/utils/mediaPicker";

type Role = "customer" | "provider";

const COMMON_SUBJECTS = [
  "Booking issue",
  "Payment problem",
  "App technical issue",
  "Account access",
  "Refund request",
  "Other",
];

function mediaMime(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType) return asset.mimeType;
  if (asset.type === "video") return "video/mp4";
  const name = String(asset.fileName || asset.uri).toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function mediaExtension(mime: string) {
  if (mime === "video/mp4") return "mp4";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function ContactSupportScreen({ role }: { role: Role }) {
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection } = useLang();
  const insets = useSafeAreaInsets();
  const accent = role === "provider" ? theme.colors.secondary : theme.colors.primary;
  const ticketRoute = `/${role === "provider" ? "(provider)" : "(customer)"}/support-tickets` as any;
  const subjects = useMemo(
    () => ["Booking issue", "Payment problem", role === "provider" ? "Customer complaint" : "Provider complaint", ...COMMON_SUBJECTS.slice(2)],
    [role],
  );

  const [subject, setSubject] = useState(subjects[0]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({});

  async function pickMedia() {
    if (media.length >= 5 || loading) return;
    const result = await pickImageWithSourceChoice(
      {
        mediaTypes: ["images", "videos"] as any,
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 30,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 5 - media.length),
      },
      {
        title: tr("Add proof"),
        message: tr("Take a photo or video, or choose existing media from your gallery."),
        camera: tr("Camera"),
        gallery: tr("Gallery"),
        cancel: tr("Cancel"),
      },
    );
    if (!result || result.canceled) return;
    setMedia((current) => {
      const seen = new Set(current.map((item) => item.uri));
      const next = [...current];
      for (const asset of result.assets) {
        if (!seen.has(asset.uri)) {
          seen.add(asset.uri);
          next.push(asset);
        }
      }
      return next.slice(0, 5);
    });
  }

  async function submit() {
    const trimmed = message.trim();
    if (trimmed.length < 20) {
      setError(tr("Please describe your issue in at least 20 characters."));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const mediaUrls: string[] = [];
      for (const [index, asset] of media.entries()) {
        const mime = mediaMime(asset);
        const ext = mediaExtension(mime);
        const filename = `support-${Date.now()}-${index + 1}.${ext}`;
        const objectPath = await uploadPickedImage(asset.uri, filename, mime, (progress) => {
          setUploadProgress((current) => ({ ...current, [asset.uri]: progress }));
        }, "private");
        mediaUrls.push(objectPath);
      }
      await api.submitComplaint({ subject, message: trimmed, mediaUrls });
      setSuccess(true);
    } catch (caught) {
      setError(tr(apiErrorToMessage(caught, "We couldn't submit your request. Please try again.")));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <ScreenHeader title={tr("Contact Support")} />
        <View style={[styles.successWrap, responsiveContent, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.successIcon, { backgroundColor: theme.colors.successSoft }]}>
            <Icon name="check-circle" size={52} color={theme.colors.success} />
          </View>
          <AppText variant="h1" align="center">{tr("Ticket submitted")}</AppText>
          <AppText tone="secondary" align="center" style={styles.successMessage}>
            {tr("Our support team will review your request and reply in your support tickets.")}
          </AppText>
          <Button title={tr("View my tickets")} onPress={() => router.replace(ticketRoute)} fullWidth style={styles.actionWidth} />
          <Button title={tr("Back to help")} onPress={() => router.back()} variant="ghost" fullWidth style={styles.actionWidth} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader
        title={tr("Contact Support")}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("View active support tickets")}
            onPress={() => router.push(ticketRoute)}
            style={({ pressed }) => [styles.headerAction, { backgroundColor: theme.colors.infoSoft }, pressed && { opacity: 0.72 }]}
          >
            <Icon name="list" size={19} color={theme.colors.primary} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 48 }]}
        >
          <AppCard elevated={false} style={{ backgroundColor: theme.colors.infoSoft }}>
            <View style={styles.infoRow}>
              <Icon name="headphones" size={24} color={theme.colors.primary} />
              <AppText tone="secondary" style={styles.flex}>
                {tr("Describe the problem clearly. You can attach up to five screenshots or short videos.")}
              </AppText>
            </View>
          </AppCard>

          <View style={styles.section}>
            <AppText variant="label">{tr("What's the issue about?")}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {subjects.map((item) => {
                const selected = item === subject;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={tr(item)}
                    onPress={() => setSubject(item)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.colors.infoSoft : theme.colors.surface,
                        borderColor: selected ? accent : theme.colors.border,
                      },
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <AppText variant="caption" style={{ color: selected ? accent : theme.colors.textSecondary }}>
                      {tr(item)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <AppText variant="label">{tr("Attach screenshots or video proof (optional)")}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Add proof from camera or gallery")}
              accessibilityState={{ disabled: loading || media.length >= 5 }}
              disabled={loading || media.length >= 5}
              onPress={() => void pickMedia()}
              style={({ pressed }) => [
                styles.attach,
                { borderColor: accent, backgroundColor: theme.colors.surface },
                pressed && { opacity: 0.76 },
                (loading || media.length >= 5) && { opacity: 0.5 },
              ]}
            >
              <Icon name="camera" size={18} color={accent} />
              <AppText variant="label" style={{ color: accent }}>
                {media.length ? tr("{{count}} of 5 files selected", { count: media.length }) : tr("Camera or gallery")}
              </AppText>
            </Pressable>

            {media.map((asset) => {
              const progress = uploadProgress[asset.uri];
              return (
                <View key={asset.uri} style={[styles.mediaRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Icon name={asset.type === "video" ? "video" : "image"} size={17} color={theme.colors.textSecondary} />
                  <AppText variant="caption" style={styles.mediaName} numberOfLines={1}>
                    {asset.fileName || tr(asset.type === "video" ? "Video proof" : "Screenshot proof")}
                  </AppText>
                  {progress ? <AppText variant="caption" style={{ color: accent }}>{progress.percent ?? 0}%</AppText> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr("Remove attachment")}
                    hitSlop={8}
                    onPress={() => setMedia((current) => current.filter((item) => item.uri !== asset.uri))}
                    style={styles.remove}
                  >
                    <Icon name="x" size={17} color={theme.colors.danger} />
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <AppText variant="label">{tr("Describe your issue")}</AppText>
            <TextInput
              accessibilityLabel={tr("Describe your issue")}
              value={message}
              onChangeText={setMessage}
              editable={!loading}
              placeholder={tr("Tell us what happened, what you expected, and any important details.")}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
              style={[
                styles.messageInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.input,
                  borderColor: error ? theme.colors.danger : theme.colors.border,
                  textAlign,
                  writingDirection,
                },
              ]}
            />
            <AppText variant="caption" tone="muted" align={textAlign}>{tr("{{count}} / 500 characters", { count: message.length })}</AppText>
          </View>

          {error ? (
            <View accessibilityRole="alert" style={[styles.errorBox, { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger }]}>
              <Icon name="alert-circle" size={18} color={theme.colors.danger} />
              <AppText variant="caption" tone="danger" style={styles.flex}>{error}</AppText>
            </View>
          ) : null}

          <Button
            title={loading ? tr("Submitting…") : tr("Submit support request")}
            accessibilityLabel={tr("Submit support request")}
            onPress={() => void submit()}
            loading={loading}
            fullWidth
          />

          {loading ? (
            <View style={styles.progressNote}>
              <ActivityIndicator color={accent} size="small" />
              <AppText variant="caption" tone="secondary">{tr("Please keep Athoo open while attachments are uploading.")}</AppText>
            </View>
          ) : (
            <AppText variant="caption" tone="muted" align="center">{tr("Most requests receive a response within 24 hours.")}</AppText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 22 },
  headerAction: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  section: { gap: 10 },
  chips: { gap: 8, paddingVertical: 2, paddingEnd: 4 },
  chip: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  attach: { minHeight: 50, borderRadius: 15, borderWidth: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 16 },
  mediaRow: { minHeight: 48, borderRadius: 13, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12 },
  mediaName: { flex: 1 },
  remove: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  messageInput: { minHeight: 150, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, lineHeight: 22 },
  errorBox: { borderRadius: 14, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  progressNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 24 },
  successIcon: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center" },
  successMessage: { maxWidth: 520, lineHeight: 22 },
  actionWidth: { maxWidth: 420 },
});
