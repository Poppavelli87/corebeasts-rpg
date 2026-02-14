import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';

export class DebugOverlayScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;

  private toggleKey!: Phaser.Input.Keyboard.Key;

  private visibleOverlay = true;

  public constructor() {
    super(SCENE_KEYS.DEBUG);
  }

  public create(): void {
    this.toggleKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
    this.label = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9ef01a',
        backgroundColor: '#000000'
      })
      .setDepth(10_000)
      .setPadding(4, 3, 4, 3)
      .setScrollFactor(0);
  }

  public update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.toggleKey)) {
      this.visibleOverlay = !this.visibleOverlay;
      this.label.setVisible(this.visibleOverlay);
    }

    if (!this.visibleOverlay) {
      return;
    }

    const activeScene = this.scene.manager
      .getScenes(true)
      .map((scene) => scene.scene.key)
      .find((sceneKey) => sceneKey !== SCENE_KEYS.DEBUG && sceneKey !== SCENE_KEYS.BOOT);

    this.label.setText([
      `FPS: ${this.game.loop.actualFps.toFixed(0)}`,
      `Scene: ${activeScene ?? 'none'}`
    ]);
  }
}
