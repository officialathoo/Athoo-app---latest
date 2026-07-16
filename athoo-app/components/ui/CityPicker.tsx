import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { api } from "@/services/api";

// City data is loaded from the admin-managed service-area API. No duplicate
// city catalogue is embedded in the mobile app.
type CityPickerProps = {
  value: string;
  onChange: (city: string) => void;
  label?: string;
  required?: boolean;
  testID?: string;
};

export function CityPicker({
  value,
  onChange,
  label = "City",
  required = false,
  testID = "city-picker",
}: CityPickerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .getActiveServiceAreas()
      .then((data) => {
        if (!mounted) return;
        setCities(
          (data.areas || [])
            .filter((area) => area.isActive !== false)
            .map((area) => area.name),
        );
      })
      .catch(() => {
        // Keep the picker usable with the current value when the service-area
        // catalogue is temporarily unavailable.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredCities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return cities;
    return cities.filter((city) => city.toLowerCase().includes(normalized));
  }, [cities, query]);

  const close = () => {
    setVisible(false);
    setQuery("");
  };

  const choose = (city: string) => {
    onChange(city);
    close();
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>
        {label} {required ? <Text style={styles.required}>*</Text> : null}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value || "No city selected"}`}
        testID={testID}
        style={({ pressed }) => [styles.inputWrapper, pressed && styles.pressed]}
        onPress={() => setVisible(true)}
      >
        <View style={styles.valueRow}>
          <Icon name="map-pin" size={17} color={value ? theme.colors.primary : theme.colors.textMuted} />
          <Text numberOfLines={1} style={[styles.valueText, !value && styles.placeholder]}>
            {value || "Select city"}
          </Text>
        </View>
        <Icon name="chevron-down" size={17} color={theme.colors.textMuted} />
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close city picker" style={styles.overlay} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.headingCopy}>
                <Text style={styles.sheetTitle}>Select City</Text>
                <Text style={styles.sheetSubtitle}>Choose your primary service area</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.closeButton} onPress={close}>
                <Icon name="x" size={20} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Icon name="search" size={17} color={theme.colors.textMuted} />
              <TextInput
                testID={`${testID}-search`}
                value={query}
                onChangeText={setQuery}
                placeholder="Search city"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.searchInput}
              />
              {query ? (
                <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")}>
                  <Icon name="x-circle" size={17} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.emptyText}>Loading cities…</Text>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} contentContainerStyle={styles.listContent}>
                {filteredCities.map((city) => {
                  const selected = value === city;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={city}
                      style={({ pressed }) => [
                        styles.cityRow,
                        selected && styles.cityRowSelected,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => choose(city)}
                    >
                      <Text style={[styles.cityText, selected && styles.cityTextSelected]}>{city}</Text>
                      {selected ? <Icon name="check-circle" size={18} color={theme.colors.primary} /> : null}
                    </Pressable>
                  );
                })}

                {filteredCities.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Icon name="search" size={24} color={theme.colors.textMuted} />
                    <Text style={styles.emptyTitle}>No matching city</Text>
                    <Text style={styles.emptyText}>Try a different spelling or select the nearest major city.</Text>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    inputGroup: { gap: 8 },
    label: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
    required: { color: theme.colors.danger },
    inputWrapper: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.input,
      borderRadius: 14,
      paddingHorizontal: 16,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
    },
    valueRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    valueText: { flex: 1, fontSize: 16, color: theme.colors.text },
    placeholder: { color: theme.colors.textMuted },
    pressed: { opacity: 0.72 },
    modalRoot: { flex: 1, justifyContent: "flex-end" },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
    sheet: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: Platform.OS === "web" ? "80%" : "72%",
      paddingBottom: Platform.OS === "ios" ? 24 : 12,
    },
    handle: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      alignSelf: "center",
      marginTop: 10,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 14,
      gap: 12,
    },
    headingCopy: { flex: 1 },
    sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
    sheetSubtitle: { marginTop: 3, fontSize: 12, color: theme.colors.textSecondary },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    searchBox: {
      marginHorizontal: 20,
      marginBottom: 10,
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: theme.colors.input,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: theme.colors.text },
    list: { paddingHorizontal: 16 },
    listContent: { paddingBottom: 24 },
    cityRow: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    cityRowSelected: { backgroundColor: theme.colors.infoSoft },
    cityText: { fontSize: 15, color: theme.colors.text },
    cityTextSelected: { color: theme.colors.primary, fontWeight: "700" },
    emptyState: { alignItems: "center", paddingVertical: 42, paddingHorizontal: 24, gap: 8 },
    emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: "700", color: theme.colors.text },
    emptyText: { marginTop: 5, fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary, textAlign: "center" },
  });
}
