import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors } from "@/constants/colors";

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
  }, [visible]);

  const iconColor = type === "success" ? Colors.success : type === "warning" ? Colors.warning : Colors.primary;
  const iconBg = type === "success" ? "#DCFCE7" : type === "warning" ? "#FEF9C3" : "#EFF6FF";
  const iconName = type === "success" ? "check-circle" : type === "warning" ? "alert-circle" : "info";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          <Animated.View style={[styles.iconCircle, { backgroundColor: iconBg, transform: [{ scale: checkScale }] }]}>
            <Icon name={iconName as any} size={44} color={iconColor} />
          </Animated.View>

          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          {details && details.length > 0 && (
            <View style={styles.detailsBox}>
              {details.map((d, i) => (
                <View key={i} style={[styles.detailRow, i < details.length - 1 && styles.detailBorder]}>
                  <Text style={styles.detailLabel}>{d.label}</Text>
                  <Text style={styles.detailValue}>{d.value}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={primaryAction.onPress}
          >
            <LinearGradient
              colors={[Colors.primary, "#0D4BA0"]}
              style={styles.primaryBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryBtnText}>{primaryAction.label}</Text>
            </LinearGradient>
          </Pressable>

          {secondaryAction && (
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              onPress={secondaryAction.onPress}
            >
              <Text style={styles.secondaryBtnText}>{secondaryAction.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 30,
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
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  detailsBox: {
    width: "100%",
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  detailBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: { fontSize: 13, color: Colors.textSecondary },
  detailValue: { fontSize: 13, fontWeight: "700", color: Colors.text },
  primaryBtn: { width: "100%", borderRadius: 16, overflow: "hidden", marginBottom: 10 },
  primaryBtnGrad: {
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  secondaryBtn: { paddingVertical: 10 },
  secondaryBtnText: { fontSize: 14, fontWeight: "600", color: Colors.primary },
  pressed: { opacity: 0.82 },
});

