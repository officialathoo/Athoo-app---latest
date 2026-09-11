import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { runtimeConfig } from "@/config/runtime";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

type InviteFriendsCardProps = {
  role: "customer" | "provider";
  referralCode?: string | null;
  referralCount?: number | null;
  delay?: number;
};

export function InviteFriendsCard({
  role,
  referralCode,
  referralCount = 0,
  delay = 80,
}: InviteFriendsCardProps) {
  const { theme } = useTheme();
  const { t, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);

  const code = String(referralCode || "").trim().toUpperCase();
  if (!code) return null;

  const isProvider = role === "provider";
  const accent = isProvider
    ? theme.colors.secondary
    : theme.colors.primary;
  const accentSoft = isProvider
    ? theme.colors.premiumSoft
    : theme.colors.infoSoft;
  const accentText = isProvider
    ? theme.colors.onLight
    : theme.colors.onBrand;
  const count = Math.max(0, Number(referralCount || 0));

  const handleShare = async () => {
    if (sharingRef.current) return;

    sharingRef.current = true;
    setSharing(true);
    try {
      const downloadSuffix = runtimeConfig.app.downloadUrl
        ? ` Download: ${runtimeConfig.app.downloadUrl}`
        : "";
      await Share.share({
        title: `Join ${brandConfig.displayName}`,
        message:
          `Join ${brandConfig.displayName} - Pakistan's home services app. ` +
          `Use my referral code ${code} when you sign up.${downloadSuffix}`,
      });
    } catch {
      Alert.alert(
        tr("Unable to share"),
        tr("Athoo could not open the share sheet. Please try again."),
      );
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  };

  return (
    <AnimatedCard delay={delay} style={styles.motion}>
      <LinearGradient
        colors={[accentSoft, theme.colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            borderColor: accent + "30",
            shadowColor: accent,
          },
        ]}
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: accent + "18" },
            ]}
          >
            <Icon name="gift" size={21} color={accent} />
          </View>

          <View style={styles.headerCopy}>
            <Text style={styles.title}>{t.inviteFriends}</Text>
            <Text style={styles.subtitle}>
              {t.inviteFriendsHint}
            </Text>
          </View>

          <View
            style={[
              styles.countBadge,
              { backgroundColor: accent + "14" },
            ]}
          >
            <Text style={[styles.countValue, { color: accent }]}>
              {count}
            </Text>
            <Text style={styles.countLabel}>{t.referred}</Text>
          </View>
        </View>

        <View style={styles.codeShell}>
          <View style={styles.codeCopy}>
            <Text style={styles.codeLabel}>{tr("YOUR REFERRAL CODE")}</Text>
            <Text
              style={[styles.code, { color: accent }]}
              selectable
              numberOfLines={1}
            >
              {code}
            </Text>
          </View>

          <View style={[styles.codeIcon, { backgroundColor: accent + "14" }]}>
            <Icon name="users" size={18} color={accent} />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.safetyCopy}>
            <Icon
              name="shield-check"
              size={13}
              color={theme.colors.success}
            />
            <Text style={styles.safetyText}>
              {tr("Share your personal code with people you know.")}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("Share referral invite")}
            accessibilityState={{ busy: sharing }}
            disabled={sharing}
            onPress={() => void handleShare()}
            style={({ pressed }) => [
              styles.shareButton,
              { backgroundColor: accent },
              sharing && styles.disabled,
              pressed && !sharing && styles.pressed,
            ]}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={accentText} />
            ) : (
              <Icon name="share-2" size={15} color={accentText} />
            )}
            <Text style={[styles.shareText, { color: accentText }]}>
              {sharing ? tr("Opening...") : tr("Share Invite")}
            </Text>
          </Pressable>
        </View>
      </LinearGradient>
    </AnimatedCard>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    motion: {
      marginHorizontal: 14,
      marginTop: 12,
      marginBottom: 4,
    },
    card: {
      borderRadius: 20,
      padding: 14,
      gap: 12,
      borderWidth: 1,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.dark ? 0.16 : 0.08,
      shadowRadius: 12,
      elevation: 2,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    iconBox: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 15,
      lineHeight: 19,
      fontWeight: "900",
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 10.5,
      lineHeight: 15,
      color: theme.colors.textSecondary,
    },
    countBadge: {
      minWidth: 54,
      minHeight: 48,
      paddingHorizontal: 8,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    countValue: {
      fontSize: 17,
      lineHeight: 19,
      fontWeight: "900",
    },
    countLabel: {
      marginTop: 1,
      fontSize: 8.5,
      fontWeight: "700",
      color: theme.colors.textMuted,
    },
    codeShell: {
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 15,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    codeCopy: {
      flex: 1,
      minWidth: 0,
    },
    codeLabel: {
      fontSize: 8.5,
      lineHeight: 11,
      fontWeight: "800",
      letterSpacing: 0.9,
      color: theme.colors.textMuted,
    },
    code: {
      marginTop: 4,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: "900",
      letterSpacing: 1.3,
      fontVariant: ["tabular-nums"],
    },
    codeIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    safetyCopy: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    safetyText: {
      flex: 1,
      fontSize: 9,
      lineHeight: 13,
      color: theme.colors.textMuted,
    },
    shareButton: {
      minHeight: 40,
      minWidth: 112,
      paddingHorizontal: 12,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    shareText: {
      fontSize: 10.5,
      fontWeight: "900",
    },
    disabled: {
      opacity: 0.62,
    },
    pressed: {
      opacity: 0.8,
      transform: [{ scale: 0.985 }],
    },
  });
}
