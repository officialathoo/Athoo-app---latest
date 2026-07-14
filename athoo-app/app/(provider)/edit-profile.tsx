import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useCategories } from "@/context/CategoriesContext";
import { Provider } from "@/data/services";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";

export default function EditProfileScreen() {
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
  const [ratePending, setRatePending] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getMyServiceRequests(), api.getMyRateRequests()]).then(([services, rates]) => {
      setPendingServiceIds((services.requests || []).filter((item: any) => item.status === "pending").map((item: any) => item.serviceCategoryId).filter(Boolean));
      setRatePending((rates.requests || []).some((item: any) => item.status === "pending"));
    }).catch(() => undefined);
  }, []);

  const requestableCategories = categories.filter((category) =>
    category.isActive !== false && !approvedServices.includes(category.slug) && !pendingServiceIds.includes(category.id)
  );

  const toggleNewService = (id: string) => setNewServices((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const handleSave = async () => {
    if (bio.trim().length > 500) return Alert.alert("Bio too long", "Bio must be 500 characters or fewer.");
    if (experience.trim().length > 120) return Alert.alert("Experience too long", "Experience must be 120 characters or fewer.");
    if (location.trim().length > 160) return Alert.alert("Location too long", "Location must be 160 characters or fewer.");
    const rate = requestedRate ? Number(requestedRate) : null;
    if (requestedRate && (!Number.isInteger(rate) || rate! < 100 || rate! > 50000)) {
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

      if (rate !== null && rate !== (provider?.ratePerHour ?? null)) {
        if (ratePending) throw new Error("A rate change request is already pending.");
        const primaryService = approvedServices[0];
        if (!primaryService) throw new Error("An approved service is required before requesting a rate change.");
        await api.requestRateChange({ service: primaryService, requestedRate: rate, reason: "Requested from provider profile" });
      }

      await refreshUser();
      Alert.alert(
        "Profile updated",
        newServices.length || (rate !== null && rate !== (provider?.ratePerHour ?? null))
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
          <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Go back"><Icon name="arrow-left" size={20} color={Colors.text} /></Pressable>
          <Text style={styles.title}>Edit Provider Profile</Text>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving} testID="provider-profile-save"><Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}>
          <View style={styles.notice}><Icon name="shield-check" size={16} color={Colors.primary} /><Text style={styles.noticeText}>Bio, experience, and location update immediately. New services and hourly-rate changes require Athoo approval.</Text></View>

          <Field label="Approved Services" hint="These services are visible to customers.">
            <View style={styles.chips}>{approvedServices.map((slug) => { const category = categories.find((item) => item.slug === slug); return <View key={slug} style={styles.approvedChip}><Icon name="check-circle" size={13} color="#16A34A" /><Text style={styles.chipText}>{category?.name || slug}</Text></View>; })}</View>
          </Field>

          {requestableCategories.length > 0 && <Field label="Request New Services" hint="Selected services enter the admin verification queue.">
            <View style={styles.chips}>{requestableCategories.map((category) => { const selected = newServices.includes(category.id); return <Pressable key={category.id} onPress={() => toggleNewService(category.id)} style={[styles.requestChip, selected && { borderColor: category.color, backgroundColor: category.color + "18" }]} testID={`provider-service-request-${category.slug}`}><Icon name={category.icon as any} size={13} color={category.color} /><Text style={styles.chipText}>{category.name}</Text>{selected && <Icon name="check" size={12} color={category.color} />}</Pressable>; })}</View>
          </Field>}
          {pendingServiceIds.length > 0 && <Text style={styles.pendingText}>{pendingServiceIds.length} service request{pendingServiceIds.length === 1 ? " is" : "s are"} awaiting review.</Text>}

          <Field label="Bio" hint="Describe your skills and professional approach."><TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio} multiline maxLength={500} textAlignVertical="top" placeholder="Tell customers about your work..." placeholderTextColor={Colors.textMuted} /></Field>
          <Field label="Experience" hint="Keep this factual and concise."><TextInput style={styles.input} value={experience} onChangeText={setExperience} maxLength={120} placeholder="e.g. 5 years residential plumbing" placeholderTextColor={Colors.textMuted} /></Field>
          <Field label="Primary Work Location" hint="Your service-radius settings still control matching."><TextInput style={styles.input} value={location} onChangeText={setLocation} maxLength={160} placeholder="e.g. Lahore, Karachi, Peshawar" placeholderTextColor={Colors.textMuted} /></Field>
          <Field label="Requested Hourly Rate (Rs.)" hint={ratePending ? "A rate request is already pending." : `Current approved rate: ${provider?.ratePerHour ? `Rs. ${provider.ratePerHour}` : "not set"}`}><TextInput style={styles.input} value={requestedRate} onChangeText={(value) => setRequestedRate(value.replace(/[^0-9]/g, ""))} keyboardType="numeric" editable={!ratePending} placeholder="e.g. 1500" placeholderTextColor={Colors.textMuted} testID="provider-rate-request-input" /></Field>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{hint ? <Text style={styles.hint}>{hint}</Text> : null}{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9 },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 }, disabled: { opacity: 0.55 },
  content: { padding: 18, gap: 20 }, notice: { flexDirection: "row", gap: 9, padding: 13, borderRadius: 12, backgroundColor: Colors.primary + "10", borderWidth: 1, borderColor: Colors.primary + "25" }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: Colors.textSecondary },
  field: { gap: 7 }, label: { fontSize: 14, fontWeight: "800", color: Colors.text }, hint: { fontSize: 12, lineHeight: 17, color: Colors.textSecondary },
  input: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.text }, textArea: { minHeight: 105 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, approvedChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC" },
  requestChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border }, chipText: { fontSize: 12, fontWeight: "700", color: Colors.text }, pendingText: { marginTop: -10, fontSize: 12, color: "#B45309", fontWeight: "700" },
});
