import { Icon } from "@/components/ui/Icon";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Booking, BookingStatus } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { AthooTheme } from "@/design/theme";
import { PrivateImage } from "@/services/storage";

type StatusTone = { label: string; color: string; bg: string; icon: string };

function getStatusConfig(theme: AthooTheme, tr: (message: string) => string): Record<BookingStatus, StatusTone> {
  return {
    pending: { label: tr("Pending"), color: theme.colors.warning, bg: theme.colors.warningSoft, icon: "clock" },
    accepted: { label: tr("Active"), color: theme.colors.info, bg: theme.colors.infoSoft, icon: "check-circle" },
    in_progress: { label: tr("In Progress"), color: theme.colors.accent, bg: theme.colors.surfaceAlt, icon: "play-circle" },
    completed: { label: tr("Completed"), color: theme.colors.success, bg: theme.colors.successSoft, icon: "check-circle" },
    cancelled: { label: tr("Cancelled"), color: theme.colors.danger, bg: theme.colors.dangerSoft, icon: "x-circle" },
  };
}

const ACTIVE_STATUSES: BookingStatus[] = ["accepted", "in_progress", "pending"];

interface BookingCardProps {
  booking: Booking & {
    customerProfileImage?: string | null;
    providerProfileImage?: string | null;
    providerProfileColor?: string | null;
  };
  role: "customer" | "provider";
  onPress: () => void;
  onContact?: () => void;
  compact?: boolean;
}

export function BookingCard({ booking, role, onPress, onContact, compact = false }: BookingCardProps) {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const status = getStatusConfig(theme, tr)[booking.status];
  const person = role === "customer" ? booking.providerName : booking.customerName;
  const personImage = role === "customer" ? booking.providerProfileImage : booking.customerProfileImage;
  const personColor = role === "customer" ? (booking.providerProfileColor || theme.colors.primary) : theme.colors.primary;
  const initial = person?.charAt(0)?.toUpperCase() || "?";
  const isActive = ACTIVE_STATUSES.includes(booking.status);
  const contactRole = role === "customer" ? tr("Provider") : tr("Customer");

  const avatarSize = compact ? 30 : 36;
  const avatarRadius = compact ? 8 : 10;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.service}, ${person}, ${status.label}${booking.price != null ? `, ${formatCurrency(booking.price)}` : ""}`}
      accessibilityHint={tr("Opens booking details")}
      style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        {personImage ? (
          <PrivateImage
            objectPath={personImage}
            accessibilityLabel={`${person} ${tr("profile photo")}`}
            style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarRadius }]}
          />
        ) : (
          <View style={[styles.avatarFallback, { width: avatarSize, height: avatarSize, borderRadius: avatarRadius, backgroundColor: `${personColor}22` }]}>
            <Text style={[styles.avatarInitial, { color: personColor, fontSize: compact ? 13 : 15 }]}>{initial}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.service, compact && styles.serviceCompact]} numberOfLines={1}>{booking.service}</Text>
          <Text style={styles.person} numberOfLines={1}>{person}</Text>
        </View>
        <View style={styles.rightColumn}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]} accessibilityLabel={status.label}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          {booking.price != null && (
            <Text style={styles.price}>{formatCurrency(booking.price)}</Text>
          )}
        </View>
      </View>

      {!compact && (
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Icon name="calendar" size={11} color={theme.colors.textMuted} />
            <Text style={styles.metaText}>{booking.scheduledDate}</Text>
          </View>
          <View style={styles.metaItem}>
            <Icon name="clock" size={11} color={theme.colors.textMuted} />
            <Text style={styles.metaText}>{booking.scheduledTime}</Text>
          </View>
          <View style={[styles.metaItem, styles.addressItem]}>
            <Icon name="map-pin" size={11} color={theme.colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>{booking.address}</Text>
          </View>
        </View>
      )}

      {!compact && isActive && onContact && (
        <Pressable
          style={({ pressed }) => [styles.contactBtn, pressed && styles.pressed]}
          onPress={(event) => { event.stopPropagation(); onContact(); }}
          accessibilityRole="button"
          accessibilityLabel={tr("Contact {{role}}", { role: contactRole })}
          hitSlop={6}
        >
          <Icon name="message-circle" size={13} color={theme.colors.primary} />
          <Text style={styles.contactBtnText}>{tr("Contact {{role}}", { role: contactRole })}</Text>
        </Pressable>
      )}

      {!compact && booking.status === "completed" && !booking.rating && role === "customer" && (
        <View style={styles.rateHint}>
          <Icon name="star" size={12} color={theme.colors.accent} />
          <Text style={styles.rateHintText}>{tr("Tap to rate this job")}</Text>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      gap: theme.spacing.sm,
      ...theme.shadows.sm,
    },
    cardCompact: { padding: 11, borderRadius: theme.radius.md, marginBottom: 6 },
    pressed: { opacity: 0.84 },
    row: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 10 },
    rightColumn: { alignItems: isUrdu ? "flex-start" : "flex-end" },
    avatar: { flexShrink: 0 },
    avatarFallback: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
    avatarInitial: { fontWeight: "700" },
    info: { flex: 1, gap: 2 },
    service: { fontSize: 14, fontWeight: "700", color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    serviceCompact: { fontSize: 13 },
    person: { fontSize: 11, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    statusBadge: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    statusDot: { width: 5, height: 5, borderRadius: 2.5 },
    statusText: { fontSize: 10, fontWeight: "700", writingDirection: isUrdu ? "rtl" : "ltr" },
    price: { fontSize: 12, fontWeight: "800", color: theme.colors.primary, textAlign: isUrdu ? "left" : "right", marginTop: 2 },
    metaRow: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 12, flexWrap: "wrap" },
    metaItem: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 4 },
    addressItem: { flex: 1 },
    metaText: { fontSize: 11, color: theme.colors.textMuted, writingDirection: isUrdu ? "rtl" : "ltr", textAlign: isUrdu ? "right" : "left" },
    contactBtn: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.colors.infoSoft, borderRadius: theme.radius.md, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: theme.colors.focusRing, alignSelf: isUrdu ? "flex-end" : "flex-start" },
    contactBtnText: { fontSize: 12, fontWeight: "700", color: theme.colors.primary, writingDirection: isUrdu ? "rtl" : "ltr" },
    rateHint: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 5, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, paddingHorizontal: 10, paddingVertical: 7, alignSelf: isUrdu ? "flex-end" : "flex-start" },
    rateHintText: { fontSize: 11, fontWeight: "600", color: theme.colors.accent, writingDirection: isUrdu ? "rtl" : "ltr" },
  });
}
