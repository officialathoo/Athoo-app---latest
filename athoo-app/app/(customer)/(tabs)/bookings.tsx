import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState , useMemo} from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { BookingCard } from "@/components/ui/BookingCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings, BookingStatus, Booking } from "@/context/BookingContext";
import { useChat } from "@/context/ChatContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { useLang } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { buildRepeatBookingParams } from "@/utils/repeatBooking";
import { ServiceHistoryInsights } from "@/components/design/ServiceHistoryInsights";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

export default function BookingsScreen() {
  const { user } = useAuth();
  const { getMyBookings, pendingAlerts, consumeAlerts, rateBooking } = useBookings();
  const { getOrCreateChat } = useChat();
  const { push } = useNotifications();
  const [rateTarget, setRateTarget] = useState<Booking | null>(null);
  const [ratingVal, setRatingVal] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);

  const handleRateBooking = async () => {
    if (!rateTarget) return;
    setRatingLoading(true);
    try {
      await rateBooking(rateTarget.id, ratingVal, reviewText.trim());
      setRateTarget(null);
      setReviewText("");
      setRatingVal(5);
      push({ type: "success", title: tr("Review Submitted"), message: tr("Thank you for your feedback!") });
    } catch {
      Alert.alert(tr("Error"), tr("Could not submit rating. Please try again."));
    } finally {
      setRatingLoading(false);
    }
  };

  const handleBookingPress = (b: Booking) => {
    if (b.status === "completed" && !b.rating) {
      setRateTarget(b);
      setRatingVal(5);
      setReviewText("");
    } else {
      router.push({ pathname: "/(customer)/booking-detail", params: { bookingId: b.id } });
    }
  };

  const handleContact = async (b: Booking) => {
    if (!user) return;
    try {
      const chat = await getOrCreateChat(
        user.id, user.name,
        b.providerId, b.providerName,
        undefined, b.service
      );
      router.push({
        pathname: "/(customer)/chat-room",
        params: {
          chatId: chat.id,
          otherUserId: b.providerId,
          otherUserName: b.providerName,
          otherUserImage: b.providerProfileImage || undefined,
          otherUserColor: b.providerProfileColor || undefined,
        },
      });
    } catch {
      Alert.alert(tr("Error"), tr("Could not open chat. Please try again."));
    }
  };

  useEffect(() => {
    if (pendingAlerts.length === 0) return;
    const alerts = consumeAlerts();
    for (const alert of alerts) {
      push({
        type: alert.type === "booking" ? "booking" : "success",
        title: alert.title,
        message: alert.message,
        role: "customer",
        bookingId: alert.booking.id,
      });
    }
  }, [pendingAlerts]);
  const { getMyNegotiations, acceptOffer, rejectOffer } = useNegotiation();
  const { t, isUrdu, translate: tr, textAlign, writingDirection, formatCurrency } = useLang();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = { textAlign, writingDirection } as const;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [activeFilter, setActiveFilter] = useState<BookingStatus | "all">("all");
  const [mainTab, setMainTab] = useState<"bookings" | "offers">("bookings");

  const FILTERS: { label: string; value: BookingStatus | "all"; icon: string; color: string }[] = [
    { label: isUrdu ? "سب" : "All", value: "all", icon: "list", color: theme.colors.primary },
    { label: t.pending, value: "pending", icon: "clock", color: theme.colors.warning },
    { label: t.active, value: "accepted", icon: "check-circle", color: theme.colors.info },
    { label: t.inProgress, value: "in_progress", icon: "play-circle", color: theme.colors.accent },
    { label: t.completed, value: "completed", icon: "check-circle", color: theme.colors.success },
    { label: t.cancelled, value: "cancelled", icon: "x-circle", color: theme.colors.danger },
  ];

  const myNegotiations = user ? getMyNegotiations(user.id) : [];
  const allBookings = user ? getMyBookings(user.id, "customer") : [];
  const filtered = activeFilter === "all"
    ? allBookings
    : allBookings.filter((b) => b.status === activeFilter);

  const counts = {
    all: allBookings.length,
    pending: allBookings.filter(b => b.status === "pending").length,
    accepted: allBookings.filter(b => b.status === "accepted").length,
    in_progress: allBookings.filter(b => b.status === "in_progress").length,
    completed: allBookings.filter(b => b.status === "completed").length,
    cancelled: allBookings.filter(b => b.status === "cancelled").length,
  };

  const totalSpent = allBookings.filter(b => b.status === "completed").reduce((s, b) => s + (b.price || 0), 0);
  const activeCount = allBookings.filter(b => ["accepted", "in_progress", "pending"].includes(b.status)).length;

  const getNegStatus = (status: string) => {
    if (status === "customer_offer") return { label: t.awaitingResponse, bg: theme.colors.warningSoft, text: theme.colors.warning };
    if (status === "provider_counter") return { label: t.providerCountered, bg: theme.colors.infoSoft, text: theme.colors.info };
    if (status === "accepted") return { label: t.accepted, bg: theme.colors.successSoft, text: theme.colors.success };
    return { label: tr("Rejected"), bg: theme.colors.dangerSoft, text: theme.colors.danger };
  };

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <View>
          <Text style={[styles.title, isUrdu && styles.urduText]}>{mainTab === "bookings" ? t.myBookings : t.myOffers}</Text>
          <Text style={[styles.subtitle, isUrdu && styles.urduText]}>
            {mainTab === "bookings" ? `${allBookings.length} ${t.totalBookings}` : `${myNegotiations.length} ${t.priceNegotiations}`}
          </Text>
        </View>
        <Pressable
          style={styles.newBtn}
          onPress={() => router.push("/(customer)/(tabs)/search")}
        >
          <Icon name="plus" size={18} color={theme.colors.onBrand} />
        </Pressable>
      </View>

      <View style={[styles.mainTabRow, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Pressable
          style={[styles.mainTab, mainTab === "bookings" && styles.mainTabActive]}
          onPress={() => setMainTab("bookings")}
        >
          <Icon name="calendar" size={14} color={mainTab === "bookings" ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.mainTabText, mainTab === "bookings" && styles.mainTabTextActive, isUrdu && styles.urduText]}>{t.bookings}</Text>
          {allBookings.length > 0 && <View style={[styles.tabBadge, mainTab === "bookings" && { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.tabBadgeText, mainTab === "bookings" && { color: theme.colors.onBrand }]}>{allBookings.length}</Text>
          </View>}
        </Pressable>
        <Pressable
          style={[styles.mainTab, mainTab === "offers" && styles.mainTabActiveOrange]}
          onPress={() => setMainTab("offers")}
        >
          <Icon name="dollar-sign" size={14} color={mainTab === "offers" ? theme.colors.secondary : theme.colors.textMuted} />
          <Text style={[styles.mainTabText, mainTab === "offers" && { color: theme.colors.secondary }, isUrdu && styles.urduText]}>{t.myOffers}</Text>
          {myNegotiations.length > 0 && <View style={[styles.tabBadge, mainTab === "offers" && { backgroundColor: theme.colors.secondary }]}>
            <Text style={[styles.tabBadgeText, mainTab === "offers" && { color: theme.colors.onBrand }]}>{myNegotiations.length}</Text>
          </View>}
        </Pressable>
      </View>

      {mainTab === "offers" ? (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]} showsVerticalScrollIndicator={false}>
          {myNegotiations.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Icon name="dollar-sign" size={30} color={theme.colors.textMuted} /></View>
              <Text style={[styles.emptyTitle, localizedText]}>{tr("No price offers yet")}</Text>
              <Text style={[styles.emptySubtitle, localizedText]}>{tr("Negotiate prices with providers on their profile pages")}</Text>
              <Pressable style={styles.findBtn} onPress={() => router.push("/(customer)/(tabs)/search")}>
                <Text style={styles.findBtnText}>{tr("Browse Services")}</Text>
              </Pressable>
            </View>
          ) : myNegotiations.map((neg, i) => {
            const st = getNegStatus(neg.status);
            return (
              <AnimatedCard key={`${neg.id}-${i}`} delay={i * 50}>
                <View style={styles.negCard}>
                  <View style={styles.negCardHeader}>
                    <View style={styles.negServiceIcon}>
                      <Icon name="briefcase" size={18} color={theme.colors.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.negService}>{neg.service}</Text>
                      <Text style={[styles.negProvider, localizedText]}>{tr("with {{name}}", { name: neg.providerName })}</Text>
                    </View>
                    <View style={[styles.negBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.negBadgeText, { color: st.text }]}>{st.label}</Text>
                    </View>
                  </View>

                  <View style={styles.negAmtRow}>
                    <View style={styles.negAmtBox}>
                      <Text style={styles.negAmtLabel}>{tr("Your Offer")}</Text>
                      <Text style={[styles.negAmt, { color: theme.colors.primary }]}>{formatCurrency(neg.customerOffer)}</Text>
                    </View>
                    {neg.providerCounter !== undefined && (
                      <View style={styles.negAmtBox}>
                        <Text style={styles.negAmtLabel}>{tr("Counter")}</Text>
                        <Text style={[styles.negAmt, { color: theme.colors.secondary }]}>{formatCurrency(neg.providerCounter)}</Text>
                      </View>
                    )}
                    {neg.finalPrice !== undefined && (
                      <View style={styles.negAmtBox}>
                        <Text style={styles.negAmtLabel}>{tr("Agreed")}</Text>
                        <Text style={[styles.negAmt, { color: theme.colors.success }]}>{formatCurrency(neg.finalPrice)}</Text>
                      </View>
                    )}
                  </View>

                  {neg.status === "provider_counter" && neg.providerCounter !== undefined && (
                    <View style={styles.negActions}>
                      <Pressable
                        style={styles.negAcceptBtn}
                        onPress={() => Alert.alert(
                          "Accept Counter Offer",
                          `Accept ${neg.providerName}'s counter of Rs. ${neg.providerCounter}?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Accept", onPress: () => acceptOffer(neg.id, neg.providerCounter!) },
                          ]
                        )}
                      >
                        <Icon name="check" size={14} color={theme.colors.onBrand} />
                        <Text style={styles.negAcceptText}>Accept {formatCurrency(neg.providerCounter)}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.negRejectBtn}
                        onPress={() => Alert.alert(
                          "Reject Counter",
                          `Decline ${neg.providerName}'s counter offer of Rs. ${neg.providerCounter}?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Reject", style: "destructive", onPress: () => rejectOffer(neg.id) },
                          ]
                        )}
                      >
                        <Icon name="x" size={14} color={theme.colors.danger} />
                        <Text style={styles.negRejectText}>Reject</Text>
                      </Pressable>
                    </View>
                  )}

                  {(neg.status === "customer_offer") && (
                    <View style={styles.negActions}>
                      <View style={styles.negWaitingBadge}>
                        <Icon name="clock" size={13} color={theme.colors.textMuted} />
                        <Text style={styles.negWaitingText}>Waiting for provider's response...</Text>
                      </View>
                      <Pressable
                        style={styles.negCancelBtn}
                        onPress={() => Alert.alert(
                          "Cancel Offer",
                          "Withdraw your price offer? The provider will no longer see it.",
                          [
                            { text: "Keep", style: "cancel" },
                            { text: "Cancel Offer", style: "destructive", onPress: () => rejectOffer(neg.id) },
                          ]
                        )}
                      >
                        <Icon name="x" size={13} color={theme.colors.textSecondary} />
                        <Text style={styles.negCancelText}>Cancel Offer</Text>
                      </Pressable>
                    </View>
                  )}

                  {neg.status === "accepted" && neg.finalPrice !== undefined && (
                    <View style={styles.negActions}>
                      <Pressable
                        style={styles.negBookNowBtn}
                        onPress={() => router.push({
                          pathname: "/(customer)/book-service",
                          params: { providerId: neg.providerId, negotiatedPrice: String(neg.finalPrice) },
                        })}
                      >
                        <Icon name="check-circle" size={14} color={theme.colors.onBrand} />
                        <Text style={styles.negBookNowText}>Complete Booking · {formatCurrency(neg.finalPrice)}</Text>
                      </Pressable>
                    </View>
                  )}

                  {neg.messages.length > 0 && (
                    <View style={styles.negLastMsg}>
                      <Icon name="message-circle" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.negLastMsgText} numberOfLines={1}>{neg.messages[neg.messages.length - 1].text}</Text>
                    </View>
                  )}
                </View>
              </AnimatedCard>
            );
          })}
        </ScrollView>
      ) : (
        <>
      <AnimatedCard delay={60}>
        <View style={styles.summaryStrip}>
          <View style={styles.stripItem}>
            <Text style={[styles.stripVal, { color: theme.colors.primary }]}>{allBookings.length}</Text>
            <Text style={styles.stripLabel}>Total</Text>
          </View>
          <View style={styles.stripDiv} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripVal, { color: theme.colors.info }]}>{activeCount}</Text>
            <Text style={styles.stripLabel}>Active</Text>
          </View>
          <View style={styles.stripDiv} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripVal, { color: theme.colors.success }]}>
              Rs.{totalSpent.toLocaleString()}
            </Text>
            <Text style={styles.stripLabel}>Spent</Text>
          </View>
        </View>
      </AnimatedCard>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((f) => {
          const cnt = counts[f.value as keyof typeof counts];
          const isActive = activeFilter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setActiveFilter(f.value)}
              style={[styles.filterChip, isActive && { backgroundColor: f.color, borderColor: f.color }]}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{f.label}</Text>
              {cnt > 0 && (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{cnt}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeFilter === "all" && (
          <ServiceHistoryInsights
            bookings={allBookings}
            onBookAgain={(booking) => router.push({ pathname: "/(customer)/book-service" as any, params: buildRepeatBookingParams(booking) } as any)}
          />
        )}
        {filtered.length === 0 ? (
          <AnimatedCard>
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="calendar" size={30} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No bookings</Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter === "all" ? "Book a service to get started" : `No ${activeFilter} bookings`}
              </Text>
              {activeFilter === "all" && (
                <Pressable style={styles.findBtn} onPress={() => router.push("/(customer)/(tabs)/search")}>
                  <Text style={styles.findBtnText}>Find Services</Text>
                </Pressable>
              )}
            </View>
          </AnimatedCard>
        ) : (
          filtered.map((b, i) => (
            <AnimatedCard key={`${b.id}-${i}`} delay={i * 40}>
              <BookingCard
                booking={b}
                role="customer"
                onPress={() => handleBookingPress(b)}
                onContact={() => handleContact(b)}
              />
              {b.status === "completed" && b.providerId && (
                <Pressable
                  style={styles.bookAgainBtn}
                  onPress={() => router.push({ pathname: "/(customer)/book-service" as any, params: buildRepeatBookingParams(b) } as any)}
                >
                  <Icon name="repeat" size={13} color={theme.colors.primary} />
                  <Text style={styles.bookAgainText}>Book Again</Text>
                </Pressable>
              )}
            </AnimatedCard>
          ))
        )}

        {filtered.length > 0 && (
          <AnimatedCard delay={filtered.length * 40 + 60}>
            <Pressable
              style={styles.billingLink}
              onPress={() => router.push("/(customer)/billing")}
            >
              <Icon name="file-text" size={15} color={theme.colors.primary} />
              <Text style={styles.billingLinkText}>View Full Billing History & Invoices</Text>
              <Icon name="chevron-right" size={14} color={theme.colors.primary} />
            </Pressable>
          </AnimatedCard>
        )}
      </ScrollView>
      </>
      )}

      <Modal visible={!!rateTarget} animationType="slide" transparent onRequestClose={() => setRateTarget(null)}>
        <Pressable style={styles.rateOverlay} onPress={() => setRateTarget(null)}>
          <View style={styles.rateBox} onStartShouldSetResponder={() => true}>
            <View style={styles.rateHandle} />
            <Text style={styles.rateTitle}>Rate Your Experience</Text>
            {rateTarget && (
              <Text style={styles.rateSubtitle}>{rateTarget.service} with {rateTarget.providerName}</Text>
            )}

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} onPress={() => setRatingVal(s)} hitSlop={8}>
                  <Icon name="star" size={38} color={s <= ratingVal ? theme.colors.accent : theme.colors.border} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingLabel}>
              {ratingVal === 5 ? "Excellent!" : ratingVal === 4 ? "Very Good" : ratingVal === 3 ? "Good" : ratingVal === 2 ? "Fair" : "Poor"}
            </Text>

            <TextInput
              style={styles.reviewInput}
              placeholder="Share your experience (optional)..."
              placeholderTextColor={theme.colors.textMuted}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              numberOfLines={3}
              maxLength={300}
            />
            <Text style={styles.charCount}>{reviewText.length}/300</Text>

            <View style={styles.rateActions}>
              <Pressable style={styles.rateCancelBtn} onPress={() => setRateTarget(null)}>
                <Text style={styles.rateCancelText}>Skip</Text>
              </Pressable>
              <Pressable
                style={[styles.rateSubmitBtn, ratingLoading && { opacity: 0.7 }]}
                onPress={handleRateBooking}
                disabled={ratingLoading}
              >
                <Icon name="send" size={15} color={theme.colors.onBrand} />
                <Text style={styles.rateSubmitText}>{ratingLoading ? "Submitting..." : "Submit Review"}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  newBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryStrip: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  stripItem: { flex: 1, alignItems: "center", gap: 2 },
  stripVal: { fontSize: 16, fontWeight: "800" },
  stripLabel: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: "600" },
  stripDiv: { width: 1, height: 30, backgroundColor: theme.colors.border },
  filterScroll: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexGrow: 0,
    flexShrink: 0,
  },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  filterText: { fontSize: 11, fontWeight: "600", color: theme.colors.textSecondary },
  filterTextActive: { color: theme.colors.onBrand },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeActive: { backgroundColor: "rgba(255,255,255,0.3)" },
  badgeText: { fontSize: 9, fontWeight: "700", color: theme.colors.textSecondary },
  badgeTextActive: { color: theme.colors.onBrand },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 0 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  emptySubtitle: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center" },
  findBtn: {
    marginTop: 10,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 14,
  },
  findBtnText: { color: theme.colors.onBrand, fontWeight: "700", fontSize: 14 },
  bookAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.colors.primary + "12",
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: -6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
  },
  bookAgainText: { fontSize: 12, fontWeight: "700", color: theme.colors.primary },
  billingLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.primary + "25",
  },
  billingLinkText: { flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.primary },
  mainTabRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 16,
    gap: 4,
  },
  mainTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  mainTabActive: { borderBottomColor: theme.colors.primary },
  mainTabActiveOrange: { borderBottomColor: theme.colors.secondary },
  mainTabText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  mainTabTextActive: { color: theme.colors.primary },
  tabBadge: {
    backgroundColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: { fontSize: 10, fontWeight: "700", color: theme.colors.textSecondary },
  negCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "25",
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  negCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  negServiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.secondary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  negService: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  negProvider: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  negBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  negBadgeText: { fontSize: 10, fontWeight: "700" },
  negAmtRow: { flexDirection: "row", gap: 10 },
  negAmtBox: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 3,
  },
  negAmtLabel: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: "600" },
  negAmt: { fontSize: 17, fontWeight: "800" },
  negActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  negAcceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.colors.success,
    borderRadius: 12,
    paddingVertical: 11,
  },
  negAcceptText: { fontSize: 13, fontWeight: "700", color: theme.colors.onBrand },
  negRejectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: theme.colors.danger + "10", borderWidth: 1, borderColor: theme.colors.danger + "30",
  },
  negRejectText: { fontSize: 13, fontWeight: "700", color: theme.colors.danger },
  negWaitingBadge: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  negWaitingText: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: "italic" },
  negCancelBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.colors.border + "50", borderWidth: 1, borderColor: theme.colors.border,
  },
  negCancelText: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary },
  negBookNowBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: theme.colors.success, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
  },
  negBookNowText: { fontSize: 13, fontWeight: "700", color: theme.colors.onBrand },
  negLastMsg: { flexDirection: "row", alignItems: "center", gap: 6 },
  negLastMsgText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, fontStyle: "italic" },
  urduText: { writingDirection: "rtl", textAlign: "right" },
  rateOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  rateBox: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, gap: 16,
  },
  rateHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: theme.colors.border, alignSelf: "center", marginBottom: 4,
  },
  rateTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  rateSubtitle: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center" },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  ratingLabel: { fontSize: 15, fontWeight: "700", color: theme.colors.accent, textAlign: "center" },
  reviewInput: {
    backgroundColor: theme.colors.background, borderRadius: 14, padding: 14,
    fontSize: 14, color: theme.colors.text, minHeight: 90, textAlignVertical: "top",
    borderWidth: 1, borderColor: theme.colors.border,
  },
  charCount: { fontSize: 11, color: theme.colors.textMuted, textAlign: "right" },
  rateActions: { flexDirection: "row", gap: 12 },
  rateCancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: "center",
    borderRadius: 14, backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rateCancelText: { fontSize: 14, fontWeight: "700", color: theme.colors.textSecondary },
  rateSubmitBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  rateSubmitText: { fontSize: 14, fontWeight: "700", color: theme.colors.onBrand },
});

