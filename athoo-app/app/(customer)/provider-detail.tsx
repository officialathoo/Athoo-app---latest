import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PrivateImage } from "@/services/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";

interface Review {
  id: string;
  rating: number | null;
  review: string | null;
  customerName: string;
  service: string;
  createdAt: string;
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 86400) return "Today";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(ts);
  return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProviderDetailScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { user, toggleSaved } = useAuth();
  const { getOrCreateChat } = useChat();
  const { getMyNegotiations } = useNegotiation();
  const { getCategoryBySlug } = useCategories();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [activeTab, setActiveTab] = useState<"about" | "reviews">("about");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const existingNegotiation = user && provider ? getMyNegotiations(user.id).find((n) => n.providerId === provider.id && n.service === (provider.services?.[0] || getCategoryBySlug((provider as any).serviceCategory || "")?.name || "General Service") && ["customer_offer", "provider_counter"].includes(n.status)) : null;


  useEffect(() => {
    api.getProvider(providerId)
      .then((res) => setProvider(res.provider as Provider))
      .catch(() => setProvider(null))
      .finally(() => setLoading(false));
  }, [providerId]);

  useEffect(() => {
    setIsSaved(!!user?.savedProviders?.includes(providerId));
  }, [providerId, user?.savedProviders]);

  useEffect(() => {
    if (activeTab !== "reviews") return;
    setReviewsLoading(true);
    api.getProviderReviews(providerId)
      .then((res) => setReviews(res.reviews))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [activeTab, providerId]);

  const handleToggleSaved = async () => {
    if (!user) {
      Alert.alert("Login Required", "Please login to save providers.");
      return;
    }

    await toggleSaved(providerId);
  };

  const handleChat = async () => {
    if (!user) {
      Alert.alert("Login Required", "Please login to chat.");
      return;
    }
    if (!provider) return;
    const firstService = provider.services?.[0];
    const serviceLabel = getCategoryBySlug(firstService || "")?.name || "General Service";
    const chat = await getOrCreateChat(user.id, user.name, provider.id, provider.name, undefined, serviceLabel);
    router.push({
      pathname: "/(customer)/chat-room",
      params: { chatId: chat.id, otherUserId: provider.id, otherUserName: provider.name, otherUserImage: provider.profileImage || undefined, otherUserColor: provider.profileColor || undefined },
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.notFound}>
          <Icon name="alert-circle" size={36} color={Colors.error} />
          <Text style={styles.notFoundText}>Provider not found</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const initials = getInitials(provider.name);
  const color = provider.profileColor || Colors.primary;
  const firstServiceId = provider.services?.[0];
  const category = getCategoryBySlug(firstServiceId || "");
  const serviceLabel = category?.name || (firstServiceId || "General Services");
  const ratingDisplay = provider.rating ? (provider.rating / 10).toFixed(1) : "New";
  const ratingNum = provider.rating ? parseFloat((provider.rating / 10).toFixed(1)) : 0;
  const rateLabel = provider.ratePerHour ? `Rs. ${provider.ratePerHour.toLocaleString()}/hr` : "Negotiable";

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.headerGrad}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Pressable style={styles.heartBtn} onPress={handleToggleSaved}>
            <Icon name={isSaved ? "heart" : "heart-outline"} size={18} color={isSaved ? "#FF6B6B" : "rgba(255,255,255,0.85)"} />
            <Text style={[styles.heartBtnLabel, isSaved && { color: "#FF6B6B" }]}>
              {isSaved ? "Saved" : "Save"}
            </Text>
          </Pressable>
          <View style={styles.providerHero}>
            {provider.profileImage ? (
              <PrivateImage objectPath={provider.profileImage} style={[styles.avatarLarge, { borderColor: "rgba(255,255,255,0.6)" }]} />
            ) : (
              <View style={[styles.avatarLarge, { backgroundColor: color + "30", borderColor: "rgba(255,255,255,0.6)" }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            {provider.isAvailable && <View style={styles.availableDot} />}
          </View>
          <Text style={styles.providerName}>{provider.name}</Text>
          <View style={styles.badgesRow}>
            {category && (
              <View style={styles.serviceTag}>
                <Icon name={category.icon as any} size={13} color="#fff" />
                <Text style={styles.serviceTagText}>{serviceLabel}</Text>
              </View>
            )}
            {provider.isVerified && (
              <View style={styles.serviceTag}>
                <Icon name="check-circle" size={13} color="#fff" />
                <Text style={styles.serviceTagText}>Verified Pro</Text>
              </View>
            )}
            <View style={styles.serviceTag}>
              <Icon name="map-pin" size={13} color="#fff" />
              <Text style={styles.serviceTagText}>{provider.location ? provider.location : "RWP & ISB"}</Text>
            </View>
          </View>
        </LinearGradient>

        <AnimatedCard delay={60}>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{ratingDisplay}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Icon key={i} name="star" size={9} color={i <= Math.round(ratingNum) ? Colors.accent : Colors.border} />
                ))}
              </View>
              <Text style={styles.statLbl}>Rating</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{provider.totalJobs || 0}</Text>
              <Text style={styles.statLbl}>Jobs Done</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{provider.experience || "–"}</Text>
              <Text style={styles.statLbl}>Experience</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: Colors.secondary, fontSize: 14 }]}>
                {provider.ratePerHour ? `Rs.${provider.ratePerHour}/h` : "Open"}
              </Text>
              <Text style={styles.statLbl}>Hourly Rate</Text>
            </View>
          </View>
        </AnimatedCard>

        <View style={styles.tabs}>
          {["about", "reviews"].map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab as any)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "about" ? "About" : `Reviews (${provider.ratingCount || 0})`}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === "about" ? (
          <View style={styles.section}>
            {provider.bio ? (
              <AnimatedCard delay={80}>
                <Text style={styles.bio}>{provider.bio}</Text>
              </AnimatedCard>
            ) : null}

            <AnimatedCard delay={130}>
              <View style={styles.infoCard}>
                {provider.location ? (
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconBg}>
                      <Icon name="map-pin" size={15} color={Colors.primary} />
                    </View>
                    <Text style={styles.infoLabel}>Location</Text>
                    <Text style={styles.infoVal}>{provider.location}</Text>
                  </View>
                ) : null}
                <View style={[styles.infoRow, provider.location ? { borderTopWidth: 1, borderTopColor: Colors.border } : {}]}>
                  <View style={styles.infoIconBg}>
                    <Icon name="dollar-sign" size={15} color={Colors.primary} />
                  </View>
                  <Text style={styles.infoLabel}>Hourly Rate</Text>
                  <Text style={[styles.infoVal, { color: Colors.secondary, fontWeight: "700" }]}>
                    {rateLabel}
                  </Text>
                </View>
                <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={styles.infoIconBg}>
                    <Icon name="message-circle" size={15} color={Colors.primary} />
                  </View>
                  <Text style={styles.infoLabel}>Contact</Text>
                  <Text style={styles.infoVal}>Via in-app chat only</Text>
                </View>
              </View>
            </AnimatedCard>

            <AnimatedCard delay={180}>
              <View style={styles.privacyCard}>
                <Icon name="shield" size={16} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyTitle}>Your number is private</Text>
                  <Text style={styles.privacyText}>
                    Phone numbers are never shared. Chat through the app to protect your privacy.
                  </Text>
                </View>
              </View>
            </AnimatedCard>

            {provider.services && provider.services.length > 0 && (
              <AnimatedCard delay={230}>
                <Text style={styles.skillsTitle}>Services Offered</Text>
                <View style={styles.skillsRow}>
                  {provider.services.map((sid, i) => {
                    const cat = getCategoryBySlug(sid);
                    return (
                      <View key={i} style={[styles.skillChip, cat ? { backgroundColor: cat.bgColor } : {}]}>
                        {cat && <Icon name={cat.icon as any} size={11} color={cat.color} />}
                        <Text style={[styles.skillText, cat ? { color: cat.color } : {}]}>{cat?.name || sid}</Text>
                      </View>
                    );
                  })}
                </View>
              </AnimatedCard>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {reviewsLoading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
            ) : reviews.length === 0 ? (
              <View style={styles.emptyReviews}>
                <Icon name="star" size={40} color={Colors.border} />
                <Text style={styles.emptyReviewsTitle}>No Reviews Yet</Text>
                <Text style={styles.emptyReviewsText}>Reviews appear here after customers complete bookings</Text>
              </View>
            ) : (
              reviews.map((r, i) => (
                <AnimatedCard key={r.id} delay={80 + i * 60}>
                  <View style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.reviewAvatar}>
                        <Text style={styles.reviewAvatarText}>{(r.customerName || "?")[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.reviewNameRow}>
                          <Text style={styles.reviewName}>{r.customerName}</Text>
                          <Icon name="check-circle" size={12} color={Colors.primary} />
                        </View>
                        <View style={styles.reviewStars}>
                          {[1, 2, 3, 4, 5].map((j) => (
                            <Icon key={j} name="star" size={11} color={j <= (r.rating || 0) ? Colors.accent : Colors.border} />
                          ))}
                        </View>
                      </View>
                      <Text style={styles.reviewDate}>{timeAgo(r.createdAt)}</Text>
                    </View>
                    {r.review ? <Text style={styles.reviewText}>{r.review}</Text> : null}
                    <Text style={styles.reviewService}>{r.service}</Text>
                  </View>
                </AnimatedCard>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 12 }]}>
        <View style={styles.footerPriceRow}>
          <View>
            <Text style={styles.footerPriceLabel}>Hourly Rate</Text>
            <Text style={styles.footerPrice}>{rateLabel}</Text>
          </View>
          <View style={[styles.availBadge, !provider.isAvailable && styles.busyBadge]}>
            <View style={[styles.availDot, !provider.isAvailable && styles.busyDot]} />
            <Text style={[styles.availText, !provider.isAvailable && styles.busyText]}>
              {provider.isAvailable ? "Available Now" : "Busy"}
            </Text>
          </View>
        </View>
        <View style={styles.footerBtns}>
          <Pressable style={styles.chatBtn} onPress={handleChat}>
            <Icon name="message-circle" size={20} color={Colors.primary} />
          </Pressable>
          <Pressable
            style={styles.negotiateBtn}
            onPress={() =>
              existingNegotiation
                ? router.push({ pathname: "/(customer)/negotiate", params: { negId: existingNegotiation.id } })
                : router.push({
                    pathname: "/(customer)/negotiate",
                    params: { providerId: provider.id, service: serviceLabel, providerRate: provider.ratePerHour ? String(provider.ratePerHour) : undefined },
                  })
            }
          >
            <Icon name="trending-down" size={16} color={Colors.secondary} />
            <Text style={styles.negotiateBtnText}>Negotiate</Text>
          </Pressable>
          <Pressable
            style={styles.bookBtn}
            onPress={() =>
              router.push({
                pathname: "/(customer)/book-service",
                params: {
                  providerId: provider.id,
                  providerName: provider.name,
                  providerRate: provider.ratePerHour ? String(provider.ratePerHour) : undefined,
                  serviceId: firstServiceId || undefined,
                },
              })
            }
          >
            <LinearGradient
              colors={[Colors.primary, "#0D4BA0"]}
              style={styles.bookBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.bookBtnText}>Book Now</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: { fontSize: 16, color: Colors.text, fontWeight: "600" },
  backLink: { fontSize: 14, color: Colors.primary, fontWeight: "700" },
  scroll: { flex: 1 },
  headerGrad: { paddingTop: 16, paddingBottom: 36, alignItems: "center", gap: 8, paddingHorizontal: 20 },
  backBtn: {
    position: "absolute", top: 16, left: 20,
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  heartBtn: {
    position: "absolute", top: 16, right: 14,
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)", gap: 2,
  },
  heartBtnLabel: {
    fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.85)",
  },
  providerHero: { position: "relative", marginTop: 20 },
  avatarLarge: {
    width: 92, height: 92, borderRadius: 46,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3,
  },
  avatarText: { fontSize: 30, fontWeight: "800", color: "#fff" },
  availableDot: {
    position: "absolute", bottom: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.success, borderWidth: 3, borderColor: "#fff",
  },
  providerName: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 4 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  serviceTag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  serviceTagText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  statsCard: {
    flexDirection: "row", backgroundColor: Colors.white,
    marginTop: -20, marginHorizontal: 20, borderRadius: 18, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1,
    shadowRadius: 12, elevation: 5,
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statVal: { fontSize: 17, fontWeight: "800", color: Colors.text },
  starsRow: { flexDirection: "row", gap: 1 },
  statLbl: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  statDiv: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  tabs: {
    flexDirection: "row", marginHorizontal: 20, marginTop: 20,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: Colors.white, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  tabTextActive: { color: Colors.text },
  section: { padding: 20, gap: 16 },
  bio: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  infoCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIconBg: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, width: 80 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.text },
  privacyCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.success + "10", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.success + "25",
  },
  privacyTitle: { fontSize: 13, fontWeight: "700", color: Colors.text },
  privacyText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 2 },
  skillsTitle: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skillChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  skillText: { fontSize: 12, color: Colors.text, fontWeight: "600" },
  emptyReviews: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyReviewsTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptyReviewsText: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 19 },
  reviewCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primary + "20", alignItems: "center", justifyContent: "center",
  },
  reviewAvatarText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  reviewNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  reviewName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  reviewStars: { flexDirection: "row", gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 11, color: Colors.textMuted },
  reviewText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  reviewService: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  footer: {
    backgroundColor: Colors.white, paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10,
  },
  footerPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  footerPriceLabel: { fontSize: 11, color: Colors.textSecondary },
  footerPrice: { fontSize: 18, fontWeight: "800", color: Colors.primary },
  availBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.success + "15", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  busyBadge: { backgroundColor: Colors.error + "15" },
  availDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success },
  busyDot: { backgroundColor: Colors.error },
  availText: { fontSize: 12, fontWeight: "700", color: Colors.success },
  busyText: { color: Colors.error },
  footerBtns: { flexDirection: "row", gap: 10, alignItems: "center" },
  chatBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: Colors.primary + "30",
  },
  negotiateBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: Colors.secondary + "15", borderWidth: 1.5, borderColor: Colors.secondary + "30",
  },
  negotiateBtnText: { fontSize: 13, fontWeight: "700", color: Colors.secondary },
  bookBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  bookBtnGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  bookBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});

