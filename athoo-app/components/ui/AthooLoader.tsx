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
  const resolvedTagline = tagline || brandConfig.descriptor;
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

  const gradient = theme.dark
    ? [theme.colors.background, theme.colors.primaryPressed, theme.colors.surfaceAlt] as const
    : [theme.colors.primary, theme.colors.primaryPressed, theme.colors.info] as const;

  return (
    <LinearGradient colors={gradient} style={styles.container} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}>
      <View style={styles.backgroundCircleTop} />
      <View style={styles.backgroundCircleBottom} />
      <View style={styles.backgroundCircleMiddle} />

      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <Animated.View style={[styles.glowCircle, { opacity: glowOpacity }]} />
        <View style={styles.logoCard}>
          <Image source={brandConfig.assets.mark} style={styles.logo} resizeMode="contain" />
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
        <Text style={styles.footerText}>Pakistan</Text>
      </View>
    </LinearGradient>
  );
}

function createStyles(theme: AthooTheme) {
  const glass = theme.dark ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.18)";
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    backgroundCircleTop: { position: "absolute", width: 340, height: 340, borderRadius: 170, backgroundColor: "rgba(255,255,255,0.05)", top: -120, right: -100 },
    backgroundCircleBottom: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(255,255,255,0.04)", bottom: -80, left: -80 },
    backgroundCircleMiddle: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.03)", top: "35%", left: "60%" },
    logoWrap: { alignItems: "center", justifyContent: "center", width: 148, height: 148 },
    ring: { position: "absolute", width: 144, height: 144, borderRadius: 72, borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
    glowCircle: { position: "absolute", width: 118, height: 118, borderRadius: 59, backgroundColor: "rgba(255,255,255,0.12)" },
    logoCard: {
      width: 108,
      height: 108,
      borderRadius: 28,
      backgroundColor: theme.colors.white,
      borderWidth: 1.5,
      borderColor: glass,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.overlay,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.3,
      shadowRadius: 22,
      elevation: 20,
      overflow: "hidden",
    },
    logo: { width: 96, height: 96 },
    textBlock: { alignItems: "center", marginTop: 30, gap: 6 },
    brandName: { fontSize: 38, fontWeight: "800", color: theme.colors.white, letterSpacing: 1.5 },
    tagline: { fontSize: 13, color: "rgba(255,255,255,0.78)", letterSpacing: 0.8, fontWeight: "500" },
    dotsRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 58 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.58)" },
    middleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.82)" },
    footer: { position: "absolute", bottom: 48, alignItems: "center" },
    footerText: { fontSize: 11, color: "rgba(255,255,255,0.52)", letterSpacing: 1.2, fontWeight: "500", textTransform: "uppercase" },
  });
}
