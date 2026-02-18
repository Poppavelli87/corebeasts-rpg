import Phaser from 'phaser';
import { ABILITIES, type AbilityContext, type AbilityDefinition } from '../data/abilities';
import { BOSS_BEHAVIORS, type BossContext } from '../data/bossBehaviors';
import {
  ENCOUNTER_CREATURE_IDS,
  getCreatureDefinition,
  isRareSpecies,
  type CreatureId
} from '../data/creatures';
import { getMoveDefinition, type MoveDefinition, type MoveId } from '../data/moves';
import { SCENE_KEYS } from '../constants';
import { AudioSystem } from '../systems/AudioSystem';
import { BattleEngine, type BattleAction, type DamageAdjusterInput } from '../systems/BattleEngine';
import { InputAdapter } from '../systems/InputAdapter';
import {
  applyExperienceGain,
  calculateBattleXpReward,
  getChallengeLevelCap,
  getMaxMovesForLevel,
  type EvolutionProgress,
  type LevelUpProgress
} from '../systems/Progression';
import { ProcSpriteFactory } from '../systems/ProcSpriteFactory';
import { SaveSystem } from '../systems/SaveSystem';
import { getTypeMultiplier } from '../systems/TypeChart';
import { getBattleMessageSpeedMultiplier, getUserSettings } from '../systems/UserSettings';
import {
  addCreatureToCollection,
  consumeInventory,
  createCreatureInstance,
  getActiveGameState,
  type CreatureInstance,
  type DifficultyMode,
  type GameState,
  type InventoryKey
} from '../state/GameState';
import {
  UI_THEME,
  createBackHint,
  createBodyText,
  createPanel,
  createTinyIcon
} from '../ui/UiTheme';
import { TouchControls } from '../ui/TouchControls';
import { getViewportManager, type ViewportRect } from '../ui/ViewportManager';
import type { BossConfig } from '../world/WorldMaps';

type BattleOutcome = 'victory' | 'defeat' | 'capture' | 'escaped';

type BattleSceneData = {
  enemy?: CreatureInstance;
  enemyTeam?: CreatureInstance[];
  battleType?: 'wild' | 'trainer';
  trainerId?: string;
  trainerName?: string;
  rareEncounter?: boolean;
  bossConfig?: BossConfig;
};

type BattleCommand = 'fight' | 'bag' | 'switch' | 'run';

type HpBarUi = {
  panel: Phaser.GameObjects.Rectangle;
  track: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  fill: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  statusBadge: Phaser.GameObjects.Text;
  maxWidth: number;
  maxHp: number;
  displayedHp: number;
  icon: Phaser.GameObjects.Rectangle;
};

type CommandButtonUi = {
  command: BattleCommand;
  index: number;
  row: number;
  col: number;
  enabled: boolean;
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
};

type MoveButtonUi = {
  moveId: MoveId;
  index: number;
  row: number;
  col: number;
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
};

type BagItemButtonUi = {
  item: InventoryKey;
  index: number;
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
};

type SwitchOptionUi = {
  index: number;
  partyIndex: number | null;
  disabled: boolean;
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
};

type ReplaceMoveButtonUi = {
  index: number;
  moveId: MoveId | null;
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
};

type MessageMode = 'fast' | 'locked';

type MessageOptions = {
  durationMs?: number;
  mode?: MessageMode;
};

type QueuedMessage = {
  text: string;
  durationMs: number;
  mode: MessageMode;
};

type AbilityHookName = keyof Pick<
  AbilityDefinition,
  'onEnter' | 'onHit' | 'onLowHP' | 'onFaint' | 'onTurnStart'
>;

type BattleLayout = {
  enemySpriteX: number;
  enemySpriteY: number;
  playerSpriteX: number;
  playerSpriteY: number;
  enemyPanelX: number;
  enemyPanelY: number;
  enemyPanelWidth: number;
  playerPanelX: number;
  playerPanelY: number;
  playerPanelWidth: number;
  battlePanelX: number;
  battlePanelY: number;
  battlePanelWidth: number;
  battlePanelHeight: number;
  movePanelX: number;
  movePanelY: number;
  movePanelWidth: number;
  movePanelCompactHeight: number;
  movePanelExpandedHeight: number;
  bagPanelX: number;
  bagPanelY: number;
  bagPanelWidth: number;
  bagPanelHeight: number;
};

const BAG_ITEMS: Array<{ item: InventoryKey; label: string }> = [
  { item: 'coreSeal', label: 'Core Seal' },
  { item: 'potion', label: 'Potion' },
  { item: 'cleanse', label: 'Cleanse' }
];

const FAST_MESSAGE_MIN_MS = 500;
const FAST_MESSAGE_MAX_MS = 700;
const COMBATANT_PANEL_PADDING = 12;
const COMBATANT_PANEL_MARGIN = 8;

export class BattleScene extends Phaser.Scene {
  private audio!: AudioSystem;
  private engine!: BattleEngine;
  private gameState!: GameState;
  private battleType: 'wild' | 'trainer' = 'wild';
  private rareEncounter = false;
  private trainerName = 'Trainer';
  private trainerId = '';
  private bossConfig: BossConfig | null = null;
  private bossState: Record<string, unknown> = {};
  private bossTurnNumber = 0;
  private bossTriggeredPhases = new Set<string>();
  private stoneWardFlags = new Set<string>();
  private tempDamageModifiers: Partial<Record<'player' | 'enemy', number>> = {};
  private pendingBossMessages: string[] = [];
  private pendingBossForceSwitchMode: 'next' | 'final' | null = null;
  private enemyTeam: CreatureInstance[] = [];
  private enemyActiveIndex = 0;
  private activePlayerIndex = 0;
  private playerHpUi!: HpBarUi;
  private enemyHpUi!: HpBarUi;
  private playerSprite!: Phaser.GameObjects.Image;
  private enemySprite!: Phaser.GameObjects.Image;
  private battleBackground?: Phaser.GameObjects.Graphics;
  private messageText!: Phaser.GameObjects.Text;
  private battlePanel?: Phaser.GameObjects.Rectangle;
  private backHint?: Phaser.GameObjects.Text;
  private commandButtons: CommandButtonUi[] = [];
  private selectedCommandIndex = 0;
  private moveSelectionOpen = false;
  private movePanel?: Phaser.GameObjects.Rectangle;
  private moveButtons: MoveButtonUi[] = [];
  private moveBackButton?: Phaser.GameObjects.Rectangle;
  private moveBackText?: Phaser.GameObjects.Text;
  private moveBackRow = 0;
  private moveBackCol = 0;
  private selectedMoveIndex = 0;
  private bagOpen = false;
  private bagReturnMode: 'command' | 'move' = 'command';
  private bagPanel?: Phaser.GameObjects.Rectangle;
  private bagHeaderText?: Phaser.GameObjects.Text;
  private bagItemButtons: BagItemButtonUi[] = [];
  private selectedBagIndex = 0;
  private switchOpen = false;
  private switchForced = false;
  private switchPanel?: Phaser.GameObjects.Rectangle;
  private switchHeaderText?: Phaser.GameObjects.Text;
  private switchButtons: SwitchOptionUi[] = [];
  private selectedSwitchIndex = 0;
  private switchResolver: ((value: number | null) => void) | null = null;
  private moveReplaceActive = false;
  private selectedReplaceIndex = 0;
  private replaceMoveButtons: ReplaceMoveButtonUi[] = [];
  private replaceMovePanel?: Phaser.GameObjects.Rectangle;
  private replaceMoveHeaderText?: Phaser.GameObjects.Text;
  private replaceMoveResolver: ((value: MoveId | null) => void) | null = null;
  private battlePanelTop = 226;
  private menuActive = false;
  private actionInProgress = false;
  private battleResolved = false;
  private playerIdleBob: Phaser.Tweens.Tween | null = null;
  private enemyIdleBob: Phaser.Tweens.Tween | null = null;
  private messageQueue: QueuedMessage[] = [];
  private messageQueueTask: Promise<void> | null = null;
  private activeMessageResolver: (() => void) | null = null;
  private activeMessageTimer: Phaser.Time.TimerEvent | null = null;
  private activeMessageMode: MessageMode | null = null;
  private pendingXpByPartyIndex = new Map<number, number>();
  private abilityEventTags = new Set<string>();
  private enemyHardSwitchUsed = false;
  private bagKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private inputAdapter!: InputAdapter;
  private viewport: ViewportRect = getViewportManager().getViewport();
  private layoutUnsubscribe: (() => void) | null = null;

  public constructor() {
    super(SCENE_KEYS.BATTLE);
  }

  public create(data: BattleSceneData): void {
    this.resetRuntimeState();
    this.audio = new AudioSystem(this);
    void this.audio.playTrack('battle_normal');
    this.gameState = getActiveGameState();

    if (this.gameState.party.length === 0) {
      this.gameState.party = [createCreatureInstance('embercub', 5)];
    }

    this.activePlayerIndex = this.findFirstUsablePartyIndex();
    if (this.activePlayerIndex < 0) {
      this.activePlayerIndex = 0;
      const fallback = this.gameState.party[0];
      fallback.currentHp = Math.max(1, fallback.stats.hp);
      fallback.status = null;
    }

    this.battleType = data.battleType ?? 'wild';
    this.trainerId = data.trainerId?.trim() ?? '';
    this.rareEncounter = this.battleType === 'wild' && (data.rareEncounter ?? false);
    this.trainerName = data.trainerName?.trim() || 'Trainer';
    this.bossConfig = this.battleType === 'trainer' ? (data.bossConfig ?? null) : null;
    this.bossState.damageModifier = 1;
    this.enemyTeam = this.createInitialEnemyTeam(data);
    this.enemyActiveIndex = 0;
    if (this.battleType === 'wild' && this.enemyTeam[0]) {
      this.rareEncounter = this.rareEncounter || isRareSpecies(this.enemyTeam[0].speciesId);
    }

    this.viewport = getViewportManager().getViewport();
    this.battlePanelTop = this.getBattleLayout().battlePanelY;
    TouchControls.getShared().setDialogOpen(false);

    this.rebuildEngineFromActive();
    this.drawBackground();
    this.inputAdapter = new InputAdapter(this);
    this.createCombatSprites();
    this.createCombatPanels();
    this.createBattlePanel();

    this.bagKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    this.cameras.main.fadeIn(240, 0, 0, 0);

    const enemy = this.getActiveEnemyCreature();
    if (enemy) {
      void this.playIntroSequence();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.layoutUnsubscribe?.();
      this.layoutUnsubscribe = null;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
      this.registry.set('battleState', null);
      this.resetRuntimeState();
    });

    this.layoutUnsubscribe = getViewportManager().onResize((viewport) => {
      this.applyLayoutProfile(viewport);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);

    this.publishBattleState();
  }

  public update(): void {
    this.layoutCombatantPanels();

    if (this.activeMessageResolver) {
      if (this.inputAdapter.consume('confirm') || this.shiftKey.isDown) {
        this.resolveActiveMessage();
      }
      return;
    }

    if (this.moveReplaceActive) {
      this.updateMoveReplaceInput();
      return;
    }

    if (this.switchOpen) {
      this.updateSwitchInput();
      return;
    }

    if (!this.menuActive || this.actionInProgress || this.battleResolved) {
      return;
    }

    if (this.bagOpen) {
      this.updateBagInput();
      return;
    }

    if (this.moveSelectionOpen) {
      this.updateMoveSelectionInput();
      return;
    }

    this.updateCommandInput();
  }
  private findFirstUsablePartyIndex(): number {
    return this.gameState.party.findIndex((creature) => creature.currentHp > 0);
  }

  private createInitialEnemyTeam(data: BattleSceneData): CreatureInstance[] {
    const baseTeam =
      data.enemyTeam && data.enemyTeam.length > 0
        ? data.enemyTeam
        : data.enemy
          ? [data.enemy]
          : [this.createRandomEnemy()];

    return baseTeam.map((entry) => {
      const clone = this.cloneCreature(entry);
      const hpCap = Math.max(1, clone.stats.hp);
      clone.currentHp = Phaser.Math.Clamp(clone.currentHp || hpCap, 1, hpCap);
      clone.status = clone.status ?? null;
      return clone;
    });
  }

  private cloneCreature(creature: CreatureInstance): CreatureInstance {
    return {
      ...creature,
      stats: { ...creature.stats },
      moves: [...creature.moves]
    };
  }

  private applyLayoutProfile(viewport: ViewportRect): void {
    this.viewport = viewport;
    this.battlePanelTop = this.getBattleLayout().battlePanelY;
    this.drawBackground();

    if (!this.playerSprite || !this.enemySprite || !this.messageText) {
      return;
    }

    this.stopIdleBob('player', false);
    this.stopIdleBob('enemy', false);
    this.repositionCombatSprites();
    this.rebuildCombatPanels();
    this.rebuildBattlePanel();
    this.resumeIdleBob('player');
    this.resumeIdleBob('enemy');

    if (this.moveSelectionOpen) {
      this.openMoveSelection();
    }

    if (this.bagOpen) {
      this.bagOpen = false;
      this.openBag(this.bagReturnMode);
    }

    this.publishBattleState();
  }

  private handleScaleResize(): void {
    this.applyLayoutProfile(getViewportManager().getViewport());
  }

  private repositionCombatSprites(): void {
    const layout = this.getBattleLayout();
    this.playerSprite.setPosition(layout.playerSpriteX, layout.playerSpriteY);
    this.enemySprite.setPosition(layout.enemySpriteX, layout.enemySpriteY);
  }

  private rebuildCombatPanels(): void {
    const player = this.getActivePlayerCreature();
    const enemy = this.getActiveEnemyCreature();
    if (!player || !enemy) {
      return;
    }

    if (this.playerHpUi) {
      this.destroyCombatantPanel(this.playerHpUi);
    }
    if (this.enemyHpUi) {
      this.destroyCombatantPanel(this.enemyHpUi);
    }

    const layout = this.getBattleLayout();
    this.enemyHpUi = this.createCombatantPanel(
      layout.enemyPanelX,
      layout.enemyPanelY,
      layout.enemyPanelWidth,
      enemy
    );
    this.playerHpUi = this.createCombatantPanel(
      layout.playerPanelX,
      layout.playerPanelY,
      layout.playerPanelWidth,
      player
    );
    this.layoutCombatantPanels();
  }

  private rebuildBattlePanel(): void {
    const currentMessage = this.messageText?.text ?? '';

    this.destroyCommandButtons();
    this.battlePanel?.destroy();
    this.backHint?.destroy();
    this.messageText?.destroy();

    this.battlePanel = undefined;
    this.backHint = undefined;

    this.createBattlePanel();

    if (currentMessage.length > 0) {
      this.messageText.setText(currentMessage);
    }
  }

  private destroyCombatantPanel(panel: HpBarUi): void {
    panel.panel.destroy();
    panel.track.destroy();
    panel.fill.destroy();
    panel.title.destroy();
    panel.label.destroy();
    panel.statusBadge.destroy();
    panel.icon.destroy();
  }

  private getBattleLayout(): BattleLayout {
    const safe = getViewportManager().getSafeMargins();
    const viewport = this.viewport;
    const width = viewport.width;
    const height = viewport.height;
    const originX = viewport.x;
    const originY = viewport.y;
    const isPortraitMobile =
      viewport.formFactor === 'mobile' && viewport.orientation === 'portrait';
    const isLandscapeMobile =
      viewport.formFactor === 'mobile' && viewport.orientation === 'landscape';
    const isTablet = viewport.formFactor === 'tablet';

    const panelHeight = isPortraitMobile
      ? Math.max(128, Math.round(height * 0.23))
      : Math.max(126, Math.min(140, Math.round(height * 0.28)));

    const panelBottomInset = safe.bottom + (isPortraitMobile ? 12 : isLandscapeMobile ? 8 : 10);

    let battlePanelX = Math.max(8, safe.left + 8);
    const battlePanelY = Math.max(0, height - panelHeight - Math.max(8, panelBottomInset));
    let battlePanelWidth = Math.max(220, width - safe.left - safe.right - 16);

    let enemySpriteX = 430;
    let enemySpriteY = 104;
    let playerSpriteX = 170;
    let playerSpriteY = 218;
    let enemyPanelX = 314;
    let enemyPanelY = 24;
    let playerPanelX = 24;
    let playerPanelY = 174;
    let panelWidth = 302;

    if (isPortraitMobile) {
      panelWidth = Math.max(220, width - safe.left - safe.right - 24);
      enemySpriteX = Math.round(width * 0.5);
      enemySpriteY = Math.max(58, Math.round(height * 0.2));
      playerSpriteX = Math.round(width * 0.5);
      playerSpriteY = Math.min(battlePanelY - 34, Math.round(height * 0.58));
      enemyPanelX = Math.round((width - panelWidth) / 2);
      enemyPanelY = Math.max(10, safe.top + 8);
      playerPanelX = Math.round((width - panelWidth) / 2);
      playerPanelY = Math.max(enemyPanelY + 82, battlePanelY - 84);
    } else if (isLandscapeMobile) {
      battlePanelX = Math.max(8, safe.left + 8);
      battlePanelWidth = Math.max(220, width - safe.left - safe.right - 16);

      panelWidth = Math.max(220, Math.min(280, battlePanelWidth - 16));
      enemySpriteX = battlePanelX + Math.round(battlePanelWidth * 0.74);
      enemySpriteY = Math.round(height * 0.29);
      playerSpriteX = battlePanelX + Math.round(battlePanelWidth * 0.26);
      playerSpriteY = Math.min(battlePanelY - 34, Math.round(height * 0.62));
      enemyPanelX = battlePanelX + Math.round((battlePanelWidth - panelWidth) / 2);
      enemyPanelY = Math.max(10, safe.top + 8);
      playerPanelX = enemyPanelX;
      playerPanelY = Math.max(12, battlePanelY - 84);
    } else if (isTablet) {
      const tabletLandscape = viewport.orientation === 'landscape';
      battlePanelX = Math.max(8, safe.left + 8);
      battlePanelWidth = Math.max(230, width - safe.left - safe.right - 16);

      panelWidth = Math.max(220, Math.min(tabletLandscape ? 292 : 300, battlePanelWidth - 16));
      enemySpriteX = battlePanelX + Math.round(battlePanelWidth * 0.74);
      enemySpriteY = Math.round(height * 0.29);
      playerSpriteX = battlePanelX + Math.round(battlePanelWidth * 0.26);
      playerSpriteY = Math.min(battlePanelY - 34, Math.round(height * 0.62));
      enemyPanelX = battlePanelX + battlePanelWidth - panelWidth - 8;
      enemyPanelY = Math.max(12, safe.top + 8);
      playerPanelX = battlePanelX + 8;
      playerPanelY = Math.max(12, battlePanelY - 84);
    }

    const movePanelX = battlePanelX + 8;
    const movePanelWidth = Math.max(220, battlePanelWidth - 16);
    const bagPanelWidth = Math.max(188, Math.min(248, Math.round(movePanelWidth * 0.46)));
    const bagPanelX = battlePanelX + battlePanelWidth - bagPanelWidth - 8;

    return {
      enemySpriteX: enemySpriteX + originX,
      enemySpriteY: enemySpriteY + originY,
      playerSpriteX: playerSpriteX + originX,
      playerSpriteY: playerSpriteY + originY,
      enemyPanelX: enemyPanelX + originX,
      enemyPanelY: enemyPanelY + originY,
      enemyPanelWidth: panelWidth,
      playerPanelX: playerPanelX + originX,
      playerPanelY: playerPanelY + originY,
      playerPanelWidth: panelWidth,
      battlePanelX: battlePanelX + originX,
      battlePanelY: battlePanelY + originY,
      battlePanelWidth,
      battlePanelHeight: panelHeight,
      movePanelX: movePanelX + originX,
      movePanelY: originY + Math.max(12, battlePanelY - (isPortraitMobile ? 132 : 82)),
      movePanelWidth,
      movePanelCompactHeight: isPortraitMobile ? 104 : 56,
      movePanelExpandedHeight: isPortraitMobile ? 146 : 108,
      bagPanelX: bagPanelX + originX,
      bagPanelY: originY + Math.max(14, battlePanelY - 132),
      bagPanelWidth,
      bagPanelHeight: 118
    };
  }

  private createCombatSprites(): void {
    const player = this.getActivePlayerCreature();
    const enemy = this.getActiveEnemyCreature();
    if (!player || !enemy) {
      return;
    }

    const layout = this.getBattleLayout();
    this.enemySprite = this.add
      .image(
        layout.enemySpriteX,
        layout.enemySpriteY,
        ProcSpriteFactory.generateFront(this, enemy.speciesId)
      )
      .setOrigin(0.5)
      .setScale(3)
      .setAlpha(0)
      .setDepth(20);
    this.applyRareEnemyVisual();

    this.playerSprite = this.add
      .image(
        layout.playerSpriteX,
        layout.playerSpriteY,
        ProcSpriteFactory.generateBack(this, player.speciesId)
      )
      .setOrigin(0.5)
      .setScale(3)
      .setAlpha(0)
      .setDepth(20);
  }

  private createCombatPanels(): void {
    const player = this.getActivePlayerCreature();
    const enemy = this.getActiveEnemyCreature();
    if (!player || !enemy) {
      return;
    }

    const layout = this.getBattleLayout();
    this.enemyHpUi = this.createCombatantPanel(
      layout.enemyPanelX,
      layout.enemyPanelY,
      layout.enemyPanelWidth,
      enemy
    );
    this.playerHpUi = this.createCombatantPanel(
      layout.playerPanelX,
      layout.playerPanelY,
      layout.playerPanelWidth,
      player
    );
    this.layoutCombatantPanels();
  }

  private layoutCombatantPanels(): void {
    if (!this.playerSprite?.scene || !this.enemySprite?.scene) {
      return;
    }

    if (!this.playerHpUi?.panel?.scene || !this.enemyHpUi?.panel?.scene) {
      return;
    }

    this.placeCombatantPanelNearSprite(this.enemyHpUi, this.enemySprite);
    this.placeCombatantPanelNearSprite(this.playerHpUi, this.playerSprite);
  }

  private placeCombatantPanelNearSprite(panel: HpBarUi, sprite: Phaser.GameObjects.Image): void {
    const safe = getViewportManager().getSafeMargins();
    const viewport = this.viewport;
    const panelWidth = panel.panel.width;
    const panelHeight = panel.panel.height;
    const spriteBounds = sprite.getBounds();

    const minX = viewport.x + safe.left + COMBATANT_PANEL_MARGIN;
    const maxX = Math.max(
      minX,
      viewport.x + viewport.width - safe.right - panelWidth - COMBATANT_PANEL_MARGIN
    );
    const minY = viewport.y + safe.top + COMBATANT_PANEL_MARGIN;
    const maxY = Math.max(
      minY,
      viewport.y + viewport.height - safe.bottom - panelHeight - COMBATANT_PANEL_MARGIN
    );

    const padding =
      this.viewport.formFactor === 'mobile' && this.viewport.orientation === 'portrait'
        ? COMBATANT_PANEL_PADDING - 2
        : COMBATANT_PANEL_PADDING;

    let x = spriteBounds.x + spriteBounds.width * 0.5 - panelWidth * 0.5;
    let y = spriteBounds.y - panelHeight - padding;

    if (y < minY) {
      y = spriteBounds.y + spriteBounds.height + padding;
    }

    x = Phaser.Math.Clamp(x, minX, maxX);
    y = Phaser.Math.Clamp(y, minY, maxY);

    this.setCombatantPanelPosition(panel, Math.round(x), Math.round(y));
  }

  private setCombatantPanelPosition(panel: HpBarUi, x: number, y: number): void {
    const panelWidth = panel.panel.width;
    panel.panel.setPosition(x, y);
    panel.title.setPosition(x + 10, y + 8);
    panel.icon.setPosition(x + 6, y + 16);
    panel.statusBadge.setPosition(x + panelWidth - 66, y + 8);
    panel.track.setPosition(x + 10, y + 36);
    panel.fill.setPosition(x + 10, y + 36);
    panel.label.setPosition(x + 10, y + 52);
  }

  private createBattlePanel(): void {
    const layout = this.getBattleLayout();
    this.battlePanelTop = layout.battlePanelY;

    const panel = createPanel(this, {
      x: layout.battlePanelX,
      y: layout.battlePanelY,
      width: layout.battlePanelWidth,
      height: layout.battlePanelHeight,
      fillColor: 0x08111f,
      fillAlpha: 0.97,
      strokeColor: 0x8cb6dc,
      strokeWidth: 2,
      depth: 40
    });
    this.battlePanel = panel;

    const isPortraitMobile =
      this.viewport.formFactor === 'mobile' && this.viewport.orientation === 'portrait';
    const messageFontSize = isPortraitMobile ? 14 : 16;
    this.messageText = createBodyText(this, panel.x + 12, panel.y + 8, '', {
      size: messageFontSize,
      color: '#f6f8ff',
      depth: 41,
      wordWrapWidth: panel.width - 24
    });
    this.backHint = createBackHint(this, 'Esc: Back', {
      x: panel.x + panel.width - 10,
      y: panel.y + panel.height - 6,
      depth: 44
    });

    this.createCommandButtons(
      panel.y + Math.max(42, panel.height - 80),
      panel.x + 8,
      panel.width - 16
    );
    this.refreshCommandHighlights();
  }

  private createCommandButtons(topY: number, startX: number, panelContentWidth: number): void {
    this.destroyCommandButtons();

    const spacing = 8;
    const buttonWidth = Math.max(92, Math.floor((Math.max(208, panelContentWidth) - spacing) / 2));
    const buttonHeight = 32;

    const commands: Array<{
      command: BattleCommand;
      label: string;
      row: number;
      col: number;
      enabled: boolean;
    }> = [
      { command: 'fight', label: 'Fight', row: 0, col: 0, enabled: true },
      {
        command: 'bag',
        label: 'Bag',
        row: 0,
        col: 1,
        enabled: !(this.gameState.challengeMode && this.battleType === 'trainer')
      },
      { command: 'switch', label: 'Switch', row: 1, col: 0, enabled: true },
      {
        command: 'run',
        label: this.battleType === 'wild' ? 'Run' : 'Back',
        row: 1,
        col: 1,
        enabled: this.battleType === 'wild'
      }
    ];

    commands.forEach((entry, index) => {
      const x = startX + entry.col * (buttonWidth + spacing);
      const y = topY + entry.row * (buttonHeight + spacing);
      const background = this.add
        .rectangle(x, y, buttonWidth, buttonHeight, 0x1a2638, 1)
        .setOrigin(0)
        .setStrokeStyle(2, 0x5d7ea7, 1)
        .setDepth(42)
        .setInteractive({ useHandCursor: true });

      const text = this.add
        .text(background.x + 8, background.y + 8, entry.label, {
          fontFamily: UI_THEME.fontFamily,
          fontSize: '18px',
          color: '#dce8f8'
        })
        .setDepth(43);

      background.on('pointerover', () => {
        if (!this.menuActive || this.actionInProgress || this.bagOpen || this.moveSelectionOpen) {
          return;
        }
        this.selectedCommandIndex = index;
        this.refreshCommandHighlights();
        this.publishBattleState();
      });

      background.on('pointerdown', () => {
        if (!this.menuActive || this.actionInProgress || this.battleResolved) {
          return;
        }

        this.selectedCommandIndex = index;
        this.refreshCommandHighlights();
        void this.handleCommandSelection(entry.command);
      });

      this.commandButtons.push({
        command: entry.command,
        index,
        row: entry.row,
        col: entry.col,
        enabled: entry.enabled,
        background,
        text
      });
    });
  }

  private destroyCommandButtons(): void {
    this.commandButtons.forEach((button) => {
      button.background.destroy();
      button.text.destroy();
    });
    this.commandButtons = [];
  }

  private async playIntroSequence(): Promise<void> {
    this.actionInProgress = true;

    const enemy = this.getActiveEnemyCreature();
    const enemyName = enemy ? this.getCreatureLabel(enemy) : 'Corebeast';

    if (this.isBossBattle()) {
      await this.audio.crossfadeTo('battle_boss', 260);
    }

    await this.playSendOutAnimation('player');

    if (this.battleType === 'wild') {
      await this.playWildEnemySlideIn();
      const line = this.rareEncounter
        ? `A rare ${enemyName} emerged from the grass!`
        : `Wild ${enemyName} appeared!`;
      await this.showQueuedMessages([line], 620);
    } else {
      await this.showQueuedMessages([`${this.trainerName} wants to battle!`], 620);
      await this.playSendOutAnimation('enemy');
      await this.showQueuedMessages([`${this.trainerName} sent out ${enemyName}!`], 560);
    }

    const player = this.getActivePlayerCreature();
    this.triggerAbilityHook('onEnter', player, enemy);
    this.triggerAbilityHook('onEnter', enemy, player);
    await this.runBossStartBehavior();
    await this.flushMessageQueue();

    if (this.battleResolved) {
      return;
    }

    this.actionInProgress = false;
    this.menuActive = true;
    this.setCommandPrompt();
    this.refreshCommandHighlights();
    this.publishBattleState();
  }

  private updateCommandInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.bagKey)) {
      this.openBag('command');
      return;
    }

    let movedSelection = false;
    if (this.inputAdapter.consume('navLeft')) {
      movedSelection = this.moveCommandSelection('left');
    } else if (this.inputAdapter.consume('navRight')) {
      movedSelection = this.moveCommandSelection('right');
    } else if (this.inputAdapter.consume('navUp')) {
      movedSelection = this.moveCommandSelection('up');
    } else if (this.inputAdapter.consume('navDown')) {
      movedSelection = this.moveCommandSelection('down');
    }

    if (movedSelection) {
      this.audio.playMenuMove();
      this.refreshCommandHighlights();
      this.publishBattleState();
    }

    if (!this.inputAdapter.consume('confirm')) {
      return;
    }

    const selected = this.commandButtons.find(
      (button) => button.index === this.selectedCommandIndex
    );
    if (!selected) {
      return;
    }

    void this.handleCommandSelection(selected.command);
  }

  private moveCommandSelection(direction: 'left' | 'right' | 'up' | 'down'): boolean {
    const nextIndex = this.navigateGridSelection(
      this.commandButtons,
      this.selectedCommandIndex,
      direction
    );
    if (nextIndex === this.selectedCommandIndex) {
      return false;
    }

    this.selectedCommandIndex = nextIndex;
    return true;
  }

  private updateMoveSelectionInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.bagKey)) {
      this.openBag('move');
      return;
    }

    if (this.inputAdapter.consume('cancel') || this.inputAdapter.consume('menu')) {
      this.closeMoveSelection();
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
      return;
    }

    let movedSelection = false;
    if (this.inputAdapter.consume('navLeft')) {
      movedSelection = this.moveMoveSelection('left');
    } else if (this.inputAdapter.consume('navRight')) {
      movedSelection = this.moveMoveSelection('right');
    } else if (this.inputAdapter.consume('navUp')) {
      movedSelection = this.moveMoveSelection('up');
    } else if (this.inputAdapter.consume('navDown')) {
      movedSelection = this.moveMoveSelection('down');
    }

    if (movedSelection) {
      this.audio.playMenuMove();
      this.refreshMoveHighlights();
      this.publishBattleState();
    }

    if (!this.inputAdapter.consume('confirm')) {
      return;
    }

    const selection = this.getMoveSlots().find((slot) => slot.index === this.selectedMoveIndex);
    if (!selection) {
      return;
    }

    if (selection.moveId === null) {
      this.closeMoveSelection();
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
      return;
    }

    void this.executeMoveTurn(selection.moveId);
  }

  private moveMoveSelection(direction: 'left' | 'right' | 'up' | 'down'): boolean {
    const slots = this.getMoveSlots();
    const nextIndex = this.navigateGridSelection(slots, this.selectedMoveIndex, direction);
    if (nextIndex === this.selectedMoveIndex) {
      return false;
    }

    this.selectedMoveIndex = nextIndex;
    return true;
  }

  private navigateGridSelection<T extends { index: number; row: number; col: number }>(
    slots: T[],
    currentIndex: number,
    direction: 'left' | 'right' | 'up' | 'down'
  ): number {
    if (slots.length === 0) {
      return currentIndex;
    }

    const current = slots.find((slot) => slot.index === currentIndex) ?? slots[0];
    let next = current;

    if (direction === 'left' || direction === 'right') {
      const rowSlots = slots
        .filter((slot) => slot.row === current.row)
        .sort((a, b) => a.col - b.col);
      if (rowSlots.length <= 1) {
        return currentIndex;
      }

      let pointer = rowSlots.findIndex((slot) => slot.index === current.index);
      pointer = pointer < 0 ? 0 : pointer;
      pointer =
        direction === 'left'
          ? (pointer - 1 + rowSlots.length) % rowSlots.length
          : (pointer + 1) % rowSlots.length;

      next = rowSlots[pointer];
    } else {
      const rows = [...new Set(slots.map((slot) => slot.row))].sort((a, b) => a - b);
      if (rows.length <= 1) {
        return currentIndex;
      }

      const rowPointer = rows.indexOf(current.row);
      const nextRow =
        direction === 'up'
          ? rows[(rowPointer - 1 + rows.length) % rows.length]
          : rows[(rowPointer + 1) % rows.length];

      const rowSlots = slots.filter((slot) => slot.row === nextRow).sort((a, b) => a.col - b.col);
      if (rowSlots.length === 0) {
        return currentIndex;
      }

      next =
        rowSlots.find((slot) => slot.col === current.col) ??
        rowSlots.reduce((closest, slot) => {
          const slotDistance = Math.abs(slot.col - current.col);
          const closestDistance = Math.abs(closest.col - current.col);
          return slotDistance < closestDistance ? slot : closest;
        }, rowSlots[0]);
    }

    return next.index;
  }

  private async handleCommandSelection(command: BattleCommand): Promise<void> {
    if (!this.menuActive || this.actionInProgress || this.battleResolved) {
      return;
    }
    this.audio.playMenuConfirm();

    if (command === 'fight') {
      this.openMoveSelection();
      return;
    }

    if (command === 'bag') {
      this.openBag('command');
      return;
    }

    if (command === 'switch') {
      await this.beginManualSwitch();
      return;
    }

    await this.attemptRun();
  }

  private openMoveSelection(): void {
    const player = this.getActivePlayerCreature();
    if (!player || this.moveReplaceActive || this.switchOpen) {
      return;
    }

    this.closeBag();
    this.destroyMovePanel();

    this.moveSelectionOpen = true;
    this.selectedMoveIndex = 0;

    const layout = this.getBattleLayout();
    const moveIds = [...player.moves];
    const totalOptions = moveIds.length + 1;
    const compactLayout =
      (this.viewport.formFactor === 'mobile' && this.viewport.orientation === 'portrait') ||
      layout.battlePanelWidth < 560;
    let columns = 4;
    if (compactLayout) {
      columns = totalOptions >= 5 ? 3 : 2;
    } else if (totalOptions >= 5) {
      columns = 3;
    }
    const rows = Math.max(1, Math.ceil(totalOptions / columns));
    const spacing = 8;
    const buttonHeight = rows > 1 ? 34 : 40;
    const panelHeight = 16 + rows * buttonHeight + (rows - 1) * spacing;
    const panelY = Math.max(this.viewport.y + 12, this.battlePanelTop - panelHeight - 8);

    this.movePanel = this.add
      .rectangle(layout.movePanelX, panelY, layout.movePanelWidth, panelHeight, 0x071321, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0x8fbbe0, 1)
      .setDepth(60);

    const buttonWidth = Math.floor((this.movePanel.width - 16 - spacing * (columns - 1)) / columns);
    const startX = this.movePanel.x + 8;
    const startY = this.movePanel.y + 8;

    const createMoveButton = (
      moveId: MoveId,
      index: number,
      x: number,
      y: number,
      width: number,
      height: number,
      row: number,
      col: number
    ): void => {
      const move = getMoveDefinition(moveId);
      const background = this.add
        .rectangle(x, y, width, height, 0x1a2638, 1)
        .setOrigin(0)
        .setStrokeStyle(2, 0x5d7ea7, 1)
        .setDepth(61)
        .setInteractive({ useHandCursor: true });

      const text = this.add
        .text(background.x + 8, background.y + 8, move.name, {
          fontFamily: '"Courier New", monospace',
          fontSize: '14px',
          color: '#dce8f8'
        })
        .setDepth(62);

      background.on('pointerover', () => {
        if (!this.menuActive || this.actionInProgress || this.bagOpen) {
          return;
        }
        this.selectedMoveIndex = index;
        this.refreshMoveHighlights();
        this.publishBattleState();
      });

      background.on('pointerdown', () => {
        if (!this.menuActive || this.actionInProgress || this.battleResolved || this.bagOpen) {
          return;
        }
        this.selectedMoveIndex = index;
        this.refreshMoveHighlights();
        void this.executeMoveTurn(moveId);
      });

      this.moveButtons.push({
        moveId,
        index,
        row,
        col,
        background,
        text
      });
    };

    moveIds.forEach((moveId, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = startX + col * (buttonWidth + spacing);
      const y = startY + row * (buttonHeight + spacing);
      createMoveButton(moveId, index, x, y, buttonWidth, buttonHeight, row, col);
    });

    const backIndex = moveIds.length;
    this.moveBackRow = Math.floor(backIndex / columns);
    this.moveBackCol = backIndex % columns;
    const backX = startX + this.moveBackCol * (buttonWidth + spacing);
    const backY = startY + this.moveBackRow * (buttonHeight + spacing);
    this.moveBackButton = this.add
      .rectangle(backX, backY, buttonWidth, buttonHeight, 0x1a2638, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0x5d7ea7, 1)
      .setDepth(61)
      .setInteractive({ useHandCursor: true });

    this.moveBackText = this.add
      .text(this.moveBackButton.x + 8, this.moveBackButton.y + 8, 'Back', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#dce8f8'
      })
      .setDepth(62);

    this.moveBackButton.on('pointerover', () => {
      if (!this.menuActive || this.actionInProgress || this.bagOpen) {
        return;
      }
      this.selectedMoveIndex = this.moveButtons.length;
      this.refreshMoveHighlights();
      this.publishBattleState();
    });

    this.moveBackButton.on('pointerdown', () => {
      if (!this.menuActive || this.actionInProgress || this.battleResolved || this.bagOpen) {
        return;
      }
      this.selectedMoveIndex = this.moveButtons.length;
      this.closeMoveSelection();
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
    });

    this.setMessage('Choose a move. Esc: Back  B: Bag');
    this.refreshMoveHighlights();
    this.publishBattleState();
  }

  private closeMoveSelection(): void {
    if (!this.moveSelectionOpen) {
      return;
    }

    this.moveSelectionOpen = false;
    this.selectedMoveIndex = 0;
    this.destroyMovePanel();
  }

  private refreshMovePanelForActiveCreature(): void {
    if (!this.moveSelectionOpen) {
      return;
    }

    this.openMoveSelection();
  }

  private destroyMovePanel(): void {
    this.movePanel?.destroy();
    this.movePanel = undefined;

    this.moveButtons.forEach((button) => {
      button.background.destroy();
      button.text.destroy();
    });
    this.moveButtons = [];

    this.moveBackButton?.destroy();
    this.moveBackText?.destroy();
    this.moveBackButton = undefined;
    this.moveBackText = undefined;
    this.moveBackRow = 0;
    this.moveBackCol = 0;
  }

  private getMoveSlots(): Array<{
    index: number;
    row: number;
    col: number;
    moveId: MoveId | null;
  }> {
    const slots: Array<{ index: number; row: number; col: number; moveId: MoveId | null }> =
      this.moveButtons.map((button) => ({
        index: button.index,
        row: button.row,
        col: button.col,
        moveId: button.moveId
      }));

    slots.push({
      index: this.moveButtons.length,
      row: this.moveBackRow,
      col: this.moveBackCol,
      moveId: null
    });

    return slots;
  }

  private refreshCommandHighlights(): void {
    this.commandButtons.forEach((button) => {
      const selected =
        this.menuActive &&
        !this.actionInProgress &&
        !this.moveSelectionOpen &&
        !this.bagOpen &&
        button.index === this.selectedCommandIndex;

      const disabled = !button.enabled;
      button.background.setFillStyle(selected ? 0x2b4264 : 0x1a2638, 1);
      button.background.setStrokeStyle(2, selected ? 0xb5d9ff : 0x5d7ea7, 1);
      button.text.setColor(disabled ? '#788da6' : selected ? '#f7f2b4' : '#dce8f8');
    });
  }

  private refreshMoveHighlights(): void {
    this.moveButtons.forEach((button) => {
      const selected =
        this.menuActive &&
        !this.actionInProgress &&
        this.moveSelectionOpen &&
        !this.bagOpen &&
        button.index === this.selectedMoveIndex;

      button.background.setFillStyle(selected ? 0x2b4264 : 0x1a2638, 1);
      button.background.setStrokeStyle(2, selected ? 0xb5d9ff : 0x5d7ea7, 1);
      button.text.setColor(selected ? '#f7f2b4' : '#dce8f8');
    });

    const backSelected =
      this.menuActive &&
      !this.actionInProgress &&
      this.moveSelectionOpen &&
      !this.bagOpen &&
      this.selectedMoveIndex === this.moveButtons.length;

    if (this.moveBackButton && this.moveBackText) {
      this.moveBackButton.setFillStyle(backSelected ? 0x2b4264 : 0x1a2638, 1);
      this.moveBackButton.setStrokeStyle(2, backSelected ? 0xb5d9ff : 0x5d7ea7, 1);
      this.moveBackText.setColor(backSelected ? '#f7f2b4' : '#dce8f8');
    }
  }

  private openBag(returnMode: 'command' | 'move'): void {
    if (
      !this.menuActive ||
      this.actionInProgress ||
      this.battleResolved ||
      this.bagOpen ||
      this.moveReplaceActive ||
      this.switchOpen
    ) {
      return;
    }

    this.bagOpen = true;
    this.bagReturnMode = returnMode;
    this.selectedBagIndex = 0;
    this.destroyBagPanel();

    const layout = this.getBattleLayout();
    this.bagPanel = this.add
      .rectangle(
        layout.bagPanelX,
        layout.bagPanelY,
        layout.bagPanelWidth,
        layout.bagPanelHeight,
        0x071321,
        0.96
      )
      .setOrigin(0)
      .setStrokeStyle(2, 0x8fbbe0, 1)
      .setDepth(80);
    this.bagHeaderText = this.add
      .text(this.bagPanel.x + 10, this.bagPanel.y + 8, 'Bag', {
        fontFamily: '"Courier New", monospace',
        fontSize: '15px',
        color: '#f2f8ff'
      })
      .setDepth(81);

    BAG_ITEMS.forEach((entry, index) => {
      const rowY = this.bagPanel!.y + 30 + index * 26;
      const row = this.add
        .rectangle(this.bagPanel!.x + 8, rowY, this.bagPanel!.width - 16, 22, 0x142236, 1)
        .setOrigin(0)
        .setDepth(82)
        .setStrokeStyle(1, 0x5d7ea7, 1)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(row.x + 7, row.y + 4, '', {
          fontFamily: '"Courier New", monospace',
          fontSize: '13px',
          color: '#dce8f8'
        })
        .setDepth(83);

      row.on('pointerover', () => {
        this.selectedBagIndex = index;
        this.refreshBagHighlights();
        this.publishBattleState();
      });

      row.on('pointerdown', () => {
        this.selectedBagIndex = index;
        this.refreshBagHighlights();
        void this.useBagItem(entry.item);
      });

      this.bagItemButtons.push({
        item: entry.item,
        index,
        background: row,
        text: label
      });
    });

    this.refreshBagHighlights();
    this.publishBattleState();
  }

  private closeBag(): void {
    if (!this.bagOpen) {
      return;
    }

    this.bagOpen = false;
    this.destroyBagPanel();

    if (this.moveSelectionOpen && this.bagReturnMode === 'move') {
      this.refreshMoveHighlights();
    } else {
      this.refreshCommandHighlights();
    }

    this.publishBattleState();
  }

  private destroyBagPanel(): void {
    this.bagPanel?.destroy();
    this.bagHeaderText?.destroy();
    this.bagPanel = undefined;
    this.bagHeaderText = undefined;

    this.bagItemButtons.forEach((button) => {
      button.background.destroy();
      button.text.destroy();
    });
    this.bagItemButtons = [];
  }

  private refreshBagHighlights(): void {
    this.bagItemButtons.forEach((button) => {
      const selected = button.index === this.selectedBagIndex;
      const count = this.gameState.inventory[button.item];
      const disabled = count <= 0;

      button.background.setFillStyle(selected ? 0x2a4162 : 0x142236, 1);
      button.background.setStrokeStyle(1, selected ? 0xb8dbff : 0x5d7ea7, 1);
      button.text.setColor(disabled ? '#7a8ea6' : selected ? '#f7f0ad' : '#dce8f8');
      button.text.setText(`${selected ? '>' : ' '} ${this.getItemLabel(button.item)} x${count}`);
    });
  }

  private updateBagInput(): void {
    const moveUp = this.inputAdapter.consume('navUp');
    const moveDown = this.inputAdapter.consume('navDown');

    if (moveUp || moveDown) {
      const direction = moveUp ? -1 : 1;
      this.selectedBagIndex =
        (this.selectedBagIndex + direction + this.bagItemButtons.length) %
        this.bagItemButtons.length;
      this.audio.playMenuMove();
      this.refreshBagHighlights();
      this.publishBattleState();
    }

    if (
      this.inputAdapter.consume('cancel') ||
      this.inputAdapter.consume('menu') ||
      Phaser.Input.Keyboard.JustDown(this.bagKey)
    ) {
      this.closeBag();
      return;
    }

    if (this.inputAdapter.consume('confirm')) {
      const selected = this.bagItemButtons[this.selectedBagIndex];
      if (!selected) {
        return;
      }
      void this.useBagItem(selected.item);
    }
  }

  private async useBagItem(item: InventoryKey): Promise<void> {
    if (!this.menuActive || this.actionInProgress || this.battleResolved) {
      return;
    }

    if (this.gameState.challengeMode && this.battleType === 'trainer') {
      this.audio.playMenuBack();
      this.setMessage('Challenge Mode: Items are disabled in trainer battles.');
      return;
    }

    const count = this.gameState.inventory[item];
    if (count <= 0) {
      this.audio.playMenuBack();
      this.setMessage(`No ${this.getItemLabel(item)} left.`);
      return;
    }

    if (item === 'coreSeal') {
      if (this.battleType !== 'wild') {
        this.audio.playMenuBack();
        this.setMessage('Core Seal cannot be used in trainer battles.');
        return;
      }

      this.menuActive = false;
      this.actionInProgress = true;
      this.closeBag();
      this.closeMoveSelection();

      consumeInventory(this.gameState, 'coreSeal', 1);
      SaveSystem.save(this.gameState);

      await this.showQueuedMessages(['You threw a Core Seal!'], 460);

      const captureResult = this.tryCapture();
      if (captureResult.captured) {
        await this.showQueuedMessages([captureResult.message], 900);
        await this.endBattle('capture');
        return;
      }

      await this.showQueuedMessages(['The Core Seal failed!'], 620);

      this.actionInProgress = false;
      this.menuActive = true;
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
      return;
    }

    if (item === 'potion') {
      const healResult = this.engine.heal('player', 30);
      const healedAmount = healResult.after - healResult.before;

      if (healedAmount <= 0) {
        this.audio.playMenuBack();
        this.setMessage('HP is already full.');
        return;
      }

      this.menuActive = false;
      this.actionInProgress = true;
      this.closeBag();
      this.closeMoveSelection();

      consumeInventory(this.gameState, 'potion', 1);
      SaveSystem.save(this.gameState);

      await this.animateHpBar(this.playerHpUi, healResult.after);
      this.syncCombatantsFromEngine();
      await this.showQueuedMessages([`Recovered ${healedAmount} HP.`], 620);

      this.actionInProgress = false;
      this.menuActive = true;
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
      return;
    }

    const cleared = this.engine.clearStatus('player');
    if (!cleared) {
      this.audio.playMenuBack();
      this.setMessage('No status condition to cleanse.');
      return;
    }

    this.menuActive = false;
    this.actionInProgress = true;
    this.closeBag();
    this.closeMoveSelection();

    consumeInventory(this.gameState, 'cleanse', 1);
    SaveSystem.save(this.gameState);
    this.syncCombatantsFromEngine();

    await this.showQueuedMessages(['Status condition removed.'], 620);

    this.actionInProgress = false;
    this.menuActive = true;
    this.setCommandPrompt();
    this.refreshCommandHighlights();
    this.publishBattleState();
  }

  private tryCapture(): { captured: boolean; message: string } {
    const state = this.engine.getState();
    const enemyDefinition = getCreatureDefinition(state.enemy.speciesId);
    const hpFactor = (state.enemy.maxHp - state.enemy.currentHp) / Math.max(1, state.enemy.maxHp);
    const bonus = 0.15 * hpFactor;
    const finalChance = Phaser.Math.Clamp(enemyDefinition.baseCatchRate + bonus, 0.05, 0.85);
    const roll = Math.random();

    if (roll > finalChance) {
      return {
        captured: false,
        message: 'Capture failed.'
      };
    }

    const capturedCreature: CreatureInstance = {
      speciesId: state.enemy.speciesId,
      level: state.enemy.level,
      xp: 0,
      bond: 0,
      nickname: undefined,
      stats: {
        hp: state.enemy.maxHp,
        atk: state.enemy.atk,
        def: state.enemy.def,
        spd: state.enemy.spd
      },
      currentHp: Math.max(1, state.enemy.currentHp),
      status: state.enemy.status ?? null,
      moves: [...state.enemy.moves]
    };

    const destination = addCreatureToCollection(this.gameState, capturedCreature);
    const enemyName = this.getCreatureLabel(capturedCreature);

    return {
      captured: true,
      message:
        destination === 'party'
          ? `Captured ${enemyName}! Added to party.`
          : `Captured ${enemyName}! Sent to storage.`
    };
  }

  private async attemptRun(): Promise<void> {
    if (this.battleType !== 'wild') {
      this.audio.playMenuBack();
      this.setMessage('No retreat in trainer battles.');
      return;
    }

    this.menuActive = false;
    this.actionInProgress = true;
    this.closeBag();
    this.closeMoveSelection();

    await this.showQueuedMessages(['Got away safely!'], 620);
    await this.endBattle('escaped');
  }

  private async beginManualSwitch(): Promise<void> {
    const switchable = this.getSwitchablePartyIndices();
    if (switchable.length === 0) {
      this.audio.playMenuBack();
      this.setMessage('No other party member can battle.');
      return;
    }

    this.menuActive = false;
    const choice = await this.promptSwitch(false);

    if (choice === null || this.battleResolved) {
      this.menuActive = true;
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
      return;
    }

    await this.performSwitch(choice, true);
  }

  private getSwitchablePartyIndices(): number[] {
    return this.gameState.party
      .map((creature, index) => ({ creature, index }))
      .filter((entry) => entry.index !== this.activePlayerIndex && entry.creature.currentHp > 0)
      .map((entry) => entry.index);
  }

  private async promptSwitch(forced: boolean): Promise<number | null> {
    this.closeBag();
    this.closeMoveSelection();
    this.destroySwitchPanel();

    this.switchOpen = true;
    this.switchForced = forced;
    this.selectedSwitchIndex = 0;

    const rowCount = this.gameState.party.length + (forced ? 0 : 1);
    const rowHeight =
      this.viewport.formFactor === 'mobile' && this.viewport.orientation === 'portrait' ? 24 : 26;
    const rowGap = 4;
    const headerHeight = 34;
    const viewport = this.viewport;
    const panelHeight = headerHeight + rowCount * (rowHeight + rowGap) + 10;
    const panelWidth = Math.min(520, viewport.width - 24);
    const panelX = viewport.x + Math.round((viewport.width - panelWidth) / 2);
    const panelY = viewport.y + Math.max(10, Math.round((viewport.height - panelHeight) / 2));

    this.switchPanel = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x06111f, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0x95bfd9, 1)
      .setDepth(95);

    this.switchHeaderText = this.add
      .text(panelX + 10, panelY + 8, forced ? 'Choose Next Corebeast' : 'Switch Corebeast', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#f5f8ff'
      })
      .setDepth(96);

    const rowStartY = panelY + headerHeight;

    this.gameState.party.forEach((creature, index) => {
      const rowY = rowStartY + index * (rowHeight + rowGap);
      const disabled = index === this.activePlayerIndex || creature.currentHp <= 0;

      const row = this.add
        .rectangle(panelX + 8, rowY, panelWidth - 16, rowHeight, 0x152236, 1)
        .setOrigin(0)
        .setDepth(96)
        .setStrokeStyle(1, 0x5d7ea7, 1)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(row.x + 30, row.y + 5, '', {
          fontFamily: '"Courier New", monospace',
          fontSize: '13px',
          color: '#dce8f8'
        })
        .setDepth(97);

      const icon = this.add
        .image(
          row.x + 14,
          row.y + 13,
          ProcSpriteFactory.generateOverworld(this, creature.speciesId)
        )
        .setOrigin(0.5)
        .setDepth(97);

      row.on('pointerover', () => {
        this.selectedSwitchIndex = index;
        this.refreshSwitchHighlights();
        this.publishBattleState();
      });

      row.on('pointerdown', () => {
        this.selectedSwitchIndex = index;
        this.refreshSwitchHighlights();
        if (disabled) {
          this.audio.playMenuBack();
          return;
        }
        this.resolveSwitchSelection(index);
      });

      this.switchButtons.push({
        index,
        partyIndex: index,
        disabled,
        background: row,
        text: label,
        icon
      });
    });
    if (!forced) {
      const cancelIndex = this.gameState.party.length;
      const rowY = rowStartY + cancelIndex * (rowHeight + rowGap);
      const row = this.add
        .rectangle(panelX + 8, rowY, panelWidth - 16, rowHeight, 0x152236, 1)
        .setOrigin(0)
        .setDepth(96)
        .setStrokeStyle(1, 0x5d7ea7, 1)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(row.x + 8, row.y + 5, '', {
          fontFamily: '"Courier New", monospace',
          fontSize: '13px',
          color: '#dce8f8'
        })
        .setDepth(97);

      row.on('pointerover', () => {
        this.selectedSwitchIndex = cancelIndex;
        this.refreshSwitchHighlights();
        this.publishBattleState();
      });

      row.on('pointerdown', () => {
        this.selectedSwitchIndex = cancelIndex;
        this.refreshSwitchHighlights();
        this.resolveSwitchSelection(null);
      });

      this.switchButtons.push({
        index: cancelIndex,
        partyIndex: null,
        disabled: false,
        background: row,
        text: label
      });
    }

    const firstValid = this.switchButtons.find(
      (button) => button.partyIndex !== null && !button.disabled
    );
    this.selectedSwitchIndex = firstValid?.index ?? 0;

    this.refreshSwitchHighlights();
    this.publishBattleState();

    return new Promise<number | null>((resolve) => {
      this.switchResolver = resolve;
    });
  }

  private updateSwitchInput(): void {
    const moveUp = this.inputAdapter.consume('navUp');
    const moveDown = this.inputAdapter.consume('navDown');

    const selectableRows = [...new Set(this.switchButtons.map((button) => button.index))]
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);

    if (moveUp || moveDown) {
      const direction = moveUp ? -1 : 1;
      const currentPointer = selectableRows.indexOf(this.selectedSwitchIndex);
      const normalizedCurrent = currentPointer < 0 ? 0 : currentPointer;
      const nextPointer =
        (normalizedCurrent + direction + selectableRows.length) % selectableRows.length;

      this.selectedSwitchIndex = selectableRows[nextPointer];
      this.audio.playMenuMove();
      this.refreshSwitchHighlights();
      this.publishBattleState();
    }

    if (
      !this.switchForced &&
      (this.inputAdapter.consume('cancel') || this.inputAdapter.consume('menu'))
    ) {
      this.resolveSwitchSelection(null);
      return;
    }

    if (!this.inputAdapter.consume('confirm')) {
      return;
    }

    const selected = this.switchButtons.find((button) => button.index === this.selectedSwitchIndex);
    if (!selected) {
      return;
    }

    if (selected.partyIndex === null) {
      this.resolveSwitchSelection(null);
      return;
    }

    if (selected.disabled) {
      this.audio.playMenuBack();
      return;
    }

    this.resolveSwitchSelection(selected.partyIndex);
  }

  private refreshSwitchHighlights(): void {
    this.switchButtons.forEach((button) => {
      const selected = button.index === this.selectedSwitchIndex;
      const isCancel = button.partyIndex === null;

      let label = '';
      if (isCancel) {
        label = `${selected ? '>' : ' '} Cancel`;
      } else {
        const partyIndex = button.partyIndex;
        const creature = partyIndex === null ? null : this.gameState.party[partyIndex];
        if (!creature) {
          label = `${selected ? '>' : ' '} ---`;
        } else {
          const stateLabel =
            partyIndex === this.activePlayerIndex
              ? '[Active]'
              : creature.currentHp <= 0
                ? '[Fainted]'
                : '';
          label =
            `${selected ? '>' : ' '} ${this.getCreatureLabel(creature)} Lv${creature.level}` +
            ` HP ${creature.currentHp}/${creature.stats.hp} ${stateLabel}`;
        }
      }

      button.background.setFillStyle(selected ? 0x2a4162 : 0x152236, 1);
      button.background.setStrokeStyle(1, selected ? 0xb8dbff : 0x5d7ea7, 1);
      button.text.setColor(button.disabled ? '#7a8ea6' : selected ? '#f7f0ad' : '#dce8f8');
      button.text.setText(label.trimEnd());
    });
  }

  private resolveSwitchSelection(value: number | null): void {
    if (!this.switchOpen) {
      return;
    }

    const resolver = this.switchResolver;
    this.switchResolver = null;

    this.switchOpen = false;
    this.switchForced = false;
    this.destroySwitchPanel();
    this.publishBattleState();
    resolver?.(value);
  }

  private destroySwitchPanel(): void {
    this.switchPanel?.destroy();
    this.switchHeaderText?.destroy();
    this.switchPanel = undefined;
    this.switchHeaderText = undefined;

    this.switchButtons.forEach((button) => {
      button.background.destroy();
      button.text.destroy();
      button.icon?.destroy();
    });
    this.switchButtons = [];
  }

  private async performSwitch(targetIndex: number, consumeTurn: boolean): Promise<void> {
    const current = this.getActivePlayerCreature();
    const next = this.gameState.party[targetIndex];

    if (!current || !next || targetIndex === this.activePlayerIndex || next.currentHp <= 0) {
      this.actionInProgress = false;
      this.menuActive = true;
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
      return;
    }

    this.closeBag();
    this.closeMoveSelection();
    this.menuActive = false;
    this.actionInProgress = true;

    this.syncCombatantsFromEngine();
    await this.playWithdrawAnimation('player');

    if (consumeTurn) {
      await this.showQueuedMessages(
        [`${this.gameState.player.name} withdrew ${this.getCreatureLabel(current)}!`],
        520
      );
    }

    this.activePlayerIndex = targetIndex;
    this.rebuildEngineFromActive();
    this.refreshPlayerVisual();
    await this.playSendOutAnimation('player');

    await this.showQueuedMessages([`Go, ${this.getCreatureLabel(next)}!`], 520);
    this.triggerAbilityHook('onEnter', next, this.getActiveEnemyCreature());
    await this.flushMessageQueue();

    if (consumeTurn) {
      await this.executeEnemyResponseTurn();
      return;
    }

    this.actionInProgress = false;
    this.menuActive = true;
    this.setCommandPrompt();
    this.refreshCommandHighlights();
    this.publishBattleState();
  }

  private async executeMoveTurn(moveId: MoveId): Promise<void> {
    if (!this.menuActive || this.actionInProgress || this.battleResolved) {
      return;
    }

    this.menuActive = false;
    this.actionInProgress = true;
    this.closeBag();
    this.closeMoveSelection();
    this.bossTurnNumber += 1;

    await this.triggerTurnStartAbilities();

    if (await this.tryExecuteHardSwitchBeforeEnemyAction()) {
      const turn = this.engine.resolvePlayerTurn(moveId);
      await this.playTurnActions(turn.actions);
      this.syncCombatantsFromEngine();
      await this.resolveAfterTurn();
      return;
    }

    const trainerMove = this.chooseTrainerMove();
    const turn = this.engine.resolveTurn(moveId, trainerMove ?? undefined);
    await this.playTurnActions(turn.actions);
    this.syncCombatantsFromEngine();
    await this.resolveAfterTurn();
  }
  private async executeEnemyResponseTurn(): Promise<void> {
    if (this.battleResolved) {
      return;
    }

    this.bossTurnNumber += 1;
    await this.triggerTurnStartAbilities();

    if (await this.tryExecuteHardSwitchBeforeEnemyAction()) {
      this.syncCombatantsFromEngine();
      await this.resolveAfterTurn();
      return;
    }

    const trainerMove = this.chooseTrainerMove();
    const turn = this.engine.resolveEnemyTurn(trainerMove ?? undefined);
    await this.playTurnActions(turn.actions);
    this.syncCombatantsFromEngine();
    await this.resolveAfterTurn();
  }

  private chooseTrainerMove(): MoveId | null {
    if (this.battleType !== 'trainer') {
      return null;
    }

    const enemy = this.getActiveEnemyCreature();
    const player = this.getActivePlayerCreature();
    if (!enemy || !player || enemy.moves.length === 0) {
      return null;
    }

    const scoredMoves = enemy.moves.map((moveId, index) => {
      const move = getMoveDefinition(moveId);
      const multiplier = getTypeMultiplier(move.type, getCreatureDefinition(player.speciesId).type);
      const estimatedDamage = this.estimateDamage(enemy, player, move, multiplier);
      const lowHp = enemy.currentHp / Math.max(1, enemy.stats.hp) <= 0.3;

      let score = move.power;

      if (estimatedDamage >= player.currentHp) {
        score += 1000;
      }

      if (multiplier > 1) {
        score += 120 + Math.round((multiplier - 1) * 90);
      } else if (multiplier < 1) {
        score -= 65;
      } else {
        score += Math.round(move.power * 0.6);
      }

      if (move.statusEffect) {
        score += player.status ? 20 : 45;
        if (lowHp) {
          score += 28;
        }
      } else if (lowHp) {
        score -= 12;
      }

      return {
        moveId,
        index,
        score,
        power: move.power
      };
    });

    scoredMoves.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.power !== left.power) {
        return right.power - left.power;
      }

      return left.index - right.index;
    });

    let selected = scoredMoves[0];
    if (scoredMoves.length > 1 && Math.random() < 0.1) {
      const alternatives = scoredMoves.slice(1);
      selected = alternatives[Math.floor(Math.random() * alternatives.length)] ?? selected;
    }

    if (import.meta.env.DEV) {
      const summary = scoredMoves
        .slice(0, 4)
        .map((entry) => `${getMoveDefinition(entry.moveId).name}:${entry.score}`)
        .join(', ');
      console.debug(
        `[TrainerAI] ${this.getCreatureLabel(enemy)} -> ${getMoveDefinition(selected.moveId).name} | ${summary}`
      );
    }

    return selected.moveId;
  }

  private estimateDamage(
    attacker: CreatureInstance,
    defender: CreatureInstance,
    move: MoveDefinition,
    multiplier: number
  ): number {
    if (move.power <= 0) {
      return 0;
    }

    const scaled = move.power * (Math.max(1, attacker.stats.atk) / Math.max(1, defender.stats.def));
    return Math.max(1, Math.floor(scaled * multiplier));
  }

  private async tryExecuteHardSwitchBeforeEnemyAction(): Promise<boolean> {
    const targetIndex = this.findHardSwitchTargetIndex();
    if (targetIndex === null) {
      return false;
    }

    const currentEnemy = this.getActiveEnemyCreature();
    const nextEnemy = this.enemyTeam[targetIndex];
    if (!currentEnemy || !nextEnemy) {
      return false;
    }

    this.enemyHardSwitchUsed = true;
    this.syncCombatantsFromEngine();
    await this.playWithdrawAnimation('enemy');
    await this.showQueuedMessages(
      [`${this.trainerName} withdrew ${this.getCreatureLabel(currentEnemy)}!`],
      500
    );

    this.enemyActiveIndex = targetIndex;
    this.rebuildEngineFromActive();
    this.refreshEnemyVisual();
    await this.playSendOutAnimation('enemy');
    await this.showQueuedMessages(
      [`${this.trainerName} sent out ${this.getCreatureLabel(nextEnemy)}!`],
      520
    );
    this.triggerAbilityHook('onEnter', nextEnemy, this.getActivePlayerCreature());
    await this.flushMessageQueue();
    return true;
  }

  private findHardSwitchTargetIndex(): number | null {
    if (
      this.battleType !== 'trainer' ||
      this.getCurrentDifficulty() !== 'hard' ||
      this.enemyHardSwitchUsed
    ) {
      return null;
    }

    const activeEnemy = this.getActiveEnemyCreature();
    const player = this.getActivePlayerCreature();
    if (!activeEnemy || !player || activeEnemy.currentHp <= 0) {
      return null;
    }

    const activeWeak =
      activeEnemy.moves.length > 0 &&
      activeEnemy.moves.every((moveId) => {
        const move = getMoveDefinition(moveId);
        if (move.power <= 0) {
          return true;
        }

        return getTypeMultiplier(move.type, getCreatureDefinition(player.speciesId).type) < 1;
      });

    if (!activeWeak) {
      return null;
    }

    const playerType = getCreatureDefinition(player.speciesId).type;
    const candidates = this.enemyTeam
      .map((creature, index) => ({ creature, index }))
      .filter(
        (entry) =>
          entry.index !== this.enemyActiveIndex &&
          entry.creature.currentHp > 0 &&
          entry.creature.moves.some(
            (moveId) => getTypeMultiplier(getMoveDefinition(moveId).type, playerType) > 1
          )
      );

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      const leftBest = Math.max(
        ...left.creature.moves.map((moveId) =>
          getTypeMultiplier(getMoveDefinition(moveId).type, playerType)
        )
      );
      const rightBest = Math.max(
        ...right.creature.moves.map((moveId) =>
          getTypeMultiplier(getMoveDefinition(moveId).type, playerType)
        )
      );

      if (rightBest !== leftBest) {
        return rightBest - leftBest;
      }

      return right.creature.level - left.creature.level;
    });

    return candidates[0]?.index ?? null;
  }

  private getCurrentDifficulty(): DifficultyMode {
    return this.gameState.difficulty ?? 'normal';
  }

  private async playTurnActions(actions: BattleAction[]): Promise<void> {
    for (const action of actions) {
      if (action.type === 'message') {
        const localizedMessage =
          action.text === 'Super effective!'
            ? "It's strong!"
            : action.text === 'Not very effective...'
              ? "It's weak..."
              : action.text;
        await this.showQueuedMessages([localizedMessage], 520);
      } else if (action.type === 'damage') {
        await this.playDamageAction(action);
      } else if (action.type === 'status') {
        this.audio.beep({ frequency: 640, durationMs: 80 });
        await this.showQueuedMessages([action.text], 500);
      } else if (action.type === 'faint') {
        await this.playFaintAnimation(action.target);
      }
    }
  }

  private async resolveAfterTurn(): Promise<void> {
    await this.triggerLowHpAbilities();
    await this.runBossTurnBehaviors();

    const enemy = this.getActiveEnemyCreature();
    if (enemy && enemy.currentHp <= 0) {
      await this.handleEnemyFaintFlow();
      if (this.battleResolved || !this.actionInProgress) {
        return;
      }
    }

    const player = this.getActivePlayerCreature();
    if (player && player.currentHp <= 0) {
      await this.handlePlayerFaintFlow();
      if (this.battleResolved || !this.actionInProgress) {
        return;
      }
    }

    if (this.battleResolved) {
      return;
    }

    this.actionInProgress = false;
    this.menuActive = true;
    this.setCommandPrompt();
    this.refreshCommandHighlights();
    this.publishBattleState();
  }

  private async triggerTurnStartAbilities(): Promise<void> {
    const player = this.getActivePlayerCreature();
    const enemy = this.getActiveEnemyCreature();
    this.triggerAbilityHook('onTurnStart', player, enemy);
    this.triggerAbilityHook('onTurnStart', enemy, player);
    await this.flushMessageQueue();
  }

  private async triggerLowHpAbilities(): Promise<void> {
    const player = this.getActivePlayerCreature();
    const enemy = this.getActiveEnemyCreature();

    if (player && player.currentHp > 0 && player.currentHp <= Math.ceil(player.stats.hp / 3)) {
      this.triggerAbilityHook('onLowHP', player, enemy);
    }

    if (enemy && enemy.currentHp > 0 && enemy.currentHp <= Math.ceil(enemy.stats.hp / 3)) {
      this.triggerAbilityHook('onLowHP', enemy, player);
    }

    await this.flushMessageQueue();
  }

  private triggerAbilityHook(
    hookName: AbilityHookName,
    source: CreatureInstance | null,
    target: CreatureInstance | null
  ): void {
    if (!source) {
      return;
    }

    const abilityId = getCreatureDefinition(source.speciesId).abilityId;
    if (!abilityId) {
      return;
    }

    const ability = ABILITIES[abilityId];
    if (!ability) {
      return;
    }

    const hook = ability[hookName];
    if (!hook) {
      return;
    }

    try {
      hook(this.buildAbilityContext(source, target));
    } catch (error) {
      console.warn(`[Ability:${abilityId}] ${hookName} hook failed.`, error);
    }
  }

  private buildAbilityContext(
    source: CreatureInstance,
    target: CreatureInstance | null
  ): AbilityContext {
    return {
      source,
      target: target ?? undefined,
      battleState: {
        enqueueAbilityMessage: (text: string): void => {
          const trimmed = text.trim();
          if (trimmed.length === 0) {
            return;
          }

          this.enqueueMessage(trimmed, {
            durationMs: 560,
            mode: 'fast'
          });
        },
        hasAbilityEventTag: (tag: string): boolean => this.abilityEventTags.has(tag),
        markAbilityEventTag: (tag: string): void => {
          this.abilityEventTags.add(tag);
        }
      }
    };
  }

  private isBossBattle(): boolean {
    return this.battleType === 'trainer' && this.bossConfig !== null;
  }

  private async runBossStartBehavior(): Promise<void> {
    if (!this.isBossBattle() || !this.bossConfig?.onBattleStartActionId) {
      return;
    }

    this.runBossBehaviorAction(this.bossConfig.onBattleStartActionId);
    await this.flushMessageQueue();
    await this.handleBossMusicAndSwitchQueue();
  }

  private async runBossTurnBehaviors(): Promise<void> {
    if (!this.isBossBattle() || this.battleResolved) {
      return;
    }

    const activeEnemy = this.getActiveEnemyCreature();
    if (!activeEnemy || activeEnemy.currentHp <= 0) {
      return;
    }

    this.evaluateBossPhaseTriggers();

    if (this.bossConfig?.specialBehaviorId) {
      this.runBossBehaviorAction(this.bossConfig.specialBehaviorId);
    }

    await this.flushMessageQueue();
    await this.handleBossMusicAndSwitchQueue();
  }

  private runBossBehaviorAction(actionId: string): void {
    const behavior = BOSS_BEHAVIORS[actionId];
    if (!behavior) {
      return;
    }

    behavior(this.buildBossContext());
  }

  private buildBossContext(): BossContext {
    return {
      activeCreature: this.getActiveEnemyCreature(),
      opponentCreature: this.getActivePlayerCreature(),
      battleState: {
        ...this.bossState,
        turnNumber: this.bossTurnNumber
      },
      scene: this,
      enqueueMessage: (text, options) => {
        const trimmed = text.trim();
        if (trimmed.length <= 0) {
          return;
        }

        this.enqueueMessage(trimmed, {
          durationMs: options?.durationMs ?? 560,
          mode: options?.locked ? 'locked' : 'fast'
        });
      },
      applyStatus: (target, status) => {
        this.applyBossStatus(target, status);
      },
      modifyDamageTemp: (multiplier, target = 'active') => {
        this.setTemporaryDamageModifier(target, multiplier);
      },
      forceSwitch: (mode = 'next') => {
        this.queueBossForceSwitch(mode);
      },
      setBattleModifier: (key, value) => {
        this.setBossModifier(key, value);
      }
    };
  }

  private normalizeBossStatus(
    status: CreatureInstance['status'] | 'gloom' | 'root' | 'shock'
  ): CreatureInstance['status'] {
    if (status === 'gloom') {
      return 'poison';
    }

    if (status === 'root' || status === 'shock') {
      return 'stun';
    }

    return status;
  }

  private applyBossStatus(
    target: 'active' | 'opponent' | 'both',
    status: CreatureInstance['status'] | 'gloom' | 'root' | 'shock'
  ): void {
    const normalized = this.normalizeBossStatus(status);
    const enemy = this.getActiveEnemyCreature();
    const player = this.getActivePlayerCreature();

    if ((target === 'active' || target === 'both') && enemy) {
      enemy.status = normalized;
      this.updateEnemyCombatantPanel(enemy);
    }

    if ((target === 'opponent' || target === 'both') && player) {
      player.status = normalized;
      this.updatePlayerCombatantPanel(player);
    }

    this.rebuildEngineFromActive();
    this.publishBattleState();
  }

  private setTemporaryDamageModifier(
    target: 'active' | 'opponent' | 'both',
    multiplier: number
  ): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return;
    }

    if (target === 'active' || target === 'both') {
      this.tempDamageModifiers.enemy = multiplier;
    }

    if (target === 'opponent' || target === 'both') {
      this.tempDamageModifiers.player = multiplier;
    }
  }

  private setBossModifier(key: string, value: unknown): void {
    if (key === 'damageModifierDelta') {
      const delta = Number(value);
      if (!Number.isFinite(delta)) {
        return;
      }

      const current = Number(this.bossState.damageModifier ?? 1);
      this.bossState.damageModifier = Phaser.Math.Clamp(current + delta, 0.5, 2.5);
      return;
    }

    this.bossState[key] = value;

    if (key === 'stoneWardSetupRequested' && value === true) {
      this.initializeStoneWardFlags();
      this.bossState.stoneWardSetupRequested = false;
    }
  }

  private queueBossForceSwitch(mode: 'next' | 'final'): void {
    if (this.pendingBossForceSwitchMode === 'final') {
      return;
    }

    if (mode === 'final') {
      this.pendingBossForceSwitchMode = 'final';
      return;
    }

    if (!this.pendingBossForceSwitchMode) {
      this.pendingBossForceSwitchMode = 'next';
    }
  }

  private async handleBossMusicAndSwitchQueue(): Promise<void> {
    if (this.consumeBossFlag('triggerFinalPhaseMusic')) {
      await this.audio.crossfadeTo('battle_final_phase', 400);
    }

    await this.processBossForceSwitchQueue();
  }

  private consumeBossFlag(key: string): boolean {
    if (this.bossState[key] !== true) {
      return false;
    }

    this.bossState[key] = false;
    return true;
  }

  private async processBossForceSwitchQueue(): Promise<void> {
    const mode = this.pendingBossForceSwitchMode;
    if (!mode) {
      return;
    }

    this.pendingBossForceSwitchMode = null;
    const targetIndex = this.findBossSwitchTarget(mode);
    if (targetIndex === null) {
      return;
    }

    await this.performBossEnemySwitch(targetIndex);
  }

  private findBossSwitchTarget(mode: 'next' | 'final'): number | null {
    const aliveIndices = this.enemyTeam
      .map((creature, index) => ({ creature, index }))
      .filter((entry) => entry.creature.currentHp > 0 && entry.index !== this.enemyActiveIndex)
      .map((entry) => entry.index);

    if (aliveIndices.length === 0) {
      return null;
    }

    if (mode === 'final') {
      return aliveIndices[aliveIndices.length - 1] ?? null;
    }

    const forward = aliveIndices.find((index) => index > this.enemyActiveIndex);
    return forward ?? aliveIndices[0] ?? null;
  }

  private async performBossEnemySwitch(targetIndex: number): Promise<void> {
    const currentEnemy = this.getActiveEnemyCreature();
    if (!currentEnemy || targetIndex === this.enemyActiveIndex) {
      return;
    }

    this.syncCombatantsFromEngine();
    await this.playWithdrawAnimation('enemy');

    this.enemyActiveIndex = targetIndex;
    this.rebuildEngineFromActive();
    this.refreshEnemyVisual();
    await this.playSendOutAnimation('enemy');

    const nextEnemy = this.getActiveEnemyCreature();
    if (!nextEnemy) {
      return;
    }

    await this.showQueuedMessages(
      [`${this.trainerName} sent out ${this.getCreatureLabel(nextEnemy)}!`],
      520
    );
    this.triggerAbilityHook('onEnter', nextEnemy, this.getActivePlayerCreature());
    await this.flushMessageQueue();
  }

  private evaluateBossPhaseTriggers(): void {
    const triggers = this.bossConfig?.phaseTriggers;
    if (!triggers || triggers.length <= 0) {
      return;
    }

    const enemy = this.getActiveEnemyCreature();
    triggers.forEach((trigger, index) => {
      const triggerKey = `${index}:${trigger.actionId}`;
      if (this.bossTriggeredPhases.has(triggerKey)) {
        return;
      }

      let matched = false;
      if (trigger.condition === 'turnNumber') {
        matched = this.bossTurnNumber >= Math.max(1, Math.floor(trigger.value));
      } else if (
        trigger.condition === 'hpBelowPercent' &&
        enemy &&
        enemy.currentHp > 0 &&
        enemy.stats.hp > 0
      ) {
        const hpPercent = (enemy.currentHp / enemy.stats.hp) * 100;
        matched = hpPercent <= trigger.value;
      }

      if (!matched) {
        return;
      }

      this.bossTriggeredPhases.add(triggerKey);
      this.runBossBehaviorAction(trigger.actionId);
    });
  }

  private initializeStoneWardFlags(): void {
    this.stoneWardFlags.clear();

    this.gameState.party.forEach((creature, index) => {
      if (creature.currentHp > 0) {
        this.stoneWardFlags.add(`player:${index}`);
      }
    });

    this.enemyTeam.forEach((creature, index) => {
      if (creature.currentHp > 0) {
        this.stoneWardFlags.add(`enemy:${index}`);
      }
    });
  }

  private applyDamageAdjustments(input: DamageAdjusterInput): number {
    let adjusted = Math.max(1, Math.floor(input.damage));

    const globalModifier = Number(this.bossState.damageModifier ?? 1);
    if (Number.isFinite(globalModifier) && globalModifier > 0) {
      adjusted = Math.max(1, Math.floor(adjusted * globalModifier));
    }

    const tempModifier = this.tempDamageModifiers[input.defender];
    if (typeof tempModifier === 'number' && Number.isFinite(tempModifier) && tempModifier > 0) {
      adjusted = Math.max(1, Math.floor(adjusted * tempModifier));
      delete this.tempDamageModifiers[input.defender];
    }

    if (this.consumeStoneWard(input.defender)) {
      adjusted = Math.max(1, Math.floor(adjusted * 0.5));
      const defender =
        input.defender === 'player'
          ? this.getActivePlayerCreature()
          : this.getActiveEnemyCreature();
      if (defender) {
        this.pendingBossMessages.push(
          `${this.getCreatureLabel(defender)}'s Stone Ward absorbed the blow!`
        );
      }
    }

    return Math.max(1, Math.floor(adjusted));
  }

  private consumeStoneWard(defender: 'player' | 'enemy'): boolean {
    if (this.bossState.stoneWardEnabled !== true) {
      return false;
    }

    const slotKey =
      defender === 'player' ? `player:${this.activePlayerIndex}` : `enemy:${this.enemyActiveIndex}`;
    if (!this.stoneWardFlags.has(slotKey)) {
      return false;
    }

    this.stoneWardFlags.delete(slotKey);
    return true;
  }

  private async handleEnemyFaintFlow(): Promise<void> {
    const defeatedEnemy = this.getActiveEnemyCreature();
    if (defeatedEnemy) {
      this.recordEnemyXpReward(defeatedEnemy.level);
    }

    if (this.enemyActiveIndex < this.enemyTeam.length - 1) {
      this.enemyActiveIndex += 1;
      this.rebuildEngineFromActive();
      this.refreshEnemyVisual();
      await this.playSendOutAnimation('enemy');

      const nextEnemy = this.getActiveEnemyCreature();
      if (nextEnemy) {
        const sendOutMessage =
          this.battleType === 'trainer'
            ? `${this.trainerName} sent out ${this.getCreatureLabel(nextEnemy)}!`
            : `Wild ${this.getCreatureLabel(nextEnemy)} appeared!`;
        await this.showQueuedMessages([sendOutMessage], 560);
        this.triggerAbilityHook('onEnter', nextEnemy, this.getActivePlayerCreature());
        await this.flushMessageQueue();
      }

      this.actionInProgress = false;
      this.menuActive = true;
      this.setCommandPrompt();
      this.refreshCommandHighlights();
      this.publishBattleState();
      return;
    }

    await this.handleVictoryFlow();
  }

  private async handlePlayerFaintFlow(): Promise<void> {
    const available = this.getSwitchablePartyIndices();
    if (available.length === 0) {
      await this.showQueuedMessages(['All party members have fainted...'], {
        durationMs: 620,
        mode: 'locked'
      });
      await this.endBattle('defeat');
      return;
    }

    await this.showQueuedMessages(['Choose the next Corebeast!'], {
      durationMs: 620,
      mode: 'locked'
    });
    const choice = await this.promptSwitch(true);

    if (choice === null) {
      await this.endBattle('defeat');
      return;
    }

    await this.performSwitch(choice, false);
  }

  private recordEnemyXpReward(enemyLevel: number): void {
    const current = this.pendingXpByPartyIndex.get(this.activePlayerIndex) ?? 0;
    const reward = calculateBattleXpReward(enemyLevel, this.battleType);
    this.pendingXpByPartyIndex.set(this.activePlayerIndex, current + reward);
  }

  private async handleVictoryFlow(): Promise<void> {
    await this.showQueuedMessages(['Victory!'], 720);

    const rewards = [...this.pendingXpByPartyIndex.entries()].sort((a, b) => a[0] - b[0]);
    const challengeLevelCap = this.gameState.challengeMode
      ? getChallengeLevelCap(
          this.gameState.storyFlags,
          this.gameState.difficulty,
          this.gameState.newGamePlus
        )
      : undefined;

    for (const [partyIndex, totalXp] of rewards) {
      const creature = this.gameState.party[partyIndex];
      if (!creature || totalXp <= 0) {
        continue;
      }

      const progression = applyExperienceGain(creature, totalXp, {
        mapId: this.gameState.player.mapId,
        storyFlags: this.gameState.storyFlags,
        levelCap: challengeLevelCap
      });
      await this.showQueuedMessages(
        [`${this.getCreatureLabel(creature)} gained ${totalXp} XP!`],
        820
      );

      if (
        challengeLevelCap !== undefined &&
        progression.levelUps.length === 0 &&
        creature.level >= challengeLevelCap
      ) {
        await this.showQueuedMessages(
          [
            `${this.getCreatureLabel(creature)} is capped at Lv ${challengeLevelCap}.`,
            'Defeat the next Trial to raise the cap.'
          ],
          {
            durationMs: 620,
            mode: 'locked'
          }
        );
      }

      for (const levelUp of progression.levelUps) {
        await this.handleLevelUp(creature, levelUp, partyIndex === this.activePlayerIndex);
      }
    }

    if (this.isBossBattle()) {
      await this.playBossVictoryMusic();
    }

    this.pendingXpByPartyIndex.clear();
    await this.endBattle('victory');
  }

  private async playBossVictoryMusic(): Promise<void> {
    await this.audio.fadeOut(220);
    await this.audio.playTrack('victory_boss');
    await this.wait(Math.min(2200, AudioSystem.getTrackDurationMs('victory_boss')));
    await this.audio.fadeOut(180);
    await this.audio.playTrack('overworld');
  }

  private async handleLevelUp(
    creature: CreatureInstance,
    levelUp: LevelUpProgress,
    isActivePlayer: boolean
  ): Promise<void> {
    await this.showQueuedMessages(
      [`${this.getCreatureLabel(creature)} grew to Lv ${levelUp.level}!`],
      {
        durationMs: 620,
        mode: 'locked'
      }
    );

    if (isActivePlayer) {
      this.updatePlayerCombatantPanel(creature);
      await this.animateHpBar(this.playerHpUi, creature.currentHp);
    }

    for (const moveId of levelUp.learnedMoves) {
      await this.teachMove(creature, moveId);
    }

    if (levelUp.evolution) {
      if (isActivePlayer) {
        await this.playEvolutionSequence(creature, levelUp.evolution);
      } else {
        const fromName = getCreatureDefinition(levelUp.evolution.fromSpeciesId).name;
        const toName = getCreatureDefinition(levelUp.evolution.toSpeciesId).name;
        await this.showQueuedMessages([`${fromName} evolved into ${toName}!`], {
          durationMs: 620,
          mode: 'locked'
        });
      }
    }

    if (isActivePlayer) {
      this.rebuildEngineFromActive();
      this.refreshPlayerVisual();
      this.refreshMovePanelForActiveCreature();
    }
  }

  private async teachMove(creature: CreatureInstance, moveId: MoveId): Promise<void> {
    const moveName = getMoveDefinition(moveId).name;
    const moveList = creature.moves;
    const maxMoves = getMaxMovesForLevel(creature.level);

    if (moveList.includes(moveId)) {
      return;
    }

    if (moveList.length < maxMoves) {
      moveList.push(moveId);
      await this.showQueuedMessages(
        [`${this.getCreatureLabel(creature)} learned ${moveName}!`],
        740
      );
      return;
    }

    await this.showQueuedMessages(
      [`${this.getCreatureLabel(creature)} wants to learn ${moveName}.`, 'Replace a move?'],
      760
    );

    const replacedMove = await this.promptMoveReplacement(creature, moveId);
    if (!replacedMove) {
      await this.showQueuedMessages(
        [`${this.getCreatureLabel(creature)} did not learn ${moveName}.`],
        740
      );
      return;
    }

    const replaceIndex = moveList.indexOf(replacedMove);
    if (replaceIndex < 0) {
      return;
    }

    const oldMoveName = getMoveDefinition(replacedMove).name;
    moveList[replaceIndex] = moveId;

    await this.showQueuedMessages(
      [
        `${this.getCreatureLabel(creature)} forgot ${oldMoveName}!`,
        `${this.getCreatureLabel(creature)} learned ${moveName}!`
      ],
      760
    );
  }
  private promptMoveReplacement(
    creature: CreatureInstance,
    nextMoveId: MoveId
  ): Promise<MoveId | null> {
    this.destroyMoveReplacePanel();

    const optionCount = creature.moves.length + 1;
    const rowHeight = 22;
    const rowGap = 2;
    const headerHeight = 34;
    const viewport = this.viewport;
    const panelHeight = headerHeight + optionCount * (rowHeight + rowGap) + 8;
    const panelWidth = Math.min(312, viewport.width - 24);
    const panelX = viewport.x + Math.round((viewport.width - panelWidth) / 2);
    const panelY = Math.max(this.viewport.y + 16, this.battlePanelTop - panelHeight - 8);

    this.replaceMovePanel = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x06111f, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0x95bfd9, 1)
      .setDepth(95);

    this.replaceMoveHeaderText = this.add
      .text(panelX + 10, panelY + 8, `Learn ${getMoveDefinition(nextMoveId).name}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#f5f8ff'
      })
      .setDepth(96);

    const rowStartY = panelY + headerHeight;

    [...creature.moves].forEach((moveId, index) => {
      const row = this.add
        .rectangle(
          panelX + 8,
          rowStartY + index * (rowHeight + rowGap),
          panelWidth - 16,
          rowHeight,
          0x152236,
          1
        )
        .setOrigin(0)
        .setDepth(96)
        .setStrokeStyle(1, 0x5d7ea7, 1)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(row.x + 7, row.y + 4, '', {
          fontFamily: '"Courier New", monospace',
          fontSize: '13px',
          color: '#dce8f8'
        })
        .setDepth(97);

      row.on('pointerover', () => {
        this.selectedReplaceIndex = index;
        this.refreshMoveReplaceHighlights();
      });

      row.on('pointerdown', () => {
        this.selectedReplaceIndex = index;
        this.resolveMoveReplaceSelection(moveId);
      });

      this.replaceMoveButtons.push({
        index,
        moveId,
        background: row,
        text: label
      });
    });

    const cancelIndex = this.replaceMoveButtons.length;
    const cancelRow = this.add
      .rectangle(
        panelX + 8,
        rowStartY + cancelIndex * (rowHeight + rowGap),
        panelWidth - 16,
        rowHeight,
        0x152236,
        1
      )
      .setOrigin(0)
      .setDepth(96)
      .setStrokeStyle(1, 0x5d7ea7, 1)
      .setInteractive({ useHandCursor: true });

    const cancelLabel = this.add
      .text(cancelRow.x + 7, cancelRow.y + 4, '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        color: '#dce8f8'
      })
      .setDepth(97);

    cancelRow.on('pointerover', () => {
      this.selectedReplaceIndex = cancelIndex;
      this.refreshMoveReplaceHighlights();
    });

    cancelRow.on('pointerdown', () => {
      this.selectedReplaceIndex = cancelIndex;
      this.resolveMoveReplaceSelection(null);
    });

    this.replaceMoveButtons.push({
      index: cancelIndex,
      moveId: null,
      background: cancelRow,
      text: cancelLabel
    });

    this.moveReplaceActive = true;
    this.selectedReplaceIndex = 0;
    this.refreshMoveReplaceHighlights();
    this.publishBattleState();

    return new Promise<MoveId | null>((resolve) => {
      this.replaceMoveResolver = resolve;
    });
  }

  private updateMoveReplaceInput(): void {
    const moveUp = this.inputAdapter.consume('navUp');
    const moveDown = this.inputAdapter.consume('navDown');

    if (moveUp || moveDown) {
      const direction = moveUp ? -1 : 1;
      this.selectedReplaceIndex =
        (this.selectedReplaceIndex + direction + this.replaceMoveButtons.length) %
        this.replaceMoveButtons.length;
      this.audio.playMenuMove();
      this.refreshMoveReplaceHighlights();
      this.publishBattleState();
    }

    if (this.inputAdapter.consume('cancel') || this.inputAdapter.consume('menu')) {
      this.resolveMoveReplaceSelection(null);
      return;
    }

    if (this.inputAdapter.consume('confirm')) {
      const selected = this.replaceMoveButtons[this.selectedReplaceIndex];
      if (!selected) {
        return;
      }
      this.resolveMoveReplaceSelection(selected.moveId);
    }
  }

  private resolveMoveReplaceSelection(value: MoveId | null): void {
    if (!this.moveReplaceActive) {
      return;
    }

    const resolver = this.replaceMoveResolver;
    this.replaceMoveResolver = null;
    this.moveReplaceActive = false;
    this.destroyMoveReplacePanel();
    this.publishBattleState();
    resolver?.(value);
  }

  private destroyMoveReplacePanel(): void {
    this.replaceMovePanel?.destroy();
    this.replaceMoveHeaderText?.destroy();
    this.replaceMovePanel = undefined;
    this.replaceMoveHeaderText = undefined;

    this.replaceMoveButtons.forEach((button) => {
      button.background.destroy();
      button.text.destroy();
    });

    this.replaceMoveButtons = [];
    this.moveReplaceActive = false;
    this.selectedReplaceIndex = 0;
  }

  private refreshMoveReplaceHighlights(): void {
    this.replaceMoveButtons.forEach((button) => {
      const selected = button.index === this.selectedReplaceIndex;
      const label =
        button.moveId === null
          ? `${selected ? '>' : ' '} Cancel (skip)`
          : `${selected ? '>' : ' '} ${getMoveDefinition(button.moveId).name}`;

      button.background.setFillStyle(selected ? 0x2a4162 : 0x152236, 1);
      button.background.setStrokeStyle(1, selected ? 0xb8dbff : 0x5d7ea7, 1);
      button.text.setColor(selected ? '#f7f0ad' : '#dce8f8');
      button.text.setText(label);
    });
  }

  private async playEvolutionSequence(
    creature: CreatureInstance,
    evolution: EvolutionProgress
  ): Promise<void> {
    const fromName = getCreatureDefinition(evolution.fromSpeciesId).name;
    const toName = getCreatureDefinition(evolution.toSpeciesId).name;

    await this.showQueuedMessages([`What? ${fromName} is evolving!`], {
      durationMs: 620,
      mode: 'locked'
    });
    this.audio.sweep({
      fromFrequency: 420,
      toFrequency: 1120,
      durationMs: 520,
      type: 'triangle'
    });

    this.tweens.killTweensOf(this.playerSprite);
    const viewport = this.viewport;
    const flash = this.add
      .rectangle(viewport.x, viewport.y, viewport.width, viewport.height, 0xffffff, 0)
      .setOrigin(0)
      .setDepth(110);

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: [this.playerSprite, flash],
        alpha: 0.15,
        duration: 90,
        yoyo: true,
        repeat: 5,
        onComplete: () => resolve()
      });
    });

    this.playerSprite.setTexture(ProcSpriteFactory.generateBack(this, creature.speciesId));
    this.playerSprite.setAlpha(1);
    flash.destroy();
    this.resumeIdleBob('player');

    this.updatePlayerCombatantPanel(creature);
    this.applyHpVisual(this.playerHpUi, creature.currentHp);
    await this.showQueuedMessages([`${fromName} evolved into ${toName}!`], {
      durationMs: 620,
      mode: 'locked'
    });
  }

  private createCombatantPanel(
    x: number,
    y: number,
    width: number,
    creature: CreatureInstance
  ): HpBarUi {
    const panelWidth = Math.max(236, width);
    const panel = createPanel(this, {
      x,
      y,
      width: panelWidth,
      height: 74,
      fillColor: 0x0a101b,
      fillAlpha: 0.94,
      strokeColor: 0x95bfd9,
      strokeWidth: 2,
      depth: 30
    });

    const title = createBodyText(
      this,
      x + 10,
      y + 8,
      `${this.getCreatureLabel(creature)}  Lv${creature.level}`,
      {
        size: 15,
        color: '#f7f8ff',
        depth: 31
      }
    );
    const icon = createTinyIcon(this, x + 6, y + 16, {
      color: 0x9fd0ff,
      size: 3,
      depth: 31
    });

    const statusBadge = createBodyText(this, x + panelWidth - 66, y + 8, '', {
      size: 10,
      color: '#d8edff',
      depth: 31
    })
      .setPadding(4, 1, 4, 1)
      .setBackgroundColor('#243a54')
      .setVisible(false);

    const hpTrackWidth = Math.max(122, panelWidth - 92);

    const track = this.add
      .rectangle(x + 10, y + 36, hpTrackWidth, 11, 0x1f2d3a, 1)
      .setOrigin(0)
      .setDepth(31);
    track.setStrokeStyle(1, 0x415d7d, 1);

    const fill = this.add
      .rectangle(x + 10, y + 36, hpTrackWidth, 11, 0x52cd75, 1)
      .setOrigin(0)
      .setDepth(32);

    const hpText = this.add
      .text(x + 10, y + 52, '', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '12px',
        color: '#b8d3e8'
      })
      .setDepth(31);

    const hpUi: HpBarUi = {
      panel,
      track,
      title,
      fill,
      label: hpText,
      statusBadge,
      maxWidth: hpTrackWidth,
      maxHp: creature.stats.hp,
      displayedHp: creature.currentHp,
      icon
    };

    this.applyHpVisual(hpUi, creature.currentHp);
    this.applyStatusBadge(hpUi, creature.status);
    return hpUi;
  }

  private updatePlayerCombatantPanel(creature: CreatureInstance): void {
    this.playerHpUi.title.setText(`${this.getCreatureLabel(creature)}  Lv${creature.level}`);
    this.playerHpUi.maxHp = creature.stats.hp;
    this.applyHpVisual(this.playerHpUi, creature.currentHp);
    this.applyStatusBadge(this.playerHpUi, creature.status);
  }

  private updateEnemyCombatantPanel(creature: CreatureInstance): void {
    this.enemyHpUi.title.setText(`${this.getCreatureLabel(creature)}  Lv${creature.level}`);
    this.enemyHpUi.maxHp = creature.stats.hp;
    this.applyHpVisual(this.enemyHpUi, creature.currentHp);
    this.applyStatusBadge(this.enemyHpUi, creature.status);
  }

  private refreshPlayerVisual(): void {
    const player = this.getActivePlayerCreature();
    if (!player) {
      return;
    }

    this.stopIdleBob('player');
    this.tweens.killTweensOf(this.playerSprite);
    const layout = this.getBattleLayout();
    this.playerSprite
      .setTexture(ProcSpriteFactory.generateBack(this, player.speciesId))
      .setPosition(layout.playerSpriteX, layout.playerSpriteY)
      .setScale(3)
      .setVisible(true)
      .setAlpha(1);

    this.resumeIdleBob('player');
    this.updatePlayerCombatantPanel(player);
    this.layoutCombatantPanels();
  }

  private refreshEnemyVisual(): void {
    const enemy = this.getActiveEnemyCreature();
    if (!enemy) {
      return;
    }

    this.stopIdleBob('enemy');
    this.tweens.killTweensOf(this.enemySprite);
    const layout = this.getBattleLayout();
    this.enemySprite
      .setTexture(ProcSpriteFactory.generateFront(this, enemy.speciesId))
      .setPosition(layout.enemySpriteX, layout.enemySpriteY)
      .setScale(3)
      .setVisible(true)
      .setAlpha(1);
    this.applyRareEnemyVisual();

    this.resumeIdleBob('enemy');
    this.updateEnemyCombatantPanel(enemy);
    this.layoutCombatantPanels();
  }

  private async playDamageAction(action: Extract<BattleAction, { type: 'damage' }>): Promise<void> {
    const targetHp = action.defender === 'player' ? this.playerHpUi : this.enemyHpUi;
    const defender =
      action.defender === 'player' ? this.getActivePlayerCreature() : this.getActiveEnemyCreature();
    const attacker =
      action.attacker === 'player' ? this.getActivePlayerCreature() : this.getActiveEnemyCreature();
    const maxHp = defender?.stats.hp ?? targetHp.maxHp;
    const isBigHit = maxHp > 0 && action.damage >= Math.ceil(maxHp * 0.25);

    this.audio.beep({ frequency: 300, durationMs: 90, type: 'triangle' });
    await this.playAttackImpact(action.attacker, action.defender, isBigHit);
    await this.animateHpBar(targetHp, action.remainingHp);

    if (this.pendingBossMessages.length > 0) {
      const queued = [...this.pendingBossMessages];
      this.pendingBossMessages = [];
      await this.showQueuedMessages(queued, 540);
    }

    this.triggerAbilityHook('onHit', defender, attacker);
    await this.flushMessageQueue();
    await this.wait(70);
  }

  private async flashHitTarget(sprite: Phaser.GameObjects.Image): Promise<void> {
    const shouldRestoreRareTint =
      sprite === this.enemySprite &&
      this.rareEncounter &&
      this.battleType === 'wild' &&
      this.enemyActiveIndex === 0;

    sprite.setTint(0xffffff);

    await new Promise<void>((resolve) => {
      this.time.delayedCall(60, () => resolve());
    });

    sprite.clearTint();
    if (shouldRestoreRareTint) {
      this.applyRareEnemyVisual();
    }
  }

  private async playFaintAnimation(target: 'player' | 'enemy'): Promise<void> {
    const sprite = target === 'player' ? this.playerSprite : this.enemySprite;
    const creature =
      target === 'player' ? this.getActivePlayerCreature() : this.getActiveEnemyCreature();
    const creatureName = creature ? this.getCreatureLabel(creature) : 'Corebeast';
    const opponent =
      target === 'player' ? this.getActiveEnemyCreature() : this.getActivePlayerCreature();

    this.triggerAbilityHook('onFaint', creature, opponent);
    await this.flushMessageQueue();

    await this.showQueuedMessages([`${creatureName} fainted!`], {
      durationMs: 620,
      mode: 'locked'
    });

    this.stopIdleBob(target);
    this.tweens.killTweensOf(sprite);
    const basePosition = this.getSpriteBasePosition(target);
    sprite.setPosition(basePosition.x, basePosition.y);
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        y: basePosition.y + 10,
        duration: 250,
        ease: 'Sine.Out',
        onComplete: () => resolve()
      });
    });

    sprite.setVisible(false);
  }

  private async animateHpBar(hpUi: HpBarUi, nextHp: number): Promise<void> {
    const holder = { value: hpUi.displayedHp };

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: holder,
        value: nextHp,
        duration: 300,
        ease: 'Quad.Out',
        onUpdate: () => {
          this.applyHpVisual(hpUi, holder.value);
        },
        onComplete: () => resolve()
      });
    });

    hpUi.displayedHp = nextHp;
  }

  private getSpriteBasePosition(target: 'player' | 'enemy'): { x: number; y: number } {
    const layout = this.getBattleLayout();
    return target === 'player'
      ? { x: layout.playerSpriteX, y: layout.playerSpriteY }
      : { x: layout.enemySpriteX, y: layout.enemySpriteY };
  }

  private getRoleSprite(target: 'player' | 'enemy'): Phaser.GameObjects.Image {
    return target === 'player' ? this.playerSprite : this.enemySprite;
  }

  private stopIdleBob(target: 'player' | 'enemy', resetToBase = true): void {
    const bobTween = target === 'player' ? this.playerIdleBob : this.enemyIdleBob;
    if (bobTween) {
      bobTween.remove();
    }

    if (target === 'player') {
      this.playerIdleBob = null;
    } else {
      this.enemyIdleBob = null;
    }

    if (!resetToBase) {
      return;
    }

    const sprite = this.getRoleSprite(target);
    const base = this.getSpriteBasePosition(target);
    sprite.setY(base.y);
  }

  private resumeIdleBob(target: 'player' | 'enemy'): void {
    const sprite = this.getRoleSprite(target);
    if (!sprite.visible || sprite.alpha <= 0.01) {
      return;
    }

    const base = this.getSpriteBasePosition(target);
    sprite.setPosition(base.x, base.y);
    const bobTween = this.startIdleBob(sprite, 2, target === 'player' ? 880 : 930);
    if (target === 'player') {
      this.playerIdleBob = bobTween;
    } else {
      this.enemyIdleBob = bobTween;
    }
  }

  private async playWildEnemySlideIn(): Promise<void> {
    const base = this.getSpriteBasePosition('enemy');
    this.stopIdleBob('enemy');
    this.tweens.killTweensOf(this.enemySprite);

    this.enemySprite
      .setVisible(true)
      .setAlpha(1)
      .setScale(3)
      .setPosition(base.x + 54, base.y);
    this.applyRareEnemyVisual();

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: this.enemySprite,
        x: base.x,
        duration: 160,
        ease: 'Cubic.Out',
        onComplete: () => resolve()
      });
    });

    this.resumeIdleBob('enemy');
  }

  private async playSendOutAnimation(target: 'player' | 'enemy'): Promise<void> {
    const sprite = this.getRoleSprite(target);
    const base = this.getSpriteBasePosition(target);

    this.stopIdleBob(target);
    this.tweens.killTweensOf(sprite);

    sprite
      .setVisible(true)
      .setPosition(base.x, base.y + 6)
      .setAlpha(0)
      .setScale(2.1);

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: sprite,
        alpha: 1,
        scaleX: 3,
        scaleY: 3,
        y: base.y - 2,
        duration: 150,
        ease: 'Quad.Out',
        onComplete: () => resolve()
      });
    });

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: sprite,
        y: base.y,
        duration: 90,
        ease: 'Quad.Out',
        onComplete: () => resolve()
      });
    });

    this.resumeIdleBob(target);
  }

  private async playWithdrawAnimation(target: 'player' | 'enemy'): Promise<void> {
    const sprite = this.getRoleSprite(target);
    const base = this.getSpriteBasePosition(target);
    this.stopIdleBob(target);
    this.tweens.killTweensOf(sprite);
    sprite.setPosition(base.x, base.y);

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 120,
        ease: 'Quad.In',
        onComplete: () => resolve()
      });
    });

    sprite.setVisible(false);
  }

  private async playAttackImpact(
    attacker: 'player' | 'enemy',
    defender: 'player' | 'enemy',
    isBigHit = false
  ): Promise<void> {
    const attackerSprite = this.getRoleSprite(attacker);
    const defenderSprite = this.getRoleSprite(defender);
    const attackerBase = this.getSpriteBasePosition(attacker);
    const defenderBase = this.getSpriteBasePosition(defender);
    const lungeDistance = attacker === 'player' ? 12 : -12;

    this.stopIdleBob(attacker);
    this.stopIdleBob(defender);
    this.tweens.killTweensOf(attackerSprite);
    this.tweens.killTweensOf(defenderSprite);

    attackerSprite.setPosition(attackerBase.x, attackerBase.y);
    defenderSprite.setPosition(defenderBase.x, defenderBase.y);

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: attackerSprite,
        x: attackerBase.x + lungeDistance,
        duration: 80,
        ease: 'Quad.Out',
        yoyo: true,
        onComplete: () => resolve()
      });
    });

    await this.playDefenderHitFeedback(defender, isBigHit);

    attackerSprite.setPosition(attackerBase.x, attackerBase.y);
    defenderSprite.setPosition(defenderBase.x, defenderBase.y);
    this.resumeIdleBob(attacker);
    this.resumeIdleBob(defender);
  }

  private async playDefenderHitFeedback(
    defender: 'player' | 'enemy',
    isBigHit: boolean
  ): Promise<void> {
    const defenderSprite = this.getRoleSprite(defender);
    const base = this.getSpriteBasePosition(defender);
    const recoilDistance = defender === 'player' ? -6 : 6;

    if (isBigHit) {
      this.cameras.main.flash(90, 255, 255, 255, true);
    }
    this.cameras.main.shake(isBigHit ? 110 : 80, isBigHit ? 0.007 : 0.004, true);
    const flashPromise = this.flashHitTarget(defenderSprite);
    const recoilPromise = new Promise<void>((resolve) => {
      this.tweens.add({
        targets: defenderSprite,
        x: base.x + recoilDistance,
        duration: 80,
        ease: 'Quad.Out',
        yoyo: true,
        onComplete: () => resolve()
      });
    });

    await Promise.all([flashPromise, recoilPromise]);
  }

  private applyHpVisual(hpUi: HpBarUi, hpValue: number): void {
    const clamped = Phaser.Math.Clamp(Math.round(hpValue), 0, hpUi.maxHp);
    const ratio = hpUi.maxHp === 0 ? 0 : clamped / hpUi.maxHp;
    const width = ratio <= 0 ? 0 : Math.max(2, Math.floor(hpUi.maxWidth * ratio));

    hpUi.fill.setSize(width, hpUi.fill.height);
    hpUi.fill.setFillStyle(ratio > 0.4 ? 0x52cd75 : ratio > 0.2 ? 0xf0bc53 : 0xdf5a5a, 1);
    hpUi.label.setText(`HP ${clamped}/${hpUi.maxHp}`);
    hpUi.displayedHp = clamped;
  }

  private applyStatusBadge(
    hpUi: HpBarUi,
    status: CreatureInstance['status'] | 'root' | 'gloom' | 'shock'
  ): void {
    const statusLabel = this.getStatusBadgeLabel(status);
    if (!statusLabel) {
      hpUi.statusBadge.setVisible(false).setText('');
      return;
    }

    const badgeColor =
      statusLabel === 'BURN'
        ? '#5a3522'
        : statusLabel === 'SHOCK'
          ? '#214561'
          : statusLabel === 'ROOT'
            ? '#2c4e2f'
            : '#3c2f58';

    hpUi.statusBadge
      .setVisible(true)
      .setText(statusLabel)
      .setBackgroundColor(badgeColor)
      .setColor('#f2f8ff');
  }

  private getStatusBadgeLabel(
    status: CreatureInstance['status'] | 'root' | 'gloom' | 'shock'
  ): 'BURN' | 'SHOCK' | 'ROOT' | 'GLOOM' | null {
    if (status === 'burn') {
      return 'BURN';
    }

    if (status === 'stun' || status === 'shock') {
      return 'SHOCK';
    }

    if (status === 'poison' || status === 'gloom') {
      return 'GLOOM';
    }

    if (status === 'root') {
      return 'ROOT';
    }

    return null;
  }

  private async endBattle(outcome: BattleOutcome): Promise<void> {
    this.battleResolved = true;
    this.menuActive = false;
    this.actionInProgress = false;

    this.closeBag();
    this.closeMoveSelection();
    this.destroyMoveReplacePanel();
    this.destroySwitchPanel();

    this.syncCombatantsFromEngine();
    this.promoteActiveCreatureToLead();
    SaveSystem.save(this.gameState);
    this.publishBattleState();

    await new Promise<void>((resolve) => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
      this.cameras.main.fadeOut(280, 0, 0, 0);
    });

    if (!(this.isBossBattle() && outcome === 'victory')) {
      await this.audio.playTrack('overworld');
    }

    this.registry.set('battleState', null);
    this.scene.resume(SCENE_KEYS.OVERWORLD, {
      source: 'battle',
      outcome
    });
    this.scene.stop(SCENE_KEYS.BATTLE);
  }

  private syncCombatantsFromEngine(): void {
    if (!this.engine) {
      return;
    }

    const state = this.engine.getState();
    const activePlayer = this.getActivePlayerCreature();
    const activeEnemy = this.getActiveEnemyCreature();

    if (activePlayer) {
      activePlayer.currentHp = Phaser.Math.Clamp(
        Math.floor(state.player.currentHp),
        0,
        activePlayer.stats.hp
      );
      activePlayer.status = state.player.status ?? null;
    }

    if (activeEnemy) {
      activeEnemy.currentHp = Phaser.Math.Clamp(
        Math.floor(state.enemy.currentHp),
        0,
        activeEnemy.stats.hp
      );
      activeEnemy.status = state.enemy.status ?? null;
    }
  }

  private promoteActiveCreatureToLead(): void {
    if (this.activePlayerIndex <= 0 || this.activePlayerIndex >= this.gameState.party.length) {
      return;
    }

    const [active] = this.gameState.party.splice(this.activePlayerIndex, 1);
    this.gameState.party.unshift(active);
    this.activePlayerIndex = 0;
  }

  private rebuildEngineFromActive(): void {
    const activePlayer = this.getActivePlayerCreature();
    const activeEnemy = this.getActiveEnemyCreature();

    if (!activePlayer || !activeEnemy) {
      return;
    }

    const enemyStatusChance = this.getCurrentDifficulty() === 'easy' ? 0.8 : 1;

    this.engine = new BattleEngine(
      this.cloneCreature(activePlayer),
      this.cloneCreature(activeEnemy),
      {
        enemyStatusEffectChance: enemyStatusChance,
        damageAdjuster: (input) => this.applyDamageAdjustments(input)
      }
    );
  }

  private getActivePlayerCreature(): CreatureInstance | null {
    return this.gameState.party[this.activePlayerIndex] ?? null;
  }

  private getActiveEnemyCreature(): CreatureInstance | null {
    return this.enemyTeam[this.enemyActiveIndex] ?? null;
  }

  private enqueueMessage(text: string, durationOrOptions: number | MessageOptions = 640): void {
    const { durationMs, mode } = this.resolveMessageOptions(durationOrOptions);
    this.messageQueue.push({
      text,
      durationMs,
      mode
    });
  }

  private async flushMessageQueue(): Promise<void> {
    if (this.messageQueueTask) {
      await this.messageQueueTask;
      return;
    }

    if (this.messageQueue.length === 0) {
      return;
    }

    this.messageQueueTask = (async () => {
      while (this.messageQueue.length > 0) {
        const next = this.messageQueue.shift();
        if (!next) {
          continue;
        }

        this.setMessage(next.text);
        await this.waitForMessageAdvance(next.mode, next.durationMs);
      }
    })();

    await this.messageQueueTask;
    this.messageQueueTask = null;
  }

  private async showQueuedMessages(
    messages: string[],
    durationOrOptions: number | MessageOptions = 640
  ): Promise<void> {
    messages.forEach((message) => this.enqueueMessage(message, durationOrOptions));
    await this.flushMessageQueue();
    this.publishBattleState();
  }

  private setMessage(text: string): void {
    this.messageText.setText(text);
  }

  private setCommandPrompt(): void {
    this.setMessage('Choose a command.');
  }

  private resolveMessageOptions(durationOrOptions: number | MessageOptions): {
    durationMs: number;
    mode: MessageMode;
  } {
    if (typeof durationOrOptions === 'number') {
      return {
        durationMs: durationOrOptions,
        mode: 'fast'
      };
    }

    return {
      durationMs: durationOrOptions.durationMs ?? 640,
      mode: durationOrOptions.mode ?? 'fast'
    };
  }

  private waitForMessageAdvance(mode: MessageMode, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.activeMessageMode = mode;
      this.activeMessageResolver = () => {
        resolve();
      };

      if (mode === 'fast') {
        const speedMultiplier = getBattleMessageSpeedMultiplier(getUserSettings().textSpeed);
        const adjustedDuration = Math.round(durationMs * speedMultiplier);
        const autoDuration = Phaser.Math.Clamp(
          adjustedDuration,
          Math.round(FAST_MESSAGE_MIN_MS * speedMultiplier),
          Math.round(FAST_MESSAGE_MAX_MS * speedMultiplier)
        );
        this.activeMessageTimer = this.time.delayedCall(autoDuration, () => {
          this.resolveActiveMessage();
        });
      }

      if (this.shiftKey?.isDown) {
        this.resolveActiveMessage();
      }
    });
  }

  private resolveActiveMessage(): void {
    if (!this.activeMessageResolver) {
      return;
    }

    this.activeMessageTimer?.remove(false);
    this.activeMessageTimer = null;
    this.activeMessageMode = null;

    const resolver = this.activeMessageResolver;
    this.activeMessageResolver = null;
    resolver();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  private startIdleBob(
    sprite: Phaser.GameObjects.Image,
    offset = 2,
    duration = 900
  ): Phaser.Tweens.Tween {
    const existing =
      sprite === this.playerSprite
        ? this.playerIdleBob
        : sprite === this.enemySprite
          ? this.enemyIdleBob
          : null;

    existing?.remove();

    const tween = this.tweens.add({
      targets: sprite,
      y: sprite.y - offset,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });

    if (sprite === this.playerSprite) {
      this.playerIdleBob = tween;
    } else if (sprite === this.enemySprite) {
      this.enemyIdleBob = tween;
    }

    return tween;
  }

  private drawBackground(): void {
    if (!this.battleBackground) {
      this.battleBackground = this.add.graphics().setDepth(0);
    }

    const layout = this.getBattleLayout();
    const viewport = this.viewport;
    const graphics = this.battleBackground;
    graphics.clear();
    graphics.fillGradientStyle(0x16223a, 0x16223a, 0x0b101d, 0x0b101d, 1);
    graphics.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
    graphics.fillStyle(0x21304b, 0.45);
    graphics.fillEllipse(layout.enemySpriteX, layout.enemySpriteY + 30, 166, 52);
    graphics.fillStyle(0x1a2b42, 0.45);
    graphics.fillEllipse(layout.playerSpriteX, layout.playerSpriteY + 28, 196, 64);
  }

  private createRandomEnemy(): CreatureInstance {
    const leadSpecies = this.gameState.party[this.activePlayerIndex]?.speciesId ?? 'embercub';
    const leadLevel = this.gameState.party[this.activePlayerIndex]?.level ?? 5;

    const available = ENCOUNTER_CREATURE_IDS.filter((id) => id !== leadSpecies);
    const selected =
      available[Math.floor(Math.random() * available.length)] ?? (leadSpecies as CreatureId);

    return createCreatureInstance(selected, Math.max(3, leadLevel + Phaser.Math.Between(-1, 1)));
  }

  private getItemLabel(item: InventoryKey): string {
    if (item === 'coreSeal') {
      return 'Core Seal';
    }

    if (item === 'potion') {
      return 'Potion';
    }

    if (item === 'cleanse') {
      return 'Cleanse';
    }

    return 'Verdant Sigil';
  }

  private getCreatureLabel(creature: CreatureInstance): string {
    return creature.nickname ?? getCreatureDefinition(creature.speciesId).name;
  }

  private applyRareEnemyVisual(): void {
    if (!this.enemySprite) {
      return;
    }

    const enemy = this.getActiveEnemyCreature();
    const shouldTint =
      this.rareEncounter &&
      this.battleType === 'wild' &&
      Boolean(enemy) &&
      this.enemyActiveIndex === 0;
    if (!shouldTint) {
      this.enemySprite.clearTint();
      return;
    }

    const enemyType = enemy ? getCreatureDefinition(enemy.speciesId).type : 'Ember';
    const tintByType = {
      Ember: 0xffd6ad,
      Tide: 0xb8f0ff,
      Bloom: 0xd5ffb1,
      Volt: 0xe0d1ff,
      Stone: 0xf1dfc3,
      Shade: 0xd8ccff
    } as const;

    this.enemySprite.setTint(tintByType[enemyType]);
  }

  private resetRuntimeState(): void {
    this.stopIdleBob('player', false);
    this.stopIdleBob('enemy', false);
    this.resolveActiveMessage();
    this.activeMessageTimer?.remove(false);
    this.activeMessageTimer = null;
    this.activeMessageMode = null;

    this.destroyBagPanel();
    this.destroyMovePanel();
    this.destroySwitchPanel();
    this.destroyMoveReplacePanel();
    this.destroyCommandButtons();
    if (this.playerHpUi) {
      this.destroyCombatantPanel(this.playerHpUi);
    }
    if (this.enemyHpUi) {
      this.destroyCombatantPanel(this.enemyHpUi);
    }
    this.battlePanel?.destroy();
    this.backHint?.destroy();
    this.battlePanel = undefined;
    this.backHint = undefined;
    this.battleBackground?.destroy();
    this.battleBackground = undefined;

    this.commandButtons = [];
    this.selectedCommandIndex = 0;

    this.moveSelectionOpen = false;
    this.moveButtons = [];
    this.selectedMoveIndex = 0;
    this.moveBackRow = 0;
    this.moveBackCol = 0;

    this.bagOpen = false;
    this.bagItemButtons = [];
    this.selectedBagIndex = 0;
    this.bagReturnMode = 'command';

    this.switchOpen = false;
    this.switchForced = false;
    this.switchButtons = [];
    this.selectedSwitchIndex = 0;

    if (this.switchResolver) {
      const resolver = this.switchResolver;
      this.switchResolver = null;
      resolver(null);
    }

    this.moveReplaceActive = false;
    this.selectedReplaceIndex = 0;
    this.replaceMoveButtons = [];

    if (this.replaceMoveResolver) {
      const resolver = this.replaceMoveResolver;
      this.replaceMoveResolver = null;
      resolver(null);
    }

    this.messageQueue = [];
    this.messageQueueTask = null;

    this.menuActive = false;
    this.actionInProgress = false;
    this.battleResolved = false;

    this.pendingXpByPartyIndex.clear();
    this.abilityEventTags.clear();
    this.enemyHardSwitchUsed = false;
    this.rareEncounter = false;
    this.trainerId = '';
    this.bossConfig = null;
    this.bossState = {};
    this.bossTurnNumber = 0;
    this.bossTriggeredPhases.clear();
    this.stoneWardFlags.clear();
    this.tempDamageModifiers = {};
    this.pendingBossMessages = [];
    this.pendingBossForceSwitchMode = null;
  }

  private publishBattleState(): void {
    const state = this.engine?.getState();
    const player = this.getActivePlayerCreature();
    const enemy = this.getActiveEnemyCreature();

    if (!state || !player || !enemy) {
      return;
    }

    this.registry.set('gameState', {
      difficulty: this.gameState.difficulty,
      player: { ...this.gameState.player },
      party: this.gameState.party.map((creature) => ({
        speciesId: creature.speciesId,
        name: creature.nickname ?? getCreatureDefinition(creature.speciesId).name,
        level: creature.level,
        xp: creature.xp,
        currentHp: creature.currentHp,
        maxHp: creature.stats.hp,
        status: creature.status,
        moves: [...creature.moves]
      })),
      storageCount: this.gameState.storage.length,
      inventory: { ...this.gameState.inventory },
      playTimeSeconds: Math.floor(this.gameState.meta.playTimeSeconds)
    });

    this.registry.set('battleState', {
      active: true,
      battleType: this.battleType,
      rareEncounter: this.rareEncounter,
      difficulty: this.gameState.difficulty,
      trainerId: this.trainerId,
      trainerName: this.trainerName,
      bossActive: this.isBossBattle(),
      bossTurnNumber: this.bossTurnNumber,
      playerActiveIndex: this.activePlayerIndex,
      enemyActiveIndex: this.enemyActiveIndex,
      enemyTeam: this.enemyTeam.map((entry, index) => ({
        index,
        speciesId: entry.speciesId,
        name: this.getCreatureLabel(entry),
        level: entry.level,
        currentHp: entry.currentHp,
        maxHp: entry.stats.hp
      })),
      player: {
        speciesId: state.player.speciesId,
        name: state.player.name,
        level: state.player.level,
        currentHp: state.player.currentHp,
        maxHp: state.player.maxHp,
        status: state.player.status,
        moves: [...state.player.moves]
      },
      enemy: {
        speciesId: state.enemy.speciesId,
        name: state.enemy.name,
        level: state.enemy.level,
        currentHp: state.enemy.currentHp,
        maxHp: state.enemy.maxHp,
        status: state.enemy.status
      },
      selectedCommandIndex: this.selectedCommandIndex,
      moveSelectionOpen: this.moveSelectionOpen,
      selectedMoveIndex: this.selectedMoveIndex,
      bagOpen: this.bagOpen,
      selectedBagIndex: this.selectedBagIndex,
      switchOpen: this.switchOpen,
      switchForced: this.switchForced,
      selectedSwitchIndex: this.selectedSwitchIndex,
      moveReplaceActive: this.moveReplaceActive,
      selectedReplaceIndex: this.selectedReplaceIndex,
      inventory: { ...this.gameState.inventory },
      menuActive: this.menuActive,
      actionInProgress: this.actionInProgress,
      messageMode: this.activeMessageMode,
      message: this.messageText?.text ?? ''
    });
  }
}
