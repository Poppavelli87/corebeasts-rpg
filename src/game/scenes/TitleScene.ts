import Phaser from 'phaser';
import { MENU_OPTIONS, SCENE_KEYS } from '../constants';
import { createNewGameState, setActiveGameState, type DifficultyMode } from '../state/GameState';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';

type PanelMode = 'none' | 'continue' | 'settings' | 'quitConfirm' | 'quitDone';

export class TitleScene extends Phaser.Scene {
  private static readonly DIFFICULTY_OPTIONS: DifficultyMode[] = ['easy', 'normal', 'hard'];

  private menuLabels: Phaser.GameObjects.Text[] = [];

  private selectedIndex = 0;

  private panelMode: PanelMode = 'none';

  private panelBox!: Phaser.GameObjects.Rectangle;

  private panelText!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private enterKey!: Phaser.Input.Keyboard.Key;

  private escKey!: Phaser.Input.Keyboard.Key;

  private audio!: AudioSystem;

  private hasContinueSave = false;

  private selectedDifficulty: DifficultyMode = 'normal';

  public constructor() {
    super(SCENE_KEYS.TITLE);
  }

  public create(): void {
    this.hasContinueSave = SaveSystem.hasSave();
    this.selectedDifficulty = SaveSystem.getSavedDifficulty() ?? 'normal';

    const { width, height } = this.scale;

    this.drawRetroBackdrop(width, height);

    this.add
      .text(width / 2, 58, 'COREBEASTS', {
        fontFamily: '"Courier New", monospace',
        fontSize: '54px',
        color: '#f5d76e',
        stroke: '#3a2600',
        strokeThickness: 8
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 102, 'RPG', {
        fontFamily: '"Courier New", monospace',
        fontSize: '26px',
        color: '#9fe3ff',
        stroke: '#112033',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    const menuStartY = 162;
    MENU_OPTIONS.forEach((label, index) => {
      const menuLabel = this.add
        .text(width / 2, menuStartY + index * 34, '', {
          fontFamily: '"Courier New", monospace',
          fontSize: '28px',
          color: '#d8ddff'
        })
        .setOrigin(0.5);

      this.menuLabels.push(menuLabel);
      menuLabel.setData('menuLabel', label);
    });

    this.panelBox = this.add
      .rectangle(width / 2, 304, 540, 88, 0x0a0d17, 0.9)
      .setStrokeStyle(3, 0x9fe3ff, 1)
      .setVisible(false);

    this.panelText = this.add
      .text(width / 2, 304, '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        align: 'center',
        color: '#f7fbff'
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.add
      .text(width / 2, height - 16, 'UP / DOWN: SELECT    ENTER: CONFIRM    ESC: BACK', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#8ab0cf'
      })
      .setOrigin(0.5);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.audio = new AudioSystem(this);

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

      if (leftPressed || upPressed) {
        this.shiftDifficulty(-1);
        return;
      }

      if (rightPressed || downPressed) {
        this.shiftDifficulty(1);
        return;
      }

      if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        this.shiftDifficulty(1);
        return;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.audio.beep({ frequency: 420, durationMs: 70 });
      this.closePanel();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey) && this.panelMode === 'quitConfirm') {
      this.audio.beep({ frequency: 250, durationMs: 120 });
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
    const menuSize = MENU_OPTIONS.length;
    this.selectedIndex = (this.selectedIndex + direction + menuSize) % menuSize;
    this.audio.beep({ frequency: 760, durationMs: 45 });
    this.refreshMenu();
  }

  private confirmSelection(): void {
    const choice = MENU_OPTIONS[this.selectedIndex];

    this.audio.beep({ frequency: 920, durationMs: 70 });

    if (choice === 'New Game') {
      setActiveGameState(createNewGameState('Player', false, this.selectedDifficulty));
      this.registry.set('battleState', null);
      this.registry.set('overworldState', null);
      this.registry.set('gameState', null);
      this.scene.start(SCENE_KEYS.INTRO);
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
      this.scene.start(SCENE_KEYS.OVERWORLD);
      return;
    }

    if (choice === 'Settings') {
      this.openPanel('settings');
      return;
    }

    this.openPanel('quitConfirm');
  }

  private openPanel(mode: Exclude<PanelMode, 'none'>): void {
    this.panelMode = mode;
    this.panelBox.setVisible(true);
    this.panelText.setVisible(true);

    if (mode === 'settings') {
      this.renderSettingsPanel();
    } else {
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
    this.panelText.setVisible(false);
    this.refreshMenu();
  }

  private refreshMenu(): void {
    this.menuLabels.forEach((label, index) => {
      const option = MENU_OPTIONS[index];
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
    this.audio.beep({ frequency: 760, durationMs: 45 });
    this.renderSettingsPanel();
  }

  private renderSettingsPanel(): void {
    const label = this.selectedDifficulty.toUpperCase();
    this.panelText.setText(
      `Difficulty: ${label}\nLeft/Right or Enter: Change\nEsc: Back\n\nNew Game will start on this difficulty.`
    );
  }
}
