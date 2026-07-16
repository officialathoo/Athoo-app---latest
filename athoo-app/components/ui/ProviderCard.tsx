import { Icon } from "@/components/ui/Icon";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PrivateImage } from "@/services/storage";
import { useLang } from "@/context/LanguageContext";
import { useCategories } from "@/context/CategoriesContext";
import { Provider } from "@/data/services";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function getProviderBadges(provider: Provider, theme: AthooTheme): Array<{ label: string; color: string; bg: string }> {
  const badges: Array<{ label: string; color: string; bg: string }> = [];
  const rating = provider.rating ? provider.rating / 10 : 0;
  const jobs = provider.totalJobs || 0;
  if (rating >= 4.7) badges.push({ label: "⭐ Top Rated", color: theme.colors.warning, bg: theme.colors.warningSoft });
  else if (rating >= 4.0) badges.push({ label: "⭐ Highly Rated", color: theme.colors.success, bg: theme.colors.successSoft });
  if (jobs >= 100) badges.push({ label: "💼 100+ Jobs", color: theme.colors.primary, bg: theme.colors.infoSoft });
  else if (jobs >= 50) badges.push({ label: "💼 50+ Jobs", color: theme.colors.secondary, bg: theme.colors.warningSoft });
  if ((provider as any).isPremium) badges.push({ label: "✨ Premium", color: theme.colors.accent, bg: theme.colors.surfaceAlt });
  if (jobs < 5 && !rating) badges.push({ label: "🆕 New", color: theme.colors.info, bg: theme.colors.infoSoft });
  return badges.slice(0, 2);
}

interface ProviderCardProps {
  provider: Provider;
  onPress?: () => void;
  distanceText?: string;
  rightAction?: React.ReactNode;
}

export function ProviderCard({ provider, onPress, distanceText, rightAction }: ProviderCardProps) {
  const { t, isUrdu } = useLang();
  const { getCategoryBySlug } = useCategories();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initials = getInitials(provider.name);
  const serviceLabels = (provider.services || [])
    .map((service) => {
      const category = getCategoryBySlug(service);
      return category ? (isUrdu ? (category.nameUrdu || category.name) : category.name) : service;
    })
    .filter(Boolean);
  const visibleServiceLabels = serviceLabels.slice(0, 3);
  const remainingServiceCount = Math.max(0, serviceLabels.length - visibleServiceLabels.length);
  const serviceLabel = visibleServiceLabels.length
    ? `${visibleServiceLabels.join(" • ")}${remainingServiceCount ? ` • +${remainingServiceCount} more` : ""}`
    : t.generalServices;
  const rating = provider.rating ? (provider.rating / 10).toFixed(1) : null;
  const color = provider.profileColor || theme.colors.primary;
  const badges = getProviderBadges(provider, theme);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        theme.shadows.sm,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.avatarContainer}>
        {provider.profileImage ? (
          <PrivateImage objectPath={provider.profileImage} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: color + "20", borderColor: color + "50" }]}>
            <Text style={[styles.avatarText, { color }]}>{initials}</Text>
          </View>
        )}
        {provider.isAvailable && <View style={styles.availableDot} />}
      </View>

      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{provider.name}</Text>
          {provider.isVerified && (
            <View style={styles.verifiedBadge}>
              <Icon name="check-circle" size={12} color={theme.colors.primary} />
            </View>
          )}
        </View>
        <Text
          style={[styles.service, { color: theme.colors.textSecondary }, isUrdu && styles.urduText]}
          numberOfLines={2}
          accessibilityLabel={`Services: ${serviceLabels.length ? serviceLabels.join(", ") : t.generalServices}`}
        >
          {serviceLabel}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Icon name="star" size={12} color={theme.colors.warning} />
            <Text style={[styles.statText, { color: theme.colors.textSecondary }]}>{rating || t.newProvider}</Text>
          </View>
          <View style={styles.dot} />
          <Text style={[styles.statText, { color: theme.colors.textSecondary }]}>{provider.totalJobs || 0} {isUrdu ? "کام" : "jobs"}</Text>
          {provider.location ? (
            <>
              <View style={styles.dot} />
              <Text style={[styles.statText, { color: theme.colors.textSecondary }]} numberOfLines={1}>{provider.location}</Text>
            </>
          ) : null}
        </View>
        {badges.length > 0 && (
          <View style={styles.badgesRow}>
            {badges.map((b, i) => (
              <View key={i} style={[styles.badge, { backgroundColor: b.bg }]}>
                <Text style={[styles.badgeText, { color: b.color }]}>{b.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.priceContainer}>
        <View style={[styles.statusBadge, !provider.isAvailable && styles.busyBadge]}>
          <Text style={[styles.statusText, !provider.isAvailable && styles.busyText]}>
            {provider.isAvailable ? t.available : t.busy}
          </Text>
        </View>
        {provider.ratePerHour ? (
          <Text style={styles.rateText}>Rs. {provider.ratePerHour.toLocaleString()}/hr</Text>
        ) : null}
        {distanceText ? (
          <Text style={[styles.distanceText, { color: theme.colors.textMuted }]}>{distanceText}</Text>
        ) : null}
        {rightAction}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "flex-start",
    borderRadius: 18, borderWidth: 1,
    padding: 16, marginBottom: 12, gap: 12,
  },
  pressed: { opacity: 0.85 },
  avatarContainer: { position: "relative" },
  avatar: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: "center", justifyContent: "center", borderWidth: 2,
  },
  avatarText: { fontSize: 16, fontWeight: "700" },
  availableDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: theme.colors.success, borderWidth: 2, borderColor: theme.colors.surface,
  },
  content: { flex: 1, gap: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: 15, fontWeight: "700", color: theme.colors.text, flex: 1 },
  verifiedBadge: { marginLeft: 2 },
  service: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary, fontWeight: "500" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 11, color: theme.colors.textSecondary },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.colors.textMuted },
  badgesRow: { flexDirection: "row", gap: 5, marginTop: 5, flexWrap: "wrap" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  priceContainer: { alignItems: "flex-end", gap: 4 },
  statusBadge: {
    backgroundColor: theme.colors.success + "20",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  busyBadge: { backgroundColor: theme.colors.danger + "20" },
  statusText: { fontSize: 10, fontWeight: "600", color: theme.colors.success },
  busyText: { color: theme.colors.danger },
  rateText: { fontSize: 11, fontWeight: "700", color: theme.colors.secondary },
  distanceText: { fontSize: 10, color: theme.colors.textMuted },
  urduText: { writingDirection: "rtl", textAlign: "right" },
});
