import { Icon } from "@/components/ui/Icon";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/design";
import { PrivateImage } from "@/services/storage";
import { useLang } from "@/context/LanguageContext";
import { useCategories } from "@/context/CategoriesContext";
import { Provider } from "@/data/services";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0] || "")
    .join("")
    .toUpperCase();
}

function getProviderBadges(
  provider: Provider,
  theme: AthooTheme,
): Array<{ label: string; color: string; background: string; icon: string }> {
  const badges: Array<{ label: string; color: string; background: string; icon: string }> = [];
  const rating = provider.rating ? provider.rating / 10 : 0;
  const jobs = provider.totalJobs || 0;

  if ((provider as any).isPremium) {
    badges.push({
      label: "Premium",
      color: theme.colors.secondaryPressed,
      background: theme.colors.premiumSoft,
      icon: "crown",
    });
  }

  if (rating >= 4.7) {
    badges.push({
      label: "Top rated",
      color: theme.colors.warning,
      background: theme.colors.warningSoft,
      icon: "star",
    });
  } else if (jobs >= 100) {
    badges.push({
      label: "Experienced",
      color: theme.colors.primary,
      background: theme.colors.infoSoft,
      icon: "award",
    });
  }

  return badges.slice(0, 2);
}

interface ProviderCardProps {
  provider: Provider;
  onPress?: () => void;
  distanceText?: string;
  rightAction?: React.ReactNode;
}

export function ProviderCard({
  provider,
  onPress,
  distanceText,
  rightAction,
}: ProviderCardProps) {
  const { t, isUrdu } = useLang();
  const { getCategoryBySlug } = useCategories();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initials = getInitials(provider.name);
  const serviceLabels = (provider.services || [])
    .map((service) => {
      const category = getCategoryBySlug(service);
      return category
        ? isUrdu
          ? category.nameUrdu || category.name
          : category.name
        : service;
    })
    .filter(Boolean);

  const visibleServices = serviceLabels.slice(0, 2);
  const remainingServiceCount = Math.max(0, serviceLabels.length - visibleServices.length);
  const serviceLabel = visibleServices.length
    ? `${visibleServices.join(" • ")}${remainingServiceCount ? ` • +${remainingServiceCount}` : ""}`
    : t.generalServices;

  const rating = provider.rating ? (provider.rating / 10).toFixed(1) : null;
  const avatarColor = provider.profileColor || theme.colors.primary;
  const badges = getProviderBadges(provider, theme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `View ${provider.name}` : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
          borderColor: pressed ? theme.colors.primary : theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.avatarContainer}>
        {provider.profileImage ? (
          <PrivateImage objectPath={provider.profileImage} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: `${avatarColor}16`,
                borderColor: `${avatarColor}38`,
              },
            ]}
          >
            <AppText variant="bodyStrong" style={{ color: avatarColor }}>
              {initials}
            </AppText>
          </View>
        )}
        <View
          accessibilityLabel={provider.isAvailable ? "Available" : "Busy"}
          style={[
            styles.presenceDot,
            {
              backgroundColor: provider.isAvailable
                ? theme.colors.success
                : theme.colors.textMuted,
              borderColor: theme.colors.surface,
            },
          ]}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {provider.name}
          </AppText>
          {provider.isVerified ? (
            <Icon name="check-circle" size={15} color={theme.colors.primary} />
          ) : null}
        </View>

        <AppText
          variant="caption"
          tone="secondary"
          numberOfLines={1}
          style={isUrdu ? styles.urduText : undefined}
          accessibilityLabel={`Services: ${
            serviceLabels.length ? serviceLabels.join(", ") : t.generalServices
          }`}
        >
          {serviceLabel}
        </AppText>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Icon name="star" size={13} color={theme.colors.warning} />
            <AppText variant="caption" tone="secondary">
              {rating || t.newProvider}
            </AppText>
          </View>

          <View style={[styles.metaDot, { backgroundColor: theme.colors.textMuted }]} />

          <AppText variant="caption" tone="secondary">
            {provider.totalJobs || 0} {isUrdu ? "Ú©Ø§Ù…" : "jobs"}
          </AppText>

          {distanceText ? (
            <>
              <View style={[styles.metaDot, { backgroundColor: theme.colors.textMuted }]} />
              <View style={styles.metaItem}>
                <Icon name="map-pin" size={12} color={theme.colors.textMuted} />
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {distanceText}
                </AppText>
              </View>
            </>
          ) : provider.location ? (
            <>
              <View style={[styles.metaDot, { backgroundColor: theme.colors.textMuted }]} />
              <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.location}>
                {provider.location}
              </AppText>
            </>
          ) : null}
        </View>

        {badges.length ? (
          <View style={styles.badgesRow}>
            {badges.map((badge) => (
              <View
                key={badge.label}
                style={[styles.badge, { backgroundColor: badge.background }]}
              >
                <Icon name={badge.icon} size={12} color={badge.color} />
                <AppText variant="caption" style={[styles.badgeText, { color: badge.color }]}>
                  {badge.label}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.trailing}>
        <View
          style={[
            styles.availability,
            {
              backgroundColor: provider.isAvailable
                ? theme.colors.successSoft
                : theme.colors.neutralSoft,
            },
          ]}
        >
          <AppText
            variant="caption"
            style={{
              color: provider.isAvailable ? theme.colors.success : theme.colors.textSecondary,
              fontWeight: "600",
            }}
          >
            {provider.isAvailable ? t.available : t.busy}
          </AppText>
        </View>

        {provider.ratePerHour ? (
          <View style={styles.rateBlock}>
            <AppText variant="label" style={{ color: theme.colors.secondaryPressed }}>
              Rs. {provider.ratePerHour.toLocaleString()}
            </AppText>
            <AppText variant="caption" tone="muted">
              /hr
            </AppText>
          </View>
        ) : null}

        {rightAction}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: AthooTheme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      borderRadius: theme.radius.md,
      borderWidth: 1,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      gap: theme.spacing.md,
    },
    pressed: {
      opacity: 0.96,
      transform: [{ scale: 0.995 }],
    },
    avatarContainer: {
      position: "relative",
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
    },
    presenceDot: {
      position: "absolute",
      bottom: 1,
      right: 1,
      width: 11,
      height: 11,
      borderRadius: 6,
      borderWidth: 2,
    },
    content: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    name: {
      flex: 1,
    },
    metaRow: {
      minHeight: 18,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 5,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      maxWidth: 118,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 2,
    },
    location: {
      flexShrink: 1,
      maxWidth: 120,
    },
    badgesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
      marginTop: 2,
    },
    badge: {
      minHeight: 23,
      paddingHorizontal: 7,
      borderRadius: theme.radius.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    badgeText: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: "600",
    },
    trailing: {
      alignItems: "flex-end",
      gap: 7,
      maxWidth: 90,
    },
    availability: {
      minHeight: 24,
      paddingHorizontal: 8,
      borderRadius: theme.radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    rateBlock: {
      alignItems: "flex-end",
    },
    urduText: {
      writingDirection: "rtl",
      textAlign: "right",
    },
  });