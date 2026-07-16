import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PrivateImage } from "@/services/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { getCategoryAppearance } from "@/utils/categoryAppearance";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api, realtime } from "@/services/api";

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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { providerId, serviceId } = useLocalSearchParams<{ providerId: string; serviceId?: string }>();
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
  const [selectedServiceId, setSelectedServiceId] = useState(serviceId || "");

  const loadProvider = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const response = await api.getProvider(providerId);
      setProvider(response.provider as Provider);
    } catch {
      setProvider(null);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    void loadProvider(true);
  }, [loadProvider]);

  useEffect(() => {
    return realtime.on((message) => {
      const payload = (message.payload || {}) as Record<string, unknown>;
      if (
        message.type === "admin:event" &&
        payload.resource === "providers" &&
        payload.providerId === providerId
      ) {
        void loadProvider(false);
      }
    });
  }, [loadProvider, providerId]);

  const serviceOptions = useMemo(() => (provider?.services || []).map((slug) => {
    const category = getCategoryBySlug(slug);
    return { slug, category, label: category?.name || slug };
  }), [getCategoryBySlug, provider?.services]);

  useEffect(() => {
    if (serviceOptions.length === 0) {
      setSelectedServiceId("");
      return;
    }
    setSelectedServiceId((current) => {
      if (current && serviceOptions.some((option) => option.slug === current)) return current;
      if (serviceId && serviceOptions.some((option) => option.slug === serviceId)) return serviceId;
      return serviceOptions[0].slug;
    });
  }, [serviceId, serviceOptions]);

  const selectedService = serviceOptions.find((option) => option.slug === selectedServiceId) || serviceOptions[0];
  const serviceLabel = selectedService?.label || "General Service";
  const existingNegotiation = useMemo(() => {
    if (!user || !provider) return null;
    const acceptedServiceKeys = new Set([selectedService?.slug, serviceLabel].filter(Boolean).map((value) => String(value).toLowerCase()));
    return getMyNegotiations(user.id).find((negotiation) =>
      negotiation.providerId === provider.id &&
      acceptedServiceKeys.has(String(negotiation.service || "").toLowerCase()) &&
      ["customer_offer", "provider_counter"].includes(negotiation.status)
    ) || null;
  }, [getMyNegotiations, provider, selectedService?.slug, serviceLabel, user]);

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
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.notFound}>
          <Icon name="alert-circle" size={36} color={theme.colors.danger} />
          <Text style={styles.notFoundText}>Provider not found</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const initials = getInitials(provider.name);
  const color = provider.profileColor || theme.colors.primary;
  const ratingDisplay = provider.rating ? (provider.rating / 10).toFixed(1) : "New";
  const ratingNum = provider.rating ? parseFloat((provider.rating / 10).toFixed(1)) : 0;
  const rateLabel = provider.ratePerHour ? `Rs. ${provider.ratePerHour.toLocaleString()}/hr` : "Negotiable";

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.headerGrad}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={theme.colors.onBrand} />
          </Pressable>
          <Pressable style={styles.heartBtn} onPress={handleToggleSaved}>
            <Icon name={isSaved ? "heart" : "heart-outline"} size={18} color={isSaved ? theme.colors.danger : "rgba(255,255,255,0.85)"} />
            <Text style={[styles.heartBtnLabel, isSaved && { color: theme.colors.danger }]}>
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
            {serviceOptions.map((option) => (
              <Pressable
                key={option.slug}
                onPress={() => setSelectedServiceId(option.slug)}
                style={[styles.serviceTag, selectedService?.slug === option.slug && styles.serviceTagSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedService?.slug === option.slug }}
                accessibilityLabel={`Select ${option.label}`}
              >
                <Icon name={(option.category?.icon || "tool") as any} size={13} color={theme.colors.onBrand} />
                <Text style={styles.serviceTagText}>{option.label}</Text>
              </Pressable>
            ))}
            {provider.isVerified && (
              <View style={styles.serviceTag}>
                <Icon name="check-circle" size={13} color={theme.colors.onBrand} />
                <Text style={styles.serviceTagText}>Verified Pro</Text>
              </View>
            )}
            <View style={styles.serviceTag}>
              <Icon name="map-pin" size={13} color={theme.colors.onBrand} />
              <Text style={styles.serviceTagText}>{provider.location ? provider.location : "Pakistan"}</Text>
            </View>
          </View>
        </LinearGradient>

        <AnimatedCard delay={60}>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{ratingDisplay}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Icon key={i} name="star" size={9} color={i <= Math.round(ratingNum) ? theme.colors.accent : theme.colors.border} />
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
              <Text style={[styles.statVal, { color: theme.colors.secondary, fontSize: 14 }]}>
                {provider.ratePerHour ? `Rs.${provider.ratePerHour}/h` : "Open"}
              </Text>
              <Text style={styles.statLbl}>Hourly Rate</Text>
            </View>
          </View>
        </AnimatedCard>

        {serviceOptions.length > 1 && (
          <AnimatedCard delay={90}>
            <View style={styles.serviceSelectorCard}>
              <View style={styles.serviceSelectorHeader}>
                <View style={styles.serviceSelectorIcon}>
                  <Icon name="briefcase" size={16} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceSelectorTitle}>Choose the required service</Text>
                  <Text style={styles.serviceSelectorText}>Chat, negotiation, and booking will use this service.</Text>
                </View>
              </View>
              <View style={styles.serviceSelectorChips}>
                {serviceOptions.map((option) => {
                  const selected = selectedService?.slug === option.slug;
                  const appearance = option.category ? getCategoryAppearance(option.category, theme) : null;
                  return (
                    <Pressable
                      key={option.slug}
                      onPress={() => setSelectedServiceId(option.slug)}
                      style={[
                        styles.serviceSelectorChip,
                        selected && styles.serviceSelectorChipSelected,
                        selected && appearance ? { borderColor: appearance.accent, backgroundColor: appearance.selectedBackground } : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Icon name={(option.category?.icon || "tool") as any} size={13} color={selected && appearance ? appearance.accent : theme.colors.textSecondary} />
                      <Text style={[styles.serviceSelectorChipText, selected && { color: appearance?.accent || theme.colors.primary }]}>{option.label}</Text>
                      {selected && <Icon name="check-circle" size={13} color={appearance?.accent || theme.colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </AnimatedCard>
        )}

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
                      <Icon name="map-pin" size={15} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.infoLabel}>Location</Text>
                    <Text style={styles.infoVal}>{provider.location}</Text>
                  </View>
                ) : null}
                <View style={[styles.infoRow, provider.location ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : {}]}>
                  <View style={styles.infoIconBg}>
                    <Icon name="dollar-sign" size={15} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.infoLabel}>General Rate</Text>
                  <Text style={[styles.infoVal, { color: theme.colors.secondary, fontWeight: "700" }]}>
                    {rateLabel}
                  </Text>
                </View>
                <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
                  <View style={styles.infoIconBg}>
                    <Icon name="message-circle" size={15} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.infoLabel}>Contact</Text>
                  <Text style={styles.infoVal}>Via in-app chat only</Text>
                </View>
              </View>
            </AnimatedCard>

            <AnimatedCard delay={180}>
              <View style={styles.privacyCard}>
                <Icon name="shield" size={16} color={theme.colors.success} />
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
                  {serviceOptions.map((option) => {
                    const appearance = option.category ? getCategoryAppearance(option.category, theme) : null;
                    const selected = selectedService?.slug === option.slug;
                    return (
                      <Pressable
                        key={option.slug}
                        onPress={() => setSelectedServiceId(option.slug)}
                        style={[
                          styles.skillChip,
                          appearance ? { backgroundColor: appearance.background, borderColor: appearance.accent } : null,
                          selected && styles.skillChipSelected,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        {option.category && appearance && <Icon name={option.category.icon as any} size={11} color={appearance.accent} />}
                        <Text style={[styles.skillText, appearance ? { color: appearance.accent } : null]}>{option.label}</Text>
                        {selected && <Icon name="check-circle" size={12} color={appearance?.accent || theme.colors.primary} />}
                      </Pressable>
                    );
                  })}
                </View>
              </AnimatedCard>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {reviewsLoading ? (
              <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
            ) : reviews.length === 0 ? (
              <View style={styles.emptyReviews}>
                <Icon name="star" size={40} color={theme.colors.border} />
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
                          <Icon name="check-circle" size={12} color={theme.colors.primary} />
                        </View>
                        <View style={styles.reviewStars}>
                          {[1, 2, 3, 4, 5].map((j) => (
                            <Icon key={j} name="star" size={11} color={j <= (r.rating || 0) ? theme.colors.accent : theme.colors.border} />
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
            <Text style={styles.footerPriceLabel}>General hourly rate</Text>
            <Text style={styles.footerPrice}>{rateLabel}</Text>
            <Text style={styles.footerService}>Selected: {serviceLabel}</Text>
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
            <Icon name="message-circle" size={20} color={theme.colors.primary} />
          </Pressable>
          <Pressable
            style={styles.negotiateBtn}
            onPress={() =>
              existingNegotiation
                ? router.push({ pathname: "/(customer)/negotiate", params: { negId: existingNegotiation.id } })
                : router.push({
                    pathname: "/(customer)/negotiate",
                    params: { providerId: provider.id, service: serviceLabel, serviceId: selectedService?.slug, providerRate: provider.ratePerHour ? String(provider.ratePerHour) : undefined },
                  })
            }
          >
            <Icon name="trending-down" size={16} color={theme.colors.secondary} />
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
                  serviceId: selectedService?.slug || undefined,
                },
              })
            }
          >
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryPressed]}
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

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: { fontSize: 16, color: theme.colors.text, fontWeight: "600" },
  backLink: { fontSize: 14, color: theme.colors.primary, fontWeight: "700" },
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
  avatarText: { fontSize: 30, fontWeight: "800", color: theme.colors.onBrand },
  availableDot: {
    position: "absolute", bottom: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.success, borderWidth: 3, borderColor: theme.colors.onBrand,
  },
  providerName: { fontSize: 22, fontWeight: "800", color: theme.colors.onBrand, marginTop: 4 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  serviceTag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  serviceTagText: { fontSize: 12, fontWeight: "700", color: theme.colors.onBrand },
  serviceTagSelected: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.9)", backgroundColor: "rgba(255,255,255,0.32)" },
  statsCard: {
    flexDirection: "row", backgroundColor: theme.colors.surface,
    marginTop: -20, marginHorizontal: 20, borderRadius: 18, padding: 16,
    shadowColor: theme.colors.text, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1,
    shadowRadius: 12, elevation: 5,
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statVal: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  starsRow: { flexDirection: "row", gap: 1 },
  statLbl: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: "600" },
  statDiv: { width: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
  serviceSelectorCard: { marginHorizontal: 20, marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 12 },
  serviceSelectorHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  serviceSelectorIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary + "15" },
  serviceSelectorTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  serviceSelectorText: { marginTop: 2, fontSize: 11, lineHeight: 16, color: theme.colors.textSecondary },
  serviceSelectorChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceSelectorChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  serviceSelectorChipSelected: { borderWidth: 1.5 },
  serviceSelectorChipText: { fontSize: 12, fontWeight: "700", color: theme.colors.textSecondary },
  tabs: {
    flexDirection: "row", marginHorizontal: 20, marginTop: 20,
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: theme.colors.surface, shadowColor: theme.colors.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: "600", color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.text },
  section: { padding: 20, gap: 16 },
  bio: { fontSize: 14, color: theme.colors.text, lineHeight: 22 },
  infoCard: { backgroundColor: theme.colors.surface, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIconBg: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.primary + "15", alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 13, color: theme.colors.textSecondary, width: 80 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.text },
  privacyCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: theme.colors.success + "10", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.colors.success + "25",
  },
  privacyTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  privacyText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18, marginTop: 2 },
  skillsTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginBottom: 8 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skillChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt,
  },
  skillText: { fontSize: 12, color: theme.colors.text, fontWeight: "600" },
  skillChipSelected: { borderWidth: 2 },
  emptyReviews: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyReviewsTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  emptyReviewsText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 19 },
  reviewCard: {
    backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.colors.border, gap: 10,
  },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: theme.colors.primary + "20", alignItems: "center", justifyContent: "center",
  },
  reviewAvatarText: { fontSize: 13, fontWeight: "700", color: theme.colors.primary },
  reviewNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  reviewName: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  reviewStars: { flexDirection: "row", gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 11, color: theme.colors.textMuted },
  reviewText: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20 },
  reviewService: { fontSize: 11, color: theme.colors.textMuted, fontWeight: "500" },
  footer: {
    backgroundColor: theme.colors.surface, paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    shadowColor: theme.colors.text, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10,
  },
  footerPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  footerPriceLabel: { fontSize: 11, color: theme.colors.textSecondary },
  footerPrice: { fontSize: 18, fontWeight: "800", color: theme.colors.primary },
  footerService: { marginTop: 1, fontSize: 10, color: theme.colors.textMuted, fontWeight: "600" },
  availBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: theme.colors.success + "15", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  busyBadge: { backgroundColor: theme.colors.danger + "15" },
  availDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.colors.success },
  busyDot: { backgroundColor: theme.colors.danger },
  availText: { fontSize: 12, fontWeight: "700", color: theme.colors.success },
  busyText: { color: theme.colors.danger },
  footerBtns: { flexDirection: "row", gap: 10, alignItems: "center" },
  chatBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: theme.colors.primary + "15", alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: theme.colors.primary + "30",
  },
  negotiateBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: theme.colors.secondary + "15", borderWidth: 1.5, borderColor: theme.colors.secondary + "30",
  },
  negotiateBtnText: { fontSize: 13, fontWeight: "700", color: theme.colors.secondary },
  bookBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  bookBtnGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  bookBtnText: { fontSize: 15, fontWeight: "800", color: theme.colors.onBrand },
});

