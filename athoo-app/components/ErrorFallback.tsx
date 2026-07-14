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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Customer/provider friendly fallback only. Technical details are hidden from app users. */}

      <View style={styles.content}>
        <Text style={[styles.title, localizedText, { color: colors.text }]}>
          {tr("Something went wrong")}
        </Text>

        <Text style={[styles.message, localizedText, { color: colors.textMuted }]}>
          {tr("Please try again. If the issue continues, contact Athoo Support.")}
        </Text>

        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text
            style={[
              styles.buttonText,
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
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 40,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 8,
    paddingHorizontal: 24,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
});
