import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { getCategoryAppearance } from "@/utils/categoryAppearance";
import { useAuth } from "@/context/AuthContext";
import { useCategories } from "@/context/CategoriesContext";
import { Provider } from "@/data/services";
import { api, realtime } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";

type ProviderRateRequest = {
  id: string;
  service: string;
  currentRate?: number | null;
  requestedRate: number;
  status: "pending" | "approved" | "rejected" | string;
  reviewNote?: string | null;
  createdAt?: string;
  reviewedAt?: string | null;
};

export default function EditProfileScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, updateUser, refreshUser } = useAuth();
  const { categories } = useCategories();
  const provider = user as Provider | null;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const approvedServices = useMemo(() => provider?.services || [], [provider?.services]);

  const [bio, setBio] = useState(provider?.bio || "");
  const [experience, setExperience] = useState(provider?.experience || "");
  const [location, setLocation] = useState(provider?.location || "");
  const [requestedRate, setRequestedRate] = useState(provider?.ratePerHour ? String(provider.ratePerHour) : "");
  const [newServices, setNewServices] = useState<string[]>([]);
  const [pendingServiceIds, setPendingServiceIds] = useState<string[]>([]);
  const [pendingRateRequest, setPendingRateRequest] = useState<ProviderRateRequest | null>(null);
  const [latestRateRequest, setLatestRateRequest] = useState<ProviderRateRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const ratePending = Boolean(pendingRateRequest);

  const loadApprovalStatus = useCallback(async () => {
    try {
      const [services, rates] = await Promise.all([api.getMyServiceRequests(), api.getMyRateRequests()]);
      setPendingServiceIds((services.requests || []).filter((item: any) => item.status === "pending").map((item: any) => item.serviceCategoryId).filter(Boolean));
      const rateRequests = ((rates.requests || []) as ProviderRateRequest[]);
      const pending = rateRequests.find((item) => item.status === "pending") || null;
      setPendingRateRequest(pending);
      setLatestRateRequest(rateRequests[0] || null);
      if (pending) setRequestedRate(String(pending.requestedRate));
      else setRequestedRate(provider?.ratePerHour ? String(provider.ratePerHour) : "");
    } catch {
      // Keep the last visible approval state when temporarily offline.
    }
  }, [provider?.ratePerHour]);

  useEffect(() => {
    void loadApprovalStatus();
  }, [loadApprovalStatus]);

  useEffect(() => realtime.on((message) => {
    const payload = (message.payload || {}) as Record<string, unknown>;
    if (message.type === "admin:event" && payload.resource === "providers" && payload.providerId === user?.id) {
      void refreshUser().then(() => loadApprovalStatus());
    }
  }), [loadApprovalStatus, refreshUser, user?.id]);

  const requestableCategories = categories.filter((category) =>
    category.isActive !== false && !approvedServices.includes(category.slug) && !pendingServiceIds.includes(category.id)
  );
  const pendingServiceCategories = categories.filter((category) => pendingServiceIds.includes(category.id));

  const toggleNewService = (id: string) => setNewServices((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const handleSave = async () => {
    if (bio.trim().length > 500) return Alert.alert("Bio too long", "Bio must be 500 characters or fewer.");
    if (experience.trim().length > 120) return Alert.alert("Experience too long", "Experience must be 120 characters or fewer.");
    if (location.trim().length > 160) return Alert.alert("Location too long", "Location must be 160 characters or fewer.");
    const rate = requestedRate ? Number(requestedRate) : null;
    if (!ratePending && requestedRate && (!Number.isInteger(rate) || rate! < 100 || rate! > 50000)) {
      return Alert.alert("Invalid rate", "Hourly rate must be a whole number from Rs. 100 to Rs. 50,000.");
    }

    setSaving(true);
    try {
      const direct: Record<string, unknown> = {};
      if (bio.trim() !== (provider?.bio || "")) direct.bio = bio.trim();
      if (experience.trim() !== (provider?.experience || "")) direct.experience = experience.trim();
      if (location.trim() !== (provider?.location || "")) direct.location = location.trim();
      if (Object.keys(direct).length) {
        const response = await api.updateMe(direct);
        await updateUser(response.user || direct);
      }

      for (const categoryId of newServices) {
        const category = categories.find((item) => item.id === categoryId);
        if (category) await api.requestServiceAdd({ serviceCategoryId: category.id, serviceName: category.name, note: "Requested from provider profile" });
      }

      const shouldRequestRate = !ratePending && rate !== null && rate !== (provider?.ratePerHour ?? null);
      if (shouldRequestRate) {
        if (!approvedServices.length) throw new Error("An approved service is required before requesting a rate change.");
        const response = await api.requestRateChange({ service: "general", requestedRate: rate, reason: "Requested from provider profile" });
        setPendingRateRequest(response.rateRequest as ProviderRateRequest);
        setLatestRateRequest(response.rateRequest as ProviderRateRequest);
      }

      await refreshUser();
      Alert.alert(
        "Profile updated",
        newServices.length || shouldRequestRate
          ? "Profile details were saved. Service and rate changes were sent to Athoo for approval."
          : "Your profile details were saved.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert("Could not save", apiErrorToMessage(error, "Please review your changes and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { paddingTop: topPad }]} testID="provider-edit-profile-screen">
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Go back"><Icon name="arrow-left" size={20} color={theme.colors.text} /></Pressable>
          <Text style={styles.title}>Edit Provider Profile</Text>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving} testID="provider-profile-save"><Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}>
          <View style={styles.notice}><Icon name="shield-check" size={16} color={theme.colors.primary} /><Text style={styles.noticeText}>Bio, experience, and location update immediately. New services and hourly-rate changes require Athoo approval.</Text></View>

          <Field label="Approved Services" hint="These services are visible to customers.">
            <View style={styles.chips}>{approvedServices.map((slug) => { const category = categories.find((item) => item.slug === slug); return <View key={slug} style={styles.approvedChip}><Icon name="check-circle" size={13} color={theme.colors.success} /><Text style={styles.chipText}>{category?.name || slug}</Text></View>; })}</View>
          </Field>

          {requestableCategories.length > 0 && <Field label="Request New Services" hint="Selected services enter the admin verification queue.">
            <View style={styles.chips}>
              {requestableCategories.map((category) => {
                const selected = newServices.includes(category.id);
                const appearance = getCategoryAppearance(category, theme);
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => toggleNewService(category.id)}
                    style={[styles.requestChip, selected && { borderColor: appearance.accent, backgroundColor: appearance.selectedBackground }]}
                    testID={`provider-service-request-${category.slug}`}
                  >
                    <Icon name={category.icon as any} size={13} color={appearance.accent} />
                    <Text style={styles.chipText}>{category.name}</Text>
                    {selected && <Icon name="check" size={12} color={appearance.accent} />}
                  </Pressable>
                );
              })}
            </View>
          </Field>}
          {pendingServiceIds.length > 0 && (
            <View style={styles.pendingServicesCard}>
              <View style={styles.pendingHeader}>
                <Icon name="clock" size={15} color={theme.colors.warning} />
                <Text style={styles.pendingTitle}>{pendingServiceIds.length} service request{pendingServiceIds.length === 1 ? "" : "s"} awaiting review</Text>
              </View>
              <View style={styles.chips}>
                {pendingServiceCategories.map((category) => (
                  <View key={category.id} style={styles.pendingChip}>
                    <Text style={styles.pendingChipText}>{category.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Field label="Bio" hint="Describe your skills and professional approach."><TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio} multiline maxLength={500} textAlignVertical="top" placeholder="Tell customers about your work..." placeholderTextColor={theme.colors.textMuted} /></Field>
          <Field label="Experience" hint="Keep this factual and concise."><TextInput style={styles.input} value={experience} onChangeText={setExperience} maxLength={120} placeholder="e.g. 5 years residential plumbing" placeholderTextColor={theme.colors.textMuted} /></Field>
          <Field label="Primary Work Location" hint="Your service-radius settings still control matching."><TextInput style={styles.input} value={location} onChangeText={setLocation} maxLength={160} placeholder="e.g. Lahore, Karachi, Peshawar" placeholderTextColor={theme.colors.textMuted} /></Field>
          <View style={styles.rateStatusCard}>
            <View style={styles.rateStatusHeader}>
              <View style={styles.rateStatusIcon}><Icon name="dollar-sign" size={16} color={theme.colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rateStatusTitle}>Public hourly rate</Text>
                <Text style={styles.rateStatusText}>Customers see only the approved rate. A requested rate becomes public after Athoo approval.</Text>
              </View>
            </View>
            <View style={styles.rateRow}>
              <Text style={styles.rateRowLabel}>Currently approved</Text>
              <Text style={styles.rateApprovedValue}>{provider?.ratePerHour ? `Rs. ${provider.ratePerHour}/hr` : "Not set"}</Text>
            </View>
            {pendingRateRequest ? (
              <View style={[styles.rateRow, styles.rateRowBorder]}>
                <View>
                  <Text style={styles.rateRowLabel}>Pending request</Text>
                  <Text style={styles.ratePendingMeta}>Awaiting admin review</Text>
                </View>
                <Text style={styles.ratePendingValue}>Rs. {pendingRateRequest.requestedRate}/hr</Text>
              </View>
            ) : latestRateRequest?.status === "rejected" ? (
              <View style={styles.rateRejectedBox}>
                <Text style={styles.rateRejectedTitle}>Last request was rejected</Text>
                <Text style={styles.rateRejectedText}>{latestRateRequest.reviewNote || "Review the allowed range and submit a new rate."}</Text>
              </View>
            ) : latestRateRequest?.status === "approved" ? (
              <Text style={styles.rateApprovedNote}>Your latest approved rate is active on customer profiles.</Text>
            ) : null}
          </View>

          <Field
            label="Request General Hourly Rate (Rs.)"
            hint={ratePending ? `Pending request: Rs. ${pendingRateRequest?.requestedRate}/hr. You can submit another rate after review.` : `Current approved rate: ${provider?.ratePerHour ? `Rs. ${provider.ratePerHour}/hr` : "not set"}`}
          >
            <TextInput style={[styles.input, ratePending && styles.readOnlyInput]} value={requestedRate} onChangeText={(value) => setRequestedRate(value.replace(/[^0-9]/g, ""))} keyboardType="numeric" editable={!ratePending} placeholder="e.g. 1500" placeholderTextColor={theme.colors.textMuted} testID="provider-rate-request-input" />
          </Field>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const fieldStyles = useMemo(() => StyleSheet.create({
    field: { gap: 7 },
    label: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
    hint: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary },
  }), [theme]);

  return <View style={fieldStyles.field}><Text style={fieldStyles.label}>{label}</Text>{hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}{children}</View>;
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceAlt },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: theme.colors.text },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9 },
  saveBtnText: { color: theme.colors.onBrand, fontWeight: "800", fontSize: 13 }, disabled: { opacity: 0.55 },
  content: { padding: 18, gap: 20 }, notice: { flexDirection: "row", gap: 9, padding: 13, borderRadius: 12, backgroundColor: theme.colors.primary + "10", borderWidth: 1, borderColor: theme.colors.primary + "25" }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },
  input: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: theme.colors.text }, textArea: { minHeight: 105 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, approvedChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.colors.successSoft, borderWidth: 1, borderColor: theme.colors.successSoft },
  requestChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: theme.colors.border }, chipText: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  pendingServicesCard: { marginTop: -8, padding: 12, borderRadius: 12, backgroundColor: theme.colors.warningSoft, borderWidth: 1, borderColor: theme.colors.warning + "35", gap: 9 },
  pendingHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  pendingTitle: { flex: 1, fontSize: 12, fontWeight: "800", color: theme.colors.warning },
  pendingChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.warning + "35" },
  pendingChipText: { fontSize: 11, fontWeight: "700", color: theme.colors.text },
  rateStatusCard: { padding: 14, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 12 },
  rateStatusHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rateStatusIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary + "15" },
  rateStatusTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  rateStatusText: { marginTop: 2, fontSize: 11, lineHeight: 16, color: theme.colors.textSecondary },
  rateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rateRowBorder: { paddingTop: 11, borderTopWidth: 1, borderTopColor: theme.colors.border },
  rateRowLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: "600" },
  rateApprovedValue: { fontSize: 14, fontWeight: "800", color: theme.colors.success },
  ratePendingValue: { fontSize: 14, fontWeight: "800", color: theme.colors.warning },
  ratePendingMeta: { marginTop: 2, fontSize: 10, color: theme.colors.textMuted },
  rateRejectedBox: { padding: 10, borderRadius: 10, backgroundColor: theme.colors.dangerSoft, gap: 3 },
  rateRejectedTitle: { fontSize: 12, fontWeight: "800", color: theme.colors.danger },
  rateRejectedText: { fontSize: 11, lineHeight: 16, color: theme.colors.textSecondary },
  rateApprovedNote: { fontSize: 11, lineHeight: 16, color: theme.colors.success, fontWeight: "700" },
  readOnlyInput: { opacity: 0.7, backgroundColor: theme.colors.surfaceAlt },
});
