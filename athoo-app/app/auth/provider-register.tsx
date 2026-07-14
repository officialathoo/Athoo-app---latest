import { Icon } from "@/components/ui/Icon";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
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
import { Colors } from "@/constants/colors";
import { OtpModal } from "@/components/ui/OtpModal";
import { SuccessModal } from "@/components/ui/SuccessModal";
import { useAuth } from "@/context/AuthContext";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { uploadPickedImage } from "@/services/storage";
import { LegalAcceptanceCheckbox, LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";
import { CityPicker } from "@/components/ui/CityPicker";

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
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>
        {label} {required && <Text style={{ color: Colors.error }}>*</Text>}
      </Text>

      <View
        style={[
          styles.inputWrapper,
          multiline && { minHeight: 80, alignItems: "flex-start" },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            multiline && { textAlignVertical: "top", paddingTop: 4 },
          ]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
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
];

export default function ProviderRegisterScreen() {
  const { register, sendOtp, verifyOtpAndLogin } = useAuth();
  const { categories } = useCategories();
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

  const handleDocUpload = async (doc: typeof DOC_ITEMS[0]) => {
    if (docFiles[doc.id]) {
      Alert.alert("Replace or Remove", `What would you like to do with "${doc.label}"?`, [
        { text: "Keep", style: "cancel" },
        { text: "Replace", onPress: () => launchPicker(doc) },
        {
          text: "Remove", style: "destructive", onPress: () => {
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
      Alert.alert("Upload Document", `Choose source for "${doc.label}"`, [
        { text: "Camera", onPress: () => { launchCamera(doc).catch((e) => Alert.alert("Error", e?.message)); } },
        { text: "Gallery", onPress: () => { launchGallery(doc).catch((e) => Alert.alert("Error", e?.message)); } },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const launchPicker = (doc: typeof DOC_ITEMS[0]) => {
    Alert.alert("Upload Document", `Choose source for "${doc.label}"`, [
      { text: "Camera", onPress: () => { launchCamera(doc).catch((e) => Alert.alert("Error", e?.message)); } },
      { text: "Gallery", onPress: () => { launchGallery(doc).catch((e) => Alert.alert("Error", e?.message)); } },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const launchCamera = async (doc: typeof DOC_ITEMS[0]) => {
    const isVideo = doc.id === "video";
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "Camera Permission Required",
          "Please go to Settings → Athoo (or Expo Go) → allow Camera access, then try again."
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
      Alert.alert("Camera Error", err?.message || "Could not open camera. Please try gallery instead.");
    }
  };

  const launchGallery = async (doc: typeof DOC_ITEMS[0]) => {
    const isVideo = doc.id === "video";
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "Gallery Permission Required",
          "Please go to Settings → Athoo (or Expo Go) → allow Photos access, then try again."
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
      Alert.alert("Gallery Error", err?.message || "Could not open photo library. Please try again.");
    }
  };

  const validateStep0 = () => {
    if (!form.name || !form.fatherName || !form.cnic || !form.phone) {
      Alert.alert("Required", "Please fill all required fields marked with *");
      return false;
    }
    if (form.cnic.length < 13) {
      Alert.alert("Invalid CNIC", "Enter a valid 13-digit CNIC number.");
      return false;
    }
    if (!otpVerified) {
      Alert.alert("Phone Not Verified", "Please verify your phone number before continuing.");
      return false;
    }
    if (form.services.length === 0) {
      Alert.alert("Services Required", "Select at least one service you offer.");
      return false;
    }
    return true;
  };

  const validateStep1 = () => {
    const required = DOC_ITEMS.filter(d => d.required).map(d => d.id);
    const missing = required.filter(r => !uploadedDocs.includes(r));
    if (missing.length > 0) {
      Alert.alert("Documents Required", "Please upload CNIC front, CNIC back, a live selfie, and the police verification letter.");
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
      Alert.alert("Required", "Please accept the Terms of Service and Privacy Policy to continue.");
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
            if (["cnic_front", "cnic_back", "selfie", "police"].includes(docId)) failedRequired.push(docLabel[docId] || docId);
          }
        }
        if (failedRequired.length > 0) {
          Alert.alert(
            "Registration saved — documents need attention",
            `Your account was created, but these required documents did not upload: ${failedRequired.join(", ")}. Please upload them again from Verification Documents.`,
            [{ text: "Manage Documents", onPress: () => router.replace("/(provider)/verification-documents" as any) }],
          );
          return;
        }
      }

      setShowSuccess(true);
    } else {
      Alert.alert("Registration Error", ok.error || "Could not create account. Please try again.");
    }
    setLoading(false);
  };

 

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.container, { paddingTop: topPad }]}>
        <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.headerGrad}>
          <Pressable style={styles.backBtn} onPress={() => step > 0 ? setStep(step - 1) : router.back()}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Provider Registration</Text>
          <Text style={styles.headerSubtitle}>Join Athoo as a verified professional</Text>

          <View style={styles.stepsRow}>
            {STEPS.map((s, i) => (
              <React.Fragment key={i}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepCircle, i === step && styles.stepActive, i < step && styles.stepDone]}>
                    {i < step
                      ? <Icon name="check" size={14} color="#fff" />
                      : <Icon name={s.icon as any} size={14} color={i === step ? "#fff" : "rgba(255,255,255,0.4)"} />
                    }
                  </View>
                  <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{s.title}</Text>
                </View>
                {i < STEPS.length - 1 && (
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
                <Icon name="user" size={15} color={Colors.primary} />{"  "}Personal Information
              </Text>

              <InputField label="Full Name" value={form.name} onChange={(v: string) => update("name", v)} placeholder="As on CNIC" required />
              <InputField label="Father's Name" value={form.fatherName} onChange={(v: string) => update("fatherName", v)} placeholder="Father's full name" required />
              <InputField
                label="CNIC Number"
                value={form.cnic}
                onChange={(v: string) => update("cnic", v.replace(/\D/g, "").slice(0, 13))}
                placeholder="3740012345678"
                keyboardType="numeric"
                required
                maxLength={13}
              />
              <InputField
                label="Phone Number"
                value={form.phone}
                onChange={(v: string) => update("phone", v)}
                placeholder="03XX-XXXXXXX"
                keyboardType="phone-pad"
                required
              />
              {otpVerified && (
                <View style={styles.verifiedRow}>
                  <Icon name="check-circle" size={14} color={Colors.success} />
                  <Text style={styles.verifiedText}>Phone number verified</Text>
                </View>
              )}
              {!otpVerified && (
                <Pressable style={styles.sendOtpBtn} onPress={async () => {
                  if (!form.phone) { Alert.alert("Enter phone number first"); return; }
                  const cleaned = form.phone.trim().replace(/\D/g, "");
                  const isPakistani = /^(92|0)?3\d{9}$/.test(cleaned);
                  if (!isPakistani) { Alert.alert("Invalid Phone", "Please enter a valid Pakistani mobile number (e.g. 03XX-XXXXXXX)."); return; }
                  const res = await sendOtp(form.phone);
                  if (!res.success || res.error) {
                    Alert.alert("Failed", res.error || res.message || "Unable to send OTP. Please try again.");
                    return;
                  }
                  if (__DEV__) setOtpHint(res.code || "");
                  setShowOtp(true);
                  if (__DEV__ && res.code) Alert.alert("Your OTP Code", `Code: ${res.code}\n\nEnter this code in the field below.`, [{ text: "OK" }]);
                }}>
                  <Text style={styles.sendOtpText}>Send Verification Code</Text>
                </Pressable>
              )}
              {otpHint ? (
                <View style={styles.verifiedRow}>
                  <Icon name="info" size={14} color={Colors.secondary} />
                  <Text style={[styles.verifiedText, { color: Colors.secondary }]}>OTP code: <Text style={{ fontWeight: "800" }}>{otpHint}</Text></Text>
                </View>
              ) : null}
              <InputField label="Email Address" value={form.email} onChange={(v: string) => update("email", v)} placeholder="your@email.com" keyboardType="email-address" />

              <Text style={[styles.formSectionTitle, { marginTop: 12 }]}>
                <Icon name="tool" size={15} color={Colors.primary} />{"  "}Services & Details
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Services Offered <Text style={{ color: Colors.error }}>*</Text></Text>
                <View style={styles.servicesGrid}>
                  {categories.map((s) => {
                    const sel = form.services.includes(s.slug || s.id);
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => toggleService(s.slug || s.id)}
                        style={[styles.serviceChip, sel && { backgroundColor: s.bgColor, borderColor: s.color }]}
                      >
                        <Icon name={s.icon as any} size={13} color={sel ? s.color : Colors.textSecondary} />
                        <Text style={[styles.serviceChipText, sel && { color: s.color }]}>{s.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <InputField label="Years of Experience" value={form.experience} onChange={(v: string) => update("experience", v)} placeholder="e.g. 5 years" />
              <InputField
                label="Hourly Rate (PKR)"
                value={form.hourlyRate}
                onChange={(v: string) => update("hourlyRate", v.replace(/\D/g, ""))}
                placeholder="e.g. 1500"
                keyboardType="numeric"
              />
              <InputField
                label="Professional Bio"
                value={form.bio}
                onChange={(v: string) => update("bio", v)}
                placeholder="Describe your expertise, experience, and what makes you the best choice..."
                multiline
                maxLength={300}
              />
              <CityPicker value={form.city} onChange={(city) => update("city", city)} required testID="provider-city-picker" />
              <InputField label="Area/Address" value={form.address} onChange={(v: string) => update("address", v)} placeholder="Your working area" />
            </View>
          )}

          {step === 1 && (
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                <Icon name="file-text" size={15} color={Colors.primary} />{"  "}Document Upload
              </Text>
              <View style={[styles.infoBox, { marginBottom: 8 }]}>
                <Icon name="info" size={14} color={Colors.primary} />
                <Text style={styles.infoText}>
                  All documents are encrypted and reviewed only by Athoo's verification team. Your data is never shared publicly.
                </Text>
              </View>

              {DOC_ITEMS.map((doc) => {
                const uploaded = uploadedDocs.includes(doc.id);
                const fileUri = docFiles[doc.id];
                return (
                  <Pressable
                    key={doc.id}
                    style={[styles.docItem, uploaded && styles.docItemUploaded]}
                    onPress={() => handleDocUpload(doc)}
                  >
                    <View style={[styles.docIconBox, { backgroundColor: uploaded ? Colors.success + "15" : Colors.surface }]}>
                      {fileUri ? (
                        <Image source={{ uri: fileUri }} style={styles.docThumb} />
                      ) : (
                        <Icon name={doc.icon as any} size={20} color={uploaded ? Colors.success : Colors.textSecondary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.docLabelRow}>
                        <Text style={styles.docLabel}>{doc.label}</Text>
                        {doc.required && (
                          <Text style={styles.docRequired}>Required</Text>
                        )}
                      </View>
                      <Text style={styles.docHint}>
                        {uploaded
                          ? "✓ Uploaded — tap to replace or remove"
                          : (doc.id === "selfie" ? "📷 Tap to open camera" : "📁 Tap for camera or gallery")}
                      </Text>
                    </View>
                    <View style={[styles.docCheck, uploaded && styles.docCheckDone]}>
                      <Icon name={uploaded ? "check" : (doc.id === "selfie" ? "camera" : "upload")} size={14} color={uploaded ? "#fff" : Colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })}

              <View style={styles.policeBox}>
                <Icon name="shield" size={16} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.policeTitle}>Police Verification</Text>
                  <Text style={styles.policeText}>
                    After registration, our team will guide you through the police character certificate verification process. This builds customer trust and helps you get more bookings.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                <Icon name="clock" size={15} color={Colors.primary} />{"  "}Under Review
              </Text>

              <View style={styles.reviewCard}>
                <View style={styles.reviewIconCircle}>
                  <Icon name="search" size={28} color={Colors.primary} />
                </View>
                <Text style={styles.reviewTitle}>Your Application is Being Reviewed</Text>
                <Text style={styles.reviewText}>
                  Our team will verify your documents, CNIC, and police verification within 24-48 hours. You'll receive a notification once approved.
                </Text>

                <View style={styles.reviewChecklist}>
                  {[
                    "Identity verification (CNIC)",
                    "Document authenticity check",
                    "Police background check",
                    "Skills & experience review",
                  ].map((item, i) => (
                    <View key={i} style={styles.checkRow}>
                      <View style={styles.checkCircle}>
                        <Icon name="clock" size={11} color={Colors.primary} />
                      </View>
                      <Text style={styles.checkText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.reviewSummary}>
                  <Text style={styles.reviewSummaryTitle}>Summary</Text>
                  <View style={styles.summaryRow}><Text style={styles.summaryKey}>Name</Text><Text style={styles.summaryVal}>{form.name}</Text></View>
                  <View style={styles.summaryRow}><Text style={styles.summaryKey}>CNIC</Text><Text style={styles.summaryVal}>{"*".repeat(9) + form.cnic.slice(-4)}</Text></View>
                  <View style={styles.summaryRow}><Text style={styles.summaryKey}>Phone</Text><Text style={styles.summaryVal}>{form.phone.slice(0, 4) + "***" + form.phone.slice(-3)}</Text></View>
                  <View style={styles.summaryRow}><Text style={styles.summaryKey}>Services</Text><Text style={styles.summaryVal}>{form.services.length} selected</Text></View>
                  <View style={styles.summaryRow}><Text style={styles.summaryKey}>Documents</Text><Text style={styles.summaryVal}>{uploadedDocs.length}/{DOC_ITEMS.length} uploaded</Text></View>
                </View>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.declarationBox}>
              <Pressable
                style={styles.declarationRow}
                onPress={() => setDeclarationAccepted(!declarationAccepted)}
              >
                <View style={[styles.checkbox, declarationAccepted && styles.checkboxChecked]}>
                  {declarationAccepted && <Icon name="check" size={14} color="#fff" />}
                </View>
                <Text style={styles.declarationText}>
                  I declare that all the information and documents provided above are true,
                  accurate, and to the best of my knowledge.
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
                colors={[Colors.primary, "#0D4BA0"]}
                style={styles.nextBtnGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={styles.nextBtnText}>
                  {loading ? "Submitting..." : step === 2 ? "Submit Application" : "Continue"}
                </Text>
                <Icon name={step === 2 ? "send" : "arrow-right"} size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <Modal visible={showCnicNotice} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Pressable style={styles.modalClose} onPress={() => router.back()}>
              <Icon name="x" size={20} color={Colors.text} />
            </Pressable>
            <View style={styles.modalIconWrap}>
              <Icon name="alert-circle" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Important Notice</Text>
            <Text style={styles.modalBody}>
              Please add all your information exactly as it appears on your CNIC and other
              legal documents. False or incorrect details will lead to rejection of your
              application and may result in a permanent ban.
            </Text>
            <Pressable
              style={styles.modalOkBtn}
              onPress={() => setShowCnicNotice(false)}
            >
              <LinearGradient
                colors={[Colors.primary, "#0D4BA0"]}
                style={styles.modalOkGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={styles.modalOkText}>I Understand, Continue</Text>
                <Icon name="arrow-right" size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      <OtpModal
        visible={showOtp}
        title="Phone Verification"
        subtitle="Enter the 4-digit code shown below"
        sentTo={form.phone}
        hint={otpHint}
        onVerify={async (code: string) => {
          const res = await verifyOtpAndLogin(form.phone, code);
          if (!res.success) {
            Alert.alert("Invalid Code", res.error || "The code you entered is incorrect. Check the code shown above.");
            return;
          }

          if (!res.isNewUser) {
            const existingRole = res.user?.role === "provider" ? "provider" : "customer";
            setShowOtp(false);
            Alert.alert(
              "Account Already Exists",
              existingRole === "provider"
                ? "This phone number is already registered as a provider. Please sign in instead."
                : "This phone number is already registered as a customer. Please sign in instead.",
              [
                {
                  text: "Go to Sign In",
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
        title="Application Submitted!"
        subtitle="Your provider registration is under review. Our team will verify your documents and approve your account within 24-48 hours."
        primaryAction={{ label: "Go to Home", onPress: () => router.replace("/(provider)/(tabs)/dashboard") }}
        secondaryAction={{ label: "Back to Login", onPress: () => router.replace("/auth/welcome") }}
        onClose={() => router.replace("/auth/welcome")}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
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
  stepActive: { backgroundColor: "#fff" },
  stepDone: { backgroundColor: Colors.success },
  stepLabel: { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: "600" },
  stepLabelActive: { color: "#fff" },
  stepLine: { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 14 },
  stepLineDone: { backgroundColor: Colors.success },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  formSection: { gap: 14 },
  formSectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 6,
    marginBottom: 4,
  },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  input: { flex: 1, fontSize: 14, color: Colors.text },
  charCount: { fontSize: 10, color: Colors.textMuted, alignSelf: "flex-end" },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.success + "10",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.success + "30",
  },
  verifiedText: { fontSize: 13, fontWeight: "600", color: Colors.success },
  sendOtpBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  sendOtpText: { fontSize: 14, fontWeight: "700", color: Colors.primary },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  serviceChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  docItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  docItemUploaded: { borderColor: Colors.success, backgroundColor: Colors.success + "05" },
  docIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  docThumb: { width: 44, height: 44, borderRadius: 10, resizeMode: "cover" },
  docLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  docLabel: { fontSize: 14, fontWeight: "700", color: Colors.text },
  docRequired: { fontSize: 9, fontWeight: "700", color: Colors.error, backgroundColor: Colors.error + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  docStatus: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  docHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  docCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  docCheckDone: { backgroundColor: Colors.success },
  policeBox: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    marginTop: 4,
  },
  policeTitle: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  policeText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  reviewCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary + "30",
  },
  reviewTitle: { fontSize: 18, fontWeight: "800", color: Colors.text, textAlign: "center" },
  reviewText: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  reviewChecklist: { width: "100%", gap: 10 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  checkText: { fontSize: 13, color: Colors.textSecondary },
  reviewSummary: { width: "100%", backgroundColor: Colors.background, borderRadius: 14, padding: 14, gap: 8 },
  reviewSummaryTitle: { fontSize: 13, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryKey: { fontSize: 12, color: Colors.textSecondary },
  summaryVal: { fontSize: 12, fontWeight: "700", color: Colors.text },
  footer: { marginTop: 24 },
  nextBtn: { borderRadius: 18, overflow: "hidden" },
  nextBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 17 },
  nextBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  btnDisabled: { opacity: 0.5 },
  declarationBox: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  declarationRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: Colors.primary },
  declarationText: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
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
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: Colors.text, marginBottom: 8 },
  modalBody: {
    fontSize: 14,
    color: Colors.textSecondary,
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
  modalOkText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

