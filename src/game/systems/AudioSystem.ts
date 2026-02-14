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

export type MusicTrack =
  | 'title'
  | 'overworld'
  | 'battle'
  | 'battle_normal'
  | 'battle_boss'
  | 'battle_final_phase'
  | 'victory_boss';

type NormalizedTrack = Exclude<MusicTrack, 'battle'>;

type TrackConfig = {
  notes: number[];
  wave: OscillatorType;
  stepMs: number;
  loop: boolean;
  gain: number;
};

type AudioMixNodes = {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
};

const TRACK_CONFIGS: Record<NormalizedTrack, TrackConfig> = {
  title: {
    notes: [262, 392, 330, 392, 294, 440, 392, 330, 0, 262, 392, 330, 523, 440, 392, 0],
    wave: 'triangle',
    stepMs: 220,
    loop: true,
    gain: 0.06
  },
  overworld: {
    notes: [220, 247, 262, 294, 330, 294, 262, 247, 220, 247, 262, 247, 196, 220, 247, 0],
    wave: 'square',
    stepMs: 220,
    loop: true,
    gain: 0.055
  },
  battle_normal: {
    notes: [196, 220, 247, 262, 247, 220, 196, 175, 196, 220, 262, 294, 262, 247, 220, 0],
    wave: 'sawtooth',
    stepMs: 210,
    loop: true,
    gain: 0.055
  },
  battle_boss: {
    notes: [175, 196, 220, 247, 262, 220, 247, 294, 262, 247, 220, 196, 220, 247, 262, 0],
    wave: 'sawtooth',
    stepMs: 195,
    loop: true,
    gain: 0.065
  },
  battle_final_phase: {
    notes: [262, 330, 294, 370, 330, 392, 370, 440, 392, 370, 330, 294, 330, 370, 440, 0],
    wave: 'square',
    stepMs: 175,
    loop: true,
    gain: 0.07
  },
  victory_boss: {
    notes: [392, 440, 494, 523, 587, 659, 587, 523, 494, 440, 523, 659],
    wave: 'triangle',
    stepMs: 180,
    loop: false,
    gain: 0.075
  }
};

const normalizeTrack = (track: MusicTrack): NormalizedTrack =>
  track === 'battle' ? 'battle_normal' : track;

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(), Math.max(0, Math.floor(ms)));
  });

export class AudioSystem {
  private readonly scene: Phaser.Scene;

  private context: AudioContext | null = null;

  private static context: AudioContext | null = null;

  private static mixNodes: AudioMixNodes | null = null;

  private static currentTrack: NormalizedTrack | null = null;

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

  public static getTrackDurationMs(track: MusicTrack): number {
    const config = TRACK_CONFIGS[normalizeTrack(track)];
    return config.stepMs * config.notes.length;
  }

  public async unlock(): Promise<void> {
    if (!this.context) {
      return;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  public playMusic(track: 'title' | 'overworld' | 'battle'): void {
    void this.playTrack(track);
  }

  public async playTrack(track: MusicTrack): Promise<void> {
    const normalized = normalizeTrack(track);
    const { musicEnabled, musicVolume } = getUserSettings();
    AudioSystem.currentTrack = normalized;

    if (!musicEnabled || musicVolume <= 0.001) {
      AudioSystem.stopMusicLoop();
      return;
    }

    AudioSystem.startMusicLoop(normalized);
    await this.fadeIn(120);
  }

  public stopMusic(): void {
    AudioSystem.stopMusicLoop();
    AudioSystem.currentTrack = null;
  }

  public async fadeOut(durationMs = 220): Promise<void> {
    const nodes = AudioSystem.mixNodes;
    const context = AudioSystem.context;
    if (!nodes || !context) {
      return;
    }

    const now = context.currentTime;
    const durationSeconds = Math.max(0.001, durationMs / 1000);

    nodes.music.gain.cancelScheduledValues(now);
    nodes.music.gain.setValueAtTime(nodes.music.gain.value, now);
    nodes.music.gain.linearRampToValueAtTime(0, now + durationSeconds);

    await waitMs(durationMs);
  }

  public async fadeIn(durationMs = 220): Promise<void> {
    const nodes = AudioSystem.mixNodes;
    const context = AudioSystem.context;
    if (!nodes || !context) {
      return;
    }

    const target = AudioSystem.getMusicTargetVolume();
    const now = context.currentTime;
    const durationSeconds = Math.max(0.001, durationMs / 1000);

    nodes.music.gain.cancelScheduledValues(now);
    nodes.music.gain.setValueAtTime(nodes.music.gain.value, now);
    nodes.music.gain.linearRampToValueAtTime(target, now + durationSeconds);

    await waitMs(durationMs);
  }

  public async crossfadeTo(track: MusicTrack, durationMs = 300): Promise<void> {
    const normalized = normalizeTrack(track);
    if (AudioSystem.currentTrack === normalized && AudioSystem.trackTimerId) {
      await this.fadeIn(Math.max(120, durationMs));
      return;
    }

    const halfDuration = Math.max(80, Math.floor(durationMs / 2));
    await this.fadeOut(halfDuration);
    await this.playTrack(normalized);
    await this.fadeIn(halfDuration);
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

  private static getMusicTargetVolume(): number {
    const settings = getUserSettings();
    if (!settings.musicEnabled || settings.musicVolume <= 0.001) {
      return 0;
    }

    return settings.musicVolume;
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
    nodes.music.gain.setTargetAtTime(AudioSystem.getMusicTargetVolume(), now, 0.01);
    nodes.sfx.gain.setTargetAtTime(settings.sfxVolume, now, 0.01);

    if ((!settings.musicEnabled || settings.musicVolume <= 0.001) && AudioSystem.trackTimerId) {
      AudioSystem.stopMusicLoop();
    }
  }

  private static startMusicLoop(track: NormalizedTrack): void {
    const context = AudioSystem.context;
    const nodes = AudioSystem.mixNodes;
    if (!context || !nodes) {
      return;
    }

    const config = TRACK_CONFIGS[track];

    if (AudioSystem.trackTimerId) {
      if (AudioSystem.currentTrack === track) {
        return;
      }
      AudioSystem.stopMusicLoop();
    }

    AudioSystem.currentTrack = track;
    AudioSystem.trackStep = 0;
    AudioSystem.playMusicStep(track, 0);

    if (config.notes.length <= 1) {
      return;
    }

    AudioSystem.trackStep = 1;
    AudioSystem.trackTimerId = window.setInterval(() => {
      if (!AudioSystem.currentTrack || AudioSystem.currentTrack !== track) {
        AudioSystem.stopMusicLoop();
        return;
      }

      if (!config.loop && AudioSystem.trackStep >= config.notes.length) {
        AudioSystem.stopMusicLoop();
        return;
      }

      AudioSystem.playMusicStep(track, AudioSystem.trackStep);
      AudioSystem.trackStep = config.loop
        ? (AudioSystem.trackStep + 1) % config.notes.length
        : AudioSystem.trackStep + 1;
    }, config.stepMs);
  }

  private static stopMusicLoop(): void {
    if (!AudioSystem.trackTimerId) {
      return;
    }

    window.clearInterval(AudioSystem.trackTimerId);
    AudioSystem.trackTimerId = null;
  }

  private static playMusicStep(track: NormalizedTrack, step: number): void {
    const context = AudioSystem.context;
    const nodes = AudioSystem.mixNodes;
    if (!context || !nodes) {
      return;
    }

    const config = TRACK_CONFIGS[track];
    if (config.notes.length === 0) {
      return;
    }

    const note = config.notes[step % config.notes.length];
    if (!note || note <= 0) {
      return;
    }

    const now = context.currentTime;
    const duration = (config.stepMs / 1000) * 0.86;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = config.wave;
    oscillator.frequency.setValueAtTime(note, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(config.gain, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(nodes.music);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
