import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { AudioSystem } from '../systems/AudioSystem';

export class GameScene extends Phaser.Scene {
  private escKey!: Phaser.Input.Keyboard.Key;

  private audio!: AudioSystem;

  public constructor() {
    super(SCENE_KEYS.GAME);
  }

  public create(): void {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#111a2a');
    this.drawGrid(width, height);

    this.add
      .text(width / 2, 120, 'ADVENTURE STAGING AREA', {
        fontFamily: '"Courier New", monospace',
        fontSize: '32px',
        color: '#f8e16c',
        stroke: '#2a1f08',
        strokeThickness: 5
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 188, 'Press Esc to return to Title', {
        fontFamily: '"Courier New", monospace',
        fontSize: '20px',
        color: '#9fe3ff'
      })
      .setOrigin(0.5);

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.audio = new AudioSystem(this);
  }

  public update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.audio.beep({ frequency: 340, durationMs: 80 });
      this.scene.start(SCENE_KEYS.TITLE);
    }
  }

  private drawGrid(width: number, height: number): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x325072, 0.4);

    for (let x = 0; x <= width; x += 16) {
      graphics.lineBetween(x, 0, x, height);
    }

    for (let y = 0; y <= height; y += 16) {
      graphics.lineBetween(0, y, width, y);
    }
  }
}
