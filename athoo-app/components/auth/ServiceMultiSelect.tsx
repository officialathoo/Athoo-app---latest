import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ServiceMultiSelectOption = {
  id: string;
  slug?: string | null;
  name: string;
  icon?: string | null;
};

type Props = {
  options: ServiceMultiSelectOption[];
  selected: string[];
  onToggle: (value: string) => void;
  label?: string;
  required?: boolean;
};

export function ServiceMultiSelect({
  options,
  selected,
  onToggle,
  label = "Services Offered",
  required = false,
}: Props) {
  const { theme } = useTheme();
  const { translate: tr } = useLang();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selected.map(String)), [selected]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(String(option.slug || option.id))),
    [options, selectedSet],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.name} ${option.slug || ""}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const summary =
    selectedOptions.length === 0
      ? tr("Select one or more services")
      : tr("{{count}} services selected", { count: selectedOptions.length });
  const preview = selectedOptions
    .slice(0, 3)
    .map((option) => option.name)
    .join(", ");

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={styles.group}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("Choose services")}
        accessibilityHint={tr("Opens a searchable list of services")}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <View style={styles.triggerIcon}>
          <Icon name="briefcase" size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.triggerCopy}>
          <Text style={styles.triggerTitle}>{summary}</Text>
          <Text style={styles.triggerHint} numberOfLines={1}>
            {preview || tr("Search and select services without filling this screen")}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{selectedOptions.length}</Text>
        </View>
        <Icon name="chevron-down" size={18} color={theme.colors.textSecondary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View
            style={[
              styles.sheet,
              {
                paddingBottom:
                  Math.max(insets.bottom, Platform.OS === "web" ? 20 : 12) + 12,
              },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{tr("Select Services")}</Text>
                <Text style={styles.sheetSubtitle}>
                  {tr("Choose every service you professionally offer.")}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr("Close")}
                onPress={close}
                style={styles.closeButton}
              >
                <Icon name="x" size={19} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.search}>
              <Icon name="search" size={18} color={theme.colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={tr("Search services")}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={10}>
                  <Icon name="x-circle" size={17} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.selectionLine}>
              <Text style={styles.selectionText}>
                {selectedOptions.length === 0
                  ? tr("No services selected yet")
                  : tr("{{count}} selected", { count: selectedOptions.length })}
              </Text>
              {selectedOptions.length > 0 ? (
                <Text style={styles.selectionHelp}>{tr("Tap a row to remove it")}</Text>
              ) : null}
            </View>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filtered.length > 0 ? (
                filtered.map((option) => {
                  const value = String(option.slug || option.id);
                  const checked = selectedSet.has(value);
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: checked }}
                      onPress={() => onToggle(value)}
                      style={({ pressed }) => [
                        styles.option,
                        checked && styles.optionSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.optionIcon, checked && styles.optionIconSelected]}>
                        <Icon
                          name={(option.icon || "tool") as any}
                          size={18}
                          color={checked ? theme.colors.primary : theme.colors.textSecondary}
                        />
                      </View>
                      <Text style={[styles.optionName, checked && styles.optionNameSelected]}>
                        {option.name}
                      </Text>
                      <View style={[styles.selectionMark, checked && styles.selectionMarkActive]}>
                        {checked ? (
                          <Icon name="check" size={14} color={theme.colors.white} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View style={styles.empty}>
                  <Icon name="search" size={28} color={theme.colors.textMuted} />
                  <Text style={styles.emptyTitle}>{tr("No services found")}</Text>
                  <Text style={styles.emptyText}>
                    {tr("Try another search term or ask Athoo to add the service.")}
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
            >
              <Text style={styles.doneText}>
                {selectedOptions.length > 0
                  ? tr("Done - {{count}} selected", { count: selectedOptions.length })
                  : tr("Done")}
              </Text>
              <Icon name="check-circle" size={18} color={theme.colors.white} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    group: { gap: 7 },
    label: { fontSize: 12.5, fontWeight: "700", color: theme.colors.text },
    required: { color: theme.colors.danger },
    trigger: {
      minHeight: 66,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.primary + "55",
      backgroundColor: theme.dark ? "rgba(37,99,235,0.08)" : theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    triggerIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary + "12",
    },
    triggerCopy: { flex: 1, minWidth: 0, gap: 3 },
    triggerTitle: { fontSize: 13.5, fontWeight: "800", color: theme.colors.text },
    triggerHint: { fontSize: 11.5, color: theme.colors.textSecondary },
    countBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 7,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary + "16",
    },
    countText: { fontSize: 12, fontWeight: "800", color: theme.colors.primary },
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(2,8,23,0.62)",
    },
    sheet: {
      maxHeight: "82%",
      width: "100%",
      maxWidth: 620,
      alignSelf: "center",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 18,
      paddingTop: 10,
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: -8 },
      elevation: 24,
    },
    handle: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      alignSelf: "center",
      marginBottom: 12,
    },
    sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
    sheetTitle: { fontSize: 21, fontWeight: "800", color: theme.colors.text },
    sheetSubtitle: { fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary, marginTop: 3 },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    search: {
      minHeight: 48,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 13,
    },
    searchInput: { flex: 1, color: theme.colors.text, fontSize: 14, paddingVertical: 0 },
    selectionLine: {
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 8,
    },
    selectionText: { color: theme.colors.primary, fontSize: 12, fontWeight: "800" },
    selectionHelp: { color: theme.colors.textMuted, fontSize: 10.5 },
    list: { flexGrow: 0 },
    listContent: { gap: 8, paddingBottom: 12 },
    option: {
      minHeight: 54,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    optionSelected: {
      borderColor: theme.colors.primary + "88",
      backgroundColor: theme.colors.primary + "0C",
    },
    optionIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    optionIconSelected: { backgroundColor: theme.colors.primary + "12" },
    optionName: { flex: 1, fontSize: 13.5, fontWeight: "600", color: theme.colors.textSecondary },
    optionNameSelected: { color: theme.colors.text, fontWeight: "800" },
    selectionMark: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    selectionMarkActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    empty: { alignItems: "center", paddingVertical: 34, paddingHorizontal: 24, gap: 8 },
    emptyTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
    emptyText: { fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary, textAlign: "center" },
    doneButton: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: theme.colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      marginTop: 4,
    },
    doneText: { color: theme.colors.white, fontSize: 15, fontWeight: "800" },
    pressed: { opacity: 0.76 },
  });
}
