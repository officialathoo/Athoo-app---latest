import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { AppText } from "@/components/design";
import { useLang, type Lang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

const LANGUAGE_OPTIONS: Array<{ value: Lang; flag: string }> = [
  { value: "en", flag: "🇬🇧" },
  { value: "ur", flag: "🇵🇰" },
];

export function LanguageSelector() {
  const { lang, setLang, t } = useLang();
  const { theme } = useTheme();
  const [saving, setSaving] = useState<Lang | null>(null);

  const chooseLanguage = async (next: Lang) => {
    if (next === lang || saving) return;
    setSaving(next);
    try {
      await setLang(next);
    } finally {
      setSaving(null);
    }
  };

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      {LANGUAGE_OPTIONS.map((option, index) => {
        const selected = lang === option.value;
        const isSaving = saving === option.value;
        const title = option.value === "en" ? t.english : t.urdu;
        const description = option.value === "en" ? t.englishHint : t.urduHint;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${title}. ${description}`}
            accessibilityState={{ checked: selected, disabled: Boolean(saving) }}
            disabled={Boolean(saving)}
            onPress={() => void chooseLanguage(option.value)}
            style={({ pressed }) => [
              styles.row,
              index < LANGUAGE_OPTIONS.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.colors.divider,
              },
              pressed && { opacity: 0.78 },
            ]}
          >
            <View style={[styles.flag, { backgroundColor: selected ? theme.colors.infoSoft : theme.colors.surfaceAlt }]}> 
              <AppText variant="h2" align="center">{option.flag}</AppText>
            </View>
            <View style={styles.copy}>
              <AppText variant="bodyStrong">{title}</AppText>
              <AppText variant="caption" tone="secondary" style={styles.description}>{description}</AppText>
            </View>
            {isSaving ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : selected ? (
              <View style={[styles.selected, { backgroundColor: theme.colors.infoSoft }]}>
                <Icon name="check" size={16} color={theme.colors.primary} />
              </View>
            ) : (
              <View style={[styles.radio, { borderColor: theme.colors.border }]} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  flag: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 3 },
  description: { lineHeight: 18 },
  selected: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
});
