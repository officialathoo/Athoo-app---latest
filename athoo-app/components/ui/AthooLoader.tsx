import { LinearGradient } from "expo-linear-gradient";
import { brandConfig } from "@/config/brand";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

interface AthooLoaderProps {
  tagline?: string;
}

export function AthooLoader({ tagline }: AthooLoaderProps) {
  const { theme } = useTheme();
  const resolvedTagline = tagline || `${brandConfig.descriptor} Across Pakistan`;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0.4)).current;
  const dot1Y = useRef(new Animated.Value(0)).current;
  const dot2Y = useRef(new Animated.Value(0)).current;
  const dot3Y = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    const intro = Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, damping: 14, stiffness: 130, mass: 0.9, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    animations.push(intro);
    intro.start();

    timers.push(setTimeout(() => {
      const text = Animated.timing(textOpacity, { toValue: 1, duration: 450, useNativeDriver: true });
      animations.push(text);
      text.start();
    }, 350));

    const glow = Animated.loop(Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 0.7, duration: 1200, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0.35, duration: 1200, useNativeDriver: true }),
    ]));
    const ringPulse = Animated.loop(Animated.sequence([
      Animated.timing(ringScale, { toValue: 1.35, duration: 1600, useNativeDriver: true }),
      Animated.timing(ringScale, { toValue: 1, duration: 1600, useNativeDriver: true }),
    ]));
    const ringFade = Animated.loop(Animated.sequence([
      Animated.timing(ringOpacity, { toValue: 0, duration: 1600, useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0.35, duration: 0, useNativeDriver: true }),
    ]));
    animations.push(glow, ringPulse, ringFade);
    glow.start();
    ringPulse.start();
    ringFade.start();

    const bounceDot = (dot: Animated.Value, delay: number) => {
      const animation = Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: -9, duration: 260, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.delay(480),
      ]));
      animations.push(animation);
      animation.start();
    };

    timers.push(setTimeout(() => {
      bounceDot(dot1Y, 0);
      bounceDot(dot2Y, 160);
      bounceDot(dot3Y, 320);
    }, 700));

    return () => {
      timers.forEach(clearTimeout);
      animations.forEach((animation) => animation.stop());
    };
  }, [dot1Y, dot2Y, dot3Y, glowOpacity, logoOpacity, logoScale, ringOpacity, ringScale, textOpacity]);

  const gradient = ["#061231", "#0B3FA8", "#08172F"] as const;

  return (
    <LinearGradient colors={gradient} style={styles.container} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}>
      <View style={styles.backgroundCircleTop} />
      <View style={styles.backgroundCircleBottom} />
      <View style={styles.backgroundCircleMiddle} />

      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <Animated.View style={[styles.glowCircle, { opacity: glowOpacity }]} />
        <View style={styles.logoCard}>
          <Image source={brandConfig.assets.appIcon} style={styles.logo} resizeMode="cover" />
        </View>
      </Animated.View>

      <Animated.View style={[styles.textBlock, { opacity: textOpacity }]}>
        <Text style={styles.brandName}>{brandConfig.displayName}</Text>
        <Text style={styles.tagline}>{resolvedTagline}</Text>
      </Animated.View>

      <View style={styles.dotsRow}>
        {[dot1Y, dot2Y, dot3Y].map((translateY, index) => (
          <Animated.View
            key={index}
            style={[styles.dot, index === 1 && styles.middleDot, { transform: [{ translateY }] }]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Secure Services - Pakistan</Text>
      </View>
    </LinearGradient>
  );
}

function createStyles(theme: AthooTheme) {
  const glass = theme.dark ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.18)";
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    backgroundCircleTop: { position: "absolute", width: 380, height: 380, borderRadius: 190, backgroundColor: "rgba(56,189,248,0.08)", top: -165, right: -135 },
    backgroundCircleBottom: { position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(249,115,22,0.10)", bottom: -125, left: -115 },
    backgroundCircleMiddle: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.03)", top: "35%", left: "60%" },
    logoWrap: { alignItems: "center", justifyContent: "center", width: 142, height: 142 },
    ring: { position: "absolute", width: 136, height: 136, borderRadius: 68, borderWidth: 1.5, borderColor: "rgba(125,211,252,0.48)" },
    glowCircle: { position: "absolute", width: 112, height: 112, borderRadius: 56, backgroundColor: "rgba(56,189,248,0.13)" },
    logoCard: {
      width: 112,
      height: 112,
      borderRadius: 30,
      backgroundColor: "rgba(7,31,78,0.82)",
      borderWidth: 1,
      borderColor: "rgba(78,182,255,0.52)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#1685FF",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.36,
      shadowRadius: 28,
      elevation: 20,
      overflow: "hidden",
    },
    logo: { width: "100%", height: "100%", borderRadius: 29 },
    textBlock: { alignItems: "center", marginTop: 24, gap: 5, paddingHorizontal: 28 },
    brandName: { fontSize: 36, fontWeight: "800", color: theme.colors.white, letterSpacing: 1.1 },
    tagline: { fontSize: 13, color: "rgba(255,255,255,0.78)", letterSpacing: 0.8, fontWeight: "500" },
    dotsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 46 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.58)" },
    middleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#F97316" },
    footer: { position: "absolute", bottom: 48, alignItems: "center" },
    footerText: { fontSize: 10, color: "rgba(255,255,255,0.46)", letterSpacing: 1.5, fontWeight: "600", textTransform: "uppercase" },
  });
}
