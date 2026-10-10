import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Stack } from "expo-router";

export default function AuthLayout() {
  const { direction } = useLang();
  const { theme } = useTheme();
  const isRtl = direction === "rtl";

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: isRtl ? "slide_from_left" : "slide_from_right",
      }}
    />
  );
}
