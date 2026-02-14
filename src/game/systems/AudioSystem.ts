import Phaser from 'phaser';
import { getUserSettings } from './UserSettings';

type BeepOptions = {
  frequency?: number;
  durationMs?: number;
  volume?: number;
  type?: OscillatorType;
};

type SweepOptions = {
  fromFrequency?: number;
  toFrequency?: number;
  durationMs?: number;
  volume?: number;
  type?: OscillatorType;
};

type MusicTrack = 'title' | 'overworld' | 'battle';

type AudioMixNodes = {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
};

const TRACK_STEP_MS = 220;

const TRACK_PATTERNS: Record<MusicTrack, number[]> = {
  title: [262, 392, 330, 392, 294, 440, 392, 330, 0, 262, 392, 330, 523, 440, 392, 0],
  overworld: [220, 247, 262, 294, 330, 294, 262, 247, 220, 247, 262, 247, 196, 220, 247, 0],
  battle: [196, 220, 247, 262, 247, 220, 196, 175, 196, 220, 262, 294, 262, 247, 220, 0]
};

const TRACK_WAVE: Record<MusicTrack, OscillatorType> = {
  title: 'triangle',
  overworld: 'square',
  battle: 'sawtooth'
};

export class AudioSystem {
  private readonly scene: Phaser.Scene;

  private context: AudioContext | null = null;

  private static context: AudioContext | null = null;

  private static mixNodes: AudioMixNodes | null = null;

  private static currentTrack: MusicTrack | null = null;

  private static trackStep = 0;

  private static trackTimerId: number | null = null;

  private static initialized = false;

  private readonly unlockHandler = () => {
    void this.unlock();
  };

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.context = AudioSystem.ensureAudioContext(this.scene);
    AudioSystem.ensureMixNodes(this.context);
    AudioSystem.applySettingsToMix();

    if (!AudioSystem.initialized) {
      AudioSystem.initialized = true;
      window.addEventListener('beforeunload', () => {
        AudioSystem.stopMusicLoop();
      });
    }

    this.scene.input.on('pointerdown', this.unlockHandler);
    this.scene.input.keyboard?.on('keydown', this.unlockHandler);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.input.off('pointerdown', this.unlockHandler);
      this.scene.input.keyboard?.off('keydown', this.unlockHandler);
    });
  }

  public static refreshSettings(): void {
    AudioSystem.applySettingsToMix();
    if (AudioSystem.currentTrack && !AudioSystem.trackTimerId) {
      AudioSystem.startMusicLoop(AudioSystem.currentTrack);
    }
  }

  public async unlock(): Promise<void> {
    if (!this.context) {
      return;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  public playMusic(track: MusicTrack): void {
    const { musicEnabled, musicVolume } = getUserSettings();
    AudioSystem.currentTrack = track;

    if (!musicEnabled || musicVolume <= 0.001) {
      AudioSystem.stopMusicLoop();
      return;
    }

    AudioSystem.startMusicLoop(track);
  }

  public stopMusic(): void {
    AudioSystem.stopMusicLoop();
    AudioSystem.currentTrack = null;
  }

  public playMenuMove(): void {
    this.beep({ frequency: 730, durationMs: 36, volume: 0.1, type: 'square' });
  }

  public playMenuConfirm(): void {
    this.beep({ frequency: 920, durationMs: 60, volume: 0.11, type: 'square' });
  }

  public playMenuBack(): void {
    this.beep({ frequency: 430, durationMs: 65, volume: 0.1, type: 'triangle' });
  }

  public beep(options: BeepOptions = {}): void {
    if (!this.context) {
      return;
    }

    const { frequency = 660, durationMs = 80, volume = 0.08, type = 'square' } = options;
    const nodes = AudioSystem.ensureMixNodes(this.context);
    if (!nodes) {
      return;
    }

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    const duration = durationMs / 1000;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(nodes.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  public sweep(options: SweepOptions = {}): void {
    if (!this.context) {
      return;
    }

    const {
      fromFrequency = 220,
      toFrequency = 980,
      durationMs = 180,
      volume = 0.09,
      type = 'sawtooth'
    } = options;

    const nodes = AudioSystem.ensureMixNodes(this.context);
    if (!nodes) {
      return;
    }

    const now = this.context.currentTime;
    const duration = durationMs / 1000;
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(toFrequency, now + duration);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(volume, now + duration * 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(nodes.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private static ensureAudioContext(scene: Phaser.Scene): AudioContext | null {
    if (AudioSystem.context) {
      return AudioSystem.context;
    }

    const soundManager = scene.sound as Phaser.Sound.BaseSoundManager & {
      context?: AudioContext;
    };

    if (soundManager.context instanceof AudioContext) {
      AudioSystem.context = soundManager.context;
      return AudioSystem.context;
    }

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    AudioSystem.context = new AudioContextCtor();
    return AudioSystem.context;
  }

  private static ensureMixNodes(context: AudioContext | null): AudioMixNodes | null {
    if (!context) {
      return null;
    }

    if (AudioSystem.mixNodes) {
      return AudioSystem.mixNodes;
    }

    const master = context.createGain();
    const music = context.createGain();
    const sfx = context.createGain();

    music.connect(master);
    sfx.connect(master);
    master.connect(context.destination);

    AudioSystem.mixNodes = {
      master,
      music,
      sfx
    };

    return AudioSystem.mixNodes;
  }

  private static applySettingsToMix(): void {
    const context = AudioSystem.context;
    const nodes = AudioSystem.mixNodes;
    if (!context || !nodes) {
      return;
    }

    const settings = getUserSettings();
    const now = context.currentTime;

    nodes.master.gain.cancelScheduledValues(now);
    nodes.music.gain.cancelScheduledValues(now);
    nodes.sfx.gain.cancelScheduledValues(now);

    nodes.master.gain.setTargetAtTime(1, now, 0.01);
    nodes.music.gain.setTargetAtTime(settings.musicEnabled ? settings.musicVolume : 0, now, 0.01);
    nodes.sfx.gain.setTargetAtTime(settings.sfxVolume, now, 0.01);

    if ((!settings.musicEnabled || settings.musicVolume <= 0.001) && AudioSystem.trackTimerId) {
      AudioSystem.stopMusicLoop();
    }
  }

  private static startMusicLoop(track: MusicTrack): void {
    const context = AudioSystem.context;
    const nodes = AudioSystem.mixNodes;
    if (!context || !nodes) {
      return;
    }

    if (AudioSystem.trackTimerId) {
      if (AudioSystem.currentTrack === track) {
        return;
      }

      AudioSystem.stopMusicLoop();
    }

    AudioSystem.currentTrack = track;
    AudioSystem.trackStep = 0;
    AudioSystem.playMusicStep(track, 0);
    AudioSystem.trackTimerId = window.setInterval(() => {
      AudioSystem.trackStep += 1;
      AudioSystem.playMusicStep(track, AudioSystem.trackStep);
    }, TRACK_STEP_MS);
  }

  private static stopMusicLoop(): void {
    if (!AudioSystem.trackTimerId) {
      return;
    }

    window.clearInterval(AudioSystem.trackTimerId);
    AudioSystem.trackTimerId = null;
  }

  private static playMusicStep(track: MusicTrack, step: number): void {
    const context = AudioSystem.context;
    const nodes = AudioSystem.mixNodes;
    if (!context || !nodes) {
      return;
    }

    const sequence = TRACK_PATTERNS[track];
    const note = sequence[step % sequence.length];
    if (!note || note <= 0) {
      return;
    }

    const now = context.currentTime;
    const duration = (TRACK_STEP_MS / 1000) * 0.86;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = TRACK_WAVE[track];
    oscillator.frequency.setValueAtTime(note, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.06, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(nodes.music);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
