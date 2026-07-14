import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import * as Updates from "expo-updates";
import { Colors } from "@/constants/colors";
import { AthooTheme, darkTheme, lightTheme, ThemeMode } from "@/design/theme";

export type ThemePreference = ThemeMode | "system";

interface ThemeContextValue {
  theme: AthooTheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  toggleTheme: () => Promise<void>;
  ready: boolean;
}

const STORAGE_KEY = "athoo.theme.preference";


function syncLegacyColors(theme: AthooTheme) {
  // Many established screens still consume the legacy Colors object. Keeping
  // it synchronized lets those screens follow the selected theme while they
  // are incrementally migrated to useTheme().
  Colors.primary = theme.colors.primary;
  Colors.primaryDark = theme.colors.primaryPressed;
  Colors.gradientStart = theme.colors.primary;
  Colors.gradientEnd = theme.dark ? "#17263C" : "#0D4BA0";
  Colors.background = theme.colors.background;
  Colors.surface = theme.colors.surfaceAlt;
  Colors.card = theme.colors.surface;
  Colors.white = theme.colors.surface;
  Colors.text = theme.colors.text;
  Colors.textSecondary = theme.colors.textSecondary;
  Colors.textMuted = theme.colors.textMuted;
  Colors.border = theme.colors.border;
  Colors.shadow = theme.dark ? "#000000" : "#000000";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  preference: "system",
  setPreference: async () => {},
  toggleTheme: async () => {},
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system") {
          setPreferenceState(value);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const resolvedMode: ThemeMode =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const theme = resolvedMode === "dark" ? darkTheme : lightTheme;
  syncLegacyColors(theme);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    preference,
    ready,
    setPreference: async (nextPreference) => {
      setPreferenceState(nextPreference);
      await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
      // Reload once so StyleSheet values created by legacy screens are rebuilt
      // with the new synchronized palette. Shared/theme-aware screens update
      // immediately, while the reload completes full-app consistency.
      await Updates.reloadAsync().catch(() => undefined);
    },
    toggleTheme: async () => {
      const nextPreference: ThemePreference = theme.dark ? "light" : "dark";
      setPreferenceState(nextPreference);
      await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
      await Updates.reloadAsync().catch(() => undefined);
    },
  }), [preference, ready, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
