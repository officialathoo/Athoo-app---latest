import { reloadAppAsync } from "expo";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useOptionalLang } from "@/context/LanguageContext";
import { appLogger } from "@/lib/logger";
import { redesign } from "@/design/redesign";
import { radius, typography } from "@/design/tokens";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ resetError }: ErrorFallbackProps) {
  const colors = useColors();
  const language = useOptionalLang();
  const tr = language?.translate ?? ((message: string) => message);
  const localizedText = {
    textAlign: language?.textAlign ?? ("center" as const),
    writingDirection: language?.writingDirection ?? ("ltr" as const),
  };
  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      appLogger.error("error-boundary-restart", restartError);
      resetError();
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      accessibilityRole="alert"
    >
      <View style={styles.content}>
        <Text style={[styles.title, localizedText, { color: colors.text }]}>
          {tr("Something went wrong")}
        </Text>

        <Text style={[styles.message, localizedText, { color: colors.textMuted }]}>
          {tr("Please try again. If the issue continues, contact support.")}
        </Text>

        <Pressable
          onPress={handleRestart}
          accessibilityRole="button"
          accessibilityLabel={tr("Try Again")}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? redesign.visual.pressedScale : 1 }],
              shadowColor: colors.shadow,
            },
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              localizedText,
              { color: colors.white },
            ]}
          >
            {tr("Try Again")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: redesign.layout.sectionGap,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: redesign.layout.fieldGap,
    width: "100%",
    maxWidth: redesign.layout.maxContentWidth,
  },
  title: {
    ...typography.h1,
    textAlign: "center",
  },
  message: {
    ...typography.bodyLg,
    textAlign: "center",
    maxWidth: 520,
  },
  button: {
    minHeight: redesign.control.standardHeight,
    borderRadius: radius.md,
    paddingHorizontal: 24,
    minWidth: 200,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    ...typography.label,
    textAlign: "center",
  },
});
