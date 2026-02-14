import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { ProcSpriteFactory } from '../systems/ProcSpriteFactory';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super(SCENE_KEYS.BOOT);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#05050a');
    ProcSpriteFactory.prewarm(this);

    if (!this.scene.isActive(SCENE_KEYS.DEBUG)) {
      this.scene.launch(SCENE_KEYS.DEBUG);
    }

    this.scene.start(SCENE_KEYS.TITLE);
  }
}
