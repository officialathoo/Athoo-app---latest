import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { router, type Href } from "expo-router";

export const LEGAL_VERSION = "1.0";

const TERMS_HREF: Href = "/legal/terms";
const PRIVACY_HREF: Href = "/legal/privacy";

interface Props {
  value: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Required legal acceptance checkbox shown on registration screens.
 * Tapping the Terms / Privacy links opens the in-app legal screens.
 */
export function LegalAcceptanceCheckbox({ value, onChange }: Props) {
  const openTerms = () => {
    try {
      router.push(TERMS_HREF);
    } catch {
      Linking.openURL("https://athoo.example/terms").catch(() => {});
    }
  };

  const openPrivacy = () => {
    try {
      router.push(PRIVACY_HREF);
    } catch {
      Linking.openURL("https://athoo.example/privacy").catch(() => {});
    }
  };

  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
    >
      <View style={[styles.box, value && styles.boxChecked]}>
        {value ? <Feather name="check" size={14} color="#fff" /> : null}
      </View>
      <Text style={styles.text}>
        I agree to the{" "}
        <Text style={styles.link} onPress={openTerms}>Terms of Service</Text>
        {" "}and{" "}
        <Text style={styles.link} onPress={openPrivacy}>Privacy Policy</Text>
        .
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  boxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  text: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  link: { color: Colors.primary, fontWeight: "700" },
});
