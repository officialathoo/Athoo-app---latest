import { LinearGradient } from "expo-linear-gradient";
import { brandConfig } from "@/config/brand";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, StatusBar, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

interface AthooLoaderProps {
  tagline?: string;
  testID?: string;
  accessibilityLabel?: string;
}

const splashSurface = "#061231";

export function AthooLoader({ tagline, testID, accessibilityLabel }: AthooLoaderProps) {
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
      Animated.timing(haloOpacity, { toValue: 0.9, duration: 1350, useNativeDriver: true }),
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

  const loaderTranslateX = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 72] });
  const loaderScaleX = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.04] });
  const glowTranslateX = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [-24, 24] });
  const glowScale = loaderProgress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.02] });
  const orbitTranslateY = orbitShift.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });

  return (
    <LinearGradient colors={[splashSurface, "#062B7E", "#04205E", splashSurface]} style={styles.container} start={{ x: 0.32, y: 0 }} end={{ x: 0.78, y: 1 }} testID={testID} accessibilityLabel={accessibilityLabel || `${brandConfig.displayName} loading`} accessibilityRole="progressbar">
      <StatusBar barStyle="light-content" backgroundColor={splashSurface} translucent={false} />
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
        <Text style={styles.brandName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{brandConfig.displayName}</Text>
        <Text style={styles.tagline} numberOfLines={2}>{resolvedTagline}</Text>
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
    container: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: splashSurface, paddingHorizontal: 24, paddingVertical: 32 },
    blueAura: { position: "absolute", top: "14%", alignSelf: "center", width: 390, height: 390, borderRadius: 195, backgroundColor: "rgba(0,119,255,0.34)", shadowColor: "#008CFF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.86, shadowRadius: 64 },
    deepVignette: { position: "absolute", width: "120%", height: "120%", borderRadius: 360, borderWidth: 1, borderColor: "rgba(25,77,210,0.08)", bottom: -220, right: -145 },
    orangeAura: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(255,132,0,0.28)", right: -96, bottom: "25%", shadowColor: "#FF8800", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.82, shadowRadius: 52 },
    orbitBlue: { position: "absolute", width: 690, height: 690, borderRadius: 345, borderWidth: 2, borderColor: "rgba(0,156,255,0.32)", bottom: -315, left: -245 },
    orbitOrange: { position: "absolute", width: 610, height: 610, borderRadius: 305, borderTopWidth: 1.4, borderRightWidth: 1.2, borderColor: "rgba(255,145,0,0.50)", bottom: -194, right: -224 },
    lowerRibbon: { position: "absolute", width: 680, height: 136, borderTopWidth: 2, borderColor: "rgba(0,206,255,0.34)", borderRadius: 340, bottom: -24, left: -142, transform: [{ rotate: "-11deg" }] },
    logoTileWrap: { width: 176, height: 176, alignItems: "center", justifyContent: "center", marginTop: 0 },
    logoTileShadow: { position: "absolute", width: 164, height: 164, borderRadius: 42, backgroundColor: "rgba(0,34,140,0.44)", shadowColor: "#008DFF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.86, shadowRadius: 34, elevation: 14 },
    logoTile: { width: 164, height: 164, borderRadius: 42, alignItems: "center", justifyContent: "center", borderWidth: 1.1, borderColor: "rgba(125,232,255,0.68)", overflow: "hidden" },
    logoTileGloss: { position: "absolute", top: 0, left: 0, width: "100%", height: "48%", borderTopLeftRadius: 42, borderTopRightRadius: 42, opacity: 0.68 },
    logoMark: { width: 118, height: 118, transform: [{ translateY: 2 }] },
    textBlock: { alignItems: "center", marginTop: 26, paddingHorizontal: 18, width: "100%", maxWidth: 300 },
    brandName: { fontSize: 44, lineHeight: 50, fontWeight: "900", color: theme.colors.white, letterSpacing: -1.2, textAlign: "center", textShadowColor: "rgba(255,255,255,0.18)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 7, width: "100%" },
    tagline: { marginTop: 6, fontSize: 15, lineHeight: 20, color: "rgba(226,237,255,0.82)", letterSpacing: 0.05, fontWeight: "500", textAlign: "center" },
    loaderZone: { marginTop: 34, width: 126, height: 30, alignItems: "center", justifyContent: "center" },
    loaderGlow: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,170,255,0.16)" },
    loaderTrack: { position: "relative", width: 76, height: 5, overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)", shadowColor: "#0084FF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.38, shadowRadius: 18, elevation: 8 },
    loaderTrackTint: { ...StyleSheet.absoluteFillObject, borderRadius: 999, opacity: 0.54 },
    loaderBar: { position: "absolute", top: 0, left: -30, width: 31, height: "100%", borderRadius: 999, overflow: "hidden", shadowColor: "#1FE5FF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.72, shadowRadius: 12, elevation: 9 },
    loaderBarGradient: { flex: 1, borderRadius: 999 },
  });
}