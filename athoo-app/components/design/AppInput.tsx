import React, { useState } from "react";
import { StyleProp, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";
import { useOptionalLang } from "@/context/LanguageContext";
import { redesign } from "@/design/redesign";

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AppInput({ label, error, containerStyle, style, onFocus, onBlur, ...props }: AppInputProps) {
  const { theme } = useTheme();
  const language = useOptionalLang();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[{ gap: theme.spacing.sm }, containerStyle]}>
      {label ? <AppText variant="label" tone={props.editable === false ? "muted" : "primary"}>{label}</AppText> : null}
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder}
        accessibilityState={{
          ...props.accessibilityState,
          disabled: props.editable === false || props.accessibilityState?.disabled,
        }}
        maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? 1.5}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          {
            minHeight: redesign.control.standardHeight,
            borderRadius: theme.radius.md,
            borderWidth: focused ? redesign.visual.focusedBorderWidth : redesign.visual.inputBorderWidth,
            borderColor: error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border,
            backgroundColor: props.editable === false ? theme.colors.surfaceAlt : theme.colors.input,
            color: theme.colors.text,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            ...theme.typography.bodyLg,
            textAlign: language?.textAlign ?? "left",
            writingDirection: language?.writingDirection ?? "ltr",
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.editable === false && { opacity: 0.72 },
          style,
        ]}
      />
      {error ? <AppText variant="caption" tone="danger">{error}</AppText> : null}
    </View>
  );
}
