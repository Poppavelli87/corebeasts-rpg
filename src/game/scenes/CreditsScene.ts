import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getActiveGameState, markStoryFlag } from '../state/GameState';
import { SaveSystem } from '../systems/SaveSystem';

const TRIAL_FLAGS = [
  'trial1Complete',
  'trial2Complete',
  'trial3Complete',
  'trial4Complete',
  'trial5Complete',
  'trial6Complete',
  'trial7Complete',
  'trial8Complete'
] as const;

const formatTime = (totalSeconds: number): string => {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

export class CreditsScene extends Phaser.Scene {
  private enterKey!: Phaser.Input.Keyboard.Key;

  private escKey!: Phaser.Input.Keyboard.Key;

  public constructor() {
    super(SCENE_KEYS.CREDITS);
  }

  public create(): void {
    const state = getActiveGameState();
    if (!state.storyFlags.postgameUnlocked) {
      markStoryFlag(state, 'postgameUnlocked');
      SaveSystem.save(state);
    }
    const trialsCompleted = TRIAL_FLAGS.filter((flag) => state.storyFlags[flag] === true).length;
    const caughtCount = state.party.length + state.storage.length;
    const timeLabel = formatTime(state.meta.playTimeSeconds);

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x030711, 1).setOrigin(0);

    this.add
      .text(width / 2, 46, 'COREBEASTS RPG', {
        fontFamily: '"Courier New", monospace',
        fontSize: '34px',
        color: '#f4d77c',
        stroke: '#2c1f04',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 84, 'Campaign Clear', {
        fontFamily: '"Courier New", monospace',
        fontSize: '20px',
        color: '#9ed2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 134, `Completion Time: ${timeLabel}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 164, `Creatures Caught: ${caughtCount}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 194, `Trials Completed: ${trialsCompleted}/8`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 224, `Difficulty: ${state.difficulty.toUpperCase()}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 258, 'Thanks for playing this benchmark build.', {
        fontFamily: '"Courier New", monospace',
        fontSize: '17px',
        color: '#f2f7ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 284, 'Postgame unlocked: optional boss hunts await.', {
        fontFamily: '"Courier New", monospace',
        fontSize: '16px',
        color: '#9fc8e9'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height - 22, 'Enter / Esc: Continue to Title', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#8ab4d6'
      })
      .setOrigin(0.5);

    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  public update(): void {
    if (
      Phaser.Input.Keyboard.JustDown(this.enterKey) ||
      Phaser.Input.Keyboard.JustDown(this.escKey)
    ) {
      this.scene.start(SCENE_KEYS.TITLE);
    }
  }
}
