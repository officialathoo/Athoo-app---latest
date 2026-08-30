import React, { type ReactNode, useState } from "react";
import {
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";

type TextFieldProps = TextInputProps & {
  label?: string;
  helperText?: string;
  error?: string;
  left?: ReactNode;
  right?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  helperText,
  error,
  left,
  right,
  containerStyle,
  onFocus,
  onBlur,
  editable = true,
  ...inputProps
}: TextFieldProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[theme.typography.label, { color: theme.colors.text, marginBottom: theme.spacing.sm }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          minHeight: redesign.control.standardHeight,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: focused ? redesign.visual.focusedBorderWidth : redesign.visual.inputBorderWidth,
          borderColor,
          backgroundColor: theme.colors.input,
          paddingHorizontal: theme.spacing.lg,
          opacity: editable ? 1 : redesign.visual.disabledOpacity,
        }}
      >
        {left}
        <TextInput
          {...inputProps}
          editable={editable}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            theme.typography.bodyLg,
            { flex: 1, color: theme.colors.text, paddingVertical: 0 },
            inputProps.style,
          ]}
        />
        {right}
      </View>
      {error || helperText ? (
        <Text
          style={[
            theme.typography.caption,
            { color: error ? theme.colors.danger : theme.colors.textSecondary, marginTop: theme.spacing.xs },
          ]}
        >
          {error || helperText}
        </Text>
      ) : null}
    </View>
  );
}