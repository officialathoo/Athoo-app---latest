import { Icon } from "@/components/ui/Icon";
import { PrivateImage } from "@/services/storage";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import React, { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

interface AvatarPickerModalsProps {
  avatarVisible: boolean;
  colorVisible: boolean;
  profileImage?: string | null;
  profileColor?: string | null;
  initials: string;
  avatarColors: string[];
  onCloseAvatar: () => void;
  onCloseColor: () => void;
  onPickImage: (useCamera: boolean) => void;
  onRemovePhoto: () => void;
  onChangeColor: (color: string) => void;
  onChooseColor: () => void;
}

export function AvatarPickerModals(props: AvatarPickerModalsProps) {
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const isRtl = direction === "rtl";
  const localizedRow = isRtl ? styles.rowReverse : undefined;
  const optionChevron = isRtl ? "chevron-left" : "chevron-right";
  const avatarColorLabel = tr("Avatar colors");
  const {
    avatarVisible,
    colorVisible,
    profileImage,
    profileColor,
    initials,
    avatarColors,
    onCloseAvatar,
    onCloseColor,
    onPickImage,
    onRemovePhoto,
    onChangeColor,
    onChooseColor,
  } = props;

  return (
    <>
      <Modal
        visible={avatarVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={onCloseAvatar}
      >
        <Pressable style={styles.backdrop} onPress={onCloseAvatar} accessibilityRole="button" accessibilityLabel={tr("Close profile picture options")}>
          <View
            style={styles.avatarSheet}
            onStartShouldSetResponder={() => true}
            accessible
            accessibilityLabel={tr("Profile Picture")}
          >
            <Text style={[styles.sheetTitle, localizedText]}>{tr("Profile Picture")}</Text>

            <View style={[styles.previewRow, localizedRow]}>
              {profileImage ? (
                <PrivateImage objectPath={profileImage} style={styles.preview} />
              ) : (
                <View
                  style={[
                    styles.preview,
                    {
                      backgroundColor: profileColor || theme.colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                  accessibilityLabel={tr("Profile initials")}
                >
                  <Text style={styles.previewInitials}>{initials}</Text>
                </View>
              )}
              {profileImage ? (
                <Pressable
                  style={[styles.removeBtn, localizedRow]}
                  onPress={onRemovePhoto}
                  accessibilityRole="button"
                  accessibilityLabel={tr("Remove profile photo")}
                >
                  <Icon name="trash-2" size={14} color={theme.colors.danger} />
                  <Text style={[styles.removeText, localizedText]}>{tr("Remove Photo")}</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[styles.option, localizedRow]}
              onPress={() => onPickImage(false)}
              accessibilityRole="button"
              accessibilityLabel={tr("Upload from Gallery")}
              accessibilityHint={tr("Choose a photo from your device")}
            >
              <View style={[styles.optIcon, { backgroundColor: theme.colors.primary + "15" }]}>
                <Icon name="image" size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.optCopy}>
                <Text style={[styles.optLabel, localizedText]}>{tr("Upload from Gallery")}</Text>
                <Text style={[styles.optSub, localizedText]}>{tr("Choose a photo from your device")}</Text>
              </View>
              <Icon name={optionChevron} size={16} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              style={[styles.option, localizedRow]}
              onPress={() => onPickImage(true)}
              accessibilityRole="button"
              accessibilityLabel={tr("Take a Selfie")}
              accessibilityHint={tr("Use your camera")}
            >
              <View style={[styles.optIcon, { backgroundColor: theme.colors.accent + "15" }]}>
                <Icon name="camera" size={20} color={theme.colors.accent} />
              </View>
              <View style={styles.optCopy}>
                <Text style={[styles.optLabel, localizedText]}>{tr("Take a Selfie")}</Text>
                <Text style={[styles.optSub, localizedText]}>{tr("Use your camera")}</Text>
              </View>
              <Icon name={optionChevron} size={16} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              style={[styles.option, localizedRow]}
              onPress={onChooseColor}
              accessibilityRole="button"
              accessibilityLabel={tr("Choose Color")}
              accessibilityHint={tr("Pick an avatar color")}
            >
              <View style={[styles.optIcon, { backgroundColor: theme.colors.secondary + "15" }]}>
                <Icon name="droplet" size={20} color={theme.colors.secondary} />
              </View>
              <View style={styles.optCopy}>
                <Text style={[styles.optLabel, localizedText]}>{tr("Choose Color")}</Text>
                <Text style={[styles.optSub, localizedText]}>{tr("Pick an avatar color")}</Text>
              </View>
              <Icon name={optionChevron} size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={colorVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={onCloseColor}
      >
        <Pressable style={styles.backdrop} onPress={onCloseColor} accessibilityRole="button" accessibilityLabel={tr("Close avatar color options")}>
          <View
            style={styles.colorSheet}
            onStartShouldSetResponder={() => true}
            accessible
            accessibilityLabel={tr("Choose Avatar Color")}
          >
            <Text style={[styles.sheetTitle, localizedText]}>{tr("Choose Avatar Color")}</Text>
            <View style={styles.colorGrid} accessibilityLabel={avatarColorLabel}>
              {avatarColors.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`${avatarColorLabel} ${c}`}
                  accessibilityState={{ selected: profileColor === c }}
                  style={[styles.colorDot, { backgroundColor: c }, profileColor === c && styles.colorActive]}
                  onPress={() => onChangeColor(c)}
                />
              ))}
            </View>
            <Pressable style={styles.cancelBtn} onPress={onCloseColor} accessibilityRole="button" accessibilityLabel={tr("Cancel")}>
              <Text style={[styles.cancelText, localizedText]}>{tr("Cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    avatarSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
      padding: redesign.layout.horizontalPadding,
      paddingBottom: 28,
      gap: 10,
      ...theme.shadows.md,
    },
    colorSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
      padding: redesign.layout.horizontalPadding,
      paddingBottom: 32,
      gap: 12,
      ...theme.shadows.md,
    },
    sheetTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text, textAlign: "center", marginTop: 4 },
    previewRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 4 },
    preview: {
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 3,
      borderColor: theme.colors.border,
    },
    previewInitials: { fontSize: 24, fontWeight: "800", color: theme.colors.onBrand },
    removeBtn: {
      minHeight: redesign.control.compactHeight,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.colors.dangerSoft,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
    },
    removeText: { fontSize: 12, color: theme.colors.danger, fontWeight: "600" },
    option: {
      minHeight: redesign.control.largeHeight,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    optIcon: {
      width: redesign.control.iconButtonSize,
      height: redesign.control.iconButtonSize,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    optCopy: { flex: 1 },
    optLabel: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
    optSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
    colorGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      justifyContent: "center",
      paddingVertical: 8,
    },
    colorDot: { width: 46, height: 46, borderRadius: 23 },
    colorActive: { borderWidth: 4, borderColor: theme.colors.text },
    cancelBtn: {
      minHeight: redesign.control.compactHeight,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radius.md,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    cancelText: { fontSize: 15, fontWeight: "600", color: theme.colors.textSecondary },
    rowReverse: { flexDirection: "row-reverse" },
  });
}
