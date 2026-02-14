import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getCreatureDefinition } from '../data/creatures';
import { getMoveDefinition } from '../data/moves';
import { applyItemEvolution, xpToNextLevel } from '../systems/Progression';
import { AudioSystem } from '../systems/AudioSystem';
import { InputAdapter } from '../systems/InputAdapter';
import {
  clearCreatureStatus,
  type DifficultyMode,
  getActiveGameState,
  healCreatureByAmount,
  movePartyCreatureToStorage,
  moveStorageCreatureToParty,
  releaseStorageCreature,
  PARTY_LIMIT,
  type CreatureInstance,
  type GameState,
  type InventoryKey
} from '../state/GameState';
import { SaveSystem } from '../systems/SaveSystem';
import {
  getUserSettings,
  setUserSettings,
  type TextSpeed,
  type UserSettings
} from '../systems/UserSettings';
import { ProcSpriteFactory } from '../systems/ProcSpriteFactory';
import {
  UI_THEME,
  createBackHint,
  createBodyText,
  createHeadingText,
  createPanel,
  createTinyIcon
} from '../ui/UiTheme';

type ViewMode =
  | 'root'
  | 'partyList'
  | 'partyDetail'
  | 'inventoryList'
  | 'inventoryTarget'
  | 'storageManager'
  | 'storageAction'
  | 'storageReleaseConfirm'
  | 'options'
  | 'optionsConfirm'
  | 'mainMenuConfirm'
  | 'message';

type PartySceneLaunchData = {
  source?: 'menu' | 'terminal';
};

type StorageTab = 'party' | 'storage';

type RootOption = 'Party' | 'Inventory' | 'Save' | 'Options' | 'Main Menu';
type StorageActionOption = 'Move to Party' | 'Release' | 'Cancel';

const ROOT_OPTIONS: RootOption[] = ['Party', 'Inventory', 'Save', 'Options', 'Main Menu'];
const DIFFICULTY_OPTIONS: DifficultyMode[] = ['easy', 'normal', 'hard'];
const TEXT_SPEED_OPTIONS: TextSpeed[] = ['slow', 'normal', 'fast'];
const STORAGE_ACTION_OPTIONS: StorageActionOption[] = ['Move to Party', 'Release', 'Cancel'];
const STORAGE_TABS: StorageTab[] = ['party', 'storage'];
const OPTIONS_ROW_COUNT = 9;
const INVENTORY_DISPLAY_OPTIONS: InventoryKey[] = [
  'coreSeal',
  'potion',
  'cleanse',
  'verdantSigil',
  'trialSigil'
];
const STORAGE_PAGE_SIZE = 6;

export class PartyScene extends Phaser.Scene {
  private audio!: AudioSystem;

  private userSettings!: UserSettings;

  private gameState!: GameState;

  private mode: ViewMode = 'root';

  private launchedFromTerminal = false;

  private rootIndex = 0;

  private partyIndex = 0;

  private inventoryIndex = 0;

  private targetIndex = 0;

  private storageTab: StorageTab = 'party';

  private storageSelectionIndex = 0;

  private storageActionIndex = 0;

  private storageActionTargetIndex = 0;

  private storageReleaseConfirmIndex = 0;

  private optionsIndex = 0;

  private pendingDifficulty: DifficultyMode = 'normal';

  private pendingChallengeMode = false;

  private pendingTextSpeed: TextSpeed = 'normal';

  private pendingMusicEnabled = true;

  private pendingMusicVolume = 0.5;

  private pendingSfxVolume = 0.5;

  private optionsConfirmIndex = 1;

  private mainMenuConfirmIndex = 1;

  private messageText = '';

  private messageReturnMode: Exclude<ViewMode, 'message'> = 'root';

  private messageTitle = 'Info';

  private layer!: Phaser.GameObjects.Container;

  private inputAdapter!: InputAdapter;

  private storageSelectionByTab: Record<StorageTab, number> = {
    party: 0,
    storage: 0
  };

  public constructor() {
    super(SCENE_KEYS.PARTY);
  }

  public create(data?: PartySceneLaunchData): void {
    this.audio = new AudioSystem(this);
    this.userSettings = getUserSettings();
    this.gameState = getActiveGameState();
    this.pendingDifficulty = this.gameState.difficulty;
    this.pendingChallengeMode = this.gameState.challengeMode;
    this.pendingTextSpeed = this.userSettings.textSpeed;
    this.pendingMusicEnabled = this.userSettings.musicEnabled;
    this.pendingMusicVolume = this.userSettings.musicVolume;
    this.pendingSfxVolume = this.userSettings.sfxVolume;
    this.launchedFromTerminal = data?.source === 'terminal';
    this.mode = this.launchedFromTerminal ? 'storageManager' : 'root';
    this.storageTab = 'party';
    this.storageSelectionIndex = 0;
    this.storageSelectionByTab = { party: 0, storage: 0 };
    this.storageActionIndex = 0;
    this.storageActionTargetIndex = 0;
    this.storageReleaseConfirmIndex = 0;

    this.layer = this.add.container(0, 0).setDepth(20_000);

    this.inputAdapter = new InputAdapter(this);

    this.renderView();
  }

  public update(): void {
    const cancelPressed = this.inputAdapter.consume('cancel') || this.inputAdapter.consume('menu');

    if (cancelPressed) {
      this.handleBack();
      return;
    }

    if (this.mode === 'message') {
      if (this.inputAdapter.consume('confirm')) {
        this.audio.playMenuConfirm();
        this.mode = this.messageReturnMode;
        this.renderView();
      }
      return;
    }

    if (this.mode === 'storageManager') {
      const leftPressed = this.inputAdapter.consume('navLeft');
      const rightPressed = this.inputAdapter.consume('navRight');
      if (leftPressed || rightPressed) {
        this.switchStorageTab(leftPressed ? -1 : 1);
      }
    }

    if (this.mode === 'options') {
      const leftPressed = this.inputAdapter.consume('navLeft');
      const rightPressed = this.inputAdapter.consume('navRight');
      if (leftPressed || rightPressed) {
        this.handleOptionsHorizontalAdjust(leftPressed ? -1 : 1);
      }
    }

    if (this.mode === 'storageReleaseConfirm') {
      const leftPressed = this.inputAdapter.consume('navLeft');
      const rightPressed = this.inputAdapter.consume('navRight');
      if (leftPressed || rightPressed) {
        this.storageReleaseConfirmIndex = Phaser.Math.Wrap(
          this.storageReleaseConfirmIndex + (leftPressed ? -1 : 1),
          0,
          2
        );
        this.audio.playMenuMove();
        this.renderView();
      }
    }

    if (this.mode === 'optionsConfirm') {
      const leftPressed = this.inputAdapter.consume('navLeft');
      const rightPressed = this.inputAdapter.consume('navRight');
      if (leftPressed || rightPressed) {
        this.optionsConfirmIndex = Phaser.Math.Wrap(
          this.optionsConfirmIndex + (leftPressed ? -1 : 1),
          0,
          2
        );
        this.audio.playMenuMove();
        this.renderView();
      }
    }

    if (this.mode === 'mainMenuConfirm') {
      const leftPressed = this.inputAdapter.consume('navLeft');
      const rightPressed = this.inputAdapter.consume('navRight');
      if (leftPressed || rightPressed) {
        this.mainMenuConfirmIndex = Phaser.Math.Wrap(
          this.mainMenuConfirmIndex + (leftPressed ? -1 : 1),
          0,
          2
        );
        this.audio.playMenuMove();
        this.renderView();
      }
    }

    if (this.inputAdapter.consume('navUp')) {
      this.moveSelection(-1);
    }

    if (this.inputAdapter.consume('navDown')) {
      this.moveSelection(1);
    }

    if (this.inputAdapter.consume('confirm')) {
      this.confirmSelection();
    }
  }

  private moveSelection(direction: number): void {
    let didMove = false;

    if (this.mode === 'root') {
      this.rootIndex = Phaser.Math.Wrap(this.rootIndex + direction, 0, ROOT_OPTIONS.length);
      didMove = true;
    } else if (this.mode === 'partyList') {
      this.partyIndex = Phaser.Math.Wrap(
        this.partyIndex + direction,
        0,
        this.gameState.party.length
      );
      didMove = true;
    } else if (this.mode === 'inventoryList') {
      this.inventoryIndex = Phaser.Math.Wrap(
        this.inventoryIndex + direction,
        0,
        INVENTORY_DISPLAY_OPTIONS.length
      );
      didMove = true;
    } else if (this.mode === 'inventoryTarget') {
      this.targetIndex = Phaser.Math.Wrap(
        this.targetIndex + direction,
        0,
        this.gameState.party.length
      );
      didMove = true;
    } else if (this.mode === 'storageManager') {
      const entries = this.getStorageEntries(this.storageTab);
      if (entries.length > 0) {
        this.storageSelectionIndex = Phaser.Math.Wrap(
          this.storageSelectionIndex + direction,
          0,
          entries.length
        );
        this.storageSelectionByTab[this.storageTab] = this.storageSelectionIndex;
        didMove = true;
      }
    } else if (this.mode === 'storageAction') {
      this.storageActionIndex = Phaser.Math.Wrap(
        this.storageActionIndex + direction,
        0,
        STORAGE_ACTION_OPTIONS.length
      );
      didMove = true;
    } else if (this.mode === 'storageReleaseConfirm') {
      this.storageReleaseConfirmIndex = Phaser.Math.Wrap(
        this.storageReleaseConfirmIndex + direction,
        0,
        2
      );
      didMove = true;
    } else if (this.mode === 'options') {
      this.optionsIndex = Phaser.Math.Wrap(this.optionsIndex + direction, 0, OPTIONS_ROW_COUNT);
      didMove = true;
    } else if (this.mode === 'optionsConfirm') {
      this.optionsConfirmIndex = Phaser.Math.Wrap(this.optionsConfirmIndex + direction, 0, 2);
      didMove = true;
    } else if (this.mode === 'mainMenuConfirm') {
      this.mainMenuConfirmIndex = Phaser.Math.Wrap(this.mainMenuConfirmIndex + direction, 0, 2);
      didMove = true;
    }

    if (didMove) {
      this.audio.playMenuMove();
    }
    this.renderView();
  }

  private confirmSelection(): void {
    this.audio.playMenuConfirm();

    if (this.mode === 'root') {
      this.handleRootAction(ROOT_OPTIONS[this.rootIndex]);
      return;
    }

    if (this.mode === 'partyList') {
      this.mode = 'partyDetail';
      this.renderView();
      return;
    }

    if (this.mode === 'inventoryList') {
      this.handleInventorySelection(INVENTORY_DISPLAY_OPTIONS[this.inventoryIndex]);
      return;
    }

    if (this.mode === 'inventoryTarget') {
      this.useInventoryItemOnTarget();
      return;
    }

    if (this.mode === 'options') {
      this.confirmOptionsSelection();
      return;
    }

    if (this.mode === 'optionsConfirm') {
      this.confirmModeChange();
      return;
    }

    if (this.mode === 'mainMenuConfirm') {
      this.confirmMainMenuSelection();
      return;
    }

    if (this.mode === 'storageManager') {
      const entries = this.getStorageEntries(this.storageTab);
      if (entries.length === 0) {
        const text =
          this.storageTab === 'party'
            ? 'Party is empty.'
            : 'Storage is empty. Capture more creatures.';
        this.showMessage(text, 'storageManager', 'Bindery Terminal');
        return;
      }

      if (this.storageTab === 'party') {
        const selected = this.gameState.party[this.storageSelectionIndex];
        if (!selected) {
          this.showMessage('Invalid party slot.', 'storageManager', 'Bindery Terminal');
          return;
        }

        const moved = movePartyCreatureToStorage(this.gameState, this.storageSelectionIndex);
        if (!moved) {
          this.showMessage(
            'At least one creature must stay in your party.',
            'storageManager',
            'Bindery Terminal'
          );
          return;
        }

        SaveSystem.save(this.gameState);
        this.clampStorageSelectionIndex();
        this.showMessage(
          `${this.getCreatureLabel(selected)} moved to Storage.`,
          'storageManager',
          'Bindery Terminal'
        );
        return;
      }

      this.storageActionTargetIndex = this.storageSelectionIndex;
      this.storageActionIndex = 0;
      this.mode = 'storageAction';
      this.renderView();
      return;
    }

    if (this.mode === 'storageAction') {
      const option = STORAGE_ACTION_OPTIONS[this.storageActionIndex];
      if (option === 'Cancel') {
        this.mode = 'storageManager';
        this.renderView();
        return;
      }

      if (option === 'Move to Party') {
        const selected = this.gameState.storage[this.storageActionTargetIndex];
        if (!selected) {
          this.showMessage('Invalid storage slot.', 'storageManager', 'Bindery Terminal');
          return;
        }

        if (this.gameState.party.length >= PARTY_LIMIT) {
          this.showMessage('Party is full (6/6).', 'storageAction', 'Bindery Terminal');
          return;
        }

        const moved = moveStorageCreatureToParty(this.gameState, this.storageActionTargetIndex);
        if (!moved) {
          this.showMessage('Could not move creature.', 'storageAction', 'Bindery Terminal');
          return;
        }

        SaveSystem.save(this.gameState);
        this.mode = 'storageManager';
        this.clampStorageSelectionIndex();
        this.showMessage(
          `${this.getCreatureLabel(selected)} moved to Party.`,
          'storageManager',
          'Bindery Terminal'
        );
        return;
      }

      this.storageReleaseConfirmIndex = 1;
      this.mode = 'storageReleaseConfirm';
      this.renderView();
      return;
    }

    if (this.mode === 'storageReleaseConfirm') {
      if (this.storageReleaseConfirmIndex === 1) {
        this.mode = 'storageAction';
        this.renderView();
        return;
      }

      const selected = this.gameState.storage[this.storageActionTargetIndex];
      if (!selected) {
        this.mode = 'storageManager';
        this.showMessage('Invalid storage slot.', 'storageManager', 'Bindery Terminal');
        return;
      }

      const released = releaseStorageCreature(this.gameState, this.storageActionTargetIndex);
      if (!released) {
        this.mode = 'storageManager';
        this.showMessage('Release failed.', 'storageManager', 'Bindery Terminal');
        return;
      }

      SaveSystem.save(this.gameState);
      this.mode = 'storageManager';
      this.clampStorageSelectionIndex();
      this.showMessage(
        `${this.getCreatureLabel(released)} was released.`,
        'storageManager',
        'Bindery Terminal'
      );
    }
  }

  private handleRootAction(option: RootOption): void {
    if (option === 'Party') {
      if (this.gameState.party.length === 0) {
        this.showMessage('No party members yet.', 'root', 'Party');
        return;
      }
      this.mode = 'partyList';
      this.partyIndex = Phaser.Math.Clamp(this.partyIndex, 0, this.gameState.party.length - 1);
      this.renderView();
      return;
    }

    if (option === 'Inventory') {
      this.mode = 'inventoryList';
      this.renderView();
      return;
    }

    if (option === 'Save') {
      const success = SaveSystem.save(this.gameState);
      this.showMessage(success ? 'Game saved.' : 'Save failed.', 'root', 'Save');
      return;
    }

    if (option === 'Main Menu') {
      this.mainMenuConfirmIndex = 1;
      this.mode = 'mainMenuConfirm';
      this.renderView();
      return;
    }

    this.userSettings = getUserSettings();
    this.pendingDifficulty = this.gameState.difficulty;
    this.pendingChallengeMode = this.gameState.challengeMode;
    this.pendingMusicEnabled = this.userSettings.musicEnabled;
    this.pendingMusicVolume = this.userSettings.musicVolume;
    this.pendingSfxVolume = this.userSettings.sfxVolume;
    this.pendingTextSpeed = this.userSettings.textSpeed;
    this.optionsIndex = 0;
    this.mode = 'options';
    this.renderView();
  }

  private handleInventorySelection(item: InventoryKey): void {
    if (item === 'coreSeal') {
      this.showMessage('Core Seal can only be used in wild battle.', 'inventoryList', 'Inventory');
      return;
    }

    if (this.gameState.inventory[item] <= 0) {
      this.showMessage(`No ${this.getInventoryName(item)} left.`, 'inventoryList', 'Inventory');
      return;
    }

    this.mode = 'inventoryTarget';
    this.targetIndex = Phaser.Math.Clamp(this.targetIndex, 0, this.gameState.party.length - 1);
    this.renderView();
  }

  private useInventoryItemOnTarget(): void {
    const item = INVENTORY_DISPLAY_OPTIONS[this.inventoryIndex];
    const target = this.gameState.party[this.targetIndex];

    if (!target) {
      this.showMessage('No valid target selected.', 'inventoryList', 'Inventory');
      return;
    }

    if (item === 'potion') {
      const healed = healCreatureByAmount(target, 30);
      if (healed <= 0) {
        this.showMessage(
          `${this.getCreatureLabel(target)} is already at full HP.`,
          'inventoryList',
          'Potion'
        );
        return;
      }

      this.gameState.inventory.potion -= 1;
      SaveSystem.save(this.gameState);
      this.showMessage(
        `${this.getCreatureLabel(target)} recovered ${healed} HP.`,
        'inventoryList',
        'Potion'
      );
      return;
    }

    if (item === 'cleanse') {
      const cleared = clearCreatureStatus(target);
      if (!cleared) {
        this.showMessage(
          `${this.getCreatureLabel(target)} has no status condition.`,
          'inventoryList',
          'Cleanse'
        );
        return;
      }

      this.gameState.inventory.cleanse -= 1;
      SaveSystem.save(this.gameState);
      this.showMessage(`${this.getCreatureLabel(target)} is cleansed.`, 'inventoryList', 'Cleanse');
      return;
    }

    if (item === 'verdantSigil' || item === 'trialSigil') {
      const evolution = applyItemEvolution(target, item, {
        mapId: this.gameState.player.mapId,
        storyFlags: this.gameState.storyFlags
      });
      if (!evolution) {
        this.showMessage('Nothing happened.', 'inventoryList', 'Evolution');
        return;
      }

      this.gameState.inventory[item] = Math.max(0, this.gameState.inventory[item] - 1);
      SaveSystem.save(this.gameState);

      const fromName = getCreatureDefinition(evolution.fromSpeciesId).name;
      const toName = getCreatureDefinition(evolution.toSpeciesId).name;
      this.showMessage(`${fromName} evolved into ${toName}!`, 'inventoryList', 'Evolution');
    }
  }

  private handleBack(): void {
    this.audio.playMenuBack();

    if (this.mode === 'storageManager') {
      this.closeMenu();
      return;
    }

    if (this.mode === 'storageAction') {
      this.mode = 'storageManager';
      this.renderView();
      return;
    }

    if (this.mode === 'storageReleaseConfirm') {
      this.mode = 'storageAction';
      this.renderView();
      return;
    }

    if (this.mode === 'optionsConfirm') {
      this.mode = 'options';
      this.renderView();
      return;
    }

    if (this.mode === 'mainMenuConfirm') {
      this.mode = 'root';
      this.renderView();
      return;
    }

    if (this.mode === 'options') {
      this.mode = 'root';
      this.renderView();
      return;
    }

    if (this.mode === 'root') {
      this.closeMenu();
      return;
    }

    if (this.mode === 'message') {
      this.mode = this.messageReturnMode;
      this.renderView();
      return;
    }

    if (this.mode === 'partyDetail') {
      this.mode = 'partyList';
      this.renderView();
      return;
    }

    if (this.mode === 'inventoryTarget') {
      this.mode = 'inventoryList';
      this.renderView();
      return;
    }

    this.mode = 'root';
    this.renderView();
  }

  private closeMenu(): void {
    if (this.launchedFromTerminal) {
      SaveSystem.save(this.gameState);
    }
    this.scene.resume(SCENE_KEYS.OVERWORLD, { source: 'party' });
    this.scene.stop(SCENE_KEYS.PARTY);
  }

  private showMessage(
    text: string,
    returnMode: Exclude<ViewMode, 'message'>,
    title = 'Info'
  ): void {
    this.messageText = text;
    this.messageTitle = title;
    this.messageReturnMode = returnMode;
    this.mode = 'message';
    this.renderView();
  }

  private renderView(): void {
    this.layer.removeAll(true);

    const { width, height } = this.scale;

    const backdrop = this.add
      .rectangle(0, 0, width, height, 0x03050b, 0.84)
      .setOrigin(0)
      .setScrollFactor(0);

    const panel = createPanel(this, {
      x: 24,
      y: 20,
      width: width - 48,
      height: height - 40,
      fillColor: 0x081324,
      fillAlpha: 0.96,
      strokeColor: 0x87b5dc,
      strokeWidth: 2
    });

    this.layer.add([backdrop, panel]);

    if (this.mode === 'root') {
      this.renderRootMenu(panel);
    } else if (this.mode === 'partyList') {
      this.renderPartyList(panel);
    } else if (this.mode === 'partyDetail') {
      this.renderPartyDetail(panel);
    } else if (this.mode === 'inventoryList') {
      this.renderInventoryList(panel);
    } else if (this.mode === 'inventoryTarget') {
      this.renderInventoryTarget(panel);
    } else if (this.mode === 'options') {
      this.renderOptionsMenu(panel);
    } else if (this.mode === 'optionsConfirm') {
      this.renderOptionsConfirm(panel);
    } else if (this.mode === 'mainMenuConfirm') {
      this.renderMainMenuConfirm(panel);
    } else if (this.mode === 'storageManager') {
      this.renderStorageManager(panel);
    } else if (this.mode === 'storageAction') {
      this.renderStorageAction(panel);
    } else if (this.mode === 'storageReleaseConfirm') {
      this.renderStorageReleaseConfirm(panel);
    } else {
      this.renderMessage(panel);
    }

    createBackHint(this, this.launchedFromTerminal ? 'Esc: Close' : 'Esc: Back', {
      container: this.layer,
      depth: 20010
    });
  }

  private renderHeader(
    panel: Phaser.GameObjects.Rectangle,
    title: string,
    subtitle?: string
  ): void {
    createHeadingText(this, panel.x + 14, panel.y + 10, title, {
      size: 20,
      color: UI_THEME.headingColor,
      container: this.layer
    });

    if (subtitle) {
      createBodyText(this, panel.x + 14, panel.y + 36, subtitle, {
        size: 13,
        color: '#9ec3df',
        container: this.layer
      });
    }

    createTinyIcon(this, panel.x + 6, panel.y + 20, {
      size: 4,
      color: 0x9ec3df,
      container: this.layer
    });
  }

  private renderRootMenu(panel: Phaser.GameObjects.Rectangle): void {
    const timeLabel = this.formatPlayTime(this.gameState.meta.playTimeSeconds);
    this.renderHeader(
      panel,
      'Menu',
      `Difficulty: ${this.gameState.difficulty.toUpperCase()}  Challenge: ${
        this.gameState.challengeMode ? 'ON' : 'OFF'
      }  Time: ${timeLabel}`
    );

    ROOT_OPTIONS.forEach((option, index) => {
      this.createSelectableRow({
        panel,
        index,
        y: panel.y + 72 + index * 44,
        text: option,
        selected: index === this.rootIndex,
        onSelect: () => {
          this.rootIndex = index;
          this.renderView();
        },
        onConfirm: () => {
          this.rootIndex = index;
          this.handleRootAction(option);
        }
      });
    });
  }

  private renderPartyList(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(panel, 'Party', 'Enter: Details  Esc: Back');

    this.gameState.party.forEach((creature, index) => {
      const definition = getCreatureDefinition(creature.speciesId);
      const top = panel.y + 66 + index * 42;

      const row = this.createSelectableRow({
        panel,
        index,
        y: top,
        text: `${this.getCreatureLabel(creature)}  Lv${creature.level}  HP ${creature.currentHp}/${creature.stats.hp}`,
        selected: index === this.partyIndex,
        onSelect: () => {
          this.partyIndex = index;
          this.renderView();
        },
        onConfirm: () => {
          this.partyIndex = index;
          this.mode = 'partyDetail';
          this.renderView();
        }
      });

      const icon = this.add
        .image(row.x + 20, top + 17, ProcSpriteFactory.generateOverworld(this, creature.speciesId))
        .setScale(1)
        .setOrigin(0.5)
        .setScrollFactor(0);

      const typeText = this.add
        .text(row.x + row.width - 86, top + 10, definition.type.toUpperCase(), {
          fontFamily: '"Courier New", monospace',
          fontSize: '11px',
          color: '#8ac1e8'
        })
        .setScrollFactor(0);

      this.layer.add([icon, typeText]);
    });
  }

  private renderPartyDetail(panel: Phaser.GameObjects.Rectangle): void {
    const creature = this.gameState.party[this.partyIndex];
    if (!creature) {
      this.mode = 'partyList';
      this.renderView();
      return;
    }

    const definition = getCreatureDefinition(creature.speciesId);

    this.renderHeader(
      panel,
      this.getCreatureLabel(creature),
      `Lv${creature.level} ${definition.type}  Esc: Back`
    );

    const icon = this.add
      .image(panel.x + 64, panel.y + 112, ProcSpriteFactory.generateFront(this, creature.speciesId))
      .setScale(2)
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.layer.add(icon);

    const statsText = this.add
      .text(panel.x + 128, panel.y + 70, '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#d6e6f6',
        lineSpacing: 5
      })
      .setScrollFactor(0);

    statsText.setText([
      `HP: ${creature.currentHp}/${creature.stats.hp}`,
      `XP: ${creature.xp}/${xpToNextLevel(creature.level)}`,
      `ATK: ${creature.stats.atk}`,
      `DEF: ${creature.stats.def}`,
      `SPD: ${creature.stats.spd}`,
      `Status: ${creature.status ?? 'None'}`
    ]);

    this.layer.add(statsText);

    const movesTitle = this.add
      .text(panel.x + 14, panel.y + 192, 'Moves', {
        fontFamily: '"Courier New", monospace',
        fontSize: '15px',
        color: '#f3de8b'
      })
      .setScrollFactor(0);

    this.layer.add(movesTitle);

    creature.moves.forEach((moveId, index) => {
      const move = getMoveDefinition(moveId);
      const line = this.add
        .text(panel.x + 20, panel.y + 218 + index * 22, `${index + 1}. ${move.name}`, {
          fontFamily: '"Courier New", monospace',
          fontSize: '14px',
          color: '#c9ddf1'
        })
        .setScrollFactor(0);

      this.layer.add(line);
    });
  }

  private renderInventoryList(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(panel, 'Inventory', 'Enter: Use  Esc: Back');

    INVENTORY_DISPLAY_OPTIONS.forEach((item, index) => {
      this.createSelectableRow({
        panel,
        index,
        y: panel.y + 72 + index * 44,
        text: `${this.getInventoryName(item)} x${this.gameState.inventory[item]}`,
        selected: index === this.inventoryIndex,
        onSelect: () => {
          this.inventoryIndex = index;
          this.renderView();
        },
        onConfirm: () => {
          this.inventoryIndex = index;
          this.handleInventorySelection(item);
        }
      });
    });

    const help = this.add
      .text(
        panel.x + 14,
        panel.y + panel.height - 34,
        'Potion: +30 HP. Cleanse: clear status. Sigils: trigger some evolutions.',
        {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          color: '#8fb6d7'
        }
      )
      .setScrollFactor(0);

    this.layer.add(help);
  }

  private renderInventoryTarget(panel: Phaser.GameObjects.Rectangle): void {
    const item = INVENTORY_DISPLAY_OPTIONS[this.inventoryIndex];

    this.renderHeader(
      panel,
      `Use ${this.getInventoryName(item)}`,
      'Choose a party target  Enter: Confirm  Esc: Back'
    );

    this.gameState.party.forEach((creature, index) => {
      this.createSelectableRow({
        panel,
        index,
        y: panel.y + 72 + index * 40,
        text: `${this.getCreatureLabel(creature)}  HP ${creature.currentHp}/${creature.stats.hp}  Status ${creature.status ?? 'None'}`,
        selected: index === this.targetIndex,
        onSelect: () => {
          this.targetIndex = index;
          this.renderView();
        },
        onConfirm: () => {
          this.targetIndex = index;
          this.useInventoryItemOnTarget();
        }
      });
    });
  }

  private renderOptionsMenu(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(panel, 'Options', 'Gameplay-safe UX settings. Enter: Select  Esc: Back');

    const rows = [
      `Difficulty: ${this.pendingDifficulty.toUpperCase()}`,
      `Challenge Mode: ${this.pendingChallengeMode ? 'ON' : 'OFF'}`,
      `Music: ${this.pendingMusicEnabled ? 'ON' : 'OFF'}`,
      `Music Volume: ${Math.round(this.pendingMusicVolume * 100)}%`,
      `SFX Volume: ${Math.round(this.pendingSfxVolume * 100)}%`,
      `Text Speed: ${this.pendingTextSpeed.toUpperCase()}`,
      'Help',
      'Apply Mode Change',
      'Back'
    ];

    rows.forEach((text, index) => {
      this.createSelectableRow({
        panel,
        index,
        y: panel.y + 66 + index * 32,
        text,
        selected: index === this.optionsIndex,
        onSelect: () => {
          this.optionsIndex = index;
          this.renderView();
        },
        onConfirm: () => {
          this.optionsIndex = index;
          this.confirmOptionsSelection();
        }
      });
    });

    const hint = this.add
      .text(
        panel.x + 14,
        panel.y + 50,
        'Left/Right adjusts highlighted setting. Mode changes require confirmation.',
        {
          fontFamily: UI_THEME.fontFamily,
          fontSize: '12px',
          color: '#8fb6d7'
        }
      )
      .setScrollFactor(0);

    this.layer.add(hint);
  }

  private renderOptionsConfirm(panel: Phaser.GameObjects.Rectangle): void {
    const difficultyLine =
      this.pendingDifficulty === this.gameState.difficulty
        ? `Difficulty stays ${this.gameState.difficulty.toUpperCase()}`
        : `${this.gameState.difficulty.toUpperCase()} -> ${this.pendingDifficulty.toUpperCase()}`;
    const challengeLine =
      this.pendingChallengeMode === this.gameState.challengeMode
        ? `Challenge stays ${this.gameState.challengeMode ? 'ON' : 'OFF'}`
        : `${this.gameState.challengeMode ? 'ON' : 'OFF'} -> ${
            this.pendingChallengeMode ? 'ON' : 'OFF'
          }`;
    this.renderHeader(panel, 'Confirm Mode Change', `${difficultyLine}\n${challengeLine}`);

    const options = ['Confirm', 'Cancel'];
    options.forEach((option, index) => {
      const selected = this.optionsConfirmIndex === index;
      const buttonWidth = 164;
      const button = this.add
        .rectangle(
          panel.x + 18 + index * (buttonWidth + 14),
          panel.y + 122,
          buttonWidth,
          40,
          0x16253d,
          1
        )
        .setOrigin(0)
        .setStrokeStyle(2, selected ? 0xbce0ff : 0x4f7398, 1)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      button.on('pointerover', () => {
        this.optionsConfirmIndex = index;
        this.renderView();
      });

      button.on('pointerdown', () => {
        this.optionsConfirmIndex = index;
        this.confirmModeChange();
      });

      const text = this.add
        .text(button.x + 18, button.y + 11, `${selected ? '>' : ' '} ${option}`, {
          fontFamily: '"Courier New", monospace',
          fontSize: '16px',
          color: selected ? '#f6e492' : '#d5e6f8'
        })
        .setScrollFactor(0);

      this.layer.add([button, text]);
    });
  }

  private renderMainMenuConfirm(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(
      panel,
      'Return to Main Menu?',
      'Unsaved progress may be lost. Your game will be saved first.'
    );

    const warning = this.add
      .text(panel.x + 16, panel.y + 96, 'Return to Main Menu now?', {
        fontFamily: '"Courier New", monospace',
        fontSize: '16px',
        color: '#f5fbff'
      })
      .setScrollFactor(0);

    const options = ['Confirm', 'Cancel'];
    options.forEach((option, index) => {
      const selected = this.mainMenuConfirmIndex === index;
      const buttonWidth = 164;
      const button = this.add
        .rectangle(
          panel.x + 18 + index * (buttonWidth + 14),
          panel.y + 138,
          buttonWidth,
          40,
          0x16253d,
          1
        )
        .setOrigin(0)
        .setStrokeStyle(2, selected ? 0xbce0ff : 0x4f7398, 1)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      button.on('pointerover', () => {
        this.mainMenuConfirmIndex = index;
        this.renderView();
      });

      button.on('pointerdown', () => {
        this.mainMenuConfirmIndex = index;
        this.confirmMainMenuSelection();
      });

      const text = this.add
        .text(button.x + 18, button.y + 11, `${selected ? '>' : ' '} ${option}`, {
          fontFamily: '"Courier New", monospace',
          fontSize: '16px',
          color: selected ? '#f6e492' : '#d5e6f8'
        })
        .setScrollFactor(0);

      this.layer.add([button, text]);
    });

    const help = this.add
      .text(panel.x + 16, panel.y + panel.height - 34, 'Enter: Confirm  Esc: Back', {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: '#8fb6d7'
      })
      .setScrollFactor(0);

    this.layer.add([warning, help]);
  }

  private confirmOptionsSelection(): void {
    if (this.optionsIndex === 0) {
      this.shiftPendingDifficulty(1);
      return;
    }

    if (this.optionsIndex === 1) {
      this.pendingChallengeMode = !this.pendingChallengeMode;
      this.audio.playMenuMove();
      this.renderView();
      return;
    }

    if (this.optionsIndex === 2) {
      this.pendingMusicEnabled = !this.pendingMusicEnabled;
      this.persistUserSettings();
      this.renderView();
      return;
    }

    if (this.optionsIndex === 3) {
      this.adjustPendingMusicVolume(0.1);
      return;
    }

    if (this.optionsIndex === 4) {
      this.adjustPendingSfxVolume(0.1);
      return;
    }

    if (this.optionsIndex === 5) {
      this.shiftPendingTextSpeed(1);
      return;
    }

    if (this.optionsIndex === 6) {
      this.showMessage(this.getControlsHelpText(), 'options', 'Help');
      return;
    }

    if (this.optionsIndex === 7) {
      if (
        this.pendingDifficulty === this.gameState.difficulty &&
        this.pendingChallengeMode === this.gameState.challengeMode
      ) {
        this.showMessage('Difficulty and challenge mode are unchanged.', 'options', 'Options');
        return;
      }

      this.optionsConfirmIndex = 1;
      this.mode = 'optionsConfirm';
      this.renderView();
      return;
    }

    this.mode = 'root';
    this.renderView();
  }

  private confirmModeChange(): void {
    if (this.optionsConfirmIndex === 1) {
      this.audio.playMenuBack();
      this.mode = 'options';
      this.renderView();
      return;
    }

    this.audio.playMenuConfirm();
    this.gameState.difficulty = this.pendingDifficulty;
    this.gameState.challengeMode = this.pendingChallengeMode;
    SaveSystem.save(this.gameState);
    this.showMessage(
      `Difficulty: ${this.gameState.difficulty.toUpperCase()}  Challenge: ${
        this.gameState.challengeMode ? 'ON' : 'OFF'
      }.`,
      'options',
      'Options'
    );
  }

  private confirmMainMenuSelection(): void {
    if (this.mainMenuConfirmIndex === 1) {
      this.audio.playMenuBack();
      this.mode = 'root';
      this.renderView();
      return;
    }

    SaveSystem.save(this.gameState);
    this.input.enabled = false;
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const manager = this.game.scene;
      this.registry.set('battleState', null);
      this.registry.set('overworldState', null);
      this.registry.set('gameState', null);

      manager.stop(SCENE_KEYS.OVERWORLD);
      manager.stop(SCENE_KEYS.BATTLE);
      manager.stop(SCENE_KEYS.PARTY);
      manager.stop(SCENE_KEYS.INTRO);
      manager.stop(SCENE_KEYS.STARTER_SELECTION);
      manager.stop(SCENE_KEYS.CREDITS);
      manager.stop(SCENE_KEYS.TITLE);
      manager.start(SCENE_KEYS.TITLE);
    });
    this.cameras.main.fadeOut(220, 0, 0, 0);
  }

  private shiftPendingDifficulty(direction: number): void {
    const currentIndex = DIFFICULTY_OPTIONS.indexOf(this.pendingDifficulty);
    const nextIndex = Phaser.Math.Wrap(currentIndex + direction, 0, DIFFICULTY_OPTIONS.length);
    this.pendingDifficulty = DIFFICULTY_OPTIONS[nextIndex];
    this.audio.playMenuMove();
    this.renderView();
  }

  private shiftPendingTextSpeed(direction: number): void {
    const currentIndex = TEXT_SPEED_OPTIONS.indexOf(this.pendingTextSpeed);
    const nextIndex = Phaser.Math.Wrap(currentIndex + direction, 0, TEXT_SPEED_OPTIONS.length);
    this.pendingTextSpeed = TEXT_SPEED_OPTIONS[nextIndex];
    this.persistUserSettings();
    this.audio.playMenuMove();
    this.renderView();
  }

  private adjustPendingMusicVolume(direction: number): void {
    this.pendingMusicVolume = Phaser.Math.Clamp(
      Math.round((this.pendingMusicVolume + direction) * 10) / 10,
      0,
      1
    );
    this.persistUserSettings();
    this.audio.playMenuMove();
    this.renderView();
  }

  private adjustPendingSfxVolume(direction: number): void {
    this.pendingSfxVolume = Phaser.Math.Clamp(
      Math.round((this.pendingSfxVolume + direction) * 10) / 10,
      0,
      1
    );
    this.persistUserSettings();
    this.audio.playMenuMove();
    this.renderView();
  }

  private handleOptionsHorizontalAdjust(direction: number): void {
    if (this.optionsIndex === 0) {
      this.shiftPendingDifficulty(direction);
      return;
    }

    if (this.optionsIndex === 1) {
      this.pendingChallengeMode = !this.pendingChallengeMode;
      this.audio.playMenuMove();
      this.renderView();
      return;
    }

    if (this.optionsIndex === 2) {
      this.pendingMusicEnabled = !this.pendingMusicEnabled;
      this.persistUserSettings();
      this.audio.playMenuMove();
      this.renderView();
      return;
    }

    if (this.optionsIndex === 3) {
      this.adjustPendingMusicVolume(direction * 0.1);
      return;
    }

    if (this.optionsIndex === 4) {
      this.adjustPendingSfxVolume(direction * 0.1);
      return;
    }

    if (this.optionsIndex === 5) {
      this.shiftPendingTextSpeed(direction);
    }
  }

  private persistUserSettings(): void {
    this.userSettings = setUserSettings({
      musicEnabled: this.pendingMusicEnabled,
      musicVolume: this.pendingMusicVolume,
      sfxVolume: this.pendingSfxVolume,
      textSpeed: this.pendingTextSpeed
    });
    AudioSystem.refreshSettings();
  }

  private renderStorageManager(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(
      panel,
      'Bindery Terminal',
      `Party ${this.gameState.party.length}/${PARTY_LIMIT}  Storage ${this.gameState.storage.length}  Esc: Close`
    );

    STORAGE_TABS.forEach((tab, index) => {
      const selected = this.storageTab === tab;
      const tabWidth = 120;
      const tabRect = this.add
        .rectangle(panel.x + 16 + index * (tabWidth + 8), panel.y + 54, tabWidth, 24, 0x172844, 1)
        .setOrigin(0)
        .setStrokeStyle(2, selected ? 0xbce0ff : 0x4f7398, 1)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      tabRect.on('pointerdown', () => {
        if (this.storageTab !== tab) {
          this.switchStorageTabTo(tab);
        }
      });

      const tabText = this.add
        .text(tabRect.x + 10, tabRect.y + 5, tab === 'party' ? 'Party' : 'Storage', {
          fontFamily: '"Courier New", monospace',
          fontSize: '14px',
          color: selected ? '#f6e492' : '#cde2f7'
        })
        .setScrollFactor(0);

      this.layer.add([tabRect, tabText]);
    });

    const entries = this.getStorageEntries(this.storageTab);
    if (entries.length === 0) {
      const emptyText = this.add
        .text(
          panel.x + 18,
          panel.y + 98,
          this.storageTab === 'party'
            ? 'Party is empty.'
            : 'Storage is empty. Capture overflow appears here.',
          {
            fontFamily: '"Courier New", monospace',
            fontSize: '15px',
            color: '#d3e6f8'
          }
        )
        .setScrollFactor(0);

      const hint = this.add
        .text(panel.x + 18, panel.y + panel.height - 34, 'Left/Right: Tab  Esc: Close', {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          color: '#8fb6d7'
        })
        .setScrollFactor(0);

      this.layer.add([emptyText, hint]);
      return;
    }

    const pageStart =
      Math.floor(this.storageSelectionIndex / STORAGE_PAGE_SIZE) * STORAGE_PAGE_SIZE;
    const pageEnd = Math.min(entries.length, pageStart + STORAGE_PAGE_SIZE);

    for (let index = pageStart; index < pageEnd; index += 1) {
      const creature = entries[index];
      const rowIndex = index - pageStart;
      const rowTop = panel.y + 86 + rowIndex * 34;
      const definition = getCreatureDefinition(creature.speciesId);

      const row = this.createSelectableRow({
        panel,
        index,
        y: rowTop,
        text: `${this.getCreatureLabel(creature)}  Lv${creature.level}  HP ${creature.currentHp}/${creature.stats.hp}`,
        selected: index === this.storageSelectionIndex,
        onSelect: () => {
          this.storageSelectionIndex = index;
          this.storageSelectionByTab[this.storageTab] = index;
          this.renderView();
        },
        onConfirm: () => {
          this.storageSelectionIndex = index;
          this.storageSelectionByTab[this.storageTab] = index;
          this.confirmSelection();
        }
      });

      const icon = this.add
        .image(
          row.x + 20,
          rowTop + 17,
          ProcSpriteFactory.generateOverworld(this, creature.speciesId)
        )
        .setScale(1)
        .setOrigin(0.5)
        .setScrollFactor(0);

      const typeText = this.add
        .text(row.x + row.width - 86, rowTop + 10, definition.type.toUpperCase(), {
          fontFamily: '"Courier New", monospace',
          fontSize: '11px',
          color: '#8ac1e8'
        })
        .setScrollFactor(0);

      this.layer.add([icon, typeText]);
    }

    const pageText = this.add
      .text(
        panel.x + panel.width - 148,
        panel.y + panel.height - 34,
        `Page ${Math.floor(pageStart / STORAGE_PAGE_SIZE) + 1}/${Math.max(
          1,
          Math.ceil(entries.length / STORAGE_PAGE_SIZE)
        )}`,
        {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          color: '#8fb6d7'
        }
      )
      .setScrollFactor(0);

    const actionText = this.add
      .text(
        panel.x + 16,
        panel.y + panel.height - 34,
        this.storageTab === 'party'
          ? 'Enter: Move to Storage  Left/Right: Tab'
          : 'Enter: Actions  Left/Right: Tab',
        {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          color: '#8fb6d7'
        }
      )
      .setScrollFactor(0);

    this.layer.add([actionText, pageText]);
  }

  private renderStorageAction(panel: Phaser.GameObjects.Rectangle): void {
    const creature = this.gameState.storage[this.storageActionTargetIndex];
    if (!creature) {
      this.mode = 'storageManager';
      this.clampStorageSelectionIndex();
      this.renderView();
      return;
    }

    this.renderHeader(
      panel,
      'Storage Action',
      `${this.getCreatureLabel(creature)} Lv${creature.level}  Enter: Confirm  Esc: Back`
    );

    const details = this.add
      .text(panel.x + 16, panel.y + 78, `HP ${creature.currentHp}/${creature.stats.hp}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#d5e8fb'
      })
      .setScrollFactor(0);

    this.layer.add(details);

    STORAGE_ACTION_OPTIONS.forEach((option, index) => {
      const isFull = option === 'Move to Party' && this.gameState.party.length >= PARTY_LIMIT;
      const label = isFull ? 'Move to Party (Full)' : option;

      this.createSelectableRow({
        panel,
        index,
        y: panel.y + 112 + index * 44,
        text: label,
        selected: index === this.storageActionIndex,
        onSelect: () => {
          this.storageActionIndex = index;
          this.renderView();
        },
        onConfirm: () => {
          this.storageActionIndex = index;
          this.confirmSelection();
        }
      });
    });
  }

  private renderStorageReleaseConfirm(panel: Phaser.GameObjects.Rectangle): void {
    const creature = this.gameState.storage[this.storageActionTargetIndex];
    if (!creature) {
      this.mode = 'storageManager';
      this.clampStorageSelectionIndex();
      this.renderView();
      return;
    }

    this.renderHeader(
      panel,
      'Release Creature?',
      `Release ${this.getCreatureLabel(creature)} forever?`
    );

    const warningText = this.add
      .text(panel.x + 16, panel.y + 96, 'This action cannot be undone.', {
        fontFamily: '"Courier New", monospace',
        fontSize: '15px',
        color: '#ffd3c9'
      })
      .setScrollFactor(0);

    const optionLabels = ['Release', 'Cancel'];
    optionLabels.forEach((option, index) => {
      const selected = this.storageReleaseConfirmIndex === index;
      const buttonWidth = 154;
      const button = this.add
        .rectangle(
          panel.x + 16 + index * (buttonWidth + 12),
          panel.y + 140,
          buttonWidth,
          40,
          0x16253d,
          1
        )
        .setOrigin(0)
        .setStrokeStyle(2, selected ? 0xbce0ff : 0x4f7398, 1)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      button.on('pointerover', () => {
        this.storageReleaseConfirmIndex = index;
        this.renderView();
      });

      button.on('pointerdown', () => {
        this.storageReleaseConfirmIndex = index;
        this.confirmSelection();
      });

      const label = this.add
        .text(button.x + 22, button.y + 11, `${selected ? '>' : ' '} ${option}`, {
          fontFamily: '"Courier New", monospace',
          fontSize: '16px',
          color: selected ? '#f6e492' : '#d5e6f8'
        })
        .setScrollFactor(0);

      this.layer.add([button, label]);
    });

    const help = this.add
      .text(
        panel.x + 16,
        panel.y + panel.height - 34,
        'Left/Right: Select  Enter: Confirm  Esc: Back',
        {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          color: '#8fb6d7'
        }
      )
      .setScrollFactor(0);

    this.layer.add([warningText, help]);
  }

  private renderMessage(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(panel, this.messageTitle, 'Enter / Esc: Back');

    const message = this.add
      .text(panel.x + 16, panel.y + 86, this.messageText, {
        fontFamily: '"Courier New", monospace',
        fontSize: '17px',
        color: '#f5fbff',
        wordWrap: {
          width: panel.width - 32
        }
      })
      .setScrollFactor(0);

    this.layer.add(message);
  }

  private createSelectableRow(options: {
    panel: Phaser.GameObjects.Rectangle;
    index: number;
    y: number;
    text: string;
    selected: boolean;
    onSelect: () => void;
    onConfirm: () => void;
  }): Phaser.GameObjects.Rectangle {
    const row = createPanel(this, {
      x: options.panel.x + 14,
      y: options.y,
      width: options.panel.width - 28,
      height: 34,
      fillColor: UI_THEME.rowFill,
      fillAlpha: 1,
      strokeColor: options.selected ? UI_THEME.rowSelectedStroke : UI_THEME.rowStroke,
      strokeWidth: 2
    }).setInteractive({ useHandCursor: true });

    row.on('pointerover', () => {
      options.onSelect();
    });

    row.on('pointerdown', () => {
      options.onConfirm();
    });

    const label = createBodyText(
      this,
      row.x + 10,
      row.y + 9,
      `${options.selected ? '>' : ' '} ${options.text}`,
      {
        size: 14,
        color: options.selected ? UI_THEME.accentColor : UI_THEME.bodyColor
      }
    );
    createTinyIcon(this, row.x + 6, row.y + 17, {
      size: 3,
      color: options.selected ? 0xbde2ff : 0x6f8dad,
      container: this.layer
    });

    this.layer.add([row, label]);

    return row;
  }

  private switchStorageTab(direction: number): void {
    const tabIndex = STORAGE_TABS.indexOf(this.storageTab);
    const nextTab = STORAGE_TABS[Phaser.Math.Wrap(tabIndex + direction, 0, STORAGE_TABS.length)];
    this.switchStorageTabTo(nextTab);
  }

  private switchStorageTabTo(nextTab: StorageTab): void {
    this.storageSelectionByTab[this.storageTab] = this.storageSelectionIndex;
    this.storageTab = nextTab;
    this.storageSelectionIndex = this.storageSelectionByTab[nextTab] ?? 0;
    this.clampStorageSelectionIndex();
    this.storageSelectionByTab[this.storageTab] = this.storageSelectionIndex;
    this.audio.playMenuMove();
    this.renderView();
  }

  private getStorageEntries(tab: StorageTab): CreatureInstance[] {
    return tab === 'party' ? this.gameState.party : this.gameState.storage;
  }

  private clampStorageSelectionIndex(): void {
    const entries = this.getStorageEntries(this.storageTab);
    if (entries.length <= 0) {
      this.storageSelectionIndex = 0;
      this.storageSelectionByTab[this.storageTab] = 0;
      return;
    }

    this.storageSelectionIndex = Phaser.Math.Clamp(
      this.storageSelectionIndex,
      0,
      entries.length - 1
    );
    this.storageSelectionByTab[this.storageTab] = this.storageSelectionIndex;
  }

  private getInventoryName(item: InventoryKey): string {
    if (item === 'coreSeal') {
      return 'Core Seal';
    }

    if (item === 'potion') {
      return 'Potion';
    }

    if (item === 'verdantSigil') {
      return 'Verdant Sigil';
    }

    if (item === 'trialSigil') {
      return 'Trial Sigils';
    }

    return 'Cleanse';
  }

  private getControlsHelpText(): string {
    return [
      'Overworld:',
      'Arrow Keys / WASD: Move',
      'Enter: Interact or advance dialog',
      'Esc: Open menu',
      'M: Toggle minimap',
      '',
      'Battle:',
      'Arrow Keys / WASD: Navigate',
      'Enter: Confirm',
      'B: Open Bag',
      'Esc: Back',
      '',
      'Mobile Touch Controls:',
      'D-pad: Move / navigate',
      'A: Confirm',
      'B: Back / cancel',
      'MENU: Open or close pause menu',
      '',
      'Challenge Mode:',
      'No items in trainer battles'
    ].join('\n');
  }

  private formatPlayTime(totalSeconds: number): string {
    const clamped = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const seconds = clamped % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private getCreatureLabel(creature: CreatureInstance): string {
    const fallback = getCreatureDefinition(creature.speciesId).name;
    return creature.nickname ?? fallback;
  }
}
