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

const STARTER_OPTIONS: StarterOption[] = [
  { id: 'embercub', typeLabel: 'EMBER' },
  { id: 'tidepup', typeLabel: 'TIDE' },
  { id: 'bloomfin', typeLabel: 'BLOOM' }
];

export class StarterSelectionScene extends Phaser.Scene {
  private audio!: AudioSystem;

  private starterUi: StarterUi[] = [];

  private selectedIndex = 0;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private wasd!: Record<'a' | 'd', Phaser.Input.Keyboard.Key>;

  private enterKey!: Phaser.Input.Keyboard.Key;

  private escKey!: Phaser.Input.Keyboard.Key;

  public constructor() {
    super(SCENE_KEYS.STARTER_SELECTION);
  }

  public create(): void {
    this.audio = new AudioSystem(this);
    this.audio.playMusic('title');

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

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.refreshSelection();
  }

  public update(): void {
    const leftPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.left!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.a);
    const rightPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.right!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.d);

    if (leftPressed) {
      this.selectedIndex =
        (this.selectedIndex - 1 + STARTER_OPTIONS.length) % STARTER_OPTIONS.length;
      this.audio.playMenuMove();
      this.refreshSelection();
      return;
    }

    if (rightPressed) {
      this.selectedIndex = (this.selectedIndex + 1) % STARTER_OPTIONS.length;
      this.audio.playMenuMove();
      this.refreshSelection();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.audio.playMenuBack();
      this.scene.start(SCENE_KEYS.INTRO);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.confirmSelection();
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

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.OVERWORLD);
    });
    this.cameras.main.fadeOut(260, 0, 0, 0);
  }
}
