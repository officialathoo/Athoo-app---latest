import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  isChanging: boolean;
}

const STORAGE_KEY = "athoo.theme.preference";


function syncLegacyColors(theme: AthooTheme) {
  // Many established screens still consume the legacy Colors object. Keeping
  // it synchronized lets those screens follow the selected theme while they
  // are incrementally migrated to useTheme().
  Colors.primary = theme.colors.primary;
  Colors.primaryDark = theme.colors.primaryPressed;
  Colors.gradientStart = theme.colors.primary;
  Colors.gradientEnd = theme.colors.primaryPressed;
  Colors.background = theme.colors.background;
  Colors.surface = theme.colors.surfaceAlt;
  Colors.card = theme.colors.surface;
  // Semantic white is used for text/icons on brand gradients and destructive
  // controls. It must remain true white in both themes; mapping it to a dark
  // surface made branding and button labels disappear in dark mode.
  Colors.white = theme.colors.white;
  Colors.text = theme.colors.text;
  Colors.textSecondary = theme.colors.textSecondary;
  Colors.textMuted = theme.colors.textMuted;
  Colors.secondary = theme.colors.secondary;
  Colors.success = theme.colors.success;
  Colors.error = theme.colors.danger;
  Colors.warning = theme.colors.warning;
  Colors.accent = theme.colors.accent;
  Colors.border = theme.colors.border;
  Colors.shadow = theme.colors.overlay;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  preference: "system",
  setPreference: async () => {},
  toggleTheme: async () => {},
  ready: false,
  isChanging: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

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

  const applyPreference = useCallback(async (nextPreference: ThemePreference) => {
    if (nextPreference === preference || isChanging) return;
    setIsChanging(true);
    setPreferenceState(nextPreference);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
      // Legacy screens still create some StyleSheet values at module load.
      // A controlled reload rebuilds those styles with the synchronized palette.
      await Updates.reloadAsync().catch(() => undefined);
    } finally {
      setIsChanging(false);
    }
  }, [isChanging, preference]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    preference,
    ready,
    isChanging,
    setPreference: applyPreference,
    toggleTheme: async () => {
      await applyPreference(theme.dark ? "light" : "dark");
    },
  }), [applyPreference, isChanging, preference, ready, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
