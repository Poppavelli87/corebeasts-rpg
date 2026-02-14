import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getActiveGameState, markStoryFlag } from '../state/GameState';
import { AudioSystem } from '../systems/AudioSystem';
import { InputAdapter } from '../systems/InputAdapter';
import { SaveSystem } from '../systems/SaveSystem';
import { UI_THEME, createBackHint, createHeadingText, createPanel } from '../ui/UiTheme';

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
  private audio!: AudioSystem;

  private inputAdapter!: InputAdapter;

  public constructor() {
    super(SCENE_KEYS.CREDITS);
  }

  public create(): void {
    this.audio = new AudioSystem(this);
    this.audio.playMusic('title');

    const state = getActiveGameState();
    if (!state.storyFlags.postgameUnlocked) {
      markStoryFlag(state, 'postgameUnlocked');
      SaveSystem.save(state);
    }
    SaveSystem.recordBestTime(state.difficulty, state.meta.playTimeSeconds);
    const bestTimes = SaveSystem.getBestTimes();
    const bestForDifficulty = bestTimes[state.difficulty];

    const trialsCompleted = TRIAL_FLAGS.filter((flag) => state.storyFlags[flag] === true).length;
    const caughtCount = state.party.length + state.storage.length;
    const timeLabel = formatTime(state.meta.playTimeSeconds);
    const bestTimeLabel = formatTime(bestForDifficulty ?? state.meta.playTimeSeconds);

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x030711, 1).setOrigin(0);
    createPanel(this, {
      x: 12,
      y: 12,
      width: width - 24,
      height: height - 24,
      fillColor: 0x071426,
      fillAlpha: 0.72,
      strokeColor: 0x6ca2d1,
      strokeWidth: 2
    });

    createHeadingText(this, width / 2, 46, 'COREBEASTS RPG', {
      size: 34,
      color: '#f4d77c',
      originX: 0.5,
      originY: 0.5
    });

    this.add
      .text(width / 2, 84, 'Campaign Clear', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '20px',
        color: '#9ed2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 134, `Completion Time: ${timeLabel}`, {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 160, `Best (${state.difficulty.toUpperCase()}): ${bestTimeLabel}`, {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '16px',
        color: '#a8d5f5'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 184, `Creatures Caught: ${caughtCount}`, {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 208, `Trials Completed: ${trialsCompleted}/8`, {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 232, `Difficulty: ${state.difficulty.toUpperCase()}`, {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '18px',
        color: '#e6f2ff'
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        256,
        `Mode: ${state.newGamePlus ? `New Game+ Cycle ${Math.max(1, state.meta.ngPlusCycle)}` : 'Standard'}  Challenge: ${
          state.challengeMode ? 'ON' : 'OFF'
        }`,
        {
          fontFamily: UI_THEME.fontFamily,
          fontSize: '14px',
          color: '#a8d5f5'
        }
      )
      .setOrigin(0.5);

    this.add
      .text(width / 2, 282, 'Thanks for playing this benchmark build.', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '17px',
        color: '#f2f7ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 304, 'Postgame unlocked: optional boss hunts await.', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '14px',
        color: '#9fc8e9'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height - 22, 'Enter / Esc: Continue to Title', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '14px',
        color: '#8ab4d6'
      })
      .setOrigin(0.5);
    createBackHint(this, 'Esc: Back to Title');

    this.inputAdapter = new InputAdapter(this);
  }

  public update(): void {
    if (
      this.inputAdapter.consume('confirm') ||
      this.inputAdapter.consume('cancel') ||
      this.inputAdapter.consume('menu')
    ) {
      this.audio.playMenuConfirm();
      this.scene.start(SCENE_KEYS.TITLE);
    }
  }
}
