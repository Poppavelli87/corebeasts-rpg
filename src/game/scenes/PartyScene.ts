import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getCreatureDefinition } from '../data/creatures';
import { getMoveDefinition } from '../data/moves';
import { applyItemEvolution, xpToNextLevel } from '../systems/Progression';
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
import { ProcSpriteFactory } from '../systems/ProcSpriteFactory';

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
  | 'message';

type PartySceneLaunchData = {
  source?: 'menu' | 'terminal';
};

type StorageTab = 'party' | 'storage';

type RootOption = 'Party' | 'Inventory' | 'Save' | 'Options';
type StorageActionOption = 'Move to Party' | 'Release' | 'Cancel';

const ROOT_OPTIONS: RootOption[] = ['Party', 'Inventory', 'Save', 'Options'];
const DIFFICULTY_OPTIONS: DifficultyMode[] = ['easy', 'normal', 'hard'];
const STORAGE_ACTION_OPTIONS: StorageActionOption[] = ['Move to Party', 'Release', 'Cancel'];
const STORAGE_TABS: StorageTab[] = ['party', 'storage'];
const INVENTORY_DISPLAY_OPTIONS: InventoryKey[] = [
  'coreSeal',
  'potion',
  'cleanse',
  'verdantSigil',
  'trialSigil'
];
const STORAGE_PAGE_SIZE = 6;

export class PartyScene extends Phaser.Scene {
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

  private optionsConfirmIndex = 1;

  private messageText = '';

  private messageReturnMode: Exclude<ViewMode, 'message'> = 'root';

  private messageTitle = 'Info';

  private layer!: Phaser.GameObjects.Container;

  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  private enterKey!: Phaser.Input.Keyboard.Key;

  private escKey!: Phaser.Input.Keyboard.Key;

  public constructor() {
    super(SCENE_KEYS.PARTY);
  }

  public create(data?: PartySceneLaunchData): void {
    this.gameState = getActiveGameState();
    this.pendingDifficulty = this.gameState.difficulty;
    this.launchedFromTerminal = data?.source === 'terminal';
    this.mode = this.launchedFromTerminal ? 'storageManager' : 'root';
    this.storageTab = 'party';
    this.storageSelectionIndex = 0;
    this.storageActionIndex = 0;
    this.storageActionTargetIndex = 0;
    this.storageReleaseConfirmIndex = 0;

    this.layer = this.add.container(0, 0).setDepth(20_000);

    this.cursorKeys = this.input.keyboard!.createCursorKeys();
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.renderView();
  }

  public update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.handleBack();
      return;
    }

    if (this.mode === 'message') {
      if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        this.mode = this.messageReturnMode;
        this.renderView();
      }
      return;
    }

    if (this.mode === 'storageManager') {
      const leftPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.left!);
      const rightPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.right!);
      if (leftPressed || rightPressed) {
        this.switchStorageTab(leftPressed ? -1 : 1);
      }
    }

    if (this.mode === 'options') {
      const leftPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.left!);
      const rightPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.right!);
      if (this.optionsIndex === 0 && (leftPressed || rightPressed)) {
        this.shiftPendingDifficulty(leftPressed ? -1 : 1);
      }
    }

    if (this.mode === 'storageReleaseConfirm') {
      const leftPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.left!);
      const rightPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.right!);
      if (leftPressed || rightPressed) {
        this.storageReleaseConfirmIndex = Phaser.Math.Wrap(
          this.storageReleaseConfirmIndex + (leftPressed ? -1 : 1),
          0,
          2
        );
        this.renderView();
      }
    }

    if (this.mode === 'optionsConfirm') {
      const leftPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.left!);
      const rightPressed = Phaser.Input.Keyboard.JustDown(this.cursorKeys.right!);
      if (leftPressed || rightPressed) {
        this.optionsConfirmIndex = Phaser.Math.Wrap(
          this.optionsConfirmIndex + (leftPressed ? -1 : 1),
          0,
          2
        );
        this.renderView();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.up!)) {
      this.moveSelection(-1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.down!)) {
      this.moveSelection(1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.confirmSelection();
    }
  }

  private moveSelection(direction: number): void {
    if (this.mode === 'root') {
      this.rootIndex = Phaser.Math.Wrap(this.rootIndex + direction, 0, ROOT_OPTIONS.length);
    } else if (this.mode === 'partyList') {
      this.partyIndex = Phaser.Math.Wrap(
        this.partyIndex + direction,
        0,
        this.gameState.party.length
      );
    } else if (this.mode === 'inventoryList') {
      this.inventoryIndex = Phaser.Math.Wrap(
        this.inventoryIndex + direction,
        0,
        INVENTORY_DISPLAY_OPTIONS.length
      );
    } else if (this.mode === 'inventoryTarget') {
      this.targetIndex = Phaser.Math.Wrap(
        this.targetIndex + direction,
        0,
        this.gameState.party.length
      );
    } else if (this.mode === 'storageManager') {
      const entries = this.getStorageEntries(this.storageTab);
      if (entries.length > 0) {
        this.storageSelectionIndex = Phaser.Math.Wrap(
          this.storageSelectionIndex + direction,
          0,
          entries.length
        );
      }
    } else if (this.mode === 'storageAction') {
      this.storageActionIndex = Phaser.Math.Wrap(
        this.storageActionIndex + direction,
        0,
        STORAGE_ACTION_OPTIONS.length
      );
    } else if (this.mode === 'storageReleaseConfirm') {
      this.storageReleaseConfirmIndex = Phaser.Math.Wrap(
        this.storageReleaseConfirmIndex + direction,
        0,
        2
      );
    } else if (this.mode === 'options') {
      this.optionsIndex = Phaser.Math.Wrap(this.optionsIndex + direction, 0, 3);
    } else if (this.mode === 'optionsConfirm') {
      this.optionsConfirmIndex = Phaser.Math.Wrap(this.optionsConfirmIndex + direction, 0, 2);
    }

    this.renderView();
  }

  private confirmSelection(): void {
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
      this.confirmDifficultyChange();
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

    this.pendingDifficulty = this.gameState.difficulty;
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

    const panel = this.add
      .rectangle(24, 20, width - 48, height - 40, 0x081324, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0x87b5dc, 1)
      .setScrollFactor(0);

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
    } else if (this.mode === 'storageManager') {
      this.renderStorageManager(panel);
    } else if (this.mode === 'storageAction') {
      this.renderStorageAction(panel);
    } else if (this.mode === 'storageReleaseConfirm') {
      this.renderStorageReleaseConfirm(panel);
    } else {
      this.renderMessage(panel);
    }
  }

  private renderHeader(
    panel: Phaser.GameObjects.Rectangle,
    title: string,
    subtitle?: string
  ): void {
    const titleText = this.add
      .text(panel.x + 14, panel.y + 10, title, {
        fontFamily: '"Courier New", monospace',
        fontSize: '20px',
        color: '#f4f8ff'
      })
      .setScrollFactor(0);

    this.layer.add(titleText);

    if (subtitle) {
      const subtitleText = this.add
        .text(panel.x + 14, panel.y + 36, subtitle, {
          fontFamily: '"Courier New", monospace',
          fontSize: '13px',
          color: '#9ec3df'
        })
        .setScrollFactor(0);

      this.layer.add(subtitleText);
    }
  }

  private renderRootMenu(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(
      panel,
      'Menu',
      `Difficulty: ${this.gameState.difficulty.toUpperCase()}  Esc: Close`
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
    this.renderHeader(panel, 'Options', 'Adjust difficulty. Enter: Select  Esc: Back');

    const rows = [
      `Difficulty: ${this.pendingDifficulty.toUpperCase()}`,
      'Apply Difficulty Change',
      'Back'
    ];

    rows.forEach((text, index) => {
      this.createSelectableRow({
        panel,
        index,
        y: panel.y + 76 + index * 44,
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
        panel.y + panel.height - 34,
        'Left/Right on Difficulty to cycle. Changes require confirmation.',
        {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          color: '#8fb6d7'
        }
      )
      .setScrollFactor(0);

    this.layer.add(hint);
  }

  private renderOptionsConfirm(panel: Phaser.GameObjects.Rectangle): void {
    this.renderHeader(
      panel,
      'Confirm Difficulty',
      `Change from ${this.gameState.difficulty.toUpperCase()} to ${this.pendingDifficulty.toUpperCase()}?`
    );

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
        this.confirmDifficultyChange();
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

  private confirmOptionsSelection(): void {
    if (this.optionsIndex === 0) {
      this.shiftPendingDifficulty(1);
      return;
    }

    if (this.optionsIndex === 1) {
      if (this.pendingDifficulty === this.gameState.difficulty) {
        this.showMessage('Difficulty is already set to this mode.', 'options', 'Options');
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

  private confirmDifficultyChange(): void {
    if (this.optionsConfirmIndex === 1) {
      this.mode = 'options';
      this.renderView();
      return;
    }

    this.gameState.difficulty = this.pendingDifficulty;
    SaveSystem.save(this.gameState);
    this.showMessage(
      `Difficulty changed to ${this.gameState.difficulty.toUpperCase()}.`,
      'options',
      'Options'
    );
  }

  private shiftPendingDifficulty(direction: number): void {
    const currentIndex = DIFFICULTY_OPTIONS.indexOf(this.pendingDifficulty);
    const nextIndex = Phaser.Math.Wrap(currentIndex + direction, 0, DIFFICULTY_OPTIONS.length);
    this.pendingDifficulty = DIFFICULTY_OPTIONS[nextIndex];
    this.renderView();
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
          this.storageTab = tab;
          this.clampStorageSelectionIndex();
          this.renderView();
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
          this.renderView();
        },
        onConfirm: () => {
          this.storageSelectionIndex = index;
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
    const row = this.add
      .rectangle(options.panel.x + 14, options.y, options.panel.width - 28, 34, 0x16253d, 1)
      .setOrigin(0)
      .setStrokeStyle(2, options.selected ? 0xbce0ff : 0x4f7398, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    row.on('pointerover', () => {
      options.onSelect();
    });

    row.on('pointerdown', () => {
      options.onConfirm();
    });

    const label = this.add
      .text(row.x + 10, row.y + 9, `${options.selected ? '>' : ' '} ${options.text}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: options.selected ? '#f6e492' : '#d5e6f8'
      })
      .setScrollFactor(0);

    this.layer.add([row, label]);

    return row;
  }

  private switchStorageTab(direction: number): void {
    const tabIndex = STORAGE_TABS.indexOf(this.storageTab);
    this.storageTab = STORAGE_TABS[Phaser.Math.Wrap(tabIndex + direction, 0, STORAGE_TABS.length)];
    this.clampStorageSelectionIndex();
    this.renderView();
  }

  private getStorageEntries(tab: StorageTab): CreatureInstance[] {
    return tab === 'party' ? this.gameState.party : this.gameState.storage;
  }

  private clampStorageSelectionIndex(): void {
    const entries = this.getStorageEntries(this.storageTab);
    if (entries.length <= 0) {
      this.storageSelectionIndex = 0;
      return;
    }

    this.storageSelectionIndex = Phaser.Math.Clamp(
      this.storageSelectionIndex,
      0,
      entries.length - 1
    );
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

  private getCreatureLabel(creature: CreatureInstance): string {
    const fallback = getCreatureDefinition(creature.speciesId).name;
    return creature.nickname ?? fallback;
  }
}
