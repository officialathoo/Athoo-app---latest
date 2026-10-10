import React, { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { runtimeConfig } from "@/config/runtime";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

export const LEGAL_VERSION = "1.0";

const TERMS_HREF: Href = "/legal/terms";
const PRIVACY_HREF: Href = "/legal/privacy";

interface Props {
  value: boolean;
  onChange: (next: boolean) => void;
}

async function openLegalRoute(route: Href, externalUrl?: string) {
  try {
    router.push(route);
  } catch {
    if (externalUrl) await Linking.openURL(externalUrl).catch(() => undefined);
  }
}

/** Required legal acceptance checkbox shown on registration screens. */
export function LegalAcceptanceCheckbox({ value, onChange }: Props) {
  const { theme } = useTheme();
  const { direction, textAlign, translate: tr, writingDirection } = useLang();
  const styles = useMemo(() => createStyles(theme, direction === "rtl"), [direction, theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);

  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={tr("I agree to the Terms of Service and Privacy Policy")}
      accessibilityHint={tr("Required before creating or continuing an Athoo account")}
    >
      <View style={[styles.box, value && styles.boxChecked]} pointerEvents="none">
        {value ? <Feather name="check" size={14} color={theme.colors.white} /> : null}
      </View>
      <Text style={[styles.text, localizedText]}>
        {tr("I agree to the")} {" "}
        <Text
          accessibilityRole="link"
          accessibilityLabel={tr("Open Terms of Service")}
          style={styles.link}
          onPress={() => void openLegalRoute(TERMS_HREF, runtimeConfig.legal.termsUrl)}
        >
          {tr("Terms of Service")}
        </Text>
        {" "}{tr("and")}{" "}
        <Text
          accessibilityRole="link"
          accessibilityLabel={tr("Open Privacy Policy")}
          style={styles.link}
          onPress={() => void openLegalRoute(PRIVACY_HREF, runtimeConfig.legal.privacyUrl)}
        >
          {tr("Privacy Policy")}
        </Text>
        .
      </Text>
    </Pressable>
  );
}

function createStyles(theme: AthooTheme, isRtl: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: isRtl ? "row-reverse" : "row",
      alignItems: "flex-start",
      gap: 10,
      minHeight: 44,
      paddingVertical: 6,
    },
    pressed: { opacity: 0.78 },
    box: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.input,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
      flexShrink: 0,
    },
    boxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    text: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },
    link: { color: theme.colors.primary, fontWeight: "700" },
  });
}
