import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "@/constants/colors";
import { Icon } from "@/components/ui/Icon";

export const PAKISTAN_CITIES = [
  "Abbottabad",
  "Attock",
  "Bahawalpur",
  "Dera Ghazi Khan",
  "Faisalabad",
  "Gujranwala",
  "Gujrat",
  "Hyderabad",
  "Islamabad",
  "Jhang",
  "Karachi",
  "Kasur",
  "Lahore",
  "Larkana",
  "Mardan",
  "Mirpur Khas",
  "Multan",
  "Muzaffarabad",
  "Nawabshah",
  "Okara",
  "Peshawar",
  "Quetta",
  "Rahim Yar Khan",
  "Rawalpindi",
  "Sahiwal",
  "Sargodha",
  "Sheikhupura",
  "Sialkot",
  "Sukkur",
  "Wah Cantonment",
] as const;

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
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");

  const filteredCities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return PAKISTAN_CITIES;
    return PAKISTAN_CITIES.filter((city) => city.toLowerCase().includes(normalized));
  }, [query]);

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
          <Icon name="map-pin" size={17} color={value ? Colors.primary : Colors.textMuted} />
          <Text numberOfLines={1} style={[styles.valueText, !value && styles.placeholder]}>
            {value || "Select city"}
          </Text>
        </View>
        <Icon name="chevron-down" size={17} color={Colors.textMuted} />
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close city picker" style={styles.overlay} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Select City</Text>
                <Text style={styles.sheetSubtitle}>Choose your primary service area</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.closeButton} onPress={close}>
                <Icon name="x" size={20} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Icon name="search" size={17} color={Colors.textMuted} />
              <TextInput
                testID={`${testID}-search`}
                value={query}
                onChangeText={setQuery}
                placeholder="Search city"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.searchInput}
              />
              {query ? (
                <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")}>
                  <Icon name="x-circle" size={17} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

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
                    {selected ? <Icon name="check-circle" size={18} color={Colors.primary} /> : null}
                  </Pressable>
                );
              })}

              {filteredCities.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="search" size={24} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>No matching city</Text>
                  <Text style={styles.emptyText}>Try a different spelling or select the nearest major city.</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: Colors.text },
  required: { color: Colors.error },
  inputWrapper: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  valueRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  valueText: { flex: 1, fontSize: 16, color: Colors.text },
  placeholder: { color: Colors.textMuted },
  pressed: { opacity: 0.72 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 23, 42, 0.52)" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Platform.OS === "web" ? "80%" : "72%",
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
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
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  sheetSubtitle: { marginTop: 3, fontSize: 12, color: Colors.textSecondary },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
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
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
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
  cityRowSelected: { backgroundColor: `${Colors.primary}12` },
  cityText: { fontSize: 15, color: Colors.text },
  cityTextSelected: { color: Colors.primary, fontWeight: "700" },
  emptyState: { alignItems: "center", paddingVertical: 42, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: "700", color: Colors.text },
  emptyText: { marginTop: 5, fontSize: 13, lineHeight: 19, color: Colors.textSecondary, textAlign: "center" },
});
