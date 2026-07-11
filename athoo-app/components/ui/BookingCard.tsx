import { Icon } from "@/components/ui/Icon";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { Booking, BookingStatus } from "@/context/BookingContext";
import { PrivateImage } from "@/services/storage";

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: "Pending", color: "#F59E0B", bg: "#FFFBEB", icon: "clock" },
  accepted: { label: "Active", color: "#3B82F6", bg: "#EFF6FF", icon: "check-circle" },
  in_progress: { label: "In Progress", color: "#8B5CF6", bg: "#F5F3FF", icon: "play-circle" },
  completed: { label: "Completed", color: "#22C55E", bg: "#F0FDF4", icon: "check-circle" },
  cancelled: { label: "Cancelled", color: "#EF4444", bg: "#FEF2F2", icon: "x-circle" },
};

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
  const status = STATUS_CONFIG[booking.status];
  const person = role === "customer" ? booking.providerName : booking.customerName;
  const personImage = role === "customer" ? booking.providerProfileImage : booking.customerProfileImage;
  const personColor = role === "customer" ? (booking.providerProfileColor || Colors.primary) : Colors.primary;
  const initial = person?.charAt(0)?.toUpperCase() || "?";
  const isActive = ACTIVE_STATUSES.includes(booking.status);

  const avatarSize = compact ? 30 : 36;
  const avatarRadius = compact ? 8 : 10;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        {personImage ? (
          <PrivateImage
            objectPath={personImage}
            style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarRadius }]}
          />
        ) : (
          <View style={[styles.avatarFallback, { width: avatarSize, height: avatarSize, borderRadius: avatarRadius, backgroundColor: personColor + "22" }]}>
            <Text style={[styles.avatarInitial, { color: personColor, fontSize: compact ? 13 : 15 }]}>{initial}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.service, compact && styles.serviceCompact]} numberOfLines={1}>{booking.service}</Text>
          <Text style={styles.person} numberOfLines={1}>{person}</Text>
        </View>
        <View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          {booking.price != null && (
            <Text style={styles.price}>Rs. {booking.price.toLocaleString()}</Text>
          )}
        </View>
      </View>

      {!compact && (
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Icon name="calendar" size={11} color={Colors.textMuted} />
            <Text style={styles.metaText}>{booking.scheduledDate}</Text>
          </View>
          <View style={styles.metaItem}>
            <Icon name="clock" size={11} color={Colors.textMuted} />
            <Text style={styles.metaText}>{booking.scheduledTime}</Text>
          </View>
          <View style={[styles.metaItem, { flex: 1 }]}>
            <Icon name="map-pin" size={11} color={Colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>{booking.address}</Text>
          </View>
        </View>
      )}

      {!compact && isActive && onContact && (
        <Pressable
          style={styles.contactBtn}
          onPress={(e) => { e.stopPropagation(); onContact(); }}
          hitSlop={4}
        >
          <Icon name="message-circle" size={13} color={Colors.primary} />
          <Text style={styles.contactBtnText}>Contact {role === "customer" ? "Provider" : "Customer"}</Text>
        </Pressable>
      )}

      {!compact && booking.status === "completed" && !booking.rating && role === "customer" && (
        <View style={styles.rateHint}>
          <Icon name="star" size={12} color={Colors.accent} />
          <Text style={styles.rateHintText}>Tap to rate this job</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  cardCompact: { padding: 11, borderRadius: 12, marginBottom: 6 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { flexShrink: 0 },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitial: { fontWeight: "700" },
  info: { flex: 1, gap: 2 },
  service: { fontSize: 14, fontWeight: "700", color: Colors.text },
  serviceCompact: { fontSize: 13 },
  person: { fontSize: 11, color: Colors.textSecondary },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: "flex-end",
  },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: "700" },
  price: { fontSize: 12, fontWeight: "800", color: Colors.primary, textAlign: "right", marginTop: 2 },
  metaRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, color: Colors.textMuted },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "12",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    alignSelf: "flex-start",
  },
  contactBtnText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  rateHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.accent + "15",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  rateHintText: { fontSize: 11, fontWeight: "600", color: Colors.accent },
});

