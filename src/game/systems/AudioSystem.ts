import Phaser from 'phaser';

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

export class AudioSystem {
  private readonly scene: Phaser.Scene;

  private context: AudioContext | null = null;

  private readonly unlockHandler = () => {
    void this.unlock();
  };

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const soundManager = this.scene.sound as Phaser.Sound.BaseSoundManager & {
      context?: AudioContext;
    };

    if (soundManager.context instanceof AudioContext) {
      this.context = soundManager.context;
    }

    if (!this.context) {
      const AudioContextCtor = window.AudioContext;
      if (AudioContextCtor) {
        this.context = new AudioContextCtor();
      }
    }

    this.scene.input.on('pointerdown', this.unlockHandler);
    this.scene.input.keyboard?.on('keydown', this.unlockHandler);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.input.off('pointerdown', this.unlockHandler);
      this.scene.input.keyboard?.off('keydown', this.unlockHandler);
    });
  }

  public async unlock(): Promise<void> {
    if (!this.context) {
      return;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  public beep(options: BeepOptions = {}): void {
    if (!this.context) {
      return;
    }

    const { frequency = 660, durationMs = 80, volume = 0.08, type = 'square' } = options;

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
    gainNode.connect(this.context.destination);
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
    gainNode.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
