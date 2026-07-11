import { Icon } from "@/components/ui/Icon";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { PrivateImage } from "@/services/storage";
import { Colors } from "@/constants/colors";
import { useLang } from "@/context/LanguageContext";
import { useCategories } from "@/context/CategoriesContext";
import { Provider } from "@/data/services";

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function getProviderBadges(provider: Provider): Array<{ label: string; color: string; bg: string }> {
  const badges: Array<{ label: string; color: string; bg: string }> = [];
  const rating = provider.rating ? provider.rating / 10 : 0;
  const jobs = provider.totalJobs || 0;
  if (rating >= 4.7) badges.push({ label: "⭐ Top Rated", color: "#B45309", bg: "#FEF3C7" });
  else if (rating >= 4.0) badges.push({ label: "⭐ Highly Rated", color: "#047857", bg: "#D1FAE5" });
  if (jobs >= 100) badges.push({ label: "💼 100+ Jobs", color: Colors.primary, bg: Colors.primary + "18" });
  else if (jobs >= 50) badges.push({ label: "💼 50+ Jobs", color: Colors.secondary, bg: Colors.secondary + "18" });
  if ((provider as any).isPremium) badges.push({ label: "✨ Premium", color: "#7C3AED", bg: "#EDE9FE" });
  if (jobs < 5 && !rating) badges.push({ label: "🆕 New", color: "#0891B2", bg: "#E0F2FE" });
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
  const initials = getInitials(provider.name);
  const cat = getCategoryBySlug(provider.services?.[0] || "");
  const serviceLabel = cat
    ? (isUrdu ? (cat.nameUrdu || cat.name) : cat.name)
    : (provider.services?.length ? provider.services[0] : t.generalServices);
  const rating = provider.rating ? (provider.rating / 10).toFixed(1) : null;
  const color = provider.profileColor || Colors.primary;
  const badges = getProviderBadges(provider);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
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
          <Text style={styles.name} numberOfLines={1}>{provider.name}</Text>
          {provider.isVerified && (
            <View style={styles.verifiedBadge}>
              <Icon name="check-circle" size={12} color={Colors.primary} />
            </View>
          )}
        </View>
        <Text style={[styles.service, isUrdu && styles.urduText]}>{serviceLabel}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Icon name="star" size={12} color={Colors.accent} />
            <Text style={styles.statText}>{rating || t.newProvider}</Text>
          </View>
          <View style={styles.dot} />
          <Text style={styles.statText}>{provider.totalJobs || 0} {isUrdu ? "کام" : "jobs"}</Text>
          {provider.location ? (
            <>
              <View style={styles.dot} />
              <Text style={styles.statText} numberOfLines={1}>{provider.location}</Text>
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
          <Text style={styles.distanceText}>{distanceText}</Text>
        ) : null}
        {rightAction}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: Colors.card, borderRadius: 18,
    padding: 16, marginBottom: 12,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 3, gap: 12,
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
    backgroundColor: Colors.success, borderWidth: 2, borderColor: Colors.white,
  },
  content: { flex: 1, gap: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: 15, fontWeight: "700", color: Colors.text, flex: 1 },
  verifiedBadge: { marginLeft: 2 },
  service: { fontSize: 12, color: Colors.textSecondary, fontWeight: "500" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 11, color: Colors.textSecondary },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  badgesRow: { flexDirection: "row", gap: 5, marginTop: 5, flexWrap: "wrap" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  priceContainer: { alignItems: "flex-end", gap: 4 },
  statusBadge: {
    backgroundColor: Colors.success + "20",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  busyBadge: { backgroundColor: Colors.error + "20" },
  statusText: { fontSize: 10, fontWeight: "600", color: Colors.success },
  busyText: { color: Colors.error },
  rateText: { fontSize: 11, fontWeight: "700", color: Colors.secondary },
  distanceText: { fontSize: 10, color: Colors.textMuted },
  urduText: { writingDirection: "rtl", textAlign: "right" },
});
