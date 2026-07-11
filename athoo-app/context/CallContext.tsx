import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { Icon } from "@/components/ui/Icon";
import { soundService } from "@/services/SoundService";
import { api } from "@/services/api";
import { useAuth } from "./AuthContext";

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
  console.log("[CallContext] react-native-webrtc unavailable – using WS audio");
}

const STUN = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

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

// Chunk duration: how long each mic recording is
const CHUNK_DURATION_MS = 600;
// Poll interval: how often we ask the server for new chunks from the other side.
// Must be LESS than CHUNK_DURATION_MS so the queue stays filled and there are no gaps.
const POLL_INTERVAL_MS = 200;

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
  const slideAnim = useRef(new Animated.Value(-220)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: insets.top + 8, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.incomingOverlay, { transform: [{ translateY: slideAnim }] }]}>
      <LinearGradient colors={["#1A1A2E", "#16213E", "#0F3460"]} style={styles.incomingGrad}>
        <View style={styles.incomingTop}>
          <Text style={styles.incomingLabel}>INCOMING CALL</Text>
          <View style={styles.incomingRingRow}>
            <View style={styles.incomingRingDot} />
            <Text style={styles.incomingRingText}>RINGING</Text>
          </View>
        </View>
        <View style={styles.callerSection}>
          <View style={[styles.callerAvatar, { backgroundColor: call.callerColor || "#1A6EE0" }]}>
            <Text style={styles.callerAvatarText}>{call.callerInitials}</Text>
          </View>
          <Text style={styles.callerName}>{call.callerName}</Text>
          {call.service && <Text style={styles.callerService}>{call.service}</Text>}
          <Text style={styles.callerSubtitle}>Athoo Home Services</Text>
        </View>
        <View style={styles.callActions}>
          <View style={{ width: 80, alignItems: "center" }}>
            <Pressable style={styles.rejectCircle} onPress={onReject}>
              <View style={styles.rejectCircleInner}>
                <Icon name="phone-off" size={26} color="#fff" />
              </View>
            </Pressable>
            <Text style={styles.callActionLabel}>Decline</Text>
          </View>
          <View style={styles.callRipple}>
            <View style={styles.callRipple2} />
            <Pressable style={styles.acceptCircle} onPress={onAccept}>
              <Icon name="phone" size={26} color="#fff" />
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
  function fmt(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  return (
    <Pressable style={styles.activeBanner} onPress={() => router.push("/call" as any)}>
      <View style={styles.activeLiveDot} />
      <View style={styles.activeCaller}>
        <View style={[styles.activeAvatar, { backgroundColor: call.callerColor || "#1A6EE0" }]}>
          <Text style={styles.activeAvatarText}>{call.callerInitials}</Text>
        </View>
        <View>
          <Text style={styles.activeName}>{call.callerName}</Text>
          <Text style={styles.activeTimer}>{fmt(duration)}</Text>
        </View>
      </View>
      <Pressable style={styles.endBannerBtn} onPress={onEnd}>
        <Icon name="phone-off" size={16} color="#fff" />
      </Pressable>
    </Pressable>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setMutedState] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  // Wrap setMuted so it always updates both the ref (used in recording loop) and state.
  const setMuted = useCallback((v: boolean) => {
    mutedRef.current = v;
    setMutedState(v);
  }, []);

  // Toggle loudspeaker routing via Audio.setAudioModeAsync.
  // On Android, playThroughEarpieceAndroid=false routes to loudspeaker.
  // On iOS, the same is achieved by setting the output to the default speaker.
  const setSpeaker = useCallback(async (on: boolean) => {
    setIsSpeaker(on);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        // false = loudspeaker, true = earpiece
        playThroughEarpieceAndroid: !on,
        interruptionModeIOS: (Audio as any).INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS ?? 2,
        interruptionModeAndroid: (Audio as any).INTERRUPTION_MODE_ANDROID_DUCK_OTHERS ?? 2,
      });
    } catch (e) {
      console.warn("[CallContext] setSpeaker error:", e);
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
      soundService.stopRingtone();
      closePeerConnection();
      stopVoiceStreaming();
    };
  }, []);

  // Ringtone + call timer management
  useEffect(() => {
    const state = activeCall?.state;
    console.log("[CallContext] state changed →", state, "callId:", activeCall?.callId);
    if (state === "incoming" || state === "outgoing") {
      soundService.startRingtone();
    } else {
      soundService.stopRingtone();
    }
    if (state === "active") {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
      const callId = activeCall?.callId;
      console.log("[CallContext] Call active, starting voice streaming for:", callId);
      if (callId) startVoiceStreaming(callId);

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

  // ── WebRTC helpers ──────────────────────────────────────────────────────────
  function closePeerConnection() {
    try { localStreamRef.current?.getTracks().forEach((t: any) => t.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    localStreamRef.current = null;
    pcRef.current = null;
    appliedCalleeCandRef.current = 0;
    appliedCallerCandRef.current = 0;
  }

  async function createPeerConnection(callId: string, role: "caller" | "callee") {
    if (!WebRTCAvailable) return null;
    const pc = new _RTCPeerConnection(STUN);
    pcRef.current = pc;
    pc.onicecandidate = async (event: any) => {
      if (event.candidate) {
        try { await api.addIceCandidate(callId, event.candidate.toJSON(), role); } catch {}
      }
    };
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        setActiveCall((p) => p ? { ...p, state: "ended" } : null);
      }
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
    console.log("[Voice] startVoiceStreaming callId:", callId, "platform:", Platform.OS);

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
              ? "Athoo needs microphone access to make voice calls. Please allow when prompted."
              : "Microphone access is blocked. Go to Settings → Athoo → allow Microphone to enable calls.",
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
        console.warn("[Voice] Permission error:", e);
      }

      try { await soundService.setRecordingMode(true); } catch {}
      recordNextChunk(callId);
    }

    // Start receiving loop (works on all platforms)
    schedulePoll(callId);
  }

  function stopVoiceStreaming() {
    console.log("[Voice] stopVoiceStreaming");
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

      await new Promise<void>((r) => setTimeout(r, CHUNK_DURATION_MS));

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
          console.log("[Voice] Uploaded chunk ext:", CHUNK_EXT, "len:", b64.length);
        } catch (e) {
          console.warn("[Voice] Upload error:", e);
        }
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
      }
    } catch (e) {
      console.warn("[Voice] Record error:", e);
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
    pollTimerRef.current = setTimeout(() => pollChunks(callId), POLL_INTERVAL_MS);
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
        console.log("[Voice] Got", chunks.length, "chunks, next:", nextFetchIndexRef.current);
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
      const safetyTimer = setTimeout(advance, CHUNK_DURATION_MS + 80);

      sound.setOnPlaybackStatusUpdate(async (s) => {
        if (s.isLoaded && s.didJustFinish) {
          clearTimeout(safetyTimer);
          advance();
        }
      });
    } catch (e) {
      console.warn("[Voice] Chunk play error (ext:", ext, "):", e);
      try { await FileSystem.deleteAsync(tempUri, { idempotent: true }); } catch {}
      drainQueue();
    }
  }

  // ── Poll for incoming calls (every 2s when foregrounded, paused in background) ──
  useEffect(() => {
    if (!user) {
      if (incomingPollRef.current) clearInterval(incomingPollRef.current);
      return;
    }

    async function checkIncoming() {
      // Skip poll if app is not in foreground AND no active call in progress.
      // During an active call we still need to detect remote hangup in background.
      if (appStateRef.current !== "active" && !activeCallRef.current) return;
      if (activeCallRef.current) return; // already in a call
      try {
        const res = await api.getIncomingCall();
        if (!res.call) return;
        const c = res.call as any;
        const initials = (c.callerName || "??").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
        setActiveCall({
          callId: c.id,
          callerId: c.callerId,
          callerName: c.callerName || "Unknown",
          callerInitials: initials,
          callerColor: c.callerColor || "#FF6B1A",
          service: c.service,
          direction: "incoming",
          state: "incoming",
          offer: c.offer || undefined,
        });
      } catch {}
    }

    incomingPollRef.current = setInterval(checkIncoming, 2000);

    // Pause polling when backgrounded, resume when foregrounded
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      appStateRef.current = next;
    });

    return () => {
      if (incomingPollRef.current) clearInterval(incomingPollRef.current);
      sub.remove();
    };
  }, [user]);

  // ── Simulate incoming call ──────────────────────────────────────────────────
  const simulateIncomingCall = useCallback((callerName: string, service?: string) => {
    const initials = callerName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    setActiveCall({
      callId: Date.now().toString(),
      callerId: "sim_" + Date.now(),
      callerName,
      callerInitials: initials,
      callerColor: "#FF6B1A",
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
        const pc = await createPeerConnection("pending", "caller");
        if (pc) {
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
        callerColor: (user as any).profileColor || "#1A6EE0",
        service,
        offer: offerSdp,
      });
      const call = res.call as any;

      setActiveCall({
        callId: call.id,
        callerId: user.id,
        callerName: receiverName,
        callerInitials: receiverInitials,
        callerColor: receiverColor || "#1A6EE0",
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
      Alert.alert("Call Failed", "Unable to connect the call. Please check your connection and try again.");
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
          const stream = await (require("react-native-webrtc").mediaDevices.getUserMedia)({ audio: true, video: false });
          if (stream) { localStreamRef.current = stream; stream.getTracks().forEach((t: any) => pc.addTrack(t, stream)); }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          answerSdp = JSON.stringify(answer);
          startCandidatePolling(current.callId, "callee");
        }
      } catch {}
    }

    try { await api.acceptCall(current.callId, { answer: answerSdp }); } catch {}

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

const styles = StyleSheet.create({
  incomingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 30,
  },
  incomingGrad: {
    marginHorizontal: 12, borderRadius: 24, overflow: "hidden",
    paddingHorizontal: 20, paddingBottom: 28, paddingTop: 16,
  },
  incomingTop: { alignItems: "center", gap: 6, marginBottom: 20 },
  incomingLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "600", letterSpacing: 1 },
  incomingRingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  incomingRingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  incomingRingText: { fontSize: 12, color: "#22C55E", fontWeight: "700" },
  callerSection: { alignItems: "center", gap: 8, marginBottom: 24 },
  callerAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.3)" },
  callerAvatarText: { fontSize: 30, fontWeight: "800", color: "#fff" },
  callerName: { fontSize: 24, fontWeight: "800", color: "#fff" },
  callerService: { fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  callerSubtitle: { fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  callActions: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start" },
  rejectCircle: { alignItems: "center", gap: 8 },
  acceptCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" },
  callRipple: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(34,197,94,0.2)", alignItems: "center", justifyContent: "center" },
  callRipple2: { ...StyleSheet.absoluteFillObject, borderRadius: 44, backgroundColor: "rgba(34,197,94,0.1)", margin: -6 },
  callActionLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  rejectCircleInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  activeBanner: {
    position: "absolute", top: Platform.OS === "web" ? 67 : 54, left: 12, right: 12, zIndex: 8888,
    backgroundColor: "#22C55E", borderRadius: 16, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    shadowColor: "#22C55E", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 20,
  },
  activeLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  activeCaller: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  activeAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  activeAvatarText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  activeName: { fontSize: 13, fontWeight: "700", color: "#fff" },
  activeTimer: { fontSize: 12, color: "rgba(255,255,255,0.85)" },
  endBannerBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
});

