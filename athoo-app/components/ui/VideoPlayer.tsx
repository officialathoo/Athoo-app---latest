import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { Icon } from "./Icon";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { getPrivateFileUrl, optimizeCloudinaryVideoUrl } from "@/services/storage";
import { api } from "@/services/api";

interface VideoPlayerProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
}

export function VideoPlayer({ uri, style }: VideoPlayerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const videoRef = useRef<Video>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [_status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(false);
    setLoading(true);

    if (!uri) {
      setResolvedUri(null);
      return () => {
        mounted = false;
      };
    }

    if (uri.startsWith("http") || uri.startsWith("data:")) {
      setResolvedUri(optimizeCloudinaryVideoUrl(uri));
      return () => {
        mounted = false;
      };
    }

    const base = getPrivateFileUrl(uri);
    api.createPurposeToken("object-read")
      .then(({ token }) => {
        if (mounted) setResolvedUri(`${base}?token=${encodeURIComponent(token)}`);
      })
      .catch(() => {
        if (mounted) {
          setResolvedUri(null);
          setLoading(false);
          setError(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [uri]);

  if (error) {
    return (
      <View style={[styles.container, styles.errorBox, style]}>
        <Icon name="video-off" size={26} color={theme.colors.textMuted} />
        <Text style={styles.errorText}>Could not load video</Text>
        <Text style={styles.errorSub}>Check your internet connection and try again.</Text>
      </View>
    );
  }

  if (!resolvedUri) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Preparing video…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Video
        ref={videoRef}
        source={{ uri: resolvedUri }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        onPlaybackStatusUpdate={setStatus}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        shouldPlay={false}
      />
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading video…</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: {
      width: "100%",
      aspectRatio: 16 / 9,
      backgroundColor: theme.colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    video: { width: "100%", height: "100%" },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    loadingText: { color: theme.colors.white, fontSize: 13, fontWeight: "500" },
    errorBox: { backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 6, padding: 16 },
    errorText: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    errorSub: { color: theme.colors.textSecondary, fontSize: 12, textAlign: "center" },
  });
}
