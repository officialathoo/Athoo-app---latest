import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";

interface AthooLoaderProps {
  tagline?: string;
}

export function AthooLoader({ tagline = "Pakistan's Home Services" }: AthooLoaderProps) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0.4)).current;
  const dot1Y = useRef(new Animated.Value(0)).current;
  const dot2Y = useRef(new Animated.Value(0)).current;
  const dot3Y = useRef(new Animated.Value(0)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        damping: 14,
        stiffness: 130,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    }, 350);

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.7, duration: 1200, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.35, duration: 1200, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ring1Scale, { toValue: 1.35, duration: 1600, useNativeDriver: true }),
        Animated.timing(ring1Scale, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ring1Opacity, { toValue: 0, duration: 1600, useNativeDriver: true }),
        Animated.timing(ring1Opacity, { toValue: 0.35, duration: 0, useNativeDriver: true }),
      ])
    ).start();

    const bounceDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -9, duration: 260, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.delay(480),
        ])
      ).start();

    setTimeout(() => {
      bounceDot(dot1Y, 0);
      bounceDot(dot2Y, 160);
      bounceDot(dot3Y, 320);
    }, 700);
  }, []);

  return (
    <LinearGradient
      colors={["#1E7AE8", "#1558C0", "#0D3F8F"]}
      style={styles.container}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.7, y: 1 }}
    >
      <View style={styles.bgCircleTL} />
      <View style={styles.bgCircleBR} />
      <View style={styles.bgCircleMid} />

      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Animated.View style={[styles.ring, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]} />
        <Animated.View style={[styles.glowCircle, { opacity: glowOpacity }]} />
        <View style={styles.logoCard}>
          <Image
            source={require("@/assets/images/logo_transparent.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </Animated.View>

      <Animated.View style={[styles.textBlock, { opacity: textOpacity }]}>
        <Text style={styles.brandName}>Athoo</Text>
        <Text style={styles.tagline}>{tagline}</Text>
      </Animated.View>

      <View style={styles.dotsRow}>
        {[dot1Y, dot2Y, dot3Y].map((dy, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              i === 1 && styles.dotMid,
              { transform: [{ translateY: dy }] },
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Rawalpindi · Islamabad</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  bgCircleTL: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(255,255,255,0.05)",
    top: -120,
    right: -100,
  },
  bgCircleBR: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -80,
    left: -80,
  },
  bgCircleMid: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.03)",
    top: "35%",
    left: "60%",
  },

  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 140,
    height: 140,
  },
  ring: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  glowCircle: {
    position: "absolute",
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  logoCard: {
    width: 104,
    height: 104,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 20,
  },
  logo: {
    width: 72,
    height: 72,
  },

  textBlock: {
    alignItems: "center",
    marginTop: 30,
    gap: 6,
  },
  brandName: {
    fontSize: 38,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 0.8,
    fontWeight: "500",
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 58,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  dotMid: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.75)",
  },

  footer: {
    position: "absolute",
    bottom: 48,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 1.2,
    fontWeight: "500",
    textTransform: "uppercase",
  },
});
