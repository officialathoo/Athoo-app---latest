import { Icon } from "@/components/ui/Icon";
import React, { useState, useEffect , useMemo} from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Platform } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

const RADIUS_OPTIONS = [5, 10, 15, 20, 30, 50];

export default function ServiceRadiusScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user, updateUser } = useAuth();
  const [selected, setSelected] = useState<number>((user as any)?.maxTravelDistanceKm || 15);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dist = (user as any)?.maxTravelDistanceKm;
    if (dist) setSelected(dist);
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser({ maxTravelDistanceKm: selected } as any);
      Alert.alert("Saved", `Your service radius is set to ${selected} km.`);
      router.back();
    } catch {
      Alert.alert("Error", "Could not save your service radius. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title}>Service Radius</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Icon name="map-pin" size={28} color={theme.colors.primary} />
          <Text style={styles.infoTitle}>Set Your Travel Radius</Text>
          <Text style={styles.infoDesc}>
            Customers outside your selected radius won't see your profile in their search results. Choose a radius that balances reach and travel convenience.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Select Maximum Distance</Text>
        <View style={styles.optionsGrid}>
          {RADIUS_OPTIONS.map(km => (
            <Pressable
              key={km}
              onPress={() => setSelected(km)}
              style={[styles.option, selected === km && styles.optionSelected]}
            >
              <Text style={[styles.optionKm, selected === km && styles.optionKmSelected]}>{km}</Text>
              <Text style={[styles.optionUnit, selected === km && styles.optionUnitSelected]}>km</Text>
              {km <= 10 && <Text style={[styles.optionTag, selected === km && styles.optionTagSelected]}>Local</Text>}
              {km === 15 && <Text style={[styles.optionTag, selected === km && styles.optionTagSelected]}>Recommended</Text>}
              {km >= 20 && <Text style={[styles.optionTag, selected === km && styles.optionTagSelected]}>Wide Reach</Text>}
            </Pressable>
          ))}
        </View>

        <View style={styles.selectedSummary}>
          <Icon name="info" size={15} color={theme.colors.primary} />
          <Text style={styles.selectedSummaryText}>
            With a <Text style={{ fontWeight: "800" }}>{selected} km</Text> radius, you'll receive job requests from customers within approximately {selected} km of your set location.
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>Tips</Text>
          <Text style={styles.tip}>• A 10–15 km radius covers most of Pakistan comfortably.</Text>
          <Text style={styles.tip}>• A larger radius means more job opportunities but longer travel.</Text>
          <Text style={styles.tip}>• You can change this setting at any time from your profile.</Text>
        </View>

        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.onBrand} size="small" />
          ) : (
            <>
              <Icon name="check" size={16} color={theme.colors.onBrand} />
              <Text style={styles.saveBtnText}>Save Service Radius</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  infoCard: {
    alignItems: "center", backgroundColor: theme.colors.surface,
    borderRadius: 18, padding: 24, gap: 10,
    shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  infoTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  infoDesc: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginBottom: 2 },
  optionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  option: {
    flex: 1, minWidth: "28%", alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 16, paddingVertical: 16,
    borderWidth: 2, borderColor: theme.colors.border, gap: 2,
  },
  optionSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "10" },
  optionKm: { fontSize: 26, fontWeight: "900", color: theme.colors.text },
  optionKmSelected: { color: theme.colors.primary },
  optionUnit: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: "600" },
  optionUnitSelected: { color: theme.colors.primary },
  optionTag: { fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginTop: 2 },
  optionTagSelected: { color: theme.colors.primary + "CC" },
  selectedSummary: {
    flexDirection: "row", gap: 8, backgroundColor: theme.colors.primary + "10",
    borderRadius: 12, padding: 14, alignItems: "flex-start",
    borderWidth: 1, borderColor: theme.colors.primary + "30",
  },
  selectedSummaryText: { flex: 1, fontSize: 13, color: theme.colors.text, lineHeight: 20 },
  tipBox: {
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, padding: 16, gap: 6,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  tipTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginBottom: 2 },
  tip: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 16, marginTop: 4,
  },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: theme.colors.onBrand },
});
