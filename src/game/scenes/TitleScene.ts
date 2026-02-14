import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getCreatureDefinition } from '../data/creatures';
import {
  createCreatureInstance,
  createNewGameState,
  setActiveGameState,
  type CreatureInstance,
  type DifficultyMode
} from '../state/GameState';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import {
  UI_THEME,
  createBackHint,
  createBodyText,
  createHeadingText,
  createPanel
} from '../ui/UiTheme';

type PanelMode =
  | 'none'
  | 'continue'
  | 'settings'
  | 'help'
  | 'quitConfirm'
  | 'quitDone'
  | 'newGamePlus';

export class TitleScene extends Phaser.Scene {
  private static readonly DIFFICULTY_OPTIONS: DifficultyMode[] = ['easy', 'normal', 'hard'];

  private menuOptions: string[] = [];

  private menuLabels: Phaser.GameObjects.Text[] = [];

  private selectedIndex = 0;

  private panelMode: PanelMode = 'none';

  private panelBox!: Phaser.GameObjects.Rectangle;

  private panelText!: Phaser.GameObjects.Text;

  private panelHeading!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private enterKey!: Phaser.Input.Keyboard.Key;

  private escKey!: Phaser.Input.Keyboard.Key;

  private audio!: AudioSystem;

  private hasContinueSave = false;

  private hasNgPlusUnlocked = false;

  private selectedDifficulty: DifficultyMode = 'normal';

  private selectedChallengeMode = false;

  private settingsIndex = 0;

  private ngPlusCarryCandidates: CreatureInstance[] = [];

  private ngPlusCarryIndex = 0;

  private bestTimes = SaveSystem.getBestTimes();

  private controlsHint!: Phaser.GameObjects.Text;

  private panelBackHint!: Phaser.GameObjects.Text;

  public constructor() {
    super(SCENE_KEYS.TITLE);
  }

  public create(): void {
    this.hasContinueSave = SaveSystem.hasSave();
    this.hasNgPlusUnlocked = SaveSystem.hasPostgameUnlockedSave();
    this.selectedDifficulty = SaveSystem.getSavedDifficulty() ?? 'normal';
    this.selectedChallengeMode = SaveSystem.getSavedChallengeMode();
    this.bestTimes = SaveSystem.getBestTimes();
    this.settingsIndex = 0;
    this.ngPlusCarryCandidates = [];
    this.ngPlusCarryIndex = 0;
    this.menuOptions = this.buildMenuOptions();
    this.menuLabels = [];
    this.selectedIndex = Phaser.Math.Clamp(this.selectedIndex, 0, this.menuOptions.length - 1);
    this.registry.set('titleMenuOptions', [...this.menuOptions]);
    this.audio = new AudioSystem(this);
    this.audio.playMusic('title');

    const { width, height } = this.scale;

    this.drawRetroBackdrop(width, height);

    this.add
      .text(width / 2, 58, 'COREBEASTS', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '54px',
        color: '#f5d76e',
        stroke: '#3a2600',
        strokeThickness: 8
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 102, 'RPG', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '26px',
        color: '#9fe3ff',
        stroke: '#112033',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    const menuStartY = 162;
    const menuStep = this.menuOptions.length > 5 ? 30 : 34;
    this.menuOptions.forEach((label, index) => {
      const menuLabel = this.add
        .text(width / 2, menuStartY + index * menuStep, '', {
          fontFamily: UI_THEME.fontFamily,
          fontSize: '28px',
          color: '#d8ddff'
        })
        .setOrigin(0.5);

      this.menuLabels.push(menuLabel);
      menuLabel.setData('menuLabel', label);
    });

    this.panelBox = createPanel(this, {
      x: width / 2 - 270,
      y: 230,
      width: 540,
      height: 128,
      strokeWidth: 3,
      strokeColor: 0x9fe3ff,
      fillColor: 0x0a0d17,
      fillAlpha: 0.9
    }).setVisible(false);

    this.panelHeading = createHeadingText(this, this.panelBox.x + 12, this.panelBox.y + 10, '', {
      size: 16,
      color: '#f5e08b',
      depth: this.panelBox.depth + 1
    }).setVisible(false);

    this.panelText = createBodyText(this, this.panelBox.x + 12, this.panelBox.y + 30, '', {
      size: 16,
      color: '#f7fbff',
      wordWrapWidth: this.panelBox.width - 24,
      depth: this.panelBox.depth + 1
    }).setVisible(false);

    this.controlsHint = this.add
      .text(width / 2, height - 16, 'UP / DOWN: SELECT    ENTER: CONFIRM    ESC: BACK', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '14px',
        color: UI_THEME.backHintColor
      })
      .setOrigin(0.5);

    this.panelBackHint = createBackHint(this, 'Esc: Back', {
      x: this.panelBox.x + this.panelBox.width - 8,
      y: this.panelBox.y + this.panelBox.height - 8,
      depth: this.panelBox.depth + 1
    }).setVisible(false);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.refreshMenu();
  }

  public update(): void {
    if (this.panelMode === 'none') {
      if (Phaser.Input.Keyboard.JustDown(this.cursors.up!)) {
        this.moveSelection(-1);
      }

      if (Phaser.Input.Keyboard.JustDown(this.cursors.down!)) {
        this.moveSelection(1);
      }

      if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        this.confirmSelection();
      }

      return;
    }

    if (this.panelMode === 'settings') {
      const leftPressed = Phaser.Input.Keyboard.JustDown(this.cursors.left!);
      const rightPressed = Phaser.Input.Keyboard.JustDown(this.cursors.right!);
      const upPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up!);
      const downPressed = Phaser.Input.Keyboard.JustDown(this.cursors.down!);

      if (upPressed || downPressed) {
        this.settingsIndex = Phaser.Math.Wrap(this.settingsIndex + (upPressed ? -1 : 1), 0, 2);
        this.audio.playMenuMove();
        this.renderSettingsPanel();
        return;
      }

      if (leftPressed || rightPressed) {
        this.applySettingsAdjust(leftPressed ? -1 : 1);
        return;
      }

      if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        this.applySettingsAdjust(1);
        return;
      }
    }

    if (this.panelMode === 'newGamePlus') {
      const leftPressed = Phaser.Input.Keyboard.JustDown(this.cursors.left!);
      const rightPressed = Phaser.Input.Keyboard.JustDown(this.cursors.right!);
      const upPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up!);
      const downPressed = Phaser.Input.Keyboard.JustDown(this.cursors.down!);

      if (leftPressed || upPressed) {
        this.shiftNgPlusCarry(-1);
        return;
      }

      if (rightPressed || downPressed) {
        this.shiftNgPlusCarry(1);
        return;
      }

      if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        this.startNewGamePlus();
        return;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.audio.playMenuBack();
      this.closePanel();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey) && this.panelMode === 'quitConfirm') {
      this.audio.playMenuConfirm();
      this.openPanel('quitDone');
    }
  }

  private drawRetroBackdrop(width: number, height: number): void {
    const graphics = this.add.graphics();

    graphics.fillGradientStyle(0x0f172a, 0x0f172a, 0x05060e, 0x05060e, 1);
    graphics.fillRect(0, 0, width, height);

    for (let y = 0; y < height; y += 4) {
      const alpha = y % 8 === 0 ? 0.2 : 0.08;
      graphics.fillStyle(0x2f3c73, alpha);
      graphics.fillRect(0, y, width, 2);
    }

    for (let star = 0; star < 40; star += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, 140);
      const color = star % 2 === 0 ? 0x7ad7ff : 0xf8e16c;
      graphics.fillStyle(color, 0.6);
      graphics.fillRect(x, y, 2, 2);
    }
  }

  private moveSelection(direction: number): void {
    const menuSize = this.menuOptions.length;
    this.selectedIndex = (this.selectedIndex + direction + menuSize) % menuSize;
    this.audio.playMenuMove();
    this.refreshMenu();
  }

  private confirmSelection(): void {
    const choice = this.menuOptions[this.selectedIndex];

    this.audio.playMenuConfirm();

    if (choice === 'New Game') {
      this.startNewGame();
      return;
    }

    if (choice === 'New Game+') {
      if (!this.hasNgPlusUnlocked) {
        this.openPanel('continue');
        return;
      }

      this.openNewGamePlusPanel();
      this.registry.set('battleState', null);
      this.registry.set('overworldState', null);
      this.registry.set('gameState', null);
      return;
    }

    if (choice === 'Continue') {
      if (!this.hasContinueSave) {
        this.openPanel('continue');
        return;
      }

      const loaded = SaveSystem.load();
      if (!loaded) {
        this.hasContinueSave = false;
        this.openPanel('continue');
        this.refreshMenu();
        return;
      }

      this.registry.set('battleState', null);
      this.registry.set('overworldState', null);
      this.registry.set('gameState', null);
      this.registry.set('ngPlusCarryOverCreature', null);
      this.scene.start(SCENE_KEYS.OVERWORLD);
      return;
    }

    if (choice === 'Settings') {
      this.openPanel('settings');
      return;
    }

    if (choice === 'Help') {
      this.openPanel('help');
      return;
    }

    this.openPanel('quitConfirm');
  }

  private openPanel(mode: Exclude<PanelMode, 'none'>): void {
    this.panelMode = mode;
    this.panelBackHint.setText(mode === 'quitDone' ? 'Esc: Back' : 'Esc: Close');
    this.panelBox.setVisible(true);
    this.panelHeading.setVisible(true);
    this.panelText.setVisible(true);
    this.panelBackHint.setVisible(true);
    this.controlsHint.setVisible(false);

    if (mode === 'settings') {
      this.settingsIndex = 0;
      this.panelHeading.setText('SETTINGS');
      this.renderSettingsPanel();
    } else if (mode === 'newGamePlus') {
      this.panelHeading.setText('NEW GAME+');
      this.renderNewGamePlusPanel();
    } else if (mode === 'help') {
      this.panelHeading.setText('HELP');
      this.panelText.setText([
        'UP / DOWN: SELECT   ENTER: CONFIRM',
        'ESC: BACK',
        '',
        'OVERWORLD: M TOGGLE MINIMAP',
        'BATTLE: B OPEN BAG',
        'NEW GAME+: TRAINERS RANDOMIZE BY RUN'
      ]);
    } else {
      this.panelHeading.setText(mode === 'continue' ? 'CONTINUE' : 'SYSTEM');
      const message = {
        continue: 'Continue is disabled.\nNo save data found yet.\nPress Esc to go back.',
        quitConfirm: 'Quit game?\nEnter: confirm   Esc: go back',
        quitDone: 'Quit cancelled in browser mode.\nPress Esc to go back.'
      }[mode];

      this.panelText.setText(message);
    }
    this.refreshMenu();
  }

  private closePanel(): void {
    this.panelMode = 'none';
    this.panelBox.setVisible(false);
    this.panelHeading.setVisible(false);
    this.panelText.setVisible(false);
    this.panelBackHint.setVisible(false);
    this.controlsHint.setVisible(true);
    this.refreshMenu();
  }

  private refreshMenu(): void {
    this.menuLabels.forEach((label, index) => {
      const option = this.menuOptions[index];
      const isContinueDisabled = option === 'Continue' && !this.hasContinueSave;
      const isSelected = this.panelMode === 'none' && index === this.selectedIndex;

      label.setText(`${isSelected ? '>' : ' '} ${option.toUpperCase()}`);

      if (isContinueDisabled) {
        label.setColor('#7a88a6');
      } else {
        label.setColor(isSelected ? '#f8e16c' : '#d8ddff');
      }
    });
  }

  private shiftDifficulty(direction: number): void {
    const options = TitleScene.DIFFICULTY_OPTIONS;
    const currentIndex = options.indexOf(this.selectedDifficulty);
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    this.selectedDifficulty = options[nextIndex];
    this.audio.playMenuMove();
    this.renderSettingsPanel();
  }

  private applySettingsAdjust(direction: 1 | -1): void {
    if (this.settingsIndex === 0) {
      this.shiftDifficulty(direction);
      return;
    }

    this.selectedChallengeMode = !this.selectedChallengeMode;
    this.audio.playMenuMove();
    this.renderSettingsPanel();
  }

  private renderSettingsPanel(): void {
    const label = this.selectedDifficulty.toUpperCase();
    const challengeLabel = this.selectedChallengeMode ? 'ON' : 'OFF';
    this.panelText.setText(
      [
        `${this.settingsIndex === 0 ? '>' : ' '} Difficulty: ${label}`,
        `${this.settingsIndex === 1 ? '>' : ' '} Challenge Mode: ${challengeLabel}`,
        'Up/Down: Select  Left/Right: Change',
        'Enter: Change selected option',
        'Applies to New Game / New Game+'
      ].join('\n')
    );
  }

  private openNewGamePlusPanel(): void {
    this.ngPlusCarryCandidates = SaveSystem.getCarryOverCandidates();
    this.ngPlusCarryIndex = 0;
    this.openPanel('newGamePlus');
  }

  private shiftNgPlusCarry(direction: number): void {
    const totalOptions = this.ngPlusCarryCandidates.length + 1;
    this.ngPlusCarryIndex = (this.ngPlusCarryIndex + direction + totalOptions) % totalOptions;
    this.audio.playMenuMove();
    this.renderNewGamePlusPanel();
  }

  private renderNewGamePlusPanel(): void {
    const selectedCarry =
      this.ngPlusCarryIndex === 0
        ? 'None'
        : this.formatCarryCreatureLabel(this.ngPlusCarryCandidates[this.ngPlusCarryIndex - 1]);

    this.panelText.setText(
      [
        `Difficulty: ${this.selectedDifficulty.toUpperCase()}  Challenge: ${
          this.selectedChallengeMode ? 'ON' : 'OFF'
        }`,
        `Carry Over: ${selectedCarry}`,
        `Best E/N/H: ${TitleScene.formatTime(this.bestTimes.easy)} / ${TitleScene.formatTime(
          this.bestTimes.normal
        )} / ${TitleScene.formatTime(this.bestTimes.hard)}`,
        'Left/Right: Carry option  Enter: Start'
      ].join('\n')
    );
  }

  private startNewGame(): void {
    setActiveGameState(
      createNewGameState('Player', false, this.selectedDifficulty, {
        challengeMode: this.selectedChallengeMode,
        newGamePlus: false,
        ngPlusCycle: 0
      })
    );
    this.registry.set('battleState', null);
    this.registry.set('overworldState', null);
    this.registry.set('gameState', null);
    this.registry.set('ngPlusCarryOverCreature', null);
    this.scene.start(SCENE_KEYS.INTRO);
  }

  private startNewGamePlus(): void {
    const nextCycle = Math.max(1, SaveSystem.getNgPlusCycle() + 1);
    setActiveGameState(
      createNewGameState('Player', false, this.selectedDifficulty, {
        challengeMode: this.selectedChallengeMode,
        newGamePlus: true,
        ngPlusCycle: nextCycle
      })
    );

    if (this.ngPlusCarryIndex > 0) {
      const source = this.ngPlusCarryCandidates[this.ngPlusCarryIndex - 1];
      if (source) {
        const carryOver = createCreatureInstance(source.speciesId, 5, {
          nickname: source.nickname,
          moves: source.moves
        });
        this.registry.set('ngPlusCarryOverCreature', {
          speciesId: carryOver.speciesId,
          nickname: carryOver.nickname,
          moves: [...carryOver.moves]
        });
      }
    } else {
      this.registry.set('ngPlusCarryOverCreature', null);
    }

    this.registry.set('battleState', null);
    this.registry.set('overworldState', null);
    this.registry.set('gameState', null);
    this.scene.start(SCENE_KEYS.INTRO);
  }

  private buildMenuOptions(): string[] {
    const options = ['New Game', 'Continue'];
    if (this.hasNgPlusUnlocked) {
      options.push('New Game+');
    }
    options.push('Settings', 'Help', 'Quit');
    return options;
  }

  private formatCarryCreatureLabel(creature?: CreatureInstance): string {
    if (!creature) {
      return 'None';
    }

    const name = creature.nickname?.trim() || getCreatureDefinition(creature.speciesId).name;
    return `${name} (Lv${creature.level})`;
  }

  private static formatTime(totalSeconds: number | null): string {
    if (totalSeconds === null || totalSeconds < 0) {
      return '--:--:--';
    }

    const clamped = Math.floor(totalSeconds);
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const seconds = clamped % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}
