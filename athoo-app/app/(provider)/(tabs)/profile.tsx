import { Icon } from "@/components/ui/Icon";
import * as ImagePicker from "expo-image-picker";
import { pickFromCamera, pickFromGallery } from "@/utils/mediaPicker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { BiometricLoginSetting } from "@/components/security/BiometricLoginSetting";
import { InviteFriendsCard } from "@/components/profile/InviteFriendsCard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { uploadPickedImage, PrivateImage } from "@/services/storage";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
import { radius } from "@/design/tokens";
import type { AthooTheme } from "@/design/theme";
import { getCategoryAppearance } from "@/utils/categoryAppearance";
import { apiErrorToMessage } from "@/lib/apiError";
import { runtimeConfig } from "@/config/runtime";
import { appIdentity } from "@/config/appIdentity";


const PROVIDER_PROFILE_BACKGROUND_REFRESH_MS = 60_000;

export default function ProviderProfileScreen() {
  const { user, logout, updateUser, refreshUser } = useAuth();
  const { getMyBookings } = useBookings();
  const { t, lang, translate: tr, textAlign, writingDirection } = useLang();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const avatarColors = useMemo(() => [theme.colors.secondary, theme.colors.primary, theme.colors.accent, theme.colors.success, theme.colors.warning, theme.colors.danger, theme.colors.info], [theme]);
  const localizedText = { textAlign, writingDirection } as const;
  const { getCategoryBySlug } = useCategories();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const socialLinks = useMemo(() => [
    { icon: "message-circle", label: "WhatsApp", url: runtimeConfig.support.whatsappUrl, color: theme.colors.success },
    { icon: "instagram", label: "Instagram", url: runtimeConfig.support.instagramUrl, color: theme.colors.accent },
    { icon: "facebook", label: "Facebook", url: runtimeConfig.support.facebookUrl, color: theme.colors.info },
  ]
    .filter((entry) => Boolean(entry.url))
    .map((entry) => ({ ...entry, url: entry.url as string })), [theme]);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean>(!!user?.isAvailable);
  const [togglingAvail, setTogglingAvail] = useState(false);
  const availabilityProgress = useRef(new Animated.Value(user?.isAvailable ? 1 : 0)).current;
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const profileRefreshInFlightRef = useRef(false);
  const profileLoadedRef = useRef(false);
  const profileLastLoadedAtRef = useRef(0);

  const refreshProfile = useCallback(async (
    mode: "initial" | "background" | "event" = "initial"
  ) => {
    if (profileRefreshInFlightRef.current) return;

    profileRefreshInFlightRef.current = true;
    try {
      await refreshUser();
      profileLoadedRef.current = true;
      profileLastLoadedAtRef.current = Date.now();
    } catch {
      // Keep the currently visible profile when a background refresh fails.
    } finally {
      profileRefreshInFlightRef.current = false;
    }
  }, [refreshUser]);

  const toggleAvailability = async (val: boolean) => {
    const previous = isAvailable;
    setIsAvailable(val);
    setTogglingAvail(true);
    try {
      const res: any = await api.updateAvailability(val);
      const next = !!res?.user?.isAvailable;
      setIsAvailable(next);
      await updateUser({ isAvailable: next });
    } catch (e: any) {
      setIsAvailable(previous);
      Alert.alert("Availability", apiErrorToMessage(e, "You cannot turn available while busy on an active job."));
    } finally {
      setTogglingAvail(false);
    }
  };

  useFocusEffect(useCallback(() => {
    if (!profileLoadedRef.current) {
      void refreshProfile("initial");
      return;
    }

    if (
      Date.now() - profileLastLoadedAtRef.current >=
      PROVIDER_PROFILE_BACKGROUND_REFRESH_MS
    ) {
      void refreshProfile("background");
    }
  }, [refreshProfile]));

  useEffect(() => {
    setIsAvailable(!!user?.isAvailable);
  }, [user?.isAvailable]);

  useEffect(() => {
    Animated.spring(availabilityProgress, {
      toValue: isAvailable ? 1 : 0,
      damping: 15,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [availabilityProgress, isAvailable]);

  const pickImage = async (useCamera: boolean) => {
    setShowAvatarModal(false);
    // Wait for ALL animations/interactions to finish before showing system dialog
    await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(resolve));
    // Extra grace period on iOS to fully dismiss the modal before the system picker appears
    if (Platform.OS === "ios") {
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }

    const opts = { allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.6 };
    const result = useCamera
      ? await pickFromCamera(opts)
      : await pickFromGallery({ ...opts, mediaTypes: "images" });
    if (!result || result.canceled || !result.assets?.[0]) return;
    if (result.assets?.[0]) {
      const asset = result.assets[0];
      try {
        setUploadingPhoto(true);
        const contentType = asset.mimeType || "image/jpeg";
        const filename = asset.fileName || `profile-${Date.now()}.${contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"}`;
        const objectPath = await uploadPickedImage(asset.uri, filename, contentType);
        await updateUser({ profileImage: objectPath });
      } catch (error) {
        Alert.alert("Upload failed", apiErrorToMessage(error, "Your profile photo could not be saved. Please try again."));
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  const bookings = user ? getMyBookings(user.id, "provider") : [];
  const completed = bookings.filter((b) => b.status === "completed").length;
  const earnings = bookings.filter((b) => b.status === "completed").reduce((s, b) => s + (b.price || 0), 0);
  const active = bookings.filter((b) => b.status === "in_progress" || b.status === "accepted").length;

  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "P";
  const avatarColor = user?.profileColor || theme.colors.secondary;

  const handleDeactivate = () => {
    router.push("/(provider)/privacy" as any);
  };

  const handleDeleteAccount = () => {
    router.push("/(provider)/privacy" as any);
  };

  const handleLogout = () => {
    Alert.alert(t.logout, t.areYouSure, [
      { text: t.cancel, style: "cancel" },
      { text: t.logout, style: "destructive", onPress: logout },
    ]);
  };

  const handleSwitchRole = () => {
    Alert.alert(
      "Switch Role",
      "Your account will switch to customer mode right now.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            Alert.alert("Info", "Please log out and log in as a customer account.");
          },
        },
      ]
    );
  };

  const MENU_SECTIONS = [
    {
      title: t.workEarnings,
      items: [
        { icon: "crown", label: t.premiumPlan, color: theme.colors.warning, onPress: () => router.push("/(provider)/subscription") },
        { icon: "file-text", label: t.invoices, color: theme.colors.primary, onPress: () => router.push("/(provider)/invoices") },
        { icon: "briefcase", label: t.myNegotiations, color: theme.colors.secondary, onPress: () => router.push("/(provider)/negotiations") },
        { icon: "calendar", label: t.availabilitySchedule, color: theme.colors.info, onPress: () => router.push("/(provider)/availability" as any) },
        { icon: "trending-up", label: t.myWallet, color: theme.colors.success, onPress: () => router.push("/(provider)/wallet" as any) },
        { icon: "map-pin", label: t.serviceRadius, color: theme.colors.info, onPress: () => router.push("/(provider)/service-radius" as any) },
      ],
    },
    {
      title: t.account,
      items: [
        { icon: "file-check", label: tr("Verification documents & validity"), color: theme.colors.success, onPress: () => router.push("/(provider)/verification-documents") },
        { icon: "settings", label: tr("Notification Preferences"), color: theme.colors.accent, onPress: () => router.push("/notification-preferences" as any) },
        { icon: "mail", label: "Email & communication", color: theme.colors.primary, onPress: () => router.push("/email-preferences" as any) },
        { icon: "sun", label: t.appearance, color: theme.colors.accent, onPress: () => router.push("/appearance" as any) },
        { icon: "lock", label: t.changePassword, color: theme.colors.warning, onPress: () => router.push("/(provider)/change-password") },
        { icon: "globe", label: t.language, color: theme.colors.info, onPress: () => router.push("/language" as any), rightEl: (
          <View style={styles.langBadge}>
            <Text style={styles.langBadgeText}>{lang === "en" ? "EN" : "اردو"}</Text>
          </View>
        )},
        { icon: "shield", label: t.privacy, color: theme.colors.primary, onPress: () => router.push("/(provider)/privacy") },
      ],
    },
    {
      title: t.support,
      items: [
        { icon: "help-circle", label: t.help, color: theme.colors.primary, onPress: () => router.push("/(provider)/help") },
        { icon: "headphones", label: t.contactSupport, color: theme.colors.danger, onPress: () => router.push("/(provider)/contact-support") },
        { icon: "info", label: t.about, color: theme.colors.secondary, onPress: () => router.push("/(provider)/about") },
      ],
    },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={[styles.headerGrad, { paddingTop: topPad + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t.myProfile}</Text>
          <Pressable style={styles.editBtn} onPress={() => router.push("/(provider)/edit-profile" as any)}>
            <Icon name="edit-2" size={16} color={theme.colors.onBrand} />
          </Pressable>
        </View>

        <View style={styles.avatarSection}>
          <Pressable style={styles.avatarWrap} onPress={() => !uploadingPhoto && setShowAvatarModal(true)}>
            {user?.profileImage ? (
              <PrivateImage objectPath={user.profileImage} style={[styles.avatar, { backgroundColor: avatarColor }]} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            {uploadingPhoto ? (
              <View style={[styles.cameraBadge, { width: "100%", height: "100%", borderRadius: 40, backgroundColor: "rgba(0,0,0,0.45)", position: "absolute", top: 0, left: 0, justifyContent: "center", alignItems: "center" }]}>
                <ActivityIndicator color={theme.colors.onBrand} size="small" />
              </View>
            ) : (
              <View style={styles.cameraBadge}>
                <Icon name="camera" size={12} color={theme.colors.onBrand} />
              </View>
            )}
          </Pressable>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name}</Text>
            <View style={styles.verifiedRow}>
              <Icon name="briefcase" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.userRole}>{t.providerRole}</Text>
              {user?.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Icon name="check-circle" size={10} color={theme.colors.secondary} />
                  <Text style={styles.verifiedText}>{t.verified}</Text>
                </View>
              )}
            </View>
            <Text style={styles.userPhone}>{user?.phone}</Text>
            {user?.publicId ? <Text style={styles.userPublicId}>{tr("Athoo ID")}: {user.publicId}</Text> : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{bookings.length}</Text>
            <Text style={styles.statLbl}>{t.totalJobsLabel}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.colors.success }]}>{completed}</Text>
            <Text style={styles.statLbl}>{t.doneLabel}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.colors.secondary }]}>{active}</Text>
            <Text style={styles.statLbl}>{t.active}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.colors.warning }]}>
              {earnings > 0 ? `${Math.round(earnings / 1000)}k` : "0"}
            </Text>
            <Text style={styles.statLbl}>{t.earnedRs}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.colors.secondary, fontSize: 13 }]}>
              {(user as any)?.ratePerHour ? String((user as any).ratePerHour) : "–"}
            </Text>
            <Text style={styles.statLbl}>{t.ratePerHourLabel}</Text>
          </View>
        </View>
      </LinearGradient>

      <InviteFriendsCard
        role="provider"
        referralCode={user?.referralCode}
        referralCount={user?.referralCount}
        delay={70}
      />

      {user?.services && user.services.length > 0 && (
        <View style={styles.servicesCard}>
          <Text style={styles.cardTitle}>{t.myServices}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.servicesGrid}
          >
            {user.services.map((sid) => {
              const svc = getCategoryBySlug(sid);
              if (!svc) return <View key={sid} style={styles.serviceChip}><Text style={styles.serviceChipText}>{sid}</Text></View>;
              const appearance = getCategoryAppearance(svc, theme);
              return (
                <View key={sid} style={[styles.serviceChip, { backgroundColor: appearance.background, borderColor: appearance.accent }]}>
                  <Icon name={svc.icon as any} size={14} color={appearance.accent} />
                  <Text style={[styles.serviceChipText, { color: appearance.accent }]}>{svc.name}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.availCard}>
        <View style={styles.availLeft}>
          <View style={[styles.availDotIcon, { backgroundColor: isAvailable ? theme.colors.successSoft : theme.colors.dangerSoft }]}>
            <Animated.View
              style={[
                styles.availPulse,
                {
                  backgroundColor: theme.colors.success,
                  opacity: availabilityProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] }),
                  transform: [{ scale: availabilityProgress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.5] }) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.availDotInner,
                {
                  backgroundColor: isAvailable ? theme.colors.success : theme.colors.danger,
                  transform: [{ scale: availabilityProgress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }],
                },
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.availTitle, localizedText]}>{t.availableForJobs}</Text>
            <Text style={styles.availSub}>
              {isAvailable ? t.customersCanBook : t.notAvailable}
            </Text>
          </View>
        </View>
        {togglingAvail ? (
          <ActivityIndicator size="small" color={isAvailable ? theme.colors.success : theme.colors.textMuted} />
        ) : (
          <Switch
            value={isAvailable}
            onValueChange={toggleAvailability}
            trackColor={{ false: theme.colors.border, true: theme.colors.successSoft }}
            thumbColor={isAvailable ? theme.colors.success : theme.colors.textMuted}
            accessibilityLabel={`${isAvailable ? "Turn off" : "Turn on"} availability for jobs`}
          />
        )}
      </View>

      {socialLinks.length > 0 ? (
        <View style={styles.socialCard}>
          <Text style={[styles.cardTitle, localizedText]}>{t.connectWithUs}</Text>
          <View style={styles.socialRow}>
            {socialLinks.map((social) => (
              <Pressable
                key={social.label}
                style={[styles.socialBtn, { backgroundColor: `${social.color}20` }]}
                onPress={() => void Linking.openURL(social.url)}
              >
                <Icon name={social.icon as any} size={20} color={social.color} />
                <Text style={[styles.socialLabel, { color: social.color }]}>{social.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {MENU_SECTIONS.map((section) => (
        <View key={section.title} style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.menuCard}>
            {section.items.map((item, i) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [
                  styles.menuItem,
                  i < section.items.length - 1 && styles.menuItemBorder,
                  pressed && styles.menuPressed,
                ]}
                onPress={item.onPress}
              >
                <View style={[styles.menuIcon, { backgroundColor: item.color + "18" }]}>
                  <Icon name={item.icon as any} size={18} color={item.color} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.rightEl ? item.rightEl : <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />}
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.menuCard}>
          <BiometricLoginSetting />
        </View>
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Icon name="log-out" size={16} color={theme.colors.danger} />
        <Text style={styles.logoutText}>{t.logout}</Text>
      </Pressable>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>{t.dangerZone}</Text>
        <Pressable style={styles.dangerBtn} onPress={handleDeactivate}>
          <Icon name="eye-off" size={15} color={theme.colors.danger} />
          <Text style={styles.dangerBtnText}>{t.deactivateAccount}</Text>
        </Pressable>
        <Pressable style={[styles.dangerBtn, { borderColor: theme.colors.danger, backgroundColor: theme.colors.danger + "10" }]} onPress={handleDeleteAccount}>
          <Icon name="trash-2" size={15} color={theme.colors.danger} />
          <Text style={[styles.dangerBtnText, { fontWeight: "800" }]}>Schedule Account Deletion</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>Athoo Provider v{appIdentity.version} | Pakistan</Text>

      <Modal visible={showAvatarModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAvatarModal(false)}>
          <View style={styles.avatarModalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorPickerTitle}>Profile Picture</Text>
            <View style={styles.avatarPreviewRow}>
              {user?.profileImage ? (
                <PrivateImage objectPath={user.profileImage} style={styles.avatarPreview} />
              ) : (
                <View style={[styles.avatarPreview, { backgroundColor: avatarColor, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: theme.colors.onBrand }}>{initials}</Text>
                </View>
              )}
              {user?.profileImage && (
                <Pressable style={styles.removePhotoBtn} onPress={() => { updateUser({ profileImage: null as any }); setShowAvatarModal(false); }}>
                  <Icon name="trash-2" size={14} color={theme.colors.danger} />
                  <Text style={styles.removePhotoText}>Remove Photo</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={styles.avatarOption} onPress={() => pickImage(false)}>
              <View style={[styles.avatarOptIcon, { backgroundColor: theme.colors.primary + "15" }]}>
                <Icon name="image" size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.avatarOptLabel}>Upload from Gallery</Text>
                <Text style={styles.avatarOptSub}>Choose a photo from your device</Text>
              </View>
              <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
            </Pressable>
            <Pressable style={styles.avatarOption} onPress={() => pickImage(true)}>
              <View style={[styles.avatarOptIcon, { backgroundColor: theme.colors.accentSoft }]}>
                <Icon name="camera" size={20} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.avatarOptLabel}>Take a Selfie</Text>
                <Text style={styles.avatarOptSub}>Use your camera</Text>
              </View>
              <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
            </Pressable>
            <Pressable style={styles.avatarOption} onPress={() => { setShowAvatarModal(false); setTimeout(() => setShowColorPicker(true), 300); }}>
              <View style={[styles.avatarOptIcon, { backgroundColor: theme.colors.secondary + "15" }]}>
                <Icon name="droplet" size={20} color={theme.colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.avatarOptLabel}>Choose Color</Text>
                <Text style={styles.avatarOptSub}>Pick an avatar color</Text>
              </View>
              <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showColorPicker} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowColorPicker(false)}>
          <View style={styles.colorPickerBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorPickerTitle}>Choose Avatar Color</Text>
            <View style={styles.colorGrid}>
              {avatarColors.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.colorCircle, { backgroundColor: c }, user?.profileColor === c && styles.colorSelected]}
                  onPress={() => { updateUser({ profileColor: c }); setShowColorPicker(false); }}
                />
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>


    </ScrollView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 120 },
  headerGrad: {
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingBottom: redesign.layout.sectionGap,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: redesign.layout.fieldGap,
  },
  headerTitle: { ...theme.typography.h2, color: theme.colors.onBrand },
  editBtn: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: redesign.layout.cardGap,
    marginBottom: redesign.layout.fieldGap,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.5)",
  },
  avatarText: { fontSize: 26, fontWeight: "800", color: theme.colors.onBrand },
  cameraBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.secondary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: theme.colors.onBrand,
  },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 18, fontWeight: "800", color: theme.colors.onBrand },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userRole: { fontSize: 13, color: "rgba(255,255,255,0.8)" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.premiumSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 10, fontWeight: "700", color: theme.colors.secondary },
  userPhone: { fontSize: 12, color: "rgba(255,255,255,0.65)" },
  userPublicId: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.78)", letterSpacing: 0.4 },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.lg,
    padding: redesign.layout.cardGap,
    alignItems: "center",
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  stat: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 16, fontWeight: "800", color: theme.colors.onBrand },
  statLbl: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "500", marginTop: 2 },
  statDiv: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.2)" },
  servicesCard: {
    marginHorizontal: redesign.layout.horizontalPadding,
    marginTop: redesign.layout.cardGap,
    marginBottom: 0,
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    padding: redesign.layout.fieldGap,
    gap: 10,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  servicesGrid: { flexDirection: "row", gap: 8, paddingRight: 8 },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: redesign.visual.cardBorderWidth,
  },
  serviceChipText: { fontSize: 12, fontWeight: "600" },
  availCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: redesign.layout.horizontalPadding,
    marginTop: redesign.layout.cardGap,
    marginBottom: 0,
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    padding: redesign.layout.fieldGap,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  availLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  availDotIcon: {
    width: redesign.control.compactHeight,
    height: redesign.control.compactHeight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  availPulse: { position: "absolute", width: 20, height: 20, borderRadius: 10 },
  availDotInner: { width: 12, height: 12, borderRadius: 6 },
  availTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  availSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  socialCard: {
    marginHorizontal: redesign.layout.horizontalPadding,
    marginTop: redesign.layout.cardGap,
    marginBottom: 0,
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    padding: redesign.layout.fieldGap,
    gap: 10,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  socialRow: { flexDirection: "row", gap: 10 },
  socialBtn: {
    flex: 1,
    minHeight: redesign.control.standardHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
  },
  socialLabel: { fontSize: 11, fontWeight: "700" },
  menuSection: {
    marginTop: redesign.layout.cardGap,
    paddingHorizontal: redesign.layout.horizontalPadding,
  },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8, marginLeft: 4 },
  menuCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    overflow: "hidden",
    ...theme.shadows.sm,
  },
  menuItem: {
    minHeight: redesign.control.largeHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: redesign.layout.cardGap,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  menuPressed: { backgroundColor: theme.colors.surfaceAlt },
  menuIcon: {
    width: redesign.control.compactHeight,
    height: redesign.control.compactHeight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.text },
  langBadge: {
    backgroundColor: theme.colors.primary + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  langBadgeText: { fontSize: 11, fontWeight: "700", color: theme.colors.primary },
  logoutBtn: {
    minHeight: redesign.control.standardHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: radius.md,
    marginHorizontal: redesign.layout.horizontalPadding,
    marginTop: redesign.layout.cardGap,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.danger + "25",
  },
  logoutText: { fontSize: 14, fontWeight: "600", color: theme.colors.danger },
  dangerZone: {
    marginHorizontal: redesign.layout.horizontalPadding,
    marginBottom: redesign.layout.fieldGap,
    borderRadius: radius.lg,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.danger + "30",
    backgroundColor: theme.colors.surface,
    padding: redesign.layout.fieldGap,
    gap: 10,
    ...theme.shadows.sm,
  },
  dangerTitle: { fontSize: 12, fontWeight: "800", color: theme.colors.danger, textTransform: "uppercase", letterSpacing: 0.5 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.danger + "30",
    backgroundColor: "transparent",
  },
  dangerBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.danger, flex: 1 },
  version: { textAlign: "center", fontSize: 12, color: theme.colors.textMuted, marginTop: 12, marginBottom: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  colorPickerBox: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: redesign.layout.horizontalPadding,
    gap: redesign.layout.fieldGap,
    ...theme.shadows.md,
  },
  colorPickerTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  colorCircle: { width: 46, height: 46, borderRadius: 23},
  colorSelected: { borderWidth: 4, borderColor: theme.colors.text },
  avatarModalBox: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: redesign.layout.horizontalPadding,
    gap: 8,
    ...theme.shadows.md,
  },
  avatarPreviewRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 },
  avatarPreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: theme.colors.border,
  },
  removePhotoBtn: {
    minHeight: redesign.control.compactHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.dangerSoft,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  removePhotoText: { fontSize: 12, color: theme.colors.danger, fontWeight: "600" },
  avatarOption: {
    minHeight: redesign.control.largeHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: redesign.layout.cardGap,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },
  avatarOptIcon: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOptLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  avatarOptSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  langBox: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, gap: 8,
  },
  langHint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  langOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1, borderColor: "transparent",
  },
  langOptionActive: { backgroundColor: theme.colors.primary + "10", borderColor: theme.colors.primary + "40" },
  langOptionText: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  langOptionSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  langCancelBtn: {
    backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, paddingVertical: 11,
    alignItems: "center", marginTop: 4,
  },
  langCancelText: { fontSize: 15, fontWeight: "600", color: theme.colors.textSecondary },
});
