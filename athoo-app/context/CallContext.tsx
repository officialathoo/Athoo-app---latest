import { appLogger } from "@/lib/logger";
import { apiErrorToMessage } from "@/lib/apiError";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { soundService } from "@/services/SoundService";
import { api, realtime } from "@/services/api";
import { useAuth } from "./AuthContext";
import { useTheme } from "./ThemeContext";
import type { AthooTheme } from "@/design/theme";

// ─── WebRTC dynamic import (native dev build only) ───────────────────────────
let WebRTCAvailable = false;
let _RTCPeerConnection: any = null;
let _RTCSessionDescription: any = null;
let _RTCIceCandidate: any = null;

try {
  const w = require("react-native-webrtc");
  _RTCPeerConnection = w.RTCPeerConnection;
  _RTCSessionDescription = w.RTCSessionDescription;
  _RTCIceCandidate = w.RTCIceCandidate;
  WebRTCAvailable = true;
} catch {
  appLogger.debug("calls", "[CallContext] react-native-webrtc unavailable – using WS audio");
}


// ─── Voice chunk recording options ──────────────────────────────────────────
// Android → AAC_ADTS (.aac) — no MOOV atom, ~1.8KB per 600ms, ExoPlayer native
// iOS     → LinearPCM  (.wav) — RIFF header only, ~8KB per 600ms, ExoPlayer+AVFoundation native
const CHUNK_EXT = Platform.OS === "android" ? ".aac" : ".wav";

const CHUNK_OPTIONS = {
  android: {
    extension: ".aac",
    outputFormat: Audio.AndroidOutputFormat.AAC_ADTS,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: ".wav",
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    sampleRate: 16000,         // wideband quality, matches Android
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

// The backend owns fallback-audio tuning so deployments can adjust it without
// rebuilding the mobile app. These limits are only safe client-side guards.
const DEFAULT_FALLBACK_CHUNK_MS = 800;
const MIN_FALLBACK_CHUNK_MS = 300;
const MAX_FALLBACK_CHUNK_MS = 2_000;

function normalizeFallbackChunkMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_FALLBACK_CHUNK_MS;
  return Math.min(MAX_FALLBACK_CHUNK_MS, Math.max(MIN_FALLBACK_CHUNK_MS, Math.round(parsed)));
}

function fallbackPollIntervalMs(chunkMs: number): number {
  return Math.min(500, Math.max(100, Math.floor(chunkMs / 3)));
}

// Outgoing call timeout — auto-cancel if receiver doesn't answer within 35s.
// Matches the server-side 35s incoming call expiry so both sides agree.
const OUTGOING_CALL_TIMEOUT_MS = 35_000;

// Incoming call poll is paused when app is backgrounded to save battery.
// It resumes immediately when the app comes back to the foreground.
// During a live call we keep polling even in background so hangup is detected.

// ─── Types ────────────────────────────────────────────────────────────────────
export type CallState = "idle" | "incoming" | "outgoing" | "active" | "ended";

export interface ActiveCall {
  callId: string;
  callerId: string;
  callerName: string;
  callerInitials: string;
  callerColor?: string;
  service?: string;
  direction: "incoming" | "outgoing";
  state: CallState;
  startedAt?: number;
  offer?: string;
}

interface CallContextType {
  activeCall: ActiveCall | null;
  callDuration: number;
  isMuted: boolean;
  isSpeaker: boolean;
  setMuted: (v: boolean) => void;
  setSpeaker: (v: boolean) => Promise<void>;
  startOutgoingCall: (receiverId: string, receiverName: string, service?: string, receiverColor?: string) => Promise<void>;
  simulateIncomingCall: (callerName: string, service?: string) => void;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall outside CallProvider");
  return ctx;
}

// ─── Incoming Call Overlay ────────────────────────────────────────────────────
function IncomingCallOverlay({ call, onAccept, onReject }: {
  call: ActiveCall;
  onAccept: () => void;
  onReject: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createCallStyles(theme), [theme]);
  const slideAnim = useRef(new Animated.Value(-220)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: insets.top + 8, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.incomingOverlay, { transform: [{ translateY: slideAnim }] }]}>
      <LinearGradient colors={[theme.colors.background, theme.colors.surfaceAlt, theme.colors.primaryPressed]} style={styles.incomingGrad}>
        <View style={styles.incomingTop}>
          <Text style={styles.incomingLabel}>INCOMING CALL</Text>
          <View style={styles.incomingRingRow}>
            <View style={styles.incomingRingDot} />
            <Text style={styles.incomingRingText}>RINGING</Text>
          </View>
        </View>
        <View style={styles.callerSection}>
          <View style={[styles.callerAvatar, { backgroundColor: call.callerColor || theme.colors.primary }]}>
            <Text style={styles.callerAvatarText}>{call.callerInitials}</Text>
          </View>
          <Text style={styles.callerName}>{call.callerName}</Text>
          {call.service && <Text style={styles.callerService}>{call.service}</Text>}
          <Text style={styles.callerSubtitle}>{`${brandConfig.displayName} ${brandConfig.descriptor}`}</Text>
        </View>
        <View style={styles.callActions}>
          <View style={{ width: 80, alignItems: "center" }}>
            <Pressable style={styles.rejectCircle} onPress={onReject}>
              <View style={styles.rejectCircleInner}>
                <Icon name="phone-off" size={26} color={theme.colors.white} />
              </View>
            </Pressable>
            <Text style={styles.callActionLabel}>Decline</Text>
          </View>
          <View style={styles.callRipple}>
            <View style={styles.callRipple2} />
            <Pressable style={styles.acceptCircle} onPress={onAccept}>
              <Icon name="phone" size={26} color={theme.colors.white} />
            </Pressable>
          </View>
          <View style={{ width: 80, alignItems: "center" }}>
            <Text style={styles.callActionLabel}>Accept</Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Active Call Banner ───────────────────────────────────────────────────────
function ActiveCallBanner({ call, duration, onEnd }: {
  call: ActiveCall;
  duration: number;
  onEnd: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createCallStyles(theme), [theme]);

  function fmt(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  return (
    <Pressable style={styles.activeBanner} onPress={() => router.push("/call" as any)}>
      <View style={styles.activeLiveDot} />
      <View style={styles.activeCaller}>
        <View style={[styles.activeAvatar, { backgroundColor: call.callerColor || theme.colors.primary }]}>
          <Text style={styles.activeAvatarText}>{call.callerInitials}</Text>
        </View>
        <View>
          <Text style={styles.activeName}>{call.callerName}</Text>
          <Text style={styles.activeTimer}>{fmt(duration)}</Text>
        </View>
      </View>
      <Pressable style={styles.endBannerBtn} onPress={onEnd}>
        <Icon name="phone-off" size={16} color={theme.colors.white} />
      </Pressable>
    </Pressable>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const iceConfigurationRef = useRef<{ iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> }>({ iceServers: [] });
  const fallbackChunkMsRef = useRef(DEFAULT_FALLBACK_CHUNK_MS);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setMutedState] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  // Wrap setMuted so it always updates both the ref (used in recording loop) and state.
  const setMuted = useCallback((v: boolean) => {
    mutedRef.current = v;
    setMutedState(v);
    try {
      localStreamRef.current?.getAudioTracks?.().forEach((track: any) => {
        track.enabled = !v;
      });
    } catch (error) {
      appLogger.warn("calls", "[CallContext] unable to update microphone track", error);
    }
  }, []);

  // Toggle loudspeaker routing via Audio.setAudioModeAsync.
  // On Android, playThroughEarpieceAndroid=false routes to loudspeaker.
  // On iOS, the same is achieved by setting the output to the default speaker.
  const setSpeaker = useCallback(async (on: boolean) => {
    setIsSpeaker(on);
    try {
      await soundService.setCallSpeakerMode(on);
    } catch (e) {
      appLogger.warn("calls", "[CallContext] setSpeaker error:", e);
    }
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outgoingStatusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const candidatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Watches the live call status while active — detects remote hangup on both sides.
  const activeCallWatcherRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Auto-cancel outgoing call if unanswered after OUTGOING_CALL_TIMEOUT_MS.
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const mutedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // WebRTC refs
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);
  const rtcConnectedRef = useRef(false);
  const rtcFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalingCallIdRef = useRef<string | null>(null);
  const pendingLocalCandidatesRef = useRef<any[]>([]);
  const appliedCalleeCandRef = useRef(0);
  const appliedCallerCandRef = useRef(0);

  // HTTP audio streaming refs
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isStreamingRef = useRef(false);
  const playQueueRef = useRef<{ data: string; ext: string }[]>([]);
  const isPlayingRef = useRef(false);
  const nextFetchIndexRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      [timerRef, incomingPollRef, outgoingStatusPollRef, candidatePollRef, activeCallWatcherRef].forEach((r) => {
        if (r.current) clearInterval(r.current);
      });
      if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
      if (rtcFallbackTimerRef.current) clearTimeout(rtcFallbackTimerRef.current);
      soundService.stopRingtone();
      closePeerConnection();
      stopVoiceStreaming();
    };
  }, []);

  // Ringtone + call timer management
  useEffect(() => {
    const state = activeCall?.state;
    appLogger.debug("calls", "[CallContext] state changed →", state, "callId:", activeCall?.callId);
    if ((state === "incoming" || state === "outgoing") && appStateRef.current === "active") {
      soundService.startRingtone().catch(() => {});
    } else {
      soundService.stopRingtone().catch(() => {});
    }
    if (state === "active") {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
      const callId = activeCall?.callId;
      appLogger.debug("calls", "[CallContext] Call active, starting voice streaming for:", callId);
      if (callId) {
        void soundService.setCallSpeakerMode(isSpeaker);
        // WebRTC owns the microphone when available. Start the authenticated
        // HTTP fallback only when RTC is unavailable or fails to connect.
        if (!WebRTCAvailable || !pcRef.current) {
          startVoiceStreaming(callId);
        } else {
          if (rtcFallbackTimerRef.current) clearTimeout(rtcFallbackTimerRef.current);
          rtcFallbackTimerRef.current = setTimeout(() => {
            if (!rtcConnectedRef.current && activeCallRef.current?.state === "active") {
              appLogger.warn("calls", "[CallContext] WebRTC connection timed out; activating audio fallback");
              closePeerConnection();
              startVoiceStreaming(callId);
            }
          }, 8_000);
        }
      }

      // Poll every 2s to detect when the remote side ends the call.
      if (activeCallWatcherRef.current) clearInterval(activeCallWatcherRef.current);
      if (callId) {
        activeCallWatcherRef.current = setInterval(async () => {
          try {
            const res = await api.getCallStatus(callId);
            const status = (res.call as any)?.status;
            if (status === "ended" || status === "rejected") {
              clearInterval(activeCallWatcherRef.current!);
              activeCallWatcherRef.current = null;
              if (candidatePollRef.current) clearInterval(candidatePollRef.current);
              closePeerConnection();
              stopVoiceStreaming();
              setActiveCall(null);
              setCallDuration(0);
            }
          } catch {}
        }, 2000);
      }
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (activeCallWatcherRef.current) { clearInterval(activeCallWatcherRef.current); activeCallWatcherRef.current = null; }
      if (state !== "incoming" && state !== "outgoing") {
        stopVoiceStreaming();
      }
    }
  }, [activeCall?.state]);

  useEffect(() => {
    if (!user) {
      iceConfigurationRef.current = { iceServers: [] };
      fallbackChunkMsRef.current = DEFAULT_FALLBACK_CHUNK_MS;
      return;
    }

    let active = true;
    api.getCallConfig()
      .then((configuration) => {
        if (!active || !Array.isArray(configuration.iceServers)) return;
        const iceServers = configuration.iceServers.filter((server) => {
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
          return urls.some((url) => typeof url === "string" && /^(stun|turn|turns):/i.test(url));
        });
        iceConfigurationRef.current = { iceServers };
        fallbackChunkMsRef.current = normalizeFallbackChunkMs(configuration.audio?.fallbackChunkMs);
      })
      .catch((error) => {
        appLogger.warn("calls", "[CallContext] Unable to load ICE configuration; using authenticated audio fallback", error);
        iceConfigurationRef.current = { iceServers: [] };
        fallbackChunkMsRef.current = DEFAULT_FALLBACK_CHUNK_MS;
      });

    return () => { active = false; };
  }, [user?.id]);

  // ── WebRTC helpers ──────────────────────────────────────────────────────────
  function closePeerConnection() {
    try { localStreamRef.current?.getTracks().forEach((t: any) => t.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    if (rtcFallbackTimerRef.current) { clearTimeout(rtcFallbackTimerRef.current); rtcFallbackTimerRef.current = null; }
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pcRef.current = null;
    rtcConnectedRef.current = false;
    signalingCallIdRef.current = null;
    pendingLocalCandidatesRef.current = [];
    appliedCalleeCandRef.current = 0;
    appliedCallerCandRef.current = 0;
  }

  async function flushPendingLocalCandidates(callId: string, role: "caller" | "callee") {
    signalingCallIdRef.current = callId;
    const queued = pendingLocalCandidatesRef.current.splice(0);
    for (const candidate of queued) {
      try { await api.addIceCandidate(callId, candidate, role); } catch (error) {
        appLogger.warn("calls", "[CallContext] unable to upload queued ICE candidate", error);
      }
    }
  }

  async function createPeerConnection(callId: string | null, role: "caller" | "callee") {
    if (!WebRTCAvailable) return null;
    signalingCallIdRef.current = callId;
    pendingLocalCandidatesRef.current = [];
    rtcConnectedRef.current = false;
    const pc = new _RTCPeerConnection(iceConfigurationRef.current);
    pcRef.current = pc;
    pc.onicecandidate = async (event: any) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      const resolvedCallId = signalingCallIdRef.current;
      if (!resolvedCallId) {
        pendingLocalCandidatesRef.current.push(candidate);
        return;
      }
      try { await api.addIceCandidate(resolvedCallId, candidate, role); } catch (error) {
        appLogger.warn("calls", "[CallContext] unable to upload ICE candidate", error);
      }
    };
    pc.ontrack = (event: any) => {
      remoteStreamRef.current = event.streams?.[0] || remoteStreamRef.current;
      appLogger.debug("calls", "[CallContext] remote audio track received");
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        rtcConnectedRef.current = true;
        if (rtcFallbackTimerRef.current) { clearTimeout(rtcFallbackTimerRef.current); rtcFallbackTimerRef.current = null; }
        if (isStreamingRef.current) stopVoiceStreaming();
        void soundService.setCallSpeakerMode(isSpeaker);
      } else if (state === "failed") {
        rtcConnectedRef.current = false;
        const callIdForFallback = activeCallRef.current?.callId;
        closePeerConnection();
        if (callIdForFallback && activeCallRef.current?.state === "active") startVoiceStreaming(callIdForFallback);
      }
      // `disconnected` can be transient during network switching. The server
      // status watcher remains authoritative for ending the call.
    };
    return pc;
  }

  function startCandidatePolling(callId: string, role: "caller" | "callee") {
    if (candidatePollRef.current) clearInterval(candidatePollRef.current);
    candidatePollRef.current = setInterval(async () => {
      if (!pcRef.current) { clearInterval(candidatePollRef.current!); return; }
      try {
        const res = await api.getCallStatus(callId);
        const call = res.call as any;
        if (!call) return;
        const remoteCands: any[] = JSON.parse(
          role === "caller" ? (call.calleeCandidates || "[]") : (call.callerCandidates || "[]")
        );
        const applied = role === "caller" ? appliedCalleeCandRef.current : appliedCallerCandRef.current;
        for (let i = applied; i < remoteCands.length; i++) {
          try { await pcRef.current.addIceCandidate(new _RTCIceCandidate(remoteCands[i])); } catch {}
        }
        if (role === "caller") appliedCalleeCandRef.current = remoteCands.length;
        else appliedCallerCandRef.current = remoteCands.length;
      } catch {}
    }, 2000);
  }

  // ── HTTP-based voice streaming (works through all proxies) ──────────────────
  async function startVoiceStreaming(callId: string) {
    if (isStreamingRef.current) return;
    appLogger.debug("calls", "[Voice] startVoiceStreaming callId:", callId, "platform:", Platform.OS);

    activeCallIdRef.current = callId;
    nextFetchIndexRef.current = 0;
    isStreamingRef.current = true;
    playQueueRef.current = [];
    isPlayingRef.current = false;

    if (Platform.OS !== "web") {
      // Request mic permission
      try {
        const { granted, canAskAgain } = await Audio.requestPermissionsAsync();
        if (!granted) {
          isStreamingRef.current = false;
          Alert.alert(
            "Microphone Required",
            canAskAgain
              ? `${brandConfig.displayName} needs microphone access to make voice calls. Please allow when prompted.`
              : `Microphone access is blocked. Go to Settings → ${brandConfig.displayName} → allow Microphone to enable calls.`,
            canAskAgain
              ? [{ text: "OK" }]
              : [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Open Settings",
                    onPress: () => {
                      const { Linking } = require("react-native");
                      Linking.openSettings();
                    },
                  },
                ]
          );
          return;
        }
      } catch (e) {
        appLogger.warn("calls", "[Voice] Permission error:", e);
      }

      try { await soundService.setRecordingMode(true); } catch {}
      recordNextChunk(callId);
    }

    // Start receiving loop (works on all platforms)
    schedulePoll(callId);
  }

  function stopVoiceStreaming() {
    appLogger.debug("calls", "[Voice] stopVoiceStreaming");
    isStreamingRef.current = false;
    activeCallIdRef.current = null;

    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }

    if (recordingRef.current) {
      try { recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }

    playQueueRef.current = [];
    isPlayingRef.current = false;

    try { soundService.setRecordingMode(false); } catch {}
  }

  // ── Record + upload loop ─────────────────────────────────────────────────────
  async function recordNextChunk(callId: string) {
    if (!isStreamingRef.current || activeCallIdRef.current !== callId) return;
    if (mutedRef.current) {
      setTimeout(() => recordNextChunk(callId), 300);
      return;
    }

    try {
      const { recording: rec } = await Audio.Recording.createAsync(CHUNK_OPTIONS as any);
      recordingRef.current = rec;

      const chunkDurationMs = fallbackChunkMsRef.current;
      await new Promise<void>((r) => setTimeout(r, chunkDurationMs));

      if (!isStreamingRef.current || activeCallIdRef.current !== callId) {
        try { await rec.stopAndUnloadAsync(); } catch {}
        return;
      }

      await rec.stopAndUnloadAsync();
      recordingRef.current = null;
      const uri = rec.getURI();

      if (uri) {
        try {
          const b64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await api.uploadAudioChunk(callId, b64, CHUNK_EXT);
          appLogger.debug("calls", "[Voice] Uploaded chunk ext:", CHUNK_EXT, "len:", b64.length);
        } catch (e) {
          appLogger.warn("calls", "[Voice] Upload error:", e);
        }
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
      }
    } catch (e) {
      appLogger.warn("calls", "[Voice] Record error:", e);
      recordingRef.current = null;
      await new Promise<void>((r) => setTimeout(r, 500));
    }

    if (isStreamingRef.current && activeCallIdRef.current === callId) {
      recordNextChunk(callId);
    }
  }

  // ── Poll + play loop ─────────────────────────────────────────────────────────
  function schedulePoll(callId: string) {
    if (!isStreamingRef.current || activeCallIdRef.current !== callId) return;
    pollTimerRef.current = setTimeout(
      () => pollChunks(callId),
      fallbackPollIntervalMs(fallbackChunkMsRef.current),
    );
  }

  async function pollChunks(callId: string) {
    if (!isStreamingRef.current || activeCallIdRef.current !== callId) return;
    try {
      const res = await api.fetchAudioChunks(callId, nextFetchIndexRef.current);
      const resAny = res as any;
      const chunks = Array.isArray(resAny.chunks) ? resAny.chunks : resAny.chunks?.chunks || [];
      if (chunks && chunks.length > 0) {
        // Update the index pointer
        for (const chunk of chunks) {
          if (chunk.index >= nextFetchIndexRef.current) {
            nextFetchIndexRef.current = chunk.index + 1;
          }
        }
        appLogger.debug("calls", "[Voice] Got", chunks.length, "chunks, next:", nextFetchIndexRef.current);
        // Keep only the LATEST chunk — drop everything older to avoid backlog/delay
        const latest = chunks[chunks.length - 1];
        playQueueRef.current = [{ data: latest.data, ext: latest.ext ?? ".m4a" }];
        if (!isPlayingRef.current) drainQueue();
      }
    } catch {}
    schedulePoll(callId);
  }

  // ── Playback queue ────────────────────────────────────────────────────────────
  function enqueueChunk(b64: string, ext = ".m4a") {
    playQueueRef.current.push({ data: b64, ext });
    if (!isPlayingRef.current) drainQueue();
  }

  async function drainQueue() {
    if (playQueueRef.current.length === 0) { isPlayingRef.current = false; return; }
    isPlayingRef.current = true;
    const { data, ext } = playQueueRef.current.shift()!;
    const androidHint = ext.replace(".", ""); // "m4a" | "aac"
    const tempUri = `${FileSystem.cacheDirectory}athoo_rx_${Date.now()}${ext}`;
    try {
      await FileSystem.writeAsStringAsync(tempUri, data, { encoding: FileSystem.EncodingType.Base64 });
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempUri, overrideFileExtensionAndroid: androidHint },
        { shouldPlay: true, volume: 1 }
      );

      let done = false;
      const advance = async () => {
        if (done) return;
        done = true;
        try { await sound.unloadAsync(); } catch {}
        try { await FileSystem.deleteAsync(tempUri, { idempotent: true }); } catch {}
        drainQueue();
      };

      // Safety: move on after chunk duration + small buffer if didJustFinish never fires (Android quirk)
      const safetyTimer = setTimeout(advance, fallbackChunkMsRef.current + 80);

      sound.setOnPlaybackStatusUpdate(async (s) => {
        if (s.isLoaded && s.didJustFinish) {
          clearTimeout(safetyTimer);
          advance();
        }
      });
    } catch (e) {
      appLogger.warn("calls", "[Voice] Chunk play error (ext:", ext, "):", e);
      try { await FileSystem.deleteAsync(tempUri, { idempotent: true }); } catch {}
      drainQueue();
    }
  }

  const presentIncomingCall = useCallback((rawCall: any) => {
    if (!rawCall?.id || activeCallRef.current) return;
    const initials = (rawCall.callerName || "??")
      .split(" ")
      .map((name: string) => name[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    setActiveCall({
      callId: rawCall.id,
      callerId: rawCall.callerId,
      callerName: rawCall.callerName || "Unknown",
      callerInitials: initials,
      callerColor: rawCall.callerColor || brandConfig.colors.secondary,
      service: rawCall.service,
      direction: "incoming",
      state: "incoming",
      offer: rawCall.offer || undefined,
    });
  }, []);

  // Realtime is the primary incoming-call channel. This removes the previous
  // two-second API loop that kept the mobile app and Render/Neon busy even when
  // no calls existed.
  useEffect(() => {
    if (!user) return;
    return realtime.on((message) => {
      if (message.type !== "call:incoming") return;
      presentIncomingCall(message.payload?.call);
    });
  }, [user, presentIncomingCall]);

  // A conservative foreground-only poll remains as recovery for sleeping mobile
  // sockets. It runs immediately on login/foreground and then every 30 seconds,
  // rather than every two seconds.
  useEffect(() => {
    if (!user) {
      if (incomingPollRef.current) clearInterval(incomingPollRef.current);
      incomingPollRef.current = null;
      return;
    }

    async function checkIncoming() {
      if (appStateRef.current !== "active" || activeCallRef.current) return;
      try {
        const response = await api.getIncomingCall();
        presentIncomingCall(response.call);
      } catch {
        // A fallback poll must never destabilize the active session.
      }
    }

    void checkIncoming();
    incomingPollRef.current = setInterval(checkIncoming, 30_000);

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      appStateRef.current = next;
      const state = activeCallRef.current?.state;
      if (next === "active") {
        if (state === "incoming" || state === "outgoing") {
          soundService.startRingtone().catch(() => {});
        }
        void checkIncoming();
      } else {
        // Background/killed-app recovery is owned by the native call notification
        // channel. Stop app-managed audio to prevent a double ringtone.
        soundService.stopRingtone().catch(() => {});
      }
    });

    return () => {
      if (incomingPollRef.current) clearInterval(incomingPollRef.current);
      incomingPollRef.current = null;
      sub.remove();
    };
  }, [user, presentIncomingCall]);

  // ── Simulate incoming call ──────────────────────────────────────────────────
  const simulateIncomingCall = useCallback((callerName: string, service?: string) => {
    const initials = callerName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    setActiveCall({
      callId: Date.now().toString(),
      callerId: "sim_" + Date.now(),
      callerName,
      callerInitials: initials,
      callerColor: brandConfig.colors.secondary,
      service,
      direction: "incoming",
      state: "incoming",
    });
  }, []);

  // ── Start outgoing call ─────────────────────────────────────────────────────
  const startOutgoingCall = useCallback(async (
    receiverId: string, receiverName: string, service?: string, receiverColor?: string
  ) => {
    if (!user) return;
    const myInitials = (user.name || "Me").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    const receiverInitials = receiverName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

    let offerSdp: string | undefined;
    if (WebRTCAvailable) {
      try {
        const pc = await createPeerConnection(null, "caller");
        if (pc) {
          await soundService.setCallSpeakerMode(isSpeaker);
          const stream = await (require("react-native-webrtc").mediaDevices.getUserMedia)({ audio: true, video: false });
          if (stream) { localStreamRef.current = stream; stream.getTracks().forEach((t: any) => pc.addTrack(t, stream)); }
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          offerSdp = JSON.stringify(offer);
        }
      } catch {}
    }

    try {
      const res = await api.startCall({
        receiverId,
        callerName: user.name,
        callerInitials: myInitials,
        callerColor: (user as any).profileColor || brandConfig.colors.primary,
        service,
        offer: offerSdp,
      });
      const call = res.call as any;
      if (pcRef.current && WebRTCAvailable) await flushPendingLocalCandidates(call.id, "caller");

      setActiveCall({
        callId: call.id,
        callerId: user.id,
        callerName: receiverName,
        callerInitials: receiverInitials,
        callerColor: receiverColor || brandConfig.colors.primary,
        service,
        direction: "outgoing",
        state: "outgoing",
      });
      try { router.push("/call" as any); } catch {}

      if (outgoingStatusPollRef.current) clearInterval(outgoingStatusPollRef.current);
      let answerApplied = false;

      // Auto-cancel if receiver doesn't answer within timeout
      if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = setTimeout(async () => {
        if (activeCallRef.current?.state === "outgoing") {
          if (outgoingStatusPollRef.current) clearInterval(outgoingStatusPollRef.current);
          try { await api.endCall(call.id); } catch {}
          closePeerConnection();
          setActiveCall(null);
          setCallDuration(0);
          Alert.alert("No Answer", "The other person didn't pick up. Please try again.");
        }
      }, OUTGOING_CALL_TIMEOUT_MS);

      outgoingStatusPollRef.current = setInterval(async () => {
        try {
          const statusRes = await api.getCallStatus(call.id);
          const callData = statusRes.call as any;
          const status = callData?.status;

          if (!answerApplied && callData?.answer && pcRef.current && WebRTCAvailable) {
            try {
              await pcRef.current.setRemoteDescription(new _RTCSessionDescription(JSON.parse(callData.answer)));
              answerApplied = true;
              startCandidatePolling(call.id, "caller");
            } catch {}
          }

          if (status === "active") {
            if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null; }
            setActiveCall((p) => p ? { ...p, state: "active", startedAt: Date.now() } : null);
            clearInterval(outgoingStatusPollRef.current!);
          } else if (status === "rejected" || status === "ended") {
            if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null; }
            setActiveCall(null);
            setCallDuration(0);
            clearInterval(outgoingStatusPollRef.current!);
            if (candidatePollRef.current) clearInterval(candidatePollRef.current);
            closePeerConnection();
            if (status === "rejected") Alert.alert("Call Declined", "The other person declined the call.");
          }
        } catch {}
      }, 1000);

    } catch (err) {
      closePeerConnection();
      Alert.alert("Call Failed", apiErrorToMessage(err, "Unable to connect the call. Please check your connection and try again."));
    }
  }, [user]);

  // ── Accept incoming call ────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current) return;

    let answerSdp: string | undefined;
    if (WebRTCAvailable && current.offer) {
      try {
        const pc = await createPeerConnection(current.callId, "callee");
        if (pc) {
          await pc.setRemoteDescription(new _RTCSessionDescription(JSON.parse(current.offer)));
          await soundService.setCallSpeakerMode(isSpeaker);
          const stream = await (require("react-native-webrtc").mediaDevices.getUserMedia)({ audio: true, video: false });
          if (stream) { localStreamRef.current = stream; stream.getTracks().forEach((t: any) => pc.addTrack(t, stream)); }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          answerSdp = JSON.stringify(answer);
          await flushPendingLocalCandidates(current.callId, "callee");
          startCandidatePolling(current.callId, "callee");
        }
      } catch {}
    }

    try {
      await api.acceptCall(current.callId, { answer: answerSdp });
    } catch (error) {
      closePeerConnection();
      Alert.alert("Call Failed", apiErrorToMessage(error, "The call could not be accepted."));
      return;
    }

    setActiveCall((p) => p ? { ...p, state: "active", startedAt: Date.now() } : null);
    try { router.push("/call" as any); } catch {}
  }, []);

  // ── Reject call ─────────────────────────────────────────────────────────────
  const rejectCall = useCallback(async () => {
    if (activeCallRef.current?.callId) {
      try { await api.rejectCall(activeCallRef.current.callId); } catch {}
    }
    if (candidatePollRef.current) clearInterval(candidatePollRef.current);
    closePeerConnection();
    stopVoiceStreaming();
    setActiveCall(null);
    setCallDuration(0);
  }, []);

  // ── End call ─────────────────────────────────────────────────────────────────
  const endCall = useCallback(async () => {
    const callId = activeCallRef.current?.callId;
    // Clear all timers immediately so no more status polls fire
    if (outgoingStatusPollRef.current) { clearInterval(outgoingStatusPollRef.current); outgoingStatusPollRef.current = null; }
    if (candidatePollRef.current) { clearInterval(candidatePollRef.current); candidatePollRef.current = null; }
    if (activeCallWatcherRef.current) { clearInterval(activeCallWatcherRef.current); activeCallWatcherRef.current = null; }
    if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null; }
    // Stop media before network call so the mic releases immediately
    closePeerConnection();
    stopVoiceStreaming();
    // Tell server the call ended — do this BEFORE clearing state so activeCallRef.current
    // is still populated if the API call is synchronous on the event loop.
    if (callId) {
      try { await api.endCall(callId); } catch {}
    }
    setActiveCall(null);
    setCallDuration(0);
    soundService.playSuccess();
  }, []);

  return (
    <CallContext.Provider value={{ activeCall, callDuration, isMuted, isSpeaker, setMuted, setSpeaker, startOutgoingCall, simulateIncomingCall, acceptCall, rejectCall, endCall }}>
      {children}
      {activeCall?.state === "incoming" && (
        <IncomingCallOverlay call={activeCall} onAccept={acceptCall} onReject={rejectCall} />
      )}
      {activeCall?.state === "active" && (
        <ActiveCallBanner call={activeCall} duration={callDuration} onEnd={endCall} />
      )}
    </CallContext.Provider>
  );
}

const createCallStyles = (theme: AthooTheme) => StyleSheet.create({
  incomingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999,
    shadowColor: theme.colors.overlay, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 30,
  },
  incomingGrad: {
    marginHorizontal: 12, borderRadius: 24, overflow: "hidden",
    paddingHorizontal: 20, paddingBottom: 28, paddingTop: 16,
  },
  incomingTop: { alignItems: "center", gap: 6, marginBottom: 20 },
  incomingLabel: { fontSize: 13, color: theme.colors.white + "99", fontWeight: "600", letterSpacing: 1 },
  incomingRingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  incomingRingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  incomingRingText: { fontSize: 12, color: theme.colors.success, fontWeight: "700" },
  callerSection: { alignItems: "center", gap: 8, marginBottom: 24 },
  callerAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: theme.colors.white + "4D" },
  callerAvatarText: { fontSize: 30, fontWeight: "800", color: theme.colors.white },
  callerName: { fontSize: 24, fontWeight: "800", color: theme.colors.white },
  callerService: { fontSize: 14, color: theme.colors.white + "B3", fontWeight: "500" },
  callerSubtitle: { fontSize: 11, color: theme.colors.white + "73", marginTop: 2 },
  callActions: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start" },
  rejectCircle: { alignItems: "center", gap: 8 },
  acceptCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.success, alignItems: "center", justifyContent: "center" },
  callRipple: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.success + "33", alignItems: "center", justifyContent: "center" },
  callRipple2: { ...StyleSheet.absoluteFillObject, borderRadius: 44, backgroundColor: theme.colors.success + "1A", margin: -6 },
  callActionLabel: { fontSize: 12, color: theme.colors.white + "B3", fontWeight: "600" },
  rejectCircleInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center" },
  activeBanner: {
    position: "absolute", top: Platform.OS === "web" ? 67 : 54, left: 12, right: 12, zIndex: 8888,
    backgroundColor: theme.colors.success, borderRadius: 16, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    shadowColor: theme.colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 20,
  },
  activeLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.white },
  activeCaller: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  activeAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  activeAvatarText: { fontSize: 12, fontWeight: "700", color: theme.colors.white },
  activeName: { fontSize: 13, fontWeight: "700", color: theme.colors.white },
  activeTimer: { fontSize: 12, color: theme.colors.white + "D9" },
  endBannerBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center" },
});

