import { appLogger } from "@/lib/logger";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import { Platform } from "react-native";

// In-app audio is separate from native notification-channel WAV assets. Native
// notification sounds are configured at build time; these bundled MP3s cover
// foreground call UI, web, Expo Go, success feedback, and recovery fallbacks.
const SOUND_MODULES = {
  ringtone: require("../assets/sounds/athoo-ringtone.mp3"),
  message: require("../assets/sounds/athoo-message.mp3"),
  notification: require("../assets/sounds/athoo-notification.mp3"),
  success: require("../assets/sounds/athoo-success.mp3"),
};

type SoundKey = keyof typeof SOUND_MODULES;

function playWebTone(type: SoundKey) {
  try {
    const ctx = new (window as any).AudioContext();
    const master = ctx.createGain();
    master.connect(ctx.destination);

    function note(freq: number, start: number, dur: number, vol = 0.4) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.02);
    }

    if (type === "ringtone") {
      [0, 0.8].forEach((offset) => {
        note(587.33, offset, 0.12);
        note(880, offset + 0.15, 0.12);
        note(1174.66, offset + 0.3, 0.3, 0.5);
        note(783.99, offset + 0.65, 0.1);
        note(1174.66, offset + 0.78, 0.1);
        note(880, offset + 0.91, 0.25, 0.45);
      });
    } else if (type === "message") {
      note(1046.5, 0, 0.08, 0.35);
      note(784, 0.11, 0.14, 0.28);
    } else if (type === "notification") {
      note(1318.5, 0, 0.09, 0.32);
      note(1046.5, 0.12, 0.13, 0.25);
    } else {
      note(783.99, 0, 0.08, 0.35);
      note(987.77, 0.1, 0.08, 0.4);
      note(1174.66, 0.2, 0.16, 0.45);
    }

    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 4000);
  } catch {}
}

class SoundService {
  private ringtoneSound: Audio.Sound | null = null;
  private ringtoneWebLoop: ReturnType<typeof setTimeout> | null = null;
  private oneShotSounds = new Set<Audio.Sound>();

  private async applyAlertAudioMode(): Promise<void> {
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

  async init(): Promise<void> {
    if (Platform.OS === "web") return;
    try {
      await this.applyAlertAudioMode();
    } catch (error) {
      appLogger.debug("sound", "Unable to initialize alert audio mode", error);
    }
  }

  async play(type: SoundKey): Promise<void> {
    if (Platform.OS === "web") {
      playWebTone(type);
      return;
    }

    try {
      await this.applyAlertAudioMode();
      const { sound } = await Audio.Sound.createAsync(SOUND_MODULES[type], {
        shouldPlay: true,
        volume: type === "ringtone" ? 1 : 0.78,
      });
      this.oneShotSounds.add(sound);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || !status.didJustFinish) return;
        this.oneShotSounds.delete(sound);
        sound.unloadAsync().catch(() => {});
      });
    } catch (error) {
      appLogger.warn("sound", `[SoundService] unable to play ${type}`, error);
    }
  }

  async startRingtone(): Promise<void> {
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
      await this.applyAlertAudioMode();
      const { sound } = await Audio.Sound.createAsync(SOUND_MODULES.ringtone, {
        shouldPlay: true,
        isLooping: true,
        volume: 1,
      });
      this.ringtoneSound = sound;
    } catch (error) {
      appLogger.warn("sound", "[SoundService] unable to start ringtone", error);
    }
  }

  async stopRingtone(): Promise<void> {
    if (this.ringtoneWebLoop) {
      clearTimeout(this.ringtoneWebLoop);
      this.ringtoneWebLoop = null;
    }
    const sound = this.ringtoneSound;
    this.ringtoneSound = null;
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {}
      try {
        await sound.unloadAsync();
      } catch {}
    }
  }

  async stopAllOneShotSounds(): Promise<void> {
    const sounds = Array.from(this.oneShotSounds);
    this.oneShotSounds.clear();
    await Promise.allSettled(
      sounds.map(async (sound) => {
        try {
          await sound.stopAsync();
        } catch {}
        try {
          await sound.unloadAsync();
        } catch {}
      }),
    );
  }

  async setRecordingMode(on: boolean, speaker = false): Promise<void> {
    try {
      if (on) {
        await this.stopRingtone();
        await this.stopAllOneShotSounds();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: !speaker,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });
      } else {
        await this.applyAlertAudioMode();
      }
    } catch (error) {
      appLogger.debug("sound", "Unable to change call audio mode", error);
    }
  }

  async setCallSpeakerMode(speaker: boolean): Promise<void> {
    await this.setRecordingMode(true, speaker);
  }

  async playNotification() {
    await this.play("notification");
  }
  async playMessage() {
    await this.play("message");
  }
  async playSuccess() {
    await this.play("success");
  }
  async playRingtone() {
    await this.play("ringtone");
  }
}

export const soundService = new SoundService();
