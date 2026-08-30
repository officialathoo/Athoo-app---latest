import React, { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, "contentContainerStyle">;
};

export function AppScreen({
  children,
  scroll = true,
  keyboardAware = false,
  padded = true,
  style,
  contentContainerStyle,
  scrollProps,
}: AppScreenProps) {
  const { theme } = useTheme();
  const horizontalPadding = padded ? redesign.layout.horizontalPadding : 0;
  const contentStyle: StyleProp<ViewStyle> = [
    {
      flexGrow: scroll ? 1 : undefined,
      paddingHorizontal: horizontalPadding,
      paddingBottom: theme.spacing.xl,
    },
    contentContainerStyle,
  ];

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...scrollProps}
      contentContainerStyle={contentStyle}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: horizontalPadding }, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.colors.background }, style]} edges={["top", "left", "right"]}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : body}
    </SafeAreaView>
  );
}