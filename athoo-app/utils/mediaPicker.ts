import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ensureCameraPermission as ensureCameraPermissionCore, ensurePhotoLibraryPermission, openAppSettings } from "../lib/permissions";

type PickOptions = ImagePicker.ImagePickerOptions;

function permissionSettingsAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Open Settings", onPress: () => openAppSettings().catch(() => {}) },
  ]);
}

export async function ensureGalleryPermission(): Promise<boolean> {
  // Ask through expo-image-picker first because iOS limited-library permissions
  // can be reported differently than generic MediaLibrary permissions.
  try {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.status === "granted") return true;
    const asked = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
    if (asked.status === "granted") return true;
  } catch {}
  const result = await ensurePhotoLibraryPermission({
    rationaleTitle: "Gallery permission required",
    rationaleBody:
      "Athoo needs Photos/Gallery access so you can upload booking videos, documents, payment screenshots, profile images, and support ticket media.",
  });
  return result === "granted";
}

export async function ensureCameraPermission(): Promise<boolean> {
  try {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.status === "granted") return true;
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    if (asked.status === "granted") return true;
  } catch {}
  const result = await ensureCameraPermissionCore({
    rationaleTitle: "Camera permission required",
    rationaleBody:
      "Athoo needs Camera access so you can take photos or videos for bookings, documents, payment screenshots, and support tickets.",
  });
  return result === "granted";
}

function normalizeOptions(options: PickOptions): PickOptions {
  return {
    quality: 0.8,
    ...options,
    // Mandatory Athoo rule: never crop documents, diplomas, CNICs, payment screenshots, or evidence media.
    allowsEditing: false,
    ...(Platform.OS === "ios" && (ImagePicker as any).UIImagePickerPreferredAssetRepresentationMode?.Compatible
      ? { preferredAssetRepresentationMode: (ImagePicker as any).UIImagePickerPreferredAssetRepresentationMode.Compatible }
      : {}),
  } as PickOptions;
}


function normalizeMediaTypesForPicker(options: PickOptions): PickOptions[] {
  const base = normalizeOptions(options) as any;
  const raw = JSON.stringify(base.mediaTypes || "").toLowerCase();
  const wantsVideo = raw.includes("video");
  const wantsImage = raw.includes("image") || raw.includes("photo") || !wantsVideo;
  const optsNoMedia = { ...base };
  delete optsNoMedia.mediaTypes;

  const attempts: any[] = [];
  if (wantsVideo && wantsImage) attempts.push({ ...optsNoMedia, mediaTypes: ["images", "videos"] });
  if (wantsVideo && !wantsImage) attempts.push({ ...optsNoMedia, mediaTypes: ["videos"] });
  if (!wantsVideo && wantsImage) attempts.push({ ...optsNoMedia, mediaTypes: ["images"] });
  // Legacy Expo fallback for older/dev clients.
  if (wantsVideo && wantsImage) attempts.push({ ...optsNoMedia, mediaTypes: (ImagePicker as any).MediaTypeOptions?.All });
  else if (wantsVideo) attempts.push({ ...optsNoMedia, mediaTypes: (ImagePicker as any).MediaTypeOptions?.Videos });
  else attempts.push({ ...optsNoMedia, mediaTypes: (ImagePicker as any).MediaTypeOptions?.Images });
  // Final fallback: let the native picker decide.
  attempts.push(optsNoMedia);
  return attempts.filter((x) => x.mediaTypes !== undefined || x === optsNoMedia) as PickOptions[];
}

function pickerFailedAlert(source: "gallery" | "camera") {
  const title = source === "gallery" ? "Gallery did not open" : "Camera did not open";
  const body =
    source === "gallery"
      ? Platform.OS === "ios"
        ? "Please allow Photos access for Athoo in iPhone Settings, then try again."
        : "Please allow Photos/Gallery access for Athoo in phone Settings, then try again."
      : "Please allow Camera access for Athoo in phone Settings, then try again.";
  permissionSettingsAlert(title, body);
}

export async function pickFromGallery(options: PickOptions): Promise<ImagePicker.ImagePickerResult | null> {
  const ok = await ensureGalleryPermission();
  if (!ok) return null;
  let lastError: unknown = null;
  for (const attempt of normalizeMediaTypesForPicker(options)) {
    try {
      return await ImagePicker.launchImageLibraryAsync(attempt as any);
    } catch (error) {
      lastError = error;
    }
  }
  pickerFailedAlert("gallery");
  return null;
}

export async function pickFromCamera(options: PickOptions): Promise<ImagePicker.ImagePickerResult | null> {
  const ok = await ensureCameraPermission();
  if (!ok) return null;
  // Video recording also needs microphone permission on many phones. Request it before opening camera.
  const wantsVideo = JSON.stringify((options as any).mediaTypes || "").toLowerCase().includes("video");
  if (wantsVideo) {
    try {
      const { ensureMicrophonePermission } = await import("../lib/permissions");
      await ensureMicrophonePermission({
        rationaleTitle: "Microphone required for video",
        rationaleBody: "Athoo needs microphone access to record booking videos with sound.",
      });
    } catch {}
  }
  for (const attempt of normalizeMediaTypesForPicker(options)) {
    try {
      return await ImagePicker.launchCameraAsync(attempt as any);
    } catch {}
  }
  pickerFailedAlert("camera");
  return null;
}
