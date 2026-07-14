import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { AthooTheme } from "@/design/theme";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface SuccessModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  details?: { label: string; value: string }[];
  primaryAction: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
  onClose: () => void;
  type?: "success" | "info" | "warning";
}

export function SuccessModal({
  visible,
  title,
  subtitle,
  details,
  primaryAction,
  secondaryAction,
  onClose,
  type = "success",
}: SuccessModalProps) {
  const { theme } = useTheme();
  const { isUrdu, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 65, friction: 9, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        Animated.spring(checkScale, { toValue: 1, tension: 80, friction: 7, useNativeDriver: true }).start();
      });
    } else {
      scale.setValue(0.6);
      opacity.setValue(0);
      checkScale.setValue(0);
      bgOpacity.setValue(0);
    }
  }, [bgOpacity, checkScale, opacity, scale, visible]);

  const iconColor = type === "success"
    ? theme.colors.success
    : type === "warning"
      ? theme.colors.warning
      : theme.colors.primary;
  const iconBg = type === "success"
    ? theme.colors.successSoft
    : type === "warning"
      ? theme.colors.warningSoft
      : theme.colors.infoSoft;
  const iconName = type === "success" ? "check-circle" : type === "warning" ? "alert-circle" : "info";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity: bgOpacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={tr("Close dialog")}
        />
        <Animated.View
          style={[styles.card, { transform: [{ scale }], opacity }]}
          accessible
          accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        >
          <Animated.View
            style={[styles.iconCircle, { backgroundColor: iconBg, transform: [{ scale: checkScale }] }]}
            accessibilityElementsHidden
          >
            <Icon name={iconName as any} size={44} color={iconColor} />
          </Animated.View>

          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {details && details.length > 0 ? (
            <View style={styles.detailsBox} accessibilityRole="summary">
              {details.map((detail, index) => (
                <View key={`${detail.label}-${index}`} style={[styles.detailRow, index < details.length - 1 && styles.detailBorder]}>
                  <Text style={styles.detailLabel}>{detail.label}</Text>
                  <Text style={styles.detailValue}>{detail.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={primaryAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={primaryAction.label}
          >
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryPressed]}
              style={styles.primaryBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryBtnText}>{primaryAction.label}</Text>
            </LinearGradient>
          </Pressable>

          {secondaryAction ? (
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              onPress={secondaryAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={secondaryAction.label}
            >
              <Text style={styles.secondaryBtnText}>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 28,
      padding: 24,
      alignItems: "center",
      width: "100%",
      maxWidth: 400,
      ...theme.shadows.lg,
    },
    iconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.text,
      textAlign: "center",
      writingDirection: isUrdu ? "rtl" : "ltr",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: "center",
      writingDirection: isUrdu ? "rtl" : "ltr",
      lineHeight: 20,
      marginBottom: 20,
    },
    detailsBox: {
      width: "100%",
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 4,
      marginBottom: 20,
    },
    detailRow: {
      flexDirection: isUrdu ? "row-reverse" : "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    detailBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
    detailLabel: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    detailValue: { flexShrink: 1, fontSize: 13, fontWeight: "700", color: theme.colors.text, textAlign: isUrdu ? "left" : "right", writingDirection: isUrdu ? "rtl" : "ltr" },
    primaryBtn: { width: "100%", minHeight: 48, borderRadius: 16, overflow: "hidden", marginBottom: 8 },
    primaryBtnGrad: { minHeight: 48, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
    primaryBtnText: { fontSize: 16, fontWeight: "800", color: theme.colors.white, writingDirection: isUrdu ? "rtl" : "ltr" },
    secondaryBtn: { minHeight: 44, minWidth: 120, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
    secondaryBtnText: { fontSize: 14, fontWeight: "600", color: theme.colors.primary, writingDirection: isUrdu ? "rtl" : "ltr" },
    pressed: { opacity: 0.82 },
  });
}
