import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
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

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    preference,
    ready,
    setPreference: async (nextPreference) => {
      setPreferenceState(nextPreference);
      await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
    },
    toggleTheme: async () => {
      const nextPreference: ThemePreference = theme.dark ? "light" : "dark";
      setPreferenceState(nextPreference);
      await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
    },
  }), [preference, ready, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
