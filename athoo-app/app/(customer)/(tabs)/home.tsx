import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Easing,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { AppText, CustomerHomeSkeleton } from "@/components/design";

type ApiBanner = {
  id: string;
  title: string;
  subtitle?: string | null;
  bgColorFrom: string;
  bgColorTo: string;
  iconName: string;
  linkType: string;
  linkTarget?: string | null;
};

type AppAnnouncement = {
  id: string;
  title: string;
  message: string;
  buttonText: string;
  buttonLink?: string | null;
  showOnce: boolean;
};

type HomeConfig = {
  locationLabel: string;
  showBroadcastCta: boolean;
  showPlatformStats: boolean;
  showTopProviders: boolean;
  showEmergencyContacts: boolean;
  maxCategories: number;
  maxProviders: number;
};

const DEFAULT_HOME_CONFIG: HomeConfig = {
  locationLabel: "Pakistan",
  showBroadcastCta: true,
  showPlatformStats: true,
  showTopProviders: true,
  showEmergencyContacts: true,
  maxCategories: 12,
  maxProviders: 4,
};

const SHOWN_ANNOUNCEMENTS_KEY = "shown_announcements";
let customerHomeLoadedThisSession = false;

const FALLBACK_BANNERS = [
  { id: "f1", title: "Book a Plumber", subtitle: "Quick fixes at your door", bgColorFrom: Colors.primary, bgColorTo: "#0D4BA0", iconName: "droplet", linkType: "category", linkTarget: "plumber" },
  { id: "f2", title: "AC Service", subtitle: "Stay cool this summer", bgColorFrom: "#14B8A6", bgColorTo: "#0E8A7E", iconName: "thermometer", linkType: "category", linkTarget: "ac_repair" },
  { id: "f3", title: "Deep Cleaning", subtitle: "Professional cleaning team", bgColorFrom: Colors.secondary, bgColorTo: "#D45A0E", iconName: "wind", linkType: "category", linkTarget: "cleaner" },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const { t, isUrdu } = useLang();
  const { unreadCount, push } = useNotifications();
  const { pendingAlerts, consumeNegAlerts } = useNegotiation();
  const { categories } = useCategories();

  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const scrollY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [topProviders, setTopProviders] = useState<Provider[]>([]);
  const [platformStats, setPlatformStats] = useState({ providerCount: 50, categoryCount: 12, avgRating: 4.8 });
  const [apiBanners, setApiBanners] = useState<ApiBanner[]>([]);
  const [announcement, setAnnouncement] = useState<AppAnnouncement | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [activeBroadcasts, setActiveBroadcasts] = useState<any[]>([]);
  const [homeLoading, setHomeLoading] = useState(!customerHomeLoadedThisSession);
  const hasLoadedHomeRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [bannersStatus, setBannersStatus] = useState<"idle" | "success" | "error">("idle");
  const [homeConfig, setHomeConfig] = useState<HomeConfig>(DEFAULT_HOME_CONFIG);
  const [emergencyContacts, setEmergencyContacts] = useState<Array<{ id: string; name: string; number: string; description?: string | null; icon: string; sortOrder: number }>>([
    { id: "fallback-1", name: "Emergency Rescue", number: "1122", description: "24/7 Emergency Service", icon: "phone-call", sortOrder: 0 },
  ]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    api.getAnnouncements("customer")
      .then(async res => {
        if (res.announcements.length === 0) return;
        const ann = res.announcements[0];
        // Repeating announcements must not block Home with a dark full-screen modal.
        // They remain available through normal marketing surfaces; only one-time
        // acknowledgements are presented as a modal.
        if (!ann.showOnce) return;
        try {
          const AS = (await import("@react-native-async-storage/async-storage")).default;
          const shown = await AS.getItem(SHOWN_ANNOUNCEMENTS_KEY);
          const shownIds: string[] = shown ? JSON.parse(shown) : [];
          if (!shownIds.includes(ann.id)) {
            setAnnouncement(ann);
            setShowAnnouncement(true);
          }
        } catch {
          setAnnouncement(ann);
          setShowAnnouncement(true);
        }
      })
      .catch(() => {});
  }, []);

  async function dismissAnnouncement() {
    setShowAnnouncement(false);
    if (announcement?.showOnce) {
      try {
        const AS = (await import("@react-native-async-storage/async-storage")).default;
        const shown = await AS.getItem(SHOWN_ANNOUNCEMENTS_KEY);
        const shownIds: string[] = shown ? JSON.parse(shown) : [];
        if (!shownIds.includes(announcement.id)) {
          shownIds.push(announcement.id);
          await AS.setItem(SHOWN_ANNOUNCEMENTS_KEY, JSON.stringify(shownIds));
        }
      } catch {}
    }
  }

  useEffect(() => {
    if (pendingAlerts.length === 0) return;

    const alerts = consumeNegAlerts();

    for (const alert of alerts) {
      push({
        type: "negotiation",
        title: alert.title,
        message: alert.message,
        role: "customer",
        negotiationId: alert.negotiation.id,
      });
    }
  }, [pendingAlerts, consumeNegAlerts, push]);

  const loadFocusData = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else if (!hasLoadedHomeRef.current) setHomeLoading(true);
    setHomeError(null);

    const results = await Promise.allSettled([
      api.getCustomerHomeConfig().then((res) => setHomeConfig({ ...DEFAULT_HOME_CONFIG, ...res.config })),
      api.getMarketingBanners("customer").then((res) => {
        setApiBanners(res.banners);
        setBannersStatus("success");
      }).catch((error) => {
        setBannersStatus("error");
        throw error;
      }),
      api.getProviders().then((res) => setTopProviders(res.providers as Provider[])),
      api.getPlatformStats().then((data) => setPlatformStats({
        providerCount: data.providerCount || 0,
        categoryCount: data.categoryCount || 0,
        avgRating: data.avgRating || 0,
      })),
      api.getEmergencyContacts().then((res) => setEmergencyContacts(res.contacts)),
      api.getBroadcastRequests({ status: "open" }).then((res) =>
        setActiveBroadcasts((res.requests || []).filter((request: any) => request.status === "open"))
      ),
    ]);

    const failures = results.filter((result) => result.status === "rejected").length;
    if (failures >= 3) {
      setHomeError("Some home content could not be refreshed. Pull down or tap retry.");
    }
    hasLoadedHomeRef.current = true;
    customerHomeLoadedThisSession = true;
    setHomeLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadFocusData(hasLoadedHomeRef.current ? "refresh" : "initial");
  }, [loadFocusData]));

  const firstName = user?.name?.split(" ")[0] || "there";
  const displayBanners = bannersStatus === "error" ? FALLBACK_BANNERS : apiBanners;
  const displayCategories = categories.slice(0, homeConfig.maxCategories);
  const displayProviders = topProviders.slice(0, homeConfig.maxProviders);
  const locationLabel = user?.location?.trim() || homeConfig.locationLabel || "Pakistan";

  return (
    <View style={styles.container}>

      <Animated.View style={[styles.header, { paddingTop: topPad + 10 }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hello, {firstName} 👋</Text>
            <View style={styles.locationRow}>
              <Icon name="map-pin" size={13} color={Colors.secondary} />
              <Text style={styles.location}>{locationLabel}</Text>
            </View>
          </View>

          <Pressable
            style={styles.notifBtn}
            onPress={() => router.push("/(customer)/notifications")}
          >
            <Icon name="bell" size={20} color={Colors.text} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        <Pressable
          style={styles.searchBar}
          onPress={() => router.push("/(customer)/(tabs)/search")}
        >
          <View style={styles.searchIconBg}>
            <Icon name="search" size={16} color={Colors.primary} />
          </View>
          <Text style={styles.searchPlaceholder}>Search services, workers...</Text>
          <View style={styles.filterBtn}>
            <Icon name="sliders" size={15} color={Colors.primary} />
          </View>
        </Pressable>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadFocusData("refresh")}
            tintColor={Colors.primary}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {homeLoading ? (
          <View style={styles.initialSkeletonWrap}>
            <CustomerHomeSkeleton />
          </View>
        ) : null}
        {homeError ? (
          <View style={styles.homeErrorCard} accessibilityRole="alert">
            <Icon name="wifi-off" size={18} color={Colors.error} />
            <Text style={styles.homeErrorText}>{homeError}</Text>
            <Pressable onPress={() => void loadFocusData("refresh")} accessibilityRole="button">
              <Text style={styles.homeRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {displayBanners.length > 0 ? (
        <AnimatedCard delay={80}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bannerScroll}
          >
            {displayBanners.map((b, i) => (
              <Pressable
                key={b.id || i}
                onPress={() => {
                  if (b.linkType === "category" && b.linkTarget) {
                    router.push({
                      pathname: "/(customer)/service-providers",
                      params: { serviceId: b.linkTarget },
                    });
                  } else if (b.linkType === "booking") {
                    router.push("/(customer)/book-service" as any);
                  }
                }}
              >
                <LinearGradient
                  colors={[b.bgColorFrom, b.bgColorTo] as [string, string]}
                  style={styles.banner}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.bannerContent}>
                    <Text style={styles.bannerTitle}>{b.title}</Text>
                    {b.subtitle ? (
                      <Text style={styles.bannerSubtitle}>{b.subtitle}</Text>
                    ) : null}
                    <View style={styles.bannerBtn}>
                      <Text style={styles.bannerBtnText}>{t.bookNow}</Text>
                      <Icon name="arrow-right" size={12} color="#fff" />
                    </View>
                  </View>
                  <View style={styles.bannerIconCircle}>
                    <Icon
                      name={(b.iconName || "star") as any}
                      size={50}
                      color="rgba(255,255,255,0.25)"
                    />
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>
        </AnimatedCard>
        ) : null}

        {/* Active Broadcast Live Banner */}
        {activeBroadcasts.length > 0 && (
          <AnimatedCard delay={110}>
            <Pressable
              style={styles.activeBroadcastCard}
              onPress={() =>
                router.push({
                  pathname: "/(customer)/broadcast-status",
                  params: { requestId: activeBroadcasts[0].id },
                } as any)
              }
            >
              <LinearGradient
                colors={["#1A6B1A", "#2D8A2D"]}
                style={styles.activeBroadcastGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {/* Pulsing live dot */}
                <View style={styles.liveDotWrap}>
                  <Animated.View style={[styles.liveDotOuter, { opacity: pulseAnim }]} />
                  <View style={styles.liveDotInner} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.activeBroadcastLabel}>LIVE BROADCAST</Text>
                  <Text style={styles.activeBroadcastService} numberOfLines={1}>
                    {activeBroadcasts[0].serviceLabel || "Broadcast Request"}
                  </Text>
                  <Text style={styles.activeBroadcastSub}>
                    {activeBroadcasts[0].responses?.filter((r: any) => r.status === "pending").length > 0
                      ? `${activeBroadcasts[0].responses.filter((r: any) => r.status === "pending").length} provider${activeBroadcasts[0].responses.filter((r: any) => r.status === "pending").length > 1 ? "s" : ""} responded`
                      : "Waiting for providers to respond..."}
                    {activeBroadcasts.length > 1 ? ` · +${activeBroadcasts.length - 1} more` : ""}
                  </Text>
                </View>

                <View style={styles.activeBroadcastBtn}>
                  <Text style={styles.activeBroadcastBtnText}>View</Text>
                  <Icon name="arrow-right" size={13} color="#fff" />
                </View>
              </LinearGradient>
            </Pressable>
          </AnimatedCard>
        )}

        {/* InDrive-style Broadcast Banner */}
        {homeConfig.showBroadcastCta ? (
        <AnimatedCard delay={120}>
          <Pressable
            style={styles.broadcastCTA}
            onPress={() => router.push("/(customer)/book-service" as any)}
          >
            <LinearGradient
              colors={[Colors.secondary, "#D45A0E"]}
              style={styles.broadcastGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.broadcastCTATitle}>Broadcast a Job</Text>
                <Text style={styles.broadcastCTASub}>
                  Describe your problem → set your price → providers respond
                </Text>
              </View>
              <View style={styles.broadcastCTAArrow}>
                <Icon name="send" size={24} color="rgba(255,255,255,0.8)" />
              </View>
            </LinearGradient>
          </Pressable>
        </AnimatedCard>
        ) : null}

        <AnimatedCard delay={150}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, isUrdu && styles.urduText]}>
                {t.services}
              </Text>
              <Pressable onPress={() => router.push("/(customer)/(tabs)/search")}>
                <Text style={[styles.seeAll, isUrdu && styles.urduText]}>
                  {t.seeAll}
                </Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.servicesRow}>
                {displayCategories.map((s) => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    onPress={() =>
                      router.push({
                        pathname: "/(customer)/service-providers",
                        params: { serviceId: s.slug || s.id },
                      })
                    }
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </AnimatedCard>

        {homeConfig.showPlatformStats ? (
        <AnimatedCard delay={220}>
          <View style={styles.section}>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: Colors.surface }]}>
                <Text style={[styles.statValue, { color: Colors.primary }]}>
                  {platformStats.providerCount}+
                </Text>
                <Text style={[styles.statLabel, isUrdu && styles.urduText]}>
                  {t.workers}
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: "#FFF7ED" }]}>
                <Text style={[styles.statValue, { color: Colors.secondary }]}>
                  {platformStats.categoryCount}
                </Text>
                <Text style={[styles.statLabel, isUrdu && styles.urduText]}>
                  {t.services}
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: "#F0FDF4" }]}>
                <Text style={[styles.statValue, { color: Colors.success }]}>
                  {platformStats.avgRating}★
                </Text>
                <Text style={[styles.statLabel, isUrdu && styles.urduText]}>
                  {t.avgRating}
                </Text>
              </View>
            </View>
          </View>
        </AnimatedCard>
        ) : null}

        {homeConfig.showTopProviders && displayProviders.length > 0 ? (
        <AnimatedCard delay={290}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, isUrdu && styles.urduText]}>
                {t.topRatedNearby}
              </Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(customer)/service-providers",
                    params: { serviceId: "all" },
                  })
                }
              >
                <Text style={[styles.seeAll, isUrdu && styles.urduText]}>
                  {t.seeAll}
                </Text>
              </Pressable>
            </View>
            {displayProviders.map((p, i) => (
              <AnimatedCard key={p.id} delay={310 + i * 60}>
                <ProviderCard
                  provider={p}
                  onPress={() =>
                    router.push({
                      pathname: "/(customer)/provider-detail",
                      params: { providerId: p.id },
                    })
                  }
                />
              </AnimatedCard>
            ))}
          </View>
        </AnimatedCard>
        ) : null}

        <AnimatedCard delay={500}>
          <Pressable
            style={styles.negotiateCard}
            onPress={() =>
              router.push({
                pathname: "/(customer)/service-providers",
                params: { serviceId: "all" },
              })
            }
          >
            <LinearGradient
              colors={[Colors.secondary, "#D45A0E"]}
              style={styles.negotiateGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.negotiateLeft}>
                <Text style={[styles.negotiateTitle, isUrdu && styles.urduText]}>
                  {t.negotiatePrice}
                </Text>
                <Text
                  style={[styles.negotiateSubtitle, isUrdu && styles.urduText]}
                >
                  {t.indriveStyle}
                </Text>
                <View style={styles.negotiateBtn}>
                  <Text
                    style={[styles.negotiateBtnText, isUrdu && styles.urduText]}
                  >
                    {t.makeAnOffer}
                  </Text>
                  <Icon name="arrow-right" size={13} color="#fff" />
                </View>
              </View>
              <Icon
                name="trending-down"
                size={52}
                color="rgba(255,255,255,0.25)"
              />
            </LinearGradient>
          </Pressable>
        </AnimatedCard>

        {homeConfig.showEmergencyContacts ? emergencyContacts.map((ec, idx) => (
          <AnimatedCard key={ec.id} delay={560 + idx * 60}>
            <Pressable
              style={styles.emergencyCard}
              onPress={() => Linking.openURL(`tel:${ec.number}`)}
            >
              <View style={styles.emergencyLeft}>
                <View style={styles.emergencyIcon}>
                  <Icon name={(ec.icon || "phone-call") as any} size={20} color={Colors.error} />
                </View>
                <View>
                  <Text style={[styles.emergencyTitle, isUrdu && styles.urduText]}>
                    {ec.name}
                  </Text>
                  <Text style={[styles.emergencySubtitle, isUrdu && styles.urduText]}>
                    {ec.description || t.support247}
                  </Text>
                </View>
              </View>
              <Pressable
                style={styles.emergencyCallBtn}
                onPress={() => Linking.openURL(`tel:${ec.number}`)}
              >
                <Text style={[styles.emergencyCallText, isUrdu && styles.urduText]}>
                  {t.callNow}
                </Text>
              </Pressable>
            </Pressable>
          </AnimatedCard>
        )) : null}
      </Animated.ScrollView>

      {/* Announcement Popup Modal */}
      <Modal
        visible={showAnnouncement && announcement !== null}
        transparent
        animationType="fade"
        onRequestClose={dismissAnnouncement}
      >
        <View style={styles.announcementOverlay}>
          <View style={styles.announcementCard}>
            <View style={styles.announcementHeader}>
              <View style={styles.announcementIconBg}>
                <Icon name="bell" size={22} color={Colors.primary} />
              </View>
              <Pressable style={styles.announcementClose} onPress={dismissAnnouncement}>
                <Icon name="x" size={18} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.announcementTitle}>{announcement?.title}</Text>
            <Text style={styles.announcementMessage}>{announcement?.message}</Text>
            <Pressable
              style={styles.announcementBtn}
              onPress={() => {
                dismissAnnouncement();
                if (announcement?.buttonLink) {
                  Linking.openURL(announcement.buttonLink).catch(() => {});
                }
              }}
            >
              <Text style={styles.announcementBtnText}>{announcement?.buttonText || "Got it"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  greeting: { fontSize: 20, fontWeight: "800", color: Colors.text },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  location: { fontSize: 12, color: Colors.textSecondary, fontWeight: "500" },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "800",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  searchIconBg: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  searchPlaceholder: { flex: 1, fontSize: 14, color: Colors.textMuted },
  filterBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  bannerScroll: { paddingHorizontal: 20, paddingTop: 18 },
  banner: {
    width: 290,
    height: 150,
    borderRadius: 22,
    marginRight: 14,
    padding: 22,
    flexDirection: "row",
    overflow: "hidden",
  },
  bannerContent: { flex: 1, justifyContent: "space-between" },
  bannerTitle: { fontSize: 19, fontWeight: "800", color: "#fff" },
  bannerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 17,
  },
  bannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  bannerBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  bannerIconCircle: { position: "absolute", right: 14, bottom: 12 },
  section: { paddingHorizontal: 20, paddingTop: 22 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  seeAll: { fontSize: 13, fontWeight: "600", color: Colors.primary },
  servicesRow: { flexDirection: "row", gap: 10, paddingRight: 20 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  negotiateCard: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 22,
    overflow: "hidden",
  },
  negotiateGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
  },
  negotiateLeft: { flex: 1, gap: 6 },
  negotiateTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  negotiateSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 17,
  },
  negotiateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  negotiateBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  emergencyCard: {
    margin: 20,
    backgroundColor: Colors.error + "10",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.error + "30",
  },
  emergencyLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  emergencyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.error + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyTitle: { fontSize: 14, fontWeight: "800", color: Colors.error },
  emergencySubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emergencyCallBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  emergencyCallText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  homeErrorCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error + "35",
    backgroundColor: Colors.error + "0D",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  homeErrorText: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  homeRetryText: { color: Colors.primary, fontSize: 12, fontWeight: "800" },
  urduText: {
    fontFamily: "System",
    writingDirection: "rtl",
    textAlign: "right",
  },

  activeBroadcastCard: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#1A6B1A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  activeBroadcastGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  liveDotWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  liveDotOuter: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#6EFF6E",
  },
  liveDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  activeBroadcastLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  activeBroadcastService: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  activeBroadcastSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  activeBroadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  activeBroadcastBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },

  broadcastCTA: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 20,
    overflow: "hidden",
  },
  broadcastGrad: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 12,
  },
  broadcastCTATitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  broadcastCTASub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 17,
    marginTop: 4,
  },
  broadcastCTAArrow: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  announcementOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  announcementCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
    gap: 12,
  },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  announcementIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  announcementClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  announcementTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.text,
  },
  announcementMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  announcementBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  announcementBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  initialSkeletonWrap: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
});
