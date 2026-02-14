import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { type CreatureId, getCreatureDefinition } from '../data/creatures';
import { ProcSpriteFactory } from '../systems/ProcSpriteFactory';
import {
  createCreatureInstance,
  getActiveGameState,
  markStoryFlag,
  movePlayerTo
} from '../state/GameState';
import { MAP_DEFINITIONS } from '../systems/TileMap';
import { AudioSystem } from '../systems/AudioSystem';
import { InputAdapter } from '../systems/InputAdapter';
import { UI_THEME, createBackHint, createHeadingText, createPanel } from '../ui/UiTheme';

type StarterOption = {
  id: CreatureId;
  typeLabel: string;
};

type NgPlusCarryPayload = {
  speciesId: CreatureId;
  nickname?: string;
  moves?: unknown;
};

type StarterUi = {
  index: number;
  option: StarterOption;
  frame: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  type: Phaser.GameObjects.Text;
};

type StarterKeys = Record<
  'LEFT' | 'RIGHT' | 'A' | 'D' | 'ENTER' | 'SPACE' | 'ESC',
  Phaser.Input.Keyboard.Key
>;

const STARTER_OPTIONS: StarterOption[] = [
  { id: 'embercub', typeLabel: 'EMBER' },
  { id: 'tidepup', typeLabel: 'TIDE' },
  { id: 'bloomfin', typeLabel: 'BLOOM' }
];

export class StarterSelectionScene extends Phaser.Scene {
  private audio!: AudioSystem;

  private starterUi: StarterUi[] = [];

  private selectedIndex = 0;

  private keys!: StarterKeys;

  private keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null = null;

  private isTransitioning = false;

  private inputLocked = false;

  private hasReceivedInput = false;

  private inputWatchdog: Phaser.Time.TimerEvent | null = null;

  private pointerFocusHandler = (): void => {
    this.focusCanvas();
  };

  private keydownHandlers: Array<{
    event: string;
    handler: (event: KeyboardEvent) => void;
  }> = [];

  private actionCooldownMs = 80;

  private actionTimestamps: Record<string, number> = {};

  private devLastKeyText: Phaser.GameObjects.Text | null = null;

  private inputAdapter!: InputAdapter;

  public constructor() {
    super(SCENE_KEYS.STARTER_SELECTION);
  }

  public create(): void {
    this.audio = new AudioSystem(this);
    this.audio.playMusic('title');
    this.isTransitioning = false;
    this.inputLocked = false;
    this.hasReceivedInput = false;
    this.actionTimestamps = {};

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x030813, 1).setOrigin(0);
    createPanel(this, {
      x: 10,
      y: 10,
      width: width - 20,
      height: height - 20,
      fillColor: 0x071426,
      fillAlpha: 0.62,
      strokeColor: 0x33557d,
      strokeWidth: 2
    });

    createHeadingText(this, width / 2, 34, 'Choose Your Starter', {
      size: 30,
      color: '#f1da83',
      originX: 0.5,
      originY: 0.5
    });

    this.add
      .text(width / 2, 62, 'Left / Right: Select   Enter: Confirm', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '14px',
        color: '#95bddb'
      })
      .setOrigin(0.5);
    createBackHint(this, 'Esc: Back');

    const cardWidth = 182;
    const cardHeight = 230;
    const spacing = 18;
    const totalWidth = STARTER_OPTIONS.length * cardWidth + (STARTER_OPTIONS.length - 1) * spacing;
    const startX = (width - totalWidth) / 2;
    const cardY = 94;

    STARTER_OPTIONS.forEach((starter, index) => {
      const cardX = startX + index * (cardWidth + spacing);
      const frame = this.add
        .rectangle(cardX, cardY, cardWidth, cardHeight, 0x09172a, 0.98)
        .setOrigin(0)
        .setStrokeStyle(2, 0x5d7ea7, 1)
        .setInteractive({ useHandCursor: true });

      const sprite = this.add
        .image(cardX + cardWidth / 2, cardY + 92, ProcSpriteFactory.generateFront(this, starter.id))
        .setScale(4)
        .setOrigin(0.5);

      const definition = getCreatureDefinition(starter.id);
      const name = this.add
        .text(cardX + cardWidth / 2, cardY + 160, definition.name, {
          fontFamily: '"Courier New", monospace',
          fontSize: '20px',
          color: '#f5fbff'
        })
        .setOrigin(0.5);

      const type = this.add
        .text(cardX + cardWidth / 2, cardY + 190, starter.typeLabel, {
          fontFamily: '"Courier New", monospace',
          fontSize: '14px',
          color: '#92c3e8'
        })
        .setOrigin(0.5);

      frame.on('pointerover', () => {
        this.selectedIndex = index;
        this.refreshSelection();
      });
      frame.on('pointerdown', () => {
        this.hasReceivedInput = true;
        this.selectedIndex = index;
        this.refreshSelection();
        this.confirmSelection();
      });

      this.starterUi.push({
        index,
        option: starter,
        frame,
        sprite,
        name,
        type
      });
    });

    this.bindInputs();
    this.inputAdapter = new InputAdapter(this, { keyboardEnabled: false });

    this.refreshSelection();

    if (import.meta.env.DEV) {
      this.devLastKeyText = this.add
        .text(width - 6, 6, 'Last: NONE', {
          fontFamily: UI_THEME.fontFamily,
          fontSize: '12px',
          color: '#9ecbea',
          backgroundColor: '#000000aa',
          padding: { x: 4, y: 2 }
        })
        .setOrigin(1, 0)
        .setDepth(5000);
    }
  }

  public update(): void {
    if (!this.keys && !this.inputAdapter) {
      return;
    }

    if (this.inputAdapter.consume('navLeft')) {
      this.moveSelection(-1, 'TOUCH_LEFT');
    }

    if (this.inputAdapter.consume('navRight')) {
      this.moveSelection(1, 'TOUCH_RIGHT');
    }

    if (this.inputAdapter.consume('confirm')) {
      this.handleConfirmInput('TOUCH_A');
    }

    if (this.inputAdapter.consume('cancel') || this.inputAdapter.consume('menu')) {
      this.handleBackInput('TOUCH_B');
    }

    if (this.keys) {
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.LEFT) ||
        Phaser.Input.Keyboard.JustDown(this.keys.A)
      ) {
        this.moveSelection(-1, 'LEFT');
      }
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.RIGHT) ||
        Phaser.Input.Keyboard.JustDown(this.keys.D)
      ) {
        this.moveSelection(1, 'RIGHT');
      }
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.ENTER) ||
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE)
      ) {
        this.handleConfirmInput('ENTER');
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
        this.handleBackInput('ESC');
      }
    }
  }

  private refreshSelection(): void {
    this.starterUi.forEach((entry) => {
      const selected = entry.index === this.selectedIndex;
      entry.frame.setFillStyle(selected ? 0x132745 : 0x09172a, 0.98);
      entry.frame.setStrokeStyle(2, selected ? 0xb3d9ff : 0x5d7ea7, 1);
      entry.name.setColor(selected ? '#f6ea9d' : '#f5fbff');
      entry.type.setColor(selected ? '#d8ecff' : '#92c3e8');
      entry.sprite.setScale(selected ? 4.2 : 4);
    });
  }

  private confirmSelection(): void {
    if (this.isTransitioning || this.inputLocked) {
      return;
    }

    const selected = STARTER_OPTIONS[this.selectedIndex];
    if (!selected) {
      return;
    }

    this.audio.playMenuConfirm();

    const gameState = getActiveGameState();
    gameState.party = [createCreatureInstance(selected.id, 5)];
    gameState.storage = [];
    gameState.inventory.coreSeal = 5;
    gameState.inventory.potion = 2;
    gameState.inventory.cleanse = 0;
    gameState.inventory.verdantSigil = 0;
    gameState.inventory.trialSigil = 0;

    markStoryFlag(gameState, 'starterChosen');
    const carryOver = this.registry.get('ngPlusCarryOverCreature') as NgPlusCarryPayload | null;
    if (carryOver && typeof carryOver.speciesId === 'string') {
      const carryCreature = createCreatureInstance(carryOver.speciesId, 5, {
        nickname: carryOver.nickname,
        moves: carryOver.moves
      });
      if (gameState.party.length < 6) {
        gameState.party.push(carryCreature);
      } else {
        gameState.storage.push(carryCreature);
      }
      markStoryFlag(gameState, 'ngPlusCarryOverClaimed');
    }
    this.registry.set('ngPlusCarryOverCreature', null);

    const spawn = MAP_DEFINITIONS.starterTown.spawn;
    movePlayerTo(gameState, 'starterTown', spawn.x, spawn.y);

    this.isTransitioning = true;
    this.inputLocked = true;
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.OVERWORLD);
    });
    this.cameras.main.fadeOut(260, 0, 0, 0);
  }

  private bindInputs(): void {
    this.keyboard = this.input.keyboard ?? null;
    if (!this.keyboard) {
      return;
    }

    this.keys = this.keyboard.addKeys({
      LEFT: Phaser.Input.Keyboard.KeyCodes.LEFT,
      RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
      ESC: Phaser.Input.Keyboard.KeyCodes.ESC
    }) as StarterKeys;

    this.rebindKeyboardEvents(false);
    this.input.on('pointerdown', this.pointerFocusHandler);
    this.focusCanvas();

    this.inputWatchdog?.remove(false);
    this.inputWatchdog = this.time.delayedCall(3000, () => {
      if (this.hasReceivedInput || !this.keyboard) {
        return;
      }

      if (import.meta.env.DEV) {
        console.warn(
          '[StarterSelectionScene] No input detected after 3s. Rebinding keyboard listeners.'
        );
      }
      this.rebindKeyboardEvents(true);
      this.focusCanvas();
    });

    const cleanup = (): void => {
      this.inputWatchdog?.remove(false);
      this.inputWatchdog = null;
      this.input.off('pointerdown', this.pointerFocusHandler);
      this.removeKeyboardEvents();
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private rebindKeyboardEvents(forceRebind: boolean): void {
    if (!this.keyboard) {
      return;
    }

    if (forceRebind) {
      this.removeKeyboardEvents();
    }

    this.addKeydownListener('keydown-LEFT', () => this.moveSelection(-1, 'LEFT'));
    this.addKeydownListener('keydown-RIGHT', () => this.moveSelection(1, 'RIGHT'));
    this.addKeydownListener('keydown-A', () => this.moveSelection(-1, 'A'));
    this.addKeydownListener('keydown-D', () => this.moveSelection(1, 'D'));
    this.addKeydownListener('keydown-ENTER', () => this.handleConfirmInput('ENTER'));
    this.addKeydownListener('keydown-SPACE', () => this.handleConfirmInput('SPACE'));
    this.addKeydownListener('keydown-ESC', () => this.handleBackInput('ESC'));
  }

  private addKeydownListener(event: string, handler: (event: KeyboardEvent) => void): void {
    if (!this.keyboard) {
      return;
    }

    this.keyboard.on(event, handler);
    this.keydownHandlers.push({ event, handler });
  }

  private removeKeyboardEvents(): void {
    if (!this.keyboard) {
      return;
    }

    this.keydownHandlers.forEach(({ event, handler }) => {
      this.keyboard?.off(event, handler);
    });
    this.keydownHandlers = [];
  }

  private moveSelection(direction: -1 | 1, keyLabel: string): void {
    if (!this.canProcessAction(`move_${direction}`)) {
      return;
    }

    this.registerInput(keyLabel);
    if (this.isTransitioning || this.inputLocked) {
      return;
    }

    this.selectedIndex =
      (this.selectedIndex + direction + STARTER_OPTIONS.length) % STARTER_OPTIONS.length;
    this.audio.playMenuMove();
    this.refreshSelection();
  }

  private handleConfirmInput(keyLabel: string): void {
    if (!this.canProcessAction('confirm')) {
      return;
    }

    this.registerInput(keyLabel);
    if (this.isTransitioning || this.inputLocked) {
      return;
    }
    this.confirmSelection();
  }

  private handleBackInput(keyLabel: string): void {
    if (!this.canProcessAction('back')) {
      return;
    }

    this.registerInput(keyLabel);
    if (this.isTransitioning) {
      return;
    }

    this.audio.playMenuBack();
    this.isTransitioning = true;
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.TITLE);
    });
    this.cameras.main.fadeOut(200, 0, 0, 0);
  }

  private canProcessAction(actionId: string): boolean {
    const now = this.time.now;
    const previous = this.actionTimestamps[actionId] ?? -Infinity;
    if (now - previous < this.actionCooldownMs) {
      return false;
    }

    this.actionTimestamps[actionId] = now;
    return true;
  }

  private registerInput(keyLabel: string): void {
    this.hasReceivedInput = true;
    this.devLastKeyText?.setText(`Last: ${keyLabel}`);
  }

  private focusCanvas(): void {
    const canvas = this.game.canvas as HTMLCanvasElement | null;
    if (!canvas) {
      return;
    }

    if (!canvas.hasAttribute('tabindex')) {
      canvas.setAttribute('tabindex', '0');
    }
    canvas.focus();
  }
}
