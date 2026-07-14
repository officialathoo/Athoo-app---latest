import React, { useState } from "react";
import { StyleProp, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AppInput({ label, error, containerStyle, style, onFocus, onBlur, ...props }: AppInputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[{ gap: theme.spacing.sm }, containerStyle]}>
      {label ? <AppText variant="label" tone={props.editable === false ? "muted" : "primary"}>{label}</AppText> : null}
      <TextInput
        {...props}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          {
            minHeight: 50,
            borderRadius: theme.radius.md,
            borderWidth: focused ? 2 : 1,
            borderColor: error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border,
            backgroundColor: props.editable === false ? theme.colors.surfaceAlt : theme.colors.input,
            color: theme.colors.text,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            fontFamily: "Inter_400Regular",
            fontSize: 15,
          },
          props.editable === false && { opacity: 0.72 },
          style,
        ]}
      />
      {error ? <AppText variant="caption" tone="danger">{error}</AppText> : null}
    </View>
  );
}
