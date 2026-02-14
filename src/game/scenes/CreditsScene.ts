import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getActiveGameState, markStoryFlag } from '../state/GameState';
import { AudioSystem } from '../systems/AudioSystem';
import { InputAdapter } from '../systems/InputAdapter';
import { SaveSystem } from '../systems/SaveSystem';
import { TouchControls } from '../ui/TouchControls';
import { UI_THEME, createBackHint, createHeadingText, createPanel } from '../ui/UiTheme';
import { getViewportManager, type ViewportRect } from '../ui/ViewportManager';

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

  private layer!: Phaser.GameObjects.Container;

  private viewportUnsubscribe: (() => void) | null = null;

  private completionTimeLabel = '';

  private bestTimeLabel = '';

  private trialsLabel = '';

  private caughtLabel = '';

  private difficultyLabel = '';

  private modeLabel = '';

  public constructor() {
    super(SCENE_KEYS.CREDITS);
  }

  public create(): void {
    this.audio = new AudioSystem(this);
    this.audio.playMusic('title');
    TouchControls.getShared().setDialogOpen(false);

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
    this.completionTimeLabel = `Completion Time: ${timeLabel}`;
    this.bestTimeLabel = `Best (${state.difficulty.toUpperCase()}): ${bestTimeLabel}`;
    this.caughtLabel = `Creatures Caught: ${caughtCount}`;
    this.trialsLabel = `Trials Completed: ${trialsCompleted}/8`;
    this.difficultyLabel = `Difficulty: ${state.difficulty.toUpperCase()}`;
    this.modeLabel = `Mode: ${state.newGamePlus ? `New Game+ Cycle ${Math.max(1, state.meta.ngPlusCycle)}` : 'Standard'}  Challenge: ${
      state.challengeMode ? 'ON' : 'OFF'
    }`;

    this.layer = this.add.container(0, 0);
    this.viewportUnsubscribe = getViewportManager().onResize((viewport) => {
      this.renderLayout(viewport);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.renderLayout(getViewportManager().getViewport());

    this.inputAdapter = new InputAdapter(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.viewportUnsubscribe?.();
      this.viewportUnsubscribe = null;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    });
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

  private handleScaleResize(): void {
    this.renderLayout(getViewportManager().getViewport());
  }

  private renderLayout(viewport: ViewportRect): void {
    if (!this.layer) {
      return;
    }

    const safe = getViewportManager().getSafeMargins();
    const x = viewport.x + Math.max(10, safe.left);
    const y = viewport.y + Math.max(10, safe.top);
    const width = Math.max(
      260,
      viewport.width - Math.max(10, safe.left) - Math.max(10, safe.right)
    );
    const height = Math.max(
      220,
      viewport.height - Math.max(10, safe.top) - Math.max(10, safe.bottom)
    );
    const centerX = x + width / 2;
    const bottomY = y + height;
    const compact = viewport.orientation === 'portrait';

    this.layer.removeAll(true);

    this.layer.add(
      this.add
        .rectangle(viewport.x, viewport.y, viewport.width, viewport.height, 0x030711, 1)
        .setOrigin(0)
    );
    createPanel(this, {
      x,
      y,
      width,
      height,
      fillColor: 0x071426,
      fillAlpha: 0.72,
      strokeColor: 0x6ca2d1,
      strokeWidth: 2,
      container: this.layer
    });

    createHeadingText(this, centerX, y + 36, 'COREBEASTS RPG', {
      size: compact ? 26 : 34,
      color: '#f4d77c',
      originX: 0.5,
      originY: 0.5,
      container: this.layer
    });

    this.layer.add(
      this.add
        .text(centerX, y + 70, 'Campaign Clear', {
          fontFamily: UI_THEME.fontFamily,
          fontSize: compact ? '16px' : '20px',
          color: '#9ed2ff'
        })
        .setOrigin(0.5)
    );

    const lines = [
      this.completionTimeLabel,
      this.bestTimeLabel,
      this.caughtLabel,
      this.trialsLabel,
      this.difficultyLabel,
      this.modeLabel,
      'Thanks for playing this benchmark build.',
      'Postgame unlocked: optional boss hunts await.'
    ];
    const startY = y + (compact ? 98 : 124);
    const lineGap = compact ? 20 : 24;
    const lineSize = compact ? '13px' : '17px';
    lines.forEach((line, index) => {
      this.layer.add(
        this.add
          .text(centerX, startY + index * lineGap, line, {
            fontFamily: UI_THEME.fontFamily,
            fontSize: lineSize,
            color: index >= 6 ? '#9fc8e9' : '#e6f2ff'
          })
          .setOrigin(0.5)
      );
    });

    this.layer.add(
      this.add
        .text(centerX, bottomY - 22, 'Enter / Esc: Continue to Title', {
          fontFamily: UI_THEME.fontFamily,
          fontSize: compact ? '12px' : '14px',
          color: '#8ab4d6'
        })
        .setOrigin(0.5)
    );

    createBackHint(this, 'Esc: Back to Title', {
      x: x + width - 8,
      y: bottomY - 6,
      container: this.layer
    });
  }
}
