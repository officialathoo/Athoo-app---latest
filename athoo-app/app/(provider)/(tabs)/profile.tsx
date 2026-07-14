import { Icon } from "@/components/ui/Icon";
import * as ImagePicker from "expo-image-picker";
import { pickFromCamera, pickFromGallery } from "@/utils/mediaPicker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { uploadPickedImage, PrivateImage } from "@/services/storage";

const AVATAR_COLORS = [
  "#FF6B1A", "#1A6EE0", "#8B5CF6", "#22C55E", "#F59E0B", "#EC4899", "#06B6D4",
];

export default function ProviderProfileScreen() {
  const { user, logout, updateUser, refreshUser } = useAuth();
  const { getMyBookings } = useBookings();
  const { t, lang, setLang, isUrdu } = useLang();
  const { getCategoryBySlug } = useCategories();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric Login");
  const [isAvailable, setIsAvailable] = useState<boolean>(!!user?.isAvailable);
  const [togglingAvail, setTogglingAvail] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);

  const toggleAvailability = async (val: boolean) => {
    setTogglingAvail(true);
    try {
      const res: any = await api.updateAvailability(val);
      const next = !!res?.user?.isAvailable;
      setIsAvailable(next);
      await updateUser({ isAvailable: next });
    } catch (e: any) {
      setIsAvailable(!!user?.isAvailable);
      Alert.alert("Availability", e?.message || "You cannot turn available while busy on an active job.");
    } finally {
      setTogglingAvail(false);
    }
  };

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvail);
    isBiometricEnabled().then(setBiometricOn);
    getBiometricLabel().then(setBiometricLabel);
  }, []);

  useFocusEffect(useCallback(() => {
    refreshUser().catch(() => {});
  }, []));

  const toggleBiometric = async () => {
    if (biometricOn) {
      Alert.alert("Disable Biometric Login", "You will need to use OTP to log in next time.", [
        { text: "Cancel", style: "cancel" },
        { text: "Disable", style: "destructive", onPress: async () => { await disableBiometric(); setBiometricOn(false); } },
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
        await enableBiometric(user.phone, "provider");
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
        Alert.alert("Upload Failed", error instanceof Error ? error.message : "Profile photo could not be saved. Please try again.");
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
  const avatarColor = user?.profileColor || Colors.secondary;

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
              await api.deactivateMe();
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
      "Your account will be deactivated and scheduled for deletion after 7 days. You can cancel during the grace period by signing in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.requestAccountDeletion({ reason: "Requested from provider profile" });
              await logout();
            } catch {
              Alert.alert("Error", "Could not delete account. Please try again.");
            }
          },
        },
      ]
    );
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
        { icon: "crown", label: t.premiumPlan, color: "#F59E0B", onPress: () => router.push("/(provider)/subscription") },
        { icon: "dollar-sign", label: t.earningsHistory, color: "#22C55E", onPress: () => router.push("/(provider)/earnings") },
        { icon: "file-text", label: t.invoices, color: Colors.primary, onPress: () => router.push("/(provider)/invoices") },
        { icon: "briefcase", label: t.myNegotiations, color: Colors.secondary, onPress: () => router.push("/(provider)/negotiations") },
        { icon: "calendar", label: t.availabilitySchedule, color: "#06B6D4", onPress: () => router.push("/(provider)/availability" as any) },
        { icon: "trending-up", label: t.myWallet, color: "#059669", onPress: () => router.push("/(provider)/wallet" as any) },
        { icon: "map-pin", label: t.serviceRadius, color: "#0891B2", onPress: () => router.push("/(provider)/service-radius" as any) },
      ],
    },
    {
      title: t.account,
      items: [
        { icon: "bell", label: t.notifications, color: "#8B5CF6", onPress: () => router.push("/(provider)/notifications") },
        { icon: "sun", label: t.appearance, color: "#6366F1", onPress: () => router.push("/appearance" as any) },
        { icon: "lock", label: t.changePassword, color: "#F59E0B", onPress: () => router.push("/(provider)/change-password") },
        { icon: "globe", label: t.language, color: "#06B6D4", onPress: () => setShowLangModal(true), rightEl: (
          <View style={styles.langBadge}>
            <Text style={styles.langBadgeText}>{lang === "en" ? "EN" : "اردو"}</Text>
          </View>
        )},
        { icon: "shield", label: t.privacy, color: Colors.primary, onPress: () => router.push("/(provider)/privacy") },
      ],
    },
    {
      title: t.support,
      items: [
        { icon: "help-circle", label: t.help, color: Colors.primary, onPress: () => router.push("/(provider)/help") },
        { icon: "headphones", label: t.contactSupport, color: "#EF4444", onPress: () => router.push("/(provider)/contact-support") },
        { icon: "info", label: t.about, color: Colors.secondary, onPress: () => router.push("/(provider)/about") },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={[styles.headerGrad, { paddingTop: topPad + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t.myProfile}</Text>
          <Pressable style={styles.editBtn} onPress={() => router.push("/(provider)/edit-profile" as any)}>
            <Icon name="edit-2" size={16} color="#fff" />
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
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : (
              <View style={styles.cameraBadge}>
                <Icon name="camera" size={12} color="#fff" />
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
                  <Icon name="check-circle" size={10} color={Colors.secondary} />
                  <Text style={styles.verifiedText}>{t.verified}</Text>
                </View>
              )}
            </View>
            <Text style={styles.userPhone}>{user?.phone}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{bookings.length}</Text>
            <Text style={styles.statLbl}>{t.totalJobsLabel}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: "#86efac" }]}>{completed}</Text>
            <Text style={styles.statLbl}>{t.doneLabel}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: Colors.secondary }]}>{active}</Text>
            <Text style={styles.statLbl}>{t.active}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: "#fbbf24" }]}>
              {earnings > 0 ? `${Math.round(earnings / 1000)}k` : "0"}
            </Text>
            <Text style={styles.statLbl}>{t.earnedRs}</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: Colors.secondary, fontSize: 13 }]}>
              {(user as any)?.ratePerHour ? String((user as any).ratePerHour) : "–"}
            </Text>
            <Text style={styles.statLbl}>{t.ratePerHourLabel}</Text>
          </View>
        </View>
      </LinearGradient>

      {user?.services && user.services.length > 0 && (
        <View style={styles.servicesCard}>
          <Text style={styles.cardTitle}>{t.myServices}</Text>
          <View style={styles.servicesGrid}>
            {user.services.map((sid) => {
              const svc = getCategoryBySlug(sid);
              if (!svc) return <View key={sid} style={styles.serviceChip}><Text style={styles.serviceChipText}>{sid}</Text></View>;
              return (
                <View key={sid} style={[styles.serviceChip, { backgroundColor: svc.bgColor }]}>
                  <Icon name={svc.icon as any} size={14} color={svc.color} />
                  <Text style={[styles.serviceChipText, { color: svc.color }]}>{svc.name}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.availCard}>
        <View style={styles.availLeft}>
          <View style={[styles.availDotIcon, { backgroundColor: isAvailable ? "#22C55E20" : "#EF444420" }]}>
            <View style={[styles.availDotInner, { backgroundColor: isAvailable ? "#22C55E" : "#EF4444" }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.availTitle}>Available for Jobs</Text>
            <Text style={styles.availSub}>
              {isAvailable ? "Customers can book you right now" : "You are currently unavailable"}
            </Text>
          </View>
        </View>
        <Switch
          value={isAvailable}
          onValueChange={toggleAvailability}
          disabled={togglingAvail}
          trackColor={{ false: Colors.border, true: "#22C55E50" }}
          thumbColor={isAvailable ? "#22C55E" : Colors.textMuted}
        />
      </View>

      <View style={styles.socialCard}>
        <Text style={styles.cardTitle}>Contact Us</Text>
        <View style={styles.socialRow}>
          <Pressable style={[styles.socialBtn, { backgroundColor: "#25D36620" }]}
            onPress={() => Linking.openURL("https://wa.me/923390051068")}>
            <Icon name="message-circle" size={20} color="#25D366" />
            <Text style={[styles.socialLabel, { color: "#25D366" }]}>WhatsApp</Text>
          </Pressable>
          <Pressable style={[styles.socialBtn, { backgroundColor: "#E1306C20" }]}
            onPress={() => Linking.openURL("https://instagram.com/athoo_services")}>
            <Icon name="instagram" size={20} color="#E1306C" />
            <Text style={[styles.socialLabel, { color: "#E1306C" }]}>Instagram</Text>
          </Pressable>
          <Pressable style={[styles.socialBtn, { backgroundColor: "#1877F220" }]}
            onPress={() => Linking.openURL("https://facebook.com/athoo.services")}>
            <Icon name="facebook" size={20} color="#1877F2" />
            <Text style={[styles.socialLabel, { color: "#1877F2" }]}>Facebook</Text>
          </Pressable>
        </View>
      </View>

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
                {item.rightEl ? item.rightEl : <Icon name="chevron-right" size={16} color={Colors.textMuted} />}
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {biometricAvail && (
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.menuCard}>
            <View style={[styles.menuItem, { paddingRight: 16 }]}>
              <View style={[styles.menuIcon, { backgroundColor: "#8B5CF618" }]}>
                <Icon name="fingerprint" size={18} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}>{biometricLabel}</Text>
                <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Use your device security to log in</Text>
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
      )}

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Icon name="log-out" size={16} color={Colors.error} />
        <Text style={styles.logoutText}>{t.logout}</Text>
      </Pressable>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>{t.dangerZone}</Text>
        <Pressable style={styles.dangerBtn} onPress={handleDeactivate}>
          <Icon name="eye-off" size={15} color={Colors.error} />
          <Text style={styles.dangerBtnText}>{t.deactivateAccount}</Text>
        </Pressable>
        <Pressable style={[styles.dangerBtn, { borderColor: Colors.error, backgroundColor: Colors.error + "10" }]} onPress={handleDeleteAccount}>
          <Icon name="trash-2" size={15} color={Colors.error} />
          <Text style={[styles.dangerBtnText, { fontWeight: "800" }]}>Schedule Account Deletion</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>Athoo Provider v1.0 • Pakistan</Text>

      <Modal visible={showAvatarModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAvatarModal(false)}>
          <View style={styles.avatarModalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorPickerTitle}>Profile Picture</Text>
            <View style={styles.avatarPreviewRow}>
              {user?.profileImage ? (
                <PrivateImage objectPath={user.profileImage} style={styles.avatarPreview} />
              ) : (
                <View style={[styles.avatarPreview, { backgroundColor: avatarColor, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: "#fff" }}>{initials}</Text>
                </View>
              )}
              {user?.profileImage && (
                <Pressable style={styles.removePhotoBtn} onPress={() => { updateUser({ profileImage: null as any }); setShowAvatarModal(false); }}>
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
            <Pressable style={styles.avatarOption} onPress={() => { setShowAvatarModal(false); setTimeout(() => setShowColorPicker(true), 300); }}>
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
        <Pressable style={styles.modalOverlay} onPress={() => setShowColorPicker(false)}>
          <View style={styles.colorPickerBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorPickerTitle}>Choose Avatar Color</Text>
            <View style={styles.colorGrid}>
              {AVATAR_COLORS.map((c) => (
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

      <Modal visible={showLangModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.langBox}>
            <Text style={styles.colorPickerTitle}>{t.language}</Text>
            <Text style={styles.langHint}>Language changes apply to the whole app instantly.</Text>
            {(["en", "ur"] as const).map((l) => (
              <Pressable
                key={l}
                style={[styles.langOption, lang === l && styles.langOptionActive]}
                onPress={() => { setLang(l); setShowLangModal(false); }}
              >
                <Text style={{ fontSize: 22 }}>{l === "en" ? "🇬🇧" : "🇵🇰"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.langOptionText, lang === l && { color: Colors.primary }]}>
                    {l === "en" ? "English" : "اردو (Urdu)"}
                  </Text>
                  <Text style={styles.langOptionSub}>{l === "en" ? "App in English" : "پوری ایپ اردو میں"}</Text>
                </View>
                {lang === l && <Icon name="check-circle" size={20} color={Colors.primary} />}
              </Pressable>
            ))}
            <Pressable style={styles.langCancelBtn} onPress={() => setShowLangModal(false)}>
              <Text style={styles.langCancelText}>Cancel</Text>
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  editBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  avatarSection: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20 },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.5)",
  },
  avatarText: { fontSize: 26, fontWeight: "800", color: "#fff" },
  cameraBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 20, fontWeight: "800", color: "#fff" },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userRole: { fontSize: 13, color: "rgba(255,255,255,0.8)" },
  verifiedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.secondary + "30", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
  },
  verifiedText: { fontSize: 10, fontWeight: "700", color: Colors.secondary },
  userPhone: { fontSize: 12, color: "rgba(255,255,255,0.65)" },
  statsRow: {
    flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 18, padding: 14, alignItems: "center",
  },
  stat: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "800", color: "#fff" },
  statLbl: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "500", marginTop: 2 },
  statDiv: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.2)" },
  servicesCard: {
    margin: 16, marginBottom: 0,
    backgroundColor: Colors.card, borderRadius: 18, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  serviceChipText: { fontSize: 12, fontWeight: "600" },
  availCard: {
    flexDirection: "row", alignItems: "center",
    margin: 16, marginBottom: 0,
    backgroundColor: Colors.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  availLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  availDotIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  availDotInner: { width: 12, height: 12, borderRadius: 6 },
  availTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  availSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  socialCard: {
    margin: 16, marginBottom: 0,
    backgroundColor: Colors.card, borderRadius: 18, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  socialRow: { flexDirection: "row", gap: 10 },
  socialBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 14,
  },
  socialLabel: { fontSize: 11, fontWeight: "700" },
  menuSection: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8, marginLeft: 4 },
  menuCard: {
    backgroundColor: Colors.card, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuPressed: { backgroundColor: Colors.surface },
  menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.text },
  langBadge: {
    backgroundColor: Colors.primary + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  langBadgeText: { fontSize: 11, fontWeight: "700", color: Colors.primary },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, backgroundColor: Colors.error + "10",
    borderRadius: 14, marginHorizontal: 16, marginTop: 16,
  },
  logoutText: { fontSize: 14, fontWeight: "600", color: Colors.error },
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
  dangerTitle: { fontSize: 12, fontWeight: "800", color: Colors.error, textTransform: "uppercase", letterSpacing: 0.5 },
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
  version: { textAlign: "center", fontSize: 12, color: Colors.textMuted, marginTop: 12, marginBottom: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  colorPickerBox: {
    backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, gap: 20,
  },
  colorPickerTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "center" },
  colorCircle: { width: 52, height: 52, borderRadius: 26 },
  colorSelected: { borderWidth: 4, borderColor: Colors.text },
  avatarModalBox: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    gap: 8,
  },
  avatarPreviewRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 },
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
  removePhotoText: { fontSize: 12, color: Colors.error, fontWeight: "600" },
  avatarOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
  },
  avatarOptIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  avatarOptLabel: { fontSize: 14, fontWeight: "700", color: Colors.text },
  avatarOptSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  langBox: {
    backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, gap: 8,
  },
  langHint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  langOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderRadius: 14, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: "transparent",
  },
  langOptionActive: { backgroundColor: Colors.primary + "10", borderColor: Colors.primary + "40" },
  langOptionText: { fontSize: 15, fontWeight: "700", color: Colors.text },
  langOptionSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  langCancelBtn: {
    backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 13,
    alignItems: "center", marginTop: 4,
  },
  langCancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
});

