import { Icon } from "@/components/ui/Icon";
import * as ImagePicker from "expo-image-picker";
import { pickFromCamera, pickFromGallery } from "@/utils/mediaPicker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState , useMemo} from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BiometricLoginSetting } from "@/components/security/BiometricLoginSetting";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { api } from "@/services/api";
import { uploadPickedImage, PrivateImage } from "@/services/storage";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { apiErrorToMessage } from "@/lib/apiError";
import { runtimeConfig } from "@/config/runtime";
import { brandConfig } from "@/config/brand";


function buildMenuSections(t: ReturnType<typeof useLang>["t"], theme: AthooTheme) {
  return [
    {
      title: t.bookingsPayments,
      items: [
        { icon: "calendar", label: t.myBookings, subtitle: t.bookingHistory, route: "/(customer)/(tabs)/bookings", color: theme.colors.primary },
        { icon: "crown", label: t.premiumPlan, subtitle: t.unlockBenefits, route: "/(customer)/subscription", color: theme.colors.premium },
        { icon: "file-text", label: t.billingHistory, subtitle: t.billingHistoryLong, route: "/(customer)/billing", color: theme.colors.accent },
        { icon: "download", label: t.invoices, subtitle: t.downloadInvoices, route: "/(customer)/invoices", color: theme.colors.info },
        { icon: "rotate-ccw", label: t.refundRequests, subtitle: t.refundRequestsHint, route: "/(customer)/refund-requests", color: theme.colors.danger },
      ],
    },
    {
      title: t.account,
      items: [
        { icon: "map-pin", label: t.myAddresses, subtitle: t.savedServiceLocations, route: "/(customer)/addresses", color: theme.colors.premium },
        { icon: "heart", label: t.savedProviders, subtitle: t.favouriteWorkers, route: "/(customer)/saved", color: theme.colors.danger },
        { icon: "bell", label: t.notifications, subtitle: t.manageAlerts, route: "/(customer)/notifications", color: theme.colors.info },
        { icon: "mail", label: "Email & communication", subtitle: "Verification, security and offers", route: "/email-preferences", color: theme.colors.primary },
        { icon: "sun", label: t.appearance, subtitle: t.appearanceHint, route: "/appearance", color: theme.colors.accent },
        { icon: "lock", label: t.changePassword, subtitle: t.updatePassword, route: "/(customer)/change-password", color: theme.colors.premium },
        { icon: "globe", label: t.language, subtitle: t.languageHint, route: "/language", color: theme.colors.info },
        { icon: "shield", label: t.privacy, subtitle: t.privacyHint, route: "/(customer)/privacy", color: theme.colors.success },
      ],
    },
    {
      title: t.support,
      items: [
        { icon: "help-circle", label: t.help, subtitle: t.helpHint, route: "/(customer)/help", color: theme.colors.primary },
        { icon: "headphones", label: t.contactSupport, subtitle: t.contactSupportHint, route: "/(customer)/contact-support", color: theme.colors.danger },
        { icon: "info", label: t.about, subtitle: t.aboutHint, route: "/(customer)/about", color: theme.colors.accent },
      ],
    },
  ];
}


export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const { getMyBookings } = useBookings();
  const { t, translate: tr, textAlign, writingDirection } = useLang();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = { textAlign, writingDirection } as const;
  const menuSections = useMemo(() => buildMenuSections(t, theme), [t, theme]);
  const avatarColors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.accent, theme.colors.success, theme.colors.warning, theme.colors.danger, theme.colors.info], [theme]);
  const socialLinks = useMemo(() => [
    { icon: "message-circle", label: "WhatsApp", url: runtimeConfig.support.whatsappUrl, color: theme.colors.success },
    { icon: "instagram", label: "Instagram", url: runtimeConfig.support.instagramUrl, color: theme.colors.accent },
    { icon: "facebook", label: "Facebook", url: runtimeConfig.support.facebookUrl, color: theme.colors.info },
  ]
    .filter((entry) => Boolean(entry.url))
    .map((entry) => ({ ...entry, url: entry.url as string })), [theme]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  const pickImage = async (useCamera: boolean) => {
    setShowAvatarModal(false);
    // Wait for ALL animations/interactions to finish before showing system dialog
    await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(resolve));
    // Extra grace period on iOS to fully dismiss the modal before the system picker appears
    if (Platform.OS === "ios") {
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }

    const opts = {
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.6,
    };

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

  const bookings = user ? getMyBookings(user.id, "customer") : [];
  const completed = bookings.filter((b) => b.status === "completed").length;
  const spent = bookings
    .filter((b) => b.status === "completed")
    .reduce((s, b) => s + (b.price || 0), 0);

  const initials =
    user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Name cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      await updateUser({ name });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t.logout, t.areYouSure, [
      { text: t.cancel, style: "cancel" },
      { text: t.logout, style: "destructive", onPress: logout },
    ]);
  };

  const handleDeactivate = () => {
    Alert.alert(
      "Deactivate Account",
      "Your account will be hidden from the app. You can reactivate it by logging back in. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deactivateAccount();
              await logout();
            } catch {
              Alert.alert("Error", "Could not deactivate account. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Your account will be deactivated now and permanently deleted after a 7-day grace period. You can sign in during that period to cancel the request.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Schedule Deletion",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await api.requestAccountDeletion();
              await logout();
              Alert.alert(
                "Deletion Scheduled",
                `Your account is scheduled for deletion on ${new Date(result.scheduledDeleteAt).toLocaleDateString()}. Sign in before then to cancel the request.`,
              );
            } catch {
              Alert.alert("Error", "Could not delete account. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleMenuPress = (route: string | null) => {
    if (route) router.push(route as any);
  };


  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.headerGrad}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>{t.profile}</Text>
          <Pressable onPress={handleLogout} style={styles.logoutTopBtn}>
            <Icon name="log-out" size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatarContainer}>
            {user?.profileImage ? (
              <PrivateImage objectPath={user.profileImage} style={[styles.avatarLarge, { borderRadius: 40 }]} />
            ) : (
              <View
                style={[
                  styles.avatarLarge,
                  user?.profileColor ? { backgroundColor: user.profileColor } : {},
                ]}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}

            {uploadingPhoto && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 40,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ActivityIndicator color={theme.colors.onBrand} size="small" />
              </View>
            )}

            <Pressable
              style={styles.avatarEdit}
              onPress={() => !uploadingPhoto && setShowAvatarModal(true)}
            >
              <Icon name="camera" size={12} color={theme.colors.onBrand} />
            </Pressable>
          </View>

          <View style={styles.profileInfo}>
            {editing ? (
              <TextInput
                style={styles.nameEdit}
                value={name}
                onChangeText={setName}
                placeholder={tr("Your name")}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
            ) : (
              <Text style={styles.profileName}>{user?.name}</Text>
            )}

            <Text style={styles.profilePhone}>{user?.phone}</Text>
            {user?.publicId ? <Text style={styles.profilePublicId}>{tr("Athoo ID")}: {user.publicId}</Text> : null}

            <View style={styles.verifiedBadge}>
              <Icon name="shield" size={10} color={theme.colors.onBrand} />
              <Text style={styles.verifiedText}>{tr("Verified Customer")}</Text>
            </View>
          </View>

          <Pressable
            style={styles.editBtn}
            onPress={() => {
              if (editing) handleSave();
              else setEditing(true);
            }}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.onBrand} />
            ) : (
              <Icon name={editing ? "check" : "edit-2"} size={14} color={theme.colors.onBrand} />
            )}
          </Pressable>
        </View>
      </LinearGradient>

      <AnimatedCard delay={60}>
        <View style={styles.statsCard}>
          <Pressable
            style={styles.statItem}
            onPress={() => router.push("/(customer)/(tabs)/bookings")}
          >
            <Text style={[styles.statVal, { color: theme.colors.primary }]}>{bookings.length}</Text>
            <Text style={styles.statLbl}>Bookings</Text>
          </Pressable>

          <View style={styles.statDivider} />

          <Pressable
            style={styles.statItem}
            onPress={() => router.push({ pathname: "/(customer)/(tabs)/bookings" })}
          >
            <Text style={[styles.statVal, { color: theme.colors.success }]}>{completed}</Text>
            <Text style={styles.statLbl}>Completed</Text>
          </Pressable>

          <View style={styles.statDivider} />

          <Pressable
            style={styles.statItem}
            onPress={() => router.push("/(customer)/billing")}
          >
            <Text style={[styles.statVal, { color: theme.colors.secondary }]}>
              Rs.{spent > 0 ? (spent / 1000).toFixed(1) + "k" : "0"}
            </Text>
            <Text style={styles.statLbl}>{t.spent}</Text>
          </Pressable>
        </View>
      </AnimatedCard>

      {(user as any)?.referralCode && (
        <AnimatedCard delay={80}>
          <View style={styles.referralCard}>
            <View style={styles.referralLeft}>
              <Text style={styles.referralTitle}>🎁 {t.inviteFriends}</Text>
              <Text style={styles.referralSub}>{t.inviteFriendsHint}</Text>
              <View style={styles.referralCodeRow}>
                <Text style={styles.referralCode}>{(user as any).referralCode}</Text>
                <Pressable
                  style={styles.shareCodeBtn}
                  onPress={() => Share.share({ message: `Join ${brandConfig.displayName} — Pakistan's home services app! Use my referral code ${(user as any).referralCode} when you sign up.${runtimeConfig.app.downloadUrl ? ` Download: ${runtimeConfig.app.downloadUrl}` : ""}` })}
                >
                  <Icon name="share-2" size={13} color={theme.colors.primary} />
                  <Text style={styles.shareCodeText}>{t.share}</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.referralRight}>
              <Text style={styles.referralCount}>{(user as any).referralCount || 0}</Text>
              <Text style={styles.referralCountLbl}>{t.referred}</Text>
            </View>
          </View>
        </AnimatedCard>
      )}

      {menuSections.map((section, si) => (
        <AnimatedCard key={si} delay={100 + si * 60}>
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, ii) => (
                <Pressable
                  key={ii}
                  style={({ pressed }) => [
                    styles.menuItem,
                    ii < section.items.length - 1 && styles.menuItemBorder,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => handleMenuPress(item.route)}
                >
                  <View style={[styles.menuIconBox, { backgroundColor: item.color + "15" }]}>
                    <Icon name={item.icon as any} size={17} color={item.color} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuSub}>{item.subtitle}</Text>
                  </View>
                  <Icon name="chevron-right" size={15} color={theme.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        </AnimatedCard>
      ))}

      <AnimatedCard delay={300}>
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{t.security}</Text>
          <View style={styles.menuCard}>
            <BiometricLoginSetting />
          </View>
        </View>
      </AnimatedCard>

      {socialLinks.length > 0 ? (
        <AnimatedCard delay={360}>
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{t.connectWithUs}</Text>
            <View style={styles.menuCard}>
              {socialLinks.map((social, i) => (
                <Pressable
                  key={social.label}
                  style={({ pressed }) => [
                    styles.menuItem,
                    i < socialLinks.length - 1 && styles.menuItemBorder,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => void Linking.openURL(social.url)}
                >
                  <View style={[styles.menuIconBox, { backgroundColor: `${social.color}15` }]}>
                    <Icon name={social.icon as any} size={17} color={social.color} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>{social.label}</Text>
                    <Text style={styles.menuSub}>{social.url.replace(/^https?:\/\//i, "").replace(/\/$/, "")}</Text>
                  </View>
                  <Icon name="external-link" size={14} color={theme.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        </AnimatedCard>
      ) : null}

      <AnimatedCard delay={460}>
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="log-out" size={16} color={theme.colors.danger} />
          <Text style={styles.logoutText}>{t.signOut}</Text>
        </Pressable>
      </AnimatedCard>

      <AnimatedCard delay={500}>
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>{t.dangerZone}</Text>

          <Pressable style={styles.dangerBtn} onPress={handleDeactivate}>
            <Icon name="eye-off" size={15} color={theme.colors.danger} />
            <Text style={styles.dangerBtnText}>{t.deactivateAccount}</Text>
          </Pressable>

          <Pressable
            style={[
              styles.dangerBtn,
              { borderColor: theme.colors.danger, backgroundColor: theme.colors.danger + "10" },
            ]}
            onPress={handleDeleteAccount}
          >
            <Icon name="trash-2" size={15} color={theme.colors.danger} />
            <Text style={[styles.dangerBtnText, { fontWeight: "800" }]}>{t.deleteAccount}</Text>
          </Pressable>
        </View>
      </AnimatedCard>

      <Text style={styles.version}>Athoo v1.0 · Available across Pakistan</Text>

      <Modal visible={showAvatarModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAvatarModal(false)}>
          <View style={styles.avatarModalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorPickerTitle}>Profile Picture</Text>

            <View style={styles.avatarPreviewRow}>
              {user?.profileImage ? (
                <PrivateImage objectPath={user.profileImage} style={styles.avatarPreview} />
              ) : (
                <View
                  style={[
                    styles.avatarPreview,
                    {
                      backgroundColor: user?.profileColor || theme.colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Text style={{ fontSize: 28, fontWeight: "800", color: theme.colors.onBrand }}>
                    {initials}
                  </Text>
                </View>
              )}

              {user?.profileImage && (
                <Pressable
                  style={styles.removePhotoBtn}
                  onPress={() => {
                    updateUser({ profileImage: null as any });
                    setShowAvatarModal(false);
                  }}
                >
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

            <Pressable
              style={styles.avatarOption}
              onPress={() => {
                setShowAvatarModal(false);
                setTimeout(() => setShowColorPicker(true), 300);
              }}
            >
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choose Avatar Color</Text>
            <View style={styles.colorGrid}>
              {avatarColors.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    user?.profileColor === c && styles.colorDotActive,
                  ]}
                  onPress={() => {
                    updateUser({ profileColor: c });
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </View>
            <Pressable style={styles.modalClose} onPress={() => setShowColorPicker(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>


    </ScrollView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 120 },

  headerGrad: { paddingHorizontal: 20, paddingBottom: 24 },

  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    marginBottom: 20,
  },

  headerTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.onBrand },

  logoutTopBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },

  avatarContainer: { position: "relative" },

  avatarLarge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
  },

  avatarText: { fontSize: 24, fontWeight: "800", color: theme.colors.onBrand },

  avatarEdit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.onBrand,
  },

  profileInfo: { flex: 1, gap: 4 },

  profileName: { fontSize: 19, fontWeight: "800", color: theme.colors.onBrand },

  nameEdit: {
    fontSize: 19,
    fontWeight: "800",
    color: theme.colors.onBrand,
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(255,255,255,0.5)",
    paddingBottom: 2,
  },

  profilePublicId: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.76)", letterSpacing: 0.4, marginTop: 2 },
  profilePhone: { fontSize: 13, color: "rgba(255,255,255,0.75)" },

  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },

  verifiedText: { fontSize: 10, fontWeight: "700", color: theme.colors.onBrand },

  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  statsCard: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    marginTop: -14,
    borderRadius: 18,
    padding: 16,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    alignItems: "center",
    marginBottom: 20,
  },

  statItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 },
  statVal: { fontSize: 18, fontWeight: "800" },
  statLbl: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: "600" },
  statDivider: { width: 1, height: 36, backgroundColor: theme.colors.border },

  menuSection: { marginHorizontal: 20, marginBottom: 16, gap: 8 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    paddingLeft: 4,
  },

  menuCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },

  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  pressed: { backgroundColor: theme.colors.surfaceAlt },

  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  menuTextCol: { flex: 1, gap: 1 },
  menuLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  menuSub: { fontSize: 11, color: theme.colors.textSecondary },

  switchRole: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.secondary + "40",
    marginBottom: 12,
  },

  switchRoleDisabled: {
    opacity: 0.7,
  },

  switchText: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.secondary,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: theme.colors.danger + "10",
    borderRadius: 16,
    marginBottom: 16,
  },

  logoutText: { fontSize: 14, fontWeight: "700", color: theme.colors.danger },

  dangerZone: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: theme.colors.danger + "30",
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 10,
  },

  dangerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.danger,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.danger + "30",
    backgroundColor: "transparent",
  },

  dangerBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.danger, flex: 1 },

  version: {
    textAlign: "center",
    fontSize: 11,
    color: theme.colors.textMuted,
    paddingBottom: 20,
  },

  langHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },

  modalBox: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: 8,
  },

  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "center",
    paddingVertical: 8,
  },

  colorDot: { width: 46, height: 46, borderRadius: 23 },

  colorDotActive: {
    borderWidth: 3,
    borderColor: theme.colors.text,
  },

  langOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },

  langOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "10",
  },

  langLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },

  langSub: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  modalClose: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },

  modalCloseText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },

  colorPickerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.text,
  },

  avatarModalBox: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    gap: 8,
  },

  avatarPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 8,
  },

  avatarPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: theme.colors.border,
  },

  removePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.danger + "12",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  removePhotoText: {
    fontSize: 12,
    color: theme.colors.danger,
    fontWeight: "600",
  },

  avatarOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
  },

  avatarOptIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  referralCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: theme.colors.primary + "10", borderRadius: 18,
    paddingVertical: 26, paddingHorizontal: 26, marginHorizontal: 20, marginBottom: 12,
    borderWidth: 1.5, borderColor: theme.colors.primary + "30",
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  referralLeft: { flex: 1, minWidth: 0, gap: 10, paddingRight: 22 },
  referralTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  referralSub: { fontSize: 11, color: theme.colors.textSecondary, lineHeight: 16 },
  referralCodeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 14, rowGap: 12, marginTop: 10, paddingRight: 8 },
  referralCode: {
    fontSize: 18, fontWeight: "900", color: theme.colors.primary,
    letterSpacing: 1.2, fontVariant: ["tabular-nums"], flexShrink: 1,
  },
  shareCodeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: theme.colors.surface, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: theme.colors.primary + "40",
  },
  shareCodeText: { fontSize: 12, fontWeight: "700", color: theme.colors.primary },
  referralRight: { alignItems: "center", justifyContent: "center", gap: 4, marginLeft: 18, minWidth: 72, paddingLeft: 18, paddingRight: 4, borderLeftWidth: 1, borderLeftColor: theme.colors.primary + "25" },
  referralCount: { fontSize: 30, fontWeight: "900", color: theme.colors.primary },
  referralCountLbl: { fontSize: 10, fontWeight: "600", color: theme.colors.textSecondary },

  avatarOptLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },

  avatarOptSub: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
});
