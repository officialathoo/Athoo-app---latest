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
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const haloOpacity = useRef(new Animated.Value(0.58)).current;
  const loaderProgress = useRef(new Animated.Value(0)).current;
  const orbitShift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];
    const intro = Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, damping: 16, stiffness: 115, mass: 0.85, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 520, delay: 210, useNativeDriver: true }),
    ]);

    const halo = Animated.loop(Animated.sequence([
      Animated.timing(haloOpacity, { toValue: 0.92, duration: 1350, useNativeDriver: true }),
      Animated.timing(haloOpacity, { toValue: 0.52, duration: 1350, useNativeDriver: true }),
    ]));

    const loader = Animated.loop(Animated.sequence([
      Animated.timing(loaderProgress, { toValue: 1, duration: 1050, useNativeDriver: true }),
      Animated.timing(loaderProgress, { toValue: 0, duration: 1050, useNativeDriver: true }),
    ]));

    const orbit = Animated.loop(Animated.sequence([
      Animated.timing(orbitShift, { toValue: 1, duration: 3200, useNativeDriver: true }),
      Animated.timing(orbitShift, { toValue: 0, duration: 3200, useNativeDriver: true }),
    ]));

    animations.push(intro, halo, loader, orbit);
    intro.start();
    halo.start();
    loader.start();
    orbit.start();

    return () => animations.forEach((animation) => animation.stop());
  }, [haloOpacity, loaderProgress, logoOpacity, logoScale, orbitShift, textOpacity]);

  const loaderTranslateX = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 89] });
  const loaderScaleX = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.1] });
  const glowTranslateX = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [-30, 30] });
  const glowScale = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.08] });
  const orbitTranslateY = orbitShift.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });

  return (
    <LinearGradient colors={["#020814", "#061E61", "#02123C", "#020814"]} style={styles.container} start={{ x: 0.32, y: 0 }} end={{ x: 0.78, y: 1 }}>
      <Animated.View style={[styles.blueAura, { opacity: haloOpacity }]} />
      <View style={styles.deepVignette} />
      <View style={styles.orangeAura} />
      <Animated.View style={[styles.orbitBlue, { transform: [{ translateY: orbitTranslateY }, { rotate: "-12deg" }] }]} />
      <Animated.View style={[styles.orbitOrange, { transform: [{ translateY: orbitTranslateY }, { rotate: "-20deg" }] }]} />
      <View style={styles.lowerRibbon} />

      <Animated.View style={[styles.logoTileWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoTileShadow} />
        <LinearGradient colors={["#1BDAFF", "#0075FF", "#003DCD"]} style={styles.logoTile} start={{ x: 0.08, y: 0.02 }} end={{ x: 0.92, y: 0.98 }}>
          <LinearGradient colors={["rgba(255,255,255,0.30)", "rgba(255,255,255,0.02)"]} style={styles.logoTileGloss} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <Image source={brandConfig.assets.mark} style={styles.logoMark} resizeMode="contain" />
        </LinearGradient>
      </Animated.View>

      <Animated.View style={[styles.textBlock, { opacity: textOpacity }]}>
        <Text style={styles.brandName}>{brandConfig.displayName}</Text>
        <Text style={styles.tagline}>{resolvedTagline}</Text>
      </Animated.View>

      <View style={styles.loaderZone} pointerEvents="none">
        <Animated.View style={[styles.loaderGlow, { transform: [{ translateX: glowTranslateX }, { scale: glowScale }] }]} />
        <View style={styles.loaderTrack}>
          <LinearGradient colors={["rgba(12,96,255,0.40)", "rgba(24,200,255,0.34)", "rgba(255,145,0,0.34)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.loaderTrackTint} />
          <Animated.View style={[styles.loaderBar, { transform: [{ translateX: loaderTranslateX }, { scaleX: loaderScaleX }] }]}>
            <LinearGradient colors={["#0B6DFF", "#1FE5FF", "#FF9A00"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.loaderBarGradient} />
          </Animated.View>
        </View>
      </View>
    </LinearGradient>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#020814" },
    blueAura: { position: "absolute", top: "10%", alignSelf: "center", width: 470, height: 470, borderRadius: 235, backgroundColor: "rgba(0,119,255,0.34)", shadowColor: "#008CFF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.88, shadowRadius: 70 },
    deepVignette: { position: "absolute", width: "120%", height: "120%", borderRadius: 360, borderWidth: 1, borderColor: "rgba(25,77,210,0.08)", bottom: -220, right: -145 },
    orangeAura: { position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(255,132,0,0.32)", right: -120, bottom: "25%", shadowColor: "#FF8800", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.85, shadowRadius: 60 },
    orbitBlue: { position: "absolute", width: 760, height: 760, borderRadius: 380, borderWidth: 2, borderColor: "rgba(0,156,255,0.34)", bottom: -335, left: -265 },
    orbitOrange: { position: "absolute", width: 680, height: 680, borderRadius: 340, borderTopWidth: 1.4, borderRightWidth: 1.2, borderColor: "rgba(255,145,0,0.54)", bottom: -210, right: -245 },
    lowerRibbon: { position: "absolute", width: 760, height: 160, borderTopWidth: 2, borderColor: "rgba(0,206,255,0.40)", borderRadius: 380, bottom: -26, left: -160, transform: [{ rotate: "-11deg" }] },
    logoTileWrap: { width: 238, height: 238, alignItems: "center", justifyContent: "center", marginTop: -66 },
    logoTileShadow: { position: "absolute", width: 224, height: 224, borderRadius: 58, backgroundColor: "rgba(0,34,140,0.48)", shadowColor: "#008DFF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.92, shadowRadius: 44, elevation: 18 },
    logoTile: { width: 224, height: 224, borderRadius: 58, alignItems: "center", justifyContent: "center", borderWidth: 1.2, borderColor: "rgba(125,232,255,0.70)", overflow: "hidden" },
    logoTileGloss: { position: "absolute", top: 0, left: 0, width: "100%", height: "48%", borderTopLeftRadius: 58, borderTopRightRadius: 58, opacity: 0.72 },
    logoMark: { width: 162, height: 162, transform: [{ translateY: 3 }] },
    textBlock: { alignItems: "center", marginTop: 42, paddingHorizontal: 24 },
    brandName: { fontSize: 60, lineHeight: 68, fontWeight: "900", color: theme.colors.white, letterSpacing: -1.8, textAlign: "center", textShadowColor: "rgba(255,255,255,0.20)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
    tagline: { marginTop: 8, fontSize: 19, lineHeight: 25, color: "rgba(226,237,255,0.82)", letterSpacing: 0.1, fontWeight: "500", textAlign: "center" },
    loaderZone: { marginTop: 62, width: 170, height: 44, alignItems: "center", justifyContent: "center" },
    loaderGlow: { position: "absolute", width: 55, height: 55, borderRadius: 28, backgroundColor: "rgba(0,170,255,0.18)" },
    loaderTrack: { position: "relative", width: 94, height: 8, overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)", shadowColor: "#0084FF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.42, shadowRadius: 22, elevation: 9 },
    loaderTrackTint: { ...StyleSheet.absoluteFillObject, borderRadius: 999, opacity: 0.55 },
    loaderBar: { position: "absolute", top: 0, left: -40, width: 43, height: "100%", borderRadius: 999, overflow: "hidden", shadowColor: "#1FE5FF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 14, elevation: 10 },
    loaderBarGradient: { flex: 1, borderRadius: 999 },
  });
}
