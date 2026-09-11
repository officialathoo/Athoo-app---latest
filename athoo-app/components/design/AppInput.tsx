import React, { useState } from "react";
import { StyleProp, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";
import { useOptionalLang } from "@/context/LanguageContext";

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  containerTestID?: string;
  labelTestID?: string;
  errorTestID?: string;
}

export function AppInput({
  label,
  error,
  containerStyle,
  style,
  onFocus,
  onBlur,
  containerTestID,
  labelTestID,
  errorTestID,
  ...props
}: AppInputProps) {
  const { theme } = useTheme();
  const language = useOptionalLang();
  const [focused, setFocused] = useState(false);
  const inputAccessibilityLabel = props.accessibilityLabel ?? label ?? props.placeholder;

  return (
    <View testID={containerTestID} style={[{ gap: theme.spacing.sm }, containerStyle]}>
      {label ? (
        <AppText testID={labelTestID} variant="label" tone={props.editable === false ? "muted" : "primary"}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        {...props}
        accessibilityLabel={inputAccessibilityLabel}
        accessibilityHint={props.accessibilityHint ?? (error ? error : undefined)}
        accessibilityInvalid={error ? true : undefined}
        maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? 1.5}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          {
            minHeight: 52,
            borderRadius: theme.radius.md,
            borderWidth: focused ? 2 : 1,
            borderColor: error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border,
            backgroundColor: props.editable === false ? theme.colors.surfaceAlt : theme.colors.input,
            color: theme.colors.text,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: props.multiline ? theme.spacing.md : 0,
            fontFamily: theme.typography.bodyLg.fontFamily,
            fontSize: theme.typography.bodyLg.fontSize,
            lineHeight: theme.typography.bodyLg.lineHeight,
            textAlign: language?.textAlign ?? "left",
            writingDirection: language?.writingDirection ?? "ltr",
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.editable === false && { opacity: 0.72 },
          style,
        ]}
      />
      {error ? (
        <AppText testID={errorTestID} accessibilityRole="alert" variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
