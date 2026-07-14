import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { Icon } from "./Icon";
import { Colors } from "@/constants/colors";
import { getPrivateFileUrl, optimizeCloudinaryVideoUrl } from "@/services/storage";
import { api } from "@/services/api";

interface VideoPlayerProps {
  uri: string;
  style?: object;
}

export function VideoPlayer({ uri, style }: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [_status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) {
      setResolvedUri(null);
      return;
    }
    // Legacy https / data URIs render directly
    if (uri.startsWith("http") || uri.startsWith("data:")) {
      setResolvedUri(optimizeCloudinaryVideoUrl(uri));
      return;
    }
    // /objects/ path — append auth token for authorized serving
    const base = getPrivateFileUrl(uri);
    api.createPurposeToken("object-read").then(({ token }) => setResolvedUri(`${base}?token=${encodeURIComponent(token)}`)).catch(() => setResolvedUri(null));
  }, [uri]);

  if (error) {
    return (
      <View style={[styles.container, styles.errorBox, style]}>
        <Icon name="video-off" size={26} color={Colors.textMuted} />
        <Text style={styles.errorText}>Could not load video</Text>
        <Text style={styles.errorSub}>Check your internet connection</Text>
      </View>
    );
  }

  if (!resolvedUri) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
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
        onError={() => { setLoading(false); setError(true); }}
        shouldPlay={false}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading video…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 10,
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  errorBox: {
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  errorSub: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
