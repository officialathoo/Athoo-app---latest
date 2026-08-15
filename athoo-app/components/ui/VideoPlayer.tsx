import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const replayResetInFlightRef = useRef(false);
  const [preparing, setPreparing] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState(false);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    replayResetInFlightRef.current = false;
    setError(false);
    setPreparing(true);
    setBuffering(false);

    if (!uri) {
      setResolvedUri(null);
      setPreparing(false);
      return () => {
        mounted = false;
      };
    }

    if (uri.startsWith("http") || uri.startsWith("data:") || uri.startsWith("file:")) {
      setResolvedUri(uri.startsWith("http") ? optimizeCloudinaryVideoUrl(uri) : uri);
      return () => {
        mounted = false;
      };
    }

    const base = getPrivateFileUrl(uri);
    api.createPurposeToken("object-read")
      .then(({ token }) => {
        if (mounted) {
          setResolvedUri(`${base}?token=${encodeURIComponent(token)}`);
        }
      })
      .catch(() => {
        if (mounted) {
          setResolvedUri(null);
          setPreparing(false);
          setBuffering(false);
          setError(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [uri]);

  const source = useMemo(() => (resolvedUri ? { uri: resolvedUri } : null), [resolvedUri]);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      // The unloaded/error AVPlaybackStatus shape is intentionally handled
      // without touching status.error so this remains compatible with the
      // expo-av discriminated union used by the current Athoo runtime.
      return;
    }

    setPreparing(false);
    setBuffering((current) => (current === status.isBuffering ? current : status.isBuffering));

    if (status.didJustFinish && !replayResetInFlightRef.current) {
      replayResetInFlightRef.current = true;
      void videoRef.current
        ?.setPositionAsync(0)
        .catch(() => undefined)
        .finally(() => {
          replayResetInFlightRef.current = false;
        });
    }
  }, []);

  if (error) {
    return (
      <View style={[styles.container, styles.errorBox, style]}>
        <Icon name="video-off" size={26} color={theme.colors.textMuted} />
        <Text style={styles.errorText}>Could not load video</Text>
        <Text style={styles.errorSub}>Check your internet connection and try again.</Text>
      </View>
    );
  }

  if (!source) {
    return (
      <View style={[styles.container, style]}>
        {preparing ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Preparing video...</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Video
        ref={videoRef}
        source={source}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onLoad={() => {
          setPreparing(false);
          setBuffering(false);
        }}
        onLoadStart={() => {
          setPreparing(true);
          setError(false);
        }}
        onError={() => {
          setPreparing(false);
          setBuffering(false);
          setError(true);
        }}
        shouldPlay={false}
        progressUpdateIntervalMillis={500}
      />
      {preparing || buffering ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{preparing ? "Loading video..." : "Buffering..."}</Text>
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
    errorBox: {
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: 16,
    },
    errorText: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    errorSub: { color: theme.colors.textSecondary, fontSize: 12, textAlign: "center" },
  });
}