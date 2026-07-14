import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import { Platform } from "react-native";

// MP3 preferred — ExoPlayer (Android) handles MP3 natively from bundled assets.
// WAV caused "None of the available extractors" errors on Android in Expo Go.
const SOUND_MODULES = {
  ringtone:     require("../assets/sounds/athoo-ringtone.mp3"),
  message:      require("../assets/sounds/athoo-message.mp3"),
  notification: require("../assets/sounds/athoo-notification.mp3"),
  success:      require("../assets/sounds/athoo-success.mp3"),
};

type SoundKey = keyof typeof SOUND_MODULES;

// Web Audio fallback for web/Expo-Go environments where expo-av assets fail
function playWebTone(type: SoundKey) {
  try {
    const ctx = new (window as any).AudioContext();
    const master = ctx.createGain();
    master.connect(ctx.destination);

    function note(freq: number, start: number, dur: number, vol = 0.4) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.02);
    }

    if (type === "ringtone") {
      [0, 0.8].forEach((o) => {
        note(587.33, o + 0.00, 0.12);
        note(880,    o + 0.15, 0.12);
        note(1174.66,o + 0.30, 0.30, 0.5);
        note(783.99, o + 0.65, 0.10);
        note(1174.66,o + 0.78, 0.10);
        note(880,    o + 0.91, 0.25, 0.45);
      });
    } else if (type === "message") {
      note(1046.5, 0.00, 0.08, 0.35);
      note(784,    0.11, 0.14, 0.28);
    } else if (type === "notification") {
      note(1318.5, 0.00, 0.09, 0.32);
      note(1046.5, 0.12, 0.13, 0.25);
    } else {
      note(783.99, 0.00, 0.08, 0.35);
      note(987.77, 0.10, 0.08, 0.40);
      note(1174.66,0.20, 0.16, 0.45);
    }

    setTimeout(() => { try { ctx.close(); } catch {} }, 4000);
  } catch {}
}

class SoundService {
  private ringtoneSound: Audio.Sound | null = null;
  private ringtoneWebLoop: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  async init() {
    if (this.initialized) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
      this.initialized = true;
    } catch {}
  }

  async play(type: SoundKey) {
    if (Platform.OS === "web") { playWebTone(type); return; }
    try {
      await this.init();
      const { sound } = await Audio.Sound.createAsync(
        SOUND_MODULES[type],
        { shouldPlay: true, volume: type === "ringtone" ? 1.0 : 0.75 }
      );
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      console.warn("[SoundService] play error:", e);
    }
  }

  async startRingtone() {
    await this.stopRingtone();

    if (Platform.OS === "web") {
      const loop = () => {
        playWebTone("ringtone");
        this.ringtoneWebLoop = setTimeout(loop, 1900);
      };
      loop();
      return;
    }

    try {
      await this.init();
      const { sound } = await Audio.Sound.createAsync(
        SOUND_MODULES.ringtone,
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      this.ringtoneSound = sound;
    } catch (e) {
      console.warn("[SoundService] startRingtone error:", e);
    }
  }

  async stopRingtone() {
    if (this.ringtoneWebLoop) { clearTimeout(this.ringtoneWebLoop); this.ringtoneWebLoop = null; }
    if (this.ringtoneSound) {
      try { await this.ringtoneSound.stopAsync(); await this.ringtoneSound.unloadAsync(); } catch {}
      this.ringtoneSound = null;
    }
  }

  async setRecordingMode(on: boolean, speaker = false) {
    try {
      if (on) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          // false = loudspeaker, true = earpiece on Android. Keep default earpiece to reduce echo.
          playThroughEarpieceAndroid: !speaker,
          interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });
      }
    } catch {}
  }

  async setCallSpeakerMode(speaker: boolean) {
    await this.setRecordingMode(true, speaker);
  }

  async playNotification() { await this.play("notification"); }
  async playMessage()      { await this.play("message"); }
  async playSuccess()      { await this.play("success"); }
  async playRingtone()     { await this.play("ringtone"); }
}

export const soundService = new SoundService();

