import { Icon } from "@/components/ui/Icon";
import * as ImagePicker from "expo-image-picker";
import { pickFromCamera, pickFromGallery } from "@/utils/mediaPicker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
  authenticateWithBiometric,
  getBiometricLabel,
} from "@/services/biometric";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { api } from "@/services/api";
import { uploadPickedImage, PrivateImage } from "@/services/storage";

const AVATAR_COLORS = [
  "#1A6EE0", "#FF6B1A", "#8B5CF6", "#22C55E", "#F59E0B", "#EC4899", "#06B6D4",
];

function buildMenuSections(t: ReturnType<typeof useLang>["t"]) {
  return [
    {
      title: t.bookingsPayments,
      items: [
        { icon: "calendar", label: t.myBookings, subtitle: t.bookingHistory, route: "/(customer)/(tabs)/bookings", color: Colors.primary },
        { icon: "crown", label: t.premiumPlan, subtitle: t.unlockBenefits, route: "/(customer)/subscription", color: "#F59E0B" },
        { icon: "file-text", label: t.billingHistory, subtitle: t.billingHistoryLong, route: "/(customer)/billing", color: "#8B5CF6" },
        { icon: "download", label: t.invoices, subtitle: t.downloadInvoices, route: "/(customer)/invoices", color: "#14B8A6" },
        { icon: "rotate-ccw", label: t.refundRequests, subtitle: t.refundRequestsHint, route: "/(customer)/refund-requests", color: "#EF4444" },
      ],
    },
    {
      title: t.account,
      items: [
        { icon: "map-pin", label: t.myAddresses, subtitle: t.savedServiceLocations, route: "/(customer)/addresses", color: "#F59E0B" },
        { icon: "heart", label: t.savedProviders, subtitle: t.favouriteWorkers, route: "/(customer)/saved", color: "#EF4444" },
        { icon: "bell", label: t.notifications, subtitle: t.manageAlerts, route: "/(customer)/notifications", color: "#3B82F6" },
        { icon: "sun", label: t.appearance, subtitle: t.appearanceHint, route: "/appearance", color: "#6366F1" },
        { icon: "lock", label: t.changePassword, subtitle: t.updatePassword, route: "/(customer)/change-password", color: "#F59E0B" },
        { icon: "globe", label: t.language, subtitle: t.languageHint, route: null, color: "#06B6D4" },
        { icon: "shield", label: t.privacy, subtitle: t.privacyHint, route: "/(customer)/privacy", color: "#10B981" },
      ],
    },
    {
      title: t.support,
      items: [
        { icon: "help-circle", label: t.help, subtitle: t.helpHint, route: "/(customer)/help", color: Colors.primary },
        { icon: "headphones", label: t.contactSupport, subtitle: t.contactSupportHint, route: "/(customer)/contact-support", color: "#EF4444" },
        { icon: "info", label: t.about, subtitle: t.aboutHint, route: "/(customer)/about", color: "#6366F1" },
      ],
    },
  ];
}

const SOCIAL = [
  { icon: "phone", label: "WhatsApp", value: "+92 339 0051068", color: "#25D366", action: () => Linking.openURL("https://wa.me/923390051068") },
  { icon: "instagram", label: "Instagram", value: "@athoo_services", color: "#E1306C", action: () => Linking.openURL("https://instagram.com/athoo_services") },
  { icon: "facebook", label: "Facebook", value: "athoo.services", color: "#1877F2", action: () => Linking.openURL("https://facebook.com/athoo.services") },
];

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const { getMyBookings } = useBookings();
  const { t, lang, setLang, isUrdu } = useLang();
  const menuSections = buildMenuSections(t);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric Login");

  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvail);
    isBiometricEnabled().then(setBiometricOn);
    getBiometricLabel().then(setBiometricLabel);
  }, []);

  useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  const toggleBiometric = async () => {
    if (biometricOn) {
      Alert.alert("Disable Biometric Login", "You will need to use OTP to log in next time.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: async () => {
            await disableBiometric();
            setBiometricOn(false);
          },
        },
      ]);
    } else {
      const available = await isBiometricAvailable();
      if (!available) {
        Alert.alert(
          "No Biometrics Enrolled",
          "This device has no Face ID / Fingerprint enrolled. Please set up biometrics in your device settings, then try again."
        );
        return;
      }
      const result = await authenticateWithBiometric("Enable biometric login for Athoo");
      if (result.success && user) {
        await enableBiometric(user.phone, user.role);
        setBiometricOn(true);
        Alert.alert("Quick Login Enabled", `You can now log in with ${biometricLabel}.`);
      } else if (!result.success) {
        Alert.alert("Authentication Failed", result.error || "Could not verify your identity. Please try again.");
      }
    }
  };

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
        Alert.alert("Upload Failed", error instanceof Error ? error.message : "Profile photo could not be saved. Please try again.");
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
    if (!route) {
      setShowLangModal(true);
      return;
    }
    router.push(route as any);
  };


  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.headerGrad}>
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
                <ActivityIndicator color="#fff" size="small" />
              </View>
            )}

            <Pressable
              style={styles.avatarEdit}
              onPress={() => !uploadingPhoto && setShowAvatarModal(true)}
            >
              <Icon name="camera" size={12} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.profileInfo}>
            {editing ? (
              <TextInput
                style={styles.nameEdit}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
            ) : (
              <Text style={styles.profileName}>{user?.name}</Text>
            )}

            <Text style={styles.profilePhone}>{user?.phone}</Text>

            <View style={styles.verifiedBadge}>
              <Icon name="shield" size={10} color="#fff" />
              <Text style={styles.verifiedText}>Verified Customer</Text>
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
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name={editing ? "check" : "edit-2"} size={14} color="#fff" />
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
            <Text style={[styles.statVal, { color: Colors.primary }]}>{bookings.length}</Text>
            <Text style={styles.statLbl}>Bookings</Text>
          </Pressable>

          <View style={styles.statDivider} />

          <Pressable
            style={styles.statItem}
            onPress={() => router.push({ pathname: "/(customer)/(tabs)/bookings" })}
          >
            <Text style={[styles.statVal, { color: Colors.success }]}>{completed}</Text>
            <Text style={styles.statLbl}>Completed</Text>
          </Pressable>

          <View style={styles.statDivider} />

          <Pressable
            style={styles.statItem}
            onPress={() => router.push("/(customer)/billing")}
          >
            <Text style={[styles.statVal, { color: Colors.secondary }]}>
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
                  onPress={() => Share.share({ message: `Join Athoo — Pakistan's home services app! Use my referral code ${(user as any).referralCode} when you sign up. Download: https://athoo.pk` })}
                >
                  <Icon name="share-2" size={13} color={Colors.primary} />
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
                  <Icon name="chevron-right" size={15} color={Colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        </AnimatedCard>
      ))}

      {biometricAvail && (
        <AnimatedCard delay={300}>
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{t.security}</Text>
            <View style={styles.menuCard}>
              <View style={styles.menuItem}>
                <View style={[styles.menuIconBox, { backgroundColor: "#8B5CF615" }]}>
                  <Icon name="fingerprint" size={17} color="#8B5CF6" />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuLabel}>{biometricLabel}</Text>
                  <Text style={styles.menuSub}>Use your device security to log in</Text>
                </View>
                <Switch
                  value={biometricOn}
                  onValueChange={toggleBiometric}
                  trackColor={{ false: Colors.border, true: "#8B5CF650" }}
                  thumbColor={biometricOn ? "#8B5CF6" : Colors.textMuted}
                />
              </View>
            </View>
          </View>
        </AnimatedCard>
      )}

      <AnimatedCard delay={360}>
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{t.connectWithUs}</Text>
          <View style={styles.menuCard}>
            {SOCIAL.map((s, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.menuItem,
                  i < SOCIAL.length - 1 && styles.menuItemBorder,
                  pressed && styles.pressed,
                ]}
                onPress={s.action}
              >
                <View style={[styles.menuIconBox, { backgroundColor: s.color + "15" }]}>
                  <Icon name={s.icon as any} size={17} color={s.color} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuLabel}>{s.label}</Text>
                  <Text style={styles.menuSub}>{s.value}</Text>
                </View>
                <Icon name="external-link" size={14} color={Colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      </AnimatedCard>

      <AnimatedCard delay={460}>
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="log-out" size={16} color={Colors.error} />
          <Text style={styles.logoutText}>{t.signOut}</Text>
        </Pressable>
      </AnimatedCard>

      <AnimatedCard delay={500}>
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>{t.dangerZone}</Text>

          <Pressable style={styles.dangerBtn} onPress={handleDeactivate}>
            <Icon name="eye-off" size={15} color={Colors.error} />
            <Text style={styles.dangerBtnText}>{t.deactivateAccount}</Text>
          </Pressable>

          <Pressable
            style={[
              styles.dangerBtn,
              { borderColor: Colors.error, backgroundColor: Colors.error + "10" },
            ]}
            onPress={handleDeleteAccount}
          >
            <Icon name="trash-2" size={15} color={Colors.error} />
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
                      backgroundColor: user?.profileColor || Colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Text style={{ fontSize: 28, fontWeight: "800", color: "#fff" }}>
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
                  <Icon name="trash-2" size={14} color={Colors.error} />
                  <Text style={styles.removePhotoText}>Remove Photo</Text>
                </Pressable>
              )}
            </View>

            <Pressable style={styles.avatarOption} onPress={() => pickImage(false)}>
              <View style={[styles.avatarOptIcon, { backgroundColor: Colors.primary + "15" }]}>
                <Icon name="image" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.avatarOptLabel}>Upload from Gallery</Text>
                <Text style={styles.avatarOptSub}>Choose a photo from your device</Text>
              </View>
              <Icon name="chevron-right" size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={styles.avatarOption} onPress={() => pickImage(true)}>
              <View style={[styles.avatarOptIcon, { backgroundColor: "#8B5CF620" }]}>
                <Icon name="camera" size={20} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.avatarOptLabel}>Take a Selfie</Text>
                <Text style={styles.avatarOptSub}>Use your camera</Text>
              </View>
              <Icon name="chevron-right" size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              style={styles.avatarOption}
              onPress={() => {
                setShowAvatarModal(false);
                setTimeout(() => setShowColorPicker(true), 300);
              }}
            >
              <View style={[styles.avatarOptIcon, { backgroundColor: Colors.secondary + "15" }]}>
                <Icon name="droplet" size={20} color={Colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.avatarOptLabel}>Choose Color</Text>
                <Text style={styles.avatarOptSub}>Pick an avatar color</Text>
              </View>
              <Icon name="chevron-right" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showColorPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choose Avatar Color</Text>
            <View style={styles.colorGrid}>
              {AVATAR_COLORS.map((c) => (
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

      <Modal visible={showLangModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Language / زبان</Text>
            <Text style={styles.langHint}>
              Language changes apply to the whole app instantly.
            </Text>

            {[
              { code: "en", flag: "🇬🇧", label: "English", sub: "App in English" },
              { code: "ur", flag: "🇵🇰", label: "اردو (Urdu)", sub: "پوری ایپ اردو میں" },
            ].map((l) => (
              <Pressable
                key={l.code}
                style={[styles.langOption, lang === l.code && styles.langOptionActive]}
                onPress={() => {
                  setLang(l.code as "en" | "ur");
                  setShowLangModal(false);
                }}
              >
                <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.langLabel,
                      lang === l.code && { color: Colors.primary },
                    ]}
                  >
                    {l.label}
                  </Text>
                  <Text style={styles.langSub}>{l.sub}</Text>
                </View>
                {lang === l.code && (
                  <Icon name="check-circle" size={20} color={Colors.primary} />
                )}
              </Pressable>
            ))}

            <Pressable style={styles.modalClose} onPress={() => setShowLangModal(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 120 },

  headerGrad: { paddingHorizontal: 20, paddingBottom: 24 },

  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    marginBottom: 20,
  },

  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },

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

  avatarText: { fontSize: 24, fontWeight: "800", color: "#fff" },

  avatarEdit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  profileInfo: { flex: 1, gap: 4 },

  profileName: { fontSize: 19, fontWeight: "800", color: "#fff" },

  nameEdit: {
    fontSize: 19,
    fontWeight: "800",
    color: "#fff",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(255,255,255,0.5)",
    paddingBottom: 2,
  },

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

  verifiedText: { fontSize: 10, fontWeight: "700", color: "#fff" },

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
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginTop: -14,
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    alignItems: "center",
    marginBottom: 20,
  },

  statItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 },
  statVal: { fontSize: 18, fontWeight: "800" },
  statLbl: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.border },

  menuSection: { marginHorizontal: 20, marginBottom: 16, gap: 8 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
    paddingLeft: 4,
  },

  menuCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: Colors.shadow,
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

  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  pressed: { backgroundColor: Colors.surface },

  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  menuTextCol: { flex: 1, gap: 1 },
  menuLabel: { fontSize: 14, fontWeight: "700", color: Colors.text },
  menuSub: { fontSize: 11, color: Colors.textSecondary },

  switchRole: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.secondary + "40",
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
    color: Colors.secondary,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.error + "10",
    borderRadius: 16,
    marginBottom: 16,
  },

  logoutText: { fontSize: 14, fontWeight: "700", color: Colors.error },

  dangerZone: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.error + "30",
    backgroundColor: Colors.white,
    padding: 16,
    gap: 10,
  },

  dangerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.error,
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
    borderColor: Colors.error + "30",
    backgroundColor: "transparent",
  },

  dangerBtnText: { fontSize: 13, fontWeight: "600", color: Colors.error, flex: 1 },

  version: {
    textAlign: "center",
    fontSize: 11,
    color: Colors.textMuted,
    paddingBottom: 20,
  },

  langHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },

  modalBox: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
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
    borderColor: Colors.text,
  },

  langOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },

  langOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "10",
  },

  langLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },

  langSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  modalClose: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },

  modalCloseText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textSecondary,
  },

  colorPickerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.text,
  },

  avatarModalBox: {
    backgroundColor: Colors.white,
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
    borderColor: Colors.border,
  },

  removePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.error + "12",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  removePhotoText: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: "600",
  },

  avatarOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
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
    backgroundColor: Colors.primary + "10", borderRadius: 18,
    paddingVertical: 26, paddingHorizontal: 26, marginHorizontal: 20, marginBottom: 12,
    borderWidth: 1.5, borderColor: Colors.primary + "30",
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  referralLeft: { flex: 1, minWidth: 0, gap: 10, paddingRight: 22 },
  referralTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  referralSub: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  referralCodeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 14, rowGap: 12, marginTop: 10, paddingRight: 8 },
  referralCode: {
    fontSize: 18, fontWeight: "900", color: Colors.primary,
    letterSpacing: 1.2, fontVariant: ["tabular-nums"], flexShrink: 1,
  },
  shareCodeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.white, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  shareCodeText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  referralRight: { alignItems: "center", justifyContent: "center", gap: 4, marginLeft: 18, minWidth: 72, paddingLeft: 18, paddingRight: 4, borderLeftWidth: 1, borderLeftColor: Colors.primary + "25" },
  referralCount: { fontSize: 30, fontWeight: "900", color: Colors.primary },
  referralCountLbl: { fontSize: 10, fontWeight: "600", color: Colors.textSecondary },

  avatarOptLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },

  avatarOptSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
