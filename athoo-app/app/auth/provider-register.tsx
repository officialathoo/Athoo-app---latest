import { Icon } from "@/components/ui/Icon";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { OtpModal } from "@/components/ui/OtpModal";
import { SuccessModal } from "@/components/ui/SuccessModal";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { uploadPickedImage } from "@/services/storage";
import { LegalAcceptanceCheckbox, LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";
import { CityPicker } from "@/components/ui/CityPicker";
import { apiErrorToMessage } from "@/lib/apiError";

type InputFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboardType?: any;
  secure?: boolean;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
};

function InputField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  secure,
  required,
  multiline,
  maxLength,
}: InputFieldProps) {
  const { theme } = useTheme();
  const { textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const localizedRow = direction === "rtl" ? styles.rowReverse : undefined;

  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, localizedText]}>
        {label} {required && <Text style={{ color: theme.colors.danger }}>*</Text>}
      </Text>

      <View
        style={[
          styles.inputWrapper,
          localizedRow,
          multiline && { minHeight: 80, alignItems: "flex-start" },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            localizedText,
            multiline && { textAlignVertical: "top", paddingTop: 4 },
          ]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          keyboardType={keyboardType || "default"}
          secureTextEntry={secure}
          multiline={multiline}
          maxLength={maxLength}
          blurOnSubmit={!multiline}
        />
        {maxLength ? (
          <Text style={styles.charCount}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const STEPS = [
  { title: "Personal Info", icon: "user", desc: "Basic details" },
  { title: "Documents", icon: "file-text", desc: "CNIC & certificates" },
  { title: "Verification", icon: "shield", desc: "Phone & review" },
];

const DOC_ITEMS = [
  { id: "cnic_front", label: "CNIC Front", icon: "credit-card", required: true, hint: "Clear photo of your CNIC front side" },
  { id: "cnic_back", label: "CNIC Back", icon: "credit-card", required: true, hint: "Clear photo of your CNIC back side" },
  { id: "selfie", label: "Live Selfie", icon: "camera", required: true, hint: "Take a selfie holding your CNIC" },
  { id: "video", label: "Introduction Video", icon: "video", required: false, hint: "Short 30-second intro video (optional)" },
  { id: "diploma", label: "Diploma / Certificate", icon: "award", required: false, hint: "Any relevant qualification or trade certificate" },
  { id: "police", label: "Police Verification Letter", icon: "shield", required: true, hint: "Character certificate from your local police station — mandatory for verification" },
] as const;

type DocItem = { id: string; label: string; icon: string; required: boolean; hint: string };

export default function ProviderRegisterScreen() {
  const { register, sendOtp, verifyOtpAndLogin } = useAuth();
  const { categories } = useCategories();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const localizedRow = direction === "rtl" ? styles.rowReverse : undefined;
  const steps = useMemo(() => STEPS.map((item) => ({ ...item, title: tr(item.title), desc: tr(item.desc) })), [tr]);
  const docItems = useMemo(() => DOC_ITEMS.map((item) => ({ ...item, label: tr(item.label), hint: tr(item.hint) })), [tr]);
  const { phone: phoneParam, preVerified } = useLocalSearchParams<{ phone?: string; preVerified?: string }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [otpVerified, setOtpVerified] = useState(preVerified === "true");
  const [showCnicNotice, setShowCnicNotice] = useState(true);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);
  const [docFiles, setDocFiles] = useState<Record<string, string>>({});
  const [otpHint, setOtpHint] = useState("");

  const [form, setForm] = useState({
    name: "",
    fatherName: "",
    cnic: "",
    phone: phoneParam || "",
    email: "",
    services: [] as string[],
    experience: "",
    city: "",
    address: "",
    bio: "",
    hourlyRate: "",
  });

  const update = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const toggleService = (id: string) => {
    setForm((p) => ({
      ...p,
      services: p.services.includes(id)
        ? p.services.filter((s) => s !== id)
        : [...p.services, id],
    }));
  };

  const handleDocUpload = async (doc: DocItem) => {
    if (docFiles[doc.id]) {
      Alert.alert(tr("Replace or Remove"), tr("What would you like to do with \"{{label}}\"?", { label: doc.label }), [
        { text: tr("Keep"), style: "cancel" },
        { text: tr("Replace"), onPress: () => launchPicker(doc) },
        {
          text: tr("Remove"), style: "destructive", onPress: () => {
            setDocFiles(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
            setUploadedDocs(prev => prev.filter(d => d !== doc.id));
          }
        },
      ]);
      return;
    }
    if (doc.id === "selfie") {
      await launchCamera(doc);
    } else {
      Alert.alert(tr("Upload Document"), tr("Choose source for \"{{label}}\"", { label: doc.label }), [
        { text: tr("Camera"), onPress: () => { launchCamera(doc).catch((e) => Alert.alert(tr("Camera Error"), tr(apiErrorToMessage(e, "Could not open camera. Please try gallery instead.")))); } },
        { text: tr("Gallery"), onPress: () => { launchGallery(doc).catch((e) => Alert.alert(tr("Gallery Error"), tr(apiErrorToMessage(e, "Could not open photo library. Please try again.")))); } },
        { text: tr("Cancel"), style: "cancel" },
      ]);
    }
  };

  const launchPicker = (doc: DocItem) => {
    Alert.alert(tr("Upload Document"), tr("Choose source for \"{{label}}\"", { label: doc.label }), [
      { text: tr("Camera"), onPress: () => { launchCamera(doc).catch((e) => Alert.alert(tr("Camera Error"), tr(apiErrorToMessage(e, "Could not open camera. Please try gallery instead.")))); } },
      { text: tr("Gallery"), onPress: () => { launchGallery(doc).catch((e) => Alert.alert(tr("Gallery Error"), tr(apiErrorToMessage(e, "Could not open photo library. Please try again.")))); } },
      { text: tr("Cancel"), style: "cancel" },
    ]);
  };

  const launchCamera = async (doc: DocItem) => {
    const isVideo = doc.id === "video";
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          tr("Camera Permission Required"),
          tr("Please go to Settings → Athoo (or Expo Go) → allow Camera access, then try again.")
        );
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: isVideo ? ("videos" as const) : ("images" as const),
        quality: 0.85,
        ...(isVideo ? { videoMaxDuration: 30 } : { allowsEditing: true, aspect: doc.id === "selfie" ? [1, 1] as [number, number] : [4, 3] as [number, number] }),
      });
      if (!result.canceled && result.assets?.[0]) {
        setDocFiles(prev => ({ ...prev, [doc.id]: result.assets[0].uri }));
        setUploadedDocs(prev => prev.includes(doc.id) ? prev : [...prev, doc.id]);
      }
    } catch (err: any) {
      Alert.alert(tr("Camera Error"), tr(apiErrorToMessage(err, "Could not open camera. Please try gallery instead.")));
    }
  };

  const launchGallery = async (doc: DocItem) => {
    const isVideo = doc.id === "video";
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          tr("Gallery Permission Required"),
          tr("Please go to Settings → Athoo (or Expo Go) → allow Photos access, then try again.")
        );
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideo ? ("videos" as const) : ("images" as const),
        quality: 0.85,
        ...(isVideo ? { videoMaxDuration: 30 } : { allowsEditing: true, aspect: [4, 3] as [number, number] }),
      });
      if (!result.canceled && result.assets?.[0]) {
        setDocFiles(prev => ({ ...prev, [doc.id]: result.assets[0].uri }));
        setUploadedDocs(prev => prev.includes(doc.id) ? prev : [...prev, doc.id]);
      }
    } catch (err: any) {
      Alert.alert(tr("Gallery Error"), tr(apiErrorToMessage(err, "Could not open photo library. Please try again.")));
    }
  };

  const validateStep0 = () => {
    if (!form.name || !form.fatherName || !form.cnic || !form.phone) {
      Alert.alert(tr("Required"), tr("Please fill all required fields marked with *"));
      return false;
    }
    if (form.cnic.length < 13) {
      Alert.alert(tr("Invalid CNIC"), tr("Enter a valid 13-digit CNIC number."));
      return false;
    }
    if (!otpVerified) {
      Alert.alert(tr("Phone Not Verified"), tr("Please verify your phone number before continuing."));
      return false;
    }
    if (form.services.length === 0) {
      Alert.alert(tr("Services Required"), tr("Select at least one service you offer."));
      return false;
    }
    return true;
  };

  const validateStep1 = () => {
    const required = docItems.filter(d => d.required).map(d => d.id);
    const missing = required.filter(r => !uploadedDocs.includes(r));
    if (missing.length > 0) {
      Alert.alert(tr("Documents Required"), tr("Please upload CNIC front, CNIC back, a live selfie, and the police verification letter."));
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !validateStep0()) return;
    if (step === 1 && !validateStep1()) return;
    if (step === 2) {
      handleSubmit();
      return;
    }
    if (step === 0 && !otpVerified) {
      setShowOtp(true);
      return;
    }
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!legalAccepted) {
      Alert.alert(tr("Required"), tr("Please accept the Terms of Service and Privacy Policy to continue."));
      return;
    }
    setLoading(true);
    const ok = await register({
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
      role: "provider",
      services: form.services,
      fatherName: form.fatherName.trim(),
      cnicNumber: form.cnic.replace(/\D/g, ""),
      experience: form.experience.trim() || undefined,
      location: form.city ? `${form.city}${form.address ? ", " + form.address : ""}` : undefined,
      ratePerHour: form.hourlyRate ? parseInt(form.hourlyRate, 10) : undefined,
      termsAccepted: true,
      privacyAccepted: true,
      legalVersion: LEGAL_VERSION,
    });
    if (ok.success) {
      // Upload KYC documents to object storage and save to the API
      const docEntries = Object.entries(docFiles);
      if (docEntries.length > 0) {
        const docLabel: Record<string, string> = {
          cnic_front: "CNIC Front",
          cnic_back: "CNIC Back",
          selfie: "Live Selfie",
          video: "Introduction Video",
          diploma: "Diploma / Certificate",
          police: "Police Verification Letter",
        };
        const failedRequired: string[] = [];
        for (const [docId, localUri] of docEntries) {
          try {
            const ext = (localUri.split(".").pop() || "jpg").toLowerCase();
            const contentType = ext === "mp4" || ext === "mov" ? "video/mp4" : "image/jpeg";
            const objectPath = await uploadPickedImage(localUri, `${docId}.${ext}`, contentType);
            await api.postDocument({ type: docId, label: docLabel[docId] || docId, url: objectPath });
          } catch {
            if (["cnic_front", "cnic_back", "selfie", "police"].includes(docId)) failedRequired.push(tr(docLabel[docId] || docId));
          }
        }
        if (failedRequired.length > 0) {
          Alert.alert(
            tr("Registration saved — documents need attention"),
            tr("Your account was created, but these required documents did not upload: {{documents}}. Please upload them again from Verification Documents.", { documents: failedRequired.join(", ") }),
            [{ text: tr("Manage Documents"), onPress: () => router.replace("/(provider)/verification-documents" as any) }],
          );
          return;
        }
      }

      setShowSuccess(true);
    } else {
      Alert.alert(tr("Registration Error"), tr(apiErrorToMessage(ok.error, "Could not create account. Please try again.")));
    }
    setLoading(false);
  };

 

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.container, { paddingTop: topPad }]}>
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.headerGrad}>
          <Pressable style={styles.backBtn} onPress={() => step > 0 ? setStep(step - 1) : router.back()}>
            <Icon name="arrow-left" size={20} color={theme.colors.white} />
          </Pressable>
          <Text style={[styles.headerTitle, localizedText]}>{tr("Provider Registration")}</Text>
          <Text style={[styles.headerSubtitle, localizedText]}>{tr("Join Athoo as a verified professional")}</Text>

          <View style={[styles.stepsRow, localizedRow]}>
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepCircle, i === step && styles.stepActive, i < step && styles.stepDone]}>
                    {i < step
                      ? <Icon name="check" size={14} color={theme.colors.white} />
                      : <Icon name={s.icon as any} size={14} color={i === step ? theme.colors.white : "rgba(255,255,255,0.4)"} />
                    }
                  </View>
                  <Text style={[styles.stepLabel, localizedText, i === step && styles.stepLabelActive]}>{s.title}</Text>
                </View>
                {i < steps.length - 1 && (
                  <View style={[styles.stepLine, i < step && styles.stepLineDone]} />
                )}
              </React.Fragment>
            ))}
          </View>
        </LinearGradient>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                <Icon name="user" size={15} color={theme.colors.primary} />{"  "}{tr("Personal Information")}
              </Text>

              <InputField label={tr("Full Name")} value={form.name} onChange={(v: string) => update("name", v)} placeholder={tr("As on CNIC")} required />
              <InputField label={tr("Father's Name")} value={form.fatherName} onChange={(v: string) => update("fatherName", v)} placeholder={tr("Father's full name")} required />
              <InputField
                label={tr("CNIC Number")}
                value={form.cnic}
                onChange={(v: string) => update("cnic", v.replace(/\D/g, "").slice(0, 13))}
                placeholder="3740012345678"
                keyboardType="numeric"
                required
                maxLength={13}
              />
              <InputField
                label={tr("Phone Number")}
                value={form.phone}
                onChange={(v: string) => update("phone", v)}
                placeholder="03XX-XXXXXXX"
                keyboardType="phone-pad"
                required
              />
              {otpVerified && (
                <View style={[styles.verifiedRow, localizedRow]}>
                  <Icon name="check-circle" size={14} color={theme.colors.success} />
                  <Text style={[styles.verifiedText, localizedText]}>{tr("Phone number verified")}</Text>
                </View>
              )}
              {!otpVerified && (
                <Pressable style={styles.sendOtpBtn} onPress={async () => {
                  if (!form.phone) { Alert.alert(tr("Enter phone number first")); return; }
                  const cleaned = form.phone.trim().replace(/\D/g, "");
                  const isPakistani = /^(92|0)?3\d{9}$/.test(cleaned);
                  if (!isPakistani) { Alert.alert(tr("Invalid Phone"), tr("Please enter a valid Pakistani mobile number (e.g. 03XX-XXXXXXX).")); return; }
                  const res = await sendOtp(form.phone);
                  if (!res.success || res.error) {
                    Alert.alert(tr("Failed"), tr(apiErrorToMessage(res.error || res.message, "Unable to send OTP. Please try again.")));
                    return;
                  }
                  if (__DEV__) setOtpHint(res.code || "");
                  setShowOtp(true);
                  if (__DEV__ && res.code) Alert.alert(tr("Your OTP Code"), tr("Code: {{code}}\n\nEnter this code in the field below.", { code: res.code }), [{ text: "OK" }]);
                }}>
                  <Text style={[styles.sendOtpText, localizedText]}>{tr("Send Verification Code")}</Text>
                </Pressable>
              )}
              {otpHint ? (
                <View style={[styles.verifiedRow, localizedRow]}>
                  <Icon name="info" size={14} color={theme.colors.secondary} />
                  <Text style={[styles.verifiedText, localizedText, { color: theme.colors.secondary }]}>{tr("OTP code: {{code}}", { code: otpHint })}</Text>
                </View>
              ) : null}
              <InputField label={tr("Email Address")} value={form.email} onChange={(v: string) => update("email", v)} placeholder="your@email.com" keyboardType="email-address" />

              <Text style={[styles.formSectionTitle, { marginTop: 12 }]}>
                <Icon name="tool" size={15} color={theme.colors.primary} />{"  "}{tr("Services & Details")}
              </Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, localizedText]}>{tr("Services Offered")} <Text style={{ color: theme.colors.danger }}>*</Text></Text>
                <View style={[styles.servicesGrid, localizedRow]}>
                  {categories.map((s) => {
                    const sel = form.services.includes(s.slug || s.id);
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => toggleService(s.slug || s.id)}
                        style={[styles.serviceChip, sel && { backgroundColor: s.bgColor, borderColor: s.color }]}
                      >
                        <Icon name={s.icon as any} size={13} color={sel ? s.color : theme.colors.textSecondary} />
                        <Text style={[styles.serviceChipText, sel && { color: s.color }]}>{s.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <InputField label={tr("Years of Experience")} value={form.experience} onChange={(v: string) => update("experience", v)} placeholder={tr("e.g. 5 years")} />
              <InputField
                label={tr("Hourly Rate (PKR)")}
                value={form.hourlyRate}
                onChange={(v: string) => update("hourlyRate", v.replace(/\D/g, ""))}
                placeholder="e.g. 1500"
                keyboardType="numeric"
              />
              <InputField
                label={tr("Professional Bio")}
                value={form.bio}
                onChange={(v: string) => update("bio", v)}
                placeholder={tr("Describe your expertise, experience, and what makes you the best choice...")}
                multiline
                maxLength={300}
              />
              <CityPicker value={form.city} onChange={(city) => update("city", city)} required testID="provider-city-picker" />
              <InputField label={tr("Area/Address")} value={form.address} onChange={(v: string) => update("address", v)} placeholder={tr("Your working area")} />
            </View>
          )}

          {step === 1 && (
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                <Icon name="file-text" size={15} color={theme.colors.primary} />{"  "}{tr("Document Upload")}
              </Text>
              <View style={[styles.infoBox, { marginBottom: 8 }]}>
                <Icon name="info" size={14} color={theme.colors.primary} />
                <Text style={styles.infoText}>
                  {tr("All documents are encrypted and reviewed only by Athoo's verification team. Your data is never shared publicly.")}
                </Text>
              </View>

              {docItems.map((doc) => {
                const uploaded = uploadedDocs.includes(doc.id);
                const fileUri = docFiles[doc.id];
                return (
                  <Pressable
                    key={doc.id}
                    style={[styles.docItem, uploaded && styles.docItemUploaded]}
                    onPress={() => handleDocUpload(doc)}
                  >
                    <View style={[styles.docIconBox, { backgroundColor: uploaded ? theme.colors.success + "15" : theme.colors.surfaceAlt }]}>
                      {fileUri ? (
                        <Image source={{ uri: fileUri }} style={styles.docThumb} />
                      ) : (
                        <Icon name={doc.icon as any} size={20} color={uploaded ? theme.colors.success : theme.colors.textSecondary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={[styles.docLabelRow, localizedRow]}>
                        <Text style={styles.docLabel}>{doc.label}</Text>
                        {doc.required && (
                          <Text style={[styles.docRequired, localizedText]}>{tr("Required")}</Text>
                        )}
                      </View>
                      <Text style={styles.docHint}>
                        {uploaded
                          ? tr("✓ Uploaded — tap to replace or remove")
                          : (doc.id === "selfie" ? tr("📷 Tap to open camera") : tr("📁 Tap for camera or gallery"))}
                      </Text>
                    </View>
                    <View style={[styles.docCheck, uploaded && styles.docCheckDone]}>
                      <Icon name={uploaded ? "check" : (doc.id === "selfie" ? "camera" : "upload")} size={14} color={uploaded ? theme.colors.white : theme.colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })}

              <View style={[styles.policeBox, localizedRow]}>
                <Icon name="shield" size={16} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.policeTitle, localizedText]}>{tr("Police Verification")}</Text>
                  <Text style={styles.policeText}>
                    {tr("After registration, our team will guide you through the police character certificate verification process. This builds customer trust and helps you get more bookings.")}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                <Icon name="clock" size={15} color={theme.colors.primary} />{"  "}{tr("Under Review")}
              </Text>

              <View style={styles.reviewCard}>
                <View style={styles.reviewIconCircle}>
                  <Icon name="search" size={28} color={theme.colors.primary} />
                </View>
                <Text style={[styles.reviewTitle, localizedText]}>{tr("Your Application is Being Reviewed")}</Text>
                <Text style={styles.reviewText}>
                  {tr("Our team will verify your documents, CNIC, and police verification within 24-48 hours. You'll receive a notification once approved.")}
                </Text>

                <View style={styles.reviewChecklist}>
                  {[
                    "Identity verification (CNIC)",
                    "Document authenticity check",
                    "Police background check",
                    "Skills & experience review",
                  ].map((item, i) => (
                    <View key={i} style={[styles.checkRow, localizedRow]}>
                      <View style={styles.checkCircle}>
                        <Icon name="clock" size={11} color={theme.colors.primary} />
                      </View>
                      <Text style={[styles.checkText, localizedText]}>{tr(item)}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.reviewSummary}>
                  <Text style={[styles.reviewSummaryTitle, localizedText]}>{tr("Summary")}</Text>
                  <View style={[styles.summaryRow, localizedRow]}><Text style={[styles.summaryKey, localizedText]}>{tr("Name")}</Text><Text style={styles.summaryVal}>{form.name}</Text></View>
                  <View style={[styles.summaryRow, localizedRow]}><Text style={styles.summaryKey}>CNIC</Text><Text style={styles.summaryVal}>{"*".repeat(9) + form.cnic.slice(-4)}</Text></View>
                  <View style={[styles.summaryRow, localizedRow]}><Text style={[styles.summaryKey, localizedText]}>{tr("Phone")}</Text><Text style={styles.summaryVal}>{form.phone.slice(0, 4) + "***" + form.phone.slice(-3)}</Text></View>
                  <View style={[styles.summaryRow, localizedRow]}><Text style={[styles.summaryKey, localizedText]}>{tr("Services")}</Text><Text style={[styles.summaryVal, localizedText]}>{tr("{{count}} selected", { count: form.services.length })}</Text></View>
                  <View style={[styles.summaryRow, localizedRow]}><Text style={[styles.summaryKey, localizedText]}>{tr("Documents")}</Text><Text style={styles.summaryVal}>{tr("{{uploaded}}/{{total}} uploaded", { uploaded: uploadedDocs.length, total: docItems.length })}</Text></View>
                </View>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.declarationBox}>
              <Pressable
                style={[styles.declarationRow, localizedRow]}
                onPress={() => setDeclarationAccepted(!declarationAccepted)}
              >
                <View style={[styles.checkbox, declarationAccepted && styles.checkboxChecked]}>
                  {declarationAccepted && <Icon name="check" size={14} color={theme.colors.white} />}
                </View>
                <Text style={styles.declarationText}>
                  {tr("I declare that all the information and documents provided above are true, accurate, and to the best of my knowledge.")}
                </Text>
              </Pressable>
              <View style={{ marginTop: 12 }}>
                <LegalAcceptanceCheckbox value={legalAccepted} onChange={setLegalAccepted} />
              </View>
            </View>
          )}

          <View style={styles.footer}>
            <Pressable
              style={[
                styles.nextBtn,
                loading && styles.btnDisabled,
                step === 2 && (!declarationAccepted || !legalAccepted) && styles.btnDisabled,
              ]}
              onPress={handleNext}
              disabled={loading || (step === 2 && (!declarationAccepted || !legalAccepted))}
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.primaryPressed]}
                style={styles.nextBtnGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={styles.nextBtnText}>
                  {loading ? tr("Submitting...") : step === 2 ? tr("Submit Application") : tr("Continue")}
                </Text>
                <Icon name={step === 2 ? "send" : "arrow-right"} size={18} color={theme.colors.white} />
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <Modal visible={showCnicNotice} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Pressable style={styles.modalClose} onPress={() => router.back()}>
              <Icon name="x" size={20} color={theme.colors.text} />
            </Pressable>
            <View style={styles.modalIconWrap}>
              <Icon name="alert-circle" size={36} color={theme.colors.primary} />
            </View>
            <Text style={[styles.modalTitle, localizedText]}>{tr("Important Notice")}</Text>
            <Text style={styles.modalBody}>
              {tr("Please add all your information exactly as it appears on your CNIC and other legal documents. False or incorrect details will lead to rejection of your application and may result in a permanent ban.")}
            </Text>
            <Pressable
              style={styles.modalOkBtn}
              onPress={() => setShowCnicNotice(false)}
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.primaryPressed]}
                style={styles.modalOkGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.modalOkText, localizedText]}>{tr("I Understand, Continue")}</Text>
                <Icon name="arrow-right" size={18} color={theme.colors.white} />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      <OtpModal
        visible={showOtp}
        title={tr("Phone Verification")}
        subtitle={tr("Enter the 4-digit code shown below")}
        sentTo={form.phone}
        hint={otpHint}
        onVerify={async (code: string) => {
          const res = await verifyOtpAndLogin(form.phone, code);
          if (!res.success) {
            Alert.alert(tr("Invalid Code"), tr(apiErrorToMessage(res.error, "The code you entered is incorrect. Check the code shown above.")));
            return;
          }

          if (!res.isNewUser) {
            const existingRole = res.user?.role === "provider" ? "provider" : "customer";
            setShowOtp(false);
            Alert.alert(
              tr("Account Already Exists"),
              existingRole === "provider"
                ? tr("This phone number is already registered as a provider. Please sign in instead.")
                : tr("This phone number is already registered as a customer. Please sign in instead."),
              [
                {
                  text: tr("Go to Sign In"),
                  onPress: () =>
                    router.replace({
                      pathname: "/auth/login",
                      params: { role: existingRole },
                    }),
                },
              ]
            );
            return;
          }

          setOtpVerified(true);
          setShowOtp(false);
          setOtpHint("");
        }}
        onCancel={() => setShowOtp(false)}
      />

      <SuccessModal
        visible={showSuccess}
        title={tr("Application Submitted!")}
        subtitle={tr("Your provider registration is under review. Our team will verify your documents and approve your account within 24-48 hours.")}
        primaryAction={{ label: tr("Go to Home"), onPress: () => router.replace("/(provider)/(tabs)/dashboard") }}
        secondaryAction={{ label: tr("Back to Login"), onPress: () => router.replace("/auth/welcome") }}
        onClose={() => router.replace("/auth/welcome")}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  rowReverse: { flexDirection: "row-reverse" },
  headerGrad: { paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    marginTop: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.white },
  headerSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2, marginBottom: 16 },
  stepsRow: { flexDirection: "row", alignItems: "center" },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepActive: { backgroundColor: theme.colors.surface },
  stepDone: { backgroundColor: theme.colors.success },
  stepLabel: { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: "600" },
  stepLabelActive: { color: theme.colors.white },
  stepLine: { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 14 },
  stepLineDone: { backgroundColor: theme.colors.success },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  formSection: { gap: 14 },
  formSectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
    marginTop: 6,
    marginBottom: 4,
  },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  input: { flex: 1, fontSize: 14, color: theme.colors.text },
  charCount: { fontSize: 10, color: theme.colors.textMuted, alignSelf: "flex-end" },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.success + "10",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.success + "30",
  },
  verifiedText: { fontSize: 13, fontWeight: "600", color: theme.colors.success },
  sendOtpBtn: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  sendOtpText: { fontSize: 14, fontWeight: "700", color: theme.colors.primary },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  serviceChipText: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + "25",
  },
  infoText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  docItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  docItemUploaded: { borderColor: theme.colors.success, backgroundColor: theme.colors.success + "05" },
  docIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  docThumb: { width: 44, height: 44, borderRadius: 10, resizeMode: "cover" },
  docLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  docLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  docRequired: { fontSize: 9, fontWeight: "700", color: theme.colors.danger, backgroundColor: theme.colors.danger + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  docStatus: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  docHint: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  docCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  docCheckDone: { backgroundColor: theme.colors.success },
  policeBox: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary + "25",
    marginTop: 4,
  },
  policeTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  policeText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  reviewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  reviewIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.primary + "30",
  },
  reviewTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  reviewText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 },
  reviewChecklist: { width: "100%", gap: 10 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.primary + "30",
  },
  checkText: { fontSize: 13, color: theme.colors.textSecondary },
  reviewSummary: { width: "100%", backgroundColor: theme.colors.background, borderRadius: 14, padding: 14, gap: 8 },
  reviewSummaryTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryKey: { fontSize: 12, color: theme.colors.textSecondary },
  summaryVal: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  footer: { marginTop: 24 },
  nextBtn: { borderRadius: 18, overflow: "hidden" },
  nextBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 17 },
  nextBtnText: { fontSize: 16, fontWeight: "800", color: theme.colors.white },
  btnDisabled: { opacity: 0.5 },
  declarationBox: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  declarationRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: theme.colors.primary },
  declarationText: { flex: 1, fontSize: 12, color: theme.colors.text, lineHeight: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
  },
  modalClose: { position: "absolute", top: 12, right: 12, padding: 6 },
  modalIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.infoSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.text, marginBottom: 8 },
  modalBody: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
  },
  modalOkBtn: { width: "100%", borderRadius: 12, overflow: "hidden" },
  modalOkGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  modalOkText: { color: theme.colors.white, fontWeight: "700", fontSize: 15 },
});

