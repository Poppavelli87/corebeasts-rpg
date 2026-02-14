import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getActiveGameState } from '../state/GameState';
import { AudioSystem } from '../systems/AudioSystem';
import { InputAdapter } from '../systems/InputAdapter';
import { getDialogCharsPerSecond, getUserSettings } from '../systems/UserSettings';
import { UI_THEME } from '../ui/UiTheme';
import { getViewportManager, type ViewportRect } from '../ui/ViewportManager';
import { TouchControls } from '../ui/TouchControls';

type IntroLine = {
  speaker: string;
  text: string;
};

const PRE_NAME_LINES: IntroLine[] = [
  {
    speaker: 'Curator Naila',
    text: 'Welcome to the Core Archive. Every bond begins with a single spark.'
  },
  {
    speaker: 'Curator Naila',
    text: 'Beyond this hall, Verdantis is stirring. The Trial Gate has gone quiet.'
  },
  {
    speaker: 'Rival Rowan',
    text: 'And I am not waiting around. I am reaching Verdantis first.'
  },
  {
    speaker: 'Curator Naila',
    text: 'Easy, Rowan. Strength without focus falls apart.'
  },
  {
    speaker: 'Rival Rowan',
    text: 'Then keep up, rookie. Route 1 is not going to clear itself.'
  },
  {
    speaker: 'Curator Naila',
    text: 'Before we begin, tell me your name.'
  }
];

const POST_NAME_LINES: IntroLine[] = [
  {
    speaker: 'Curator Naila',
    text: 'A good name carries intent. Hold to it when battles turn rough.'
  },
  {
    speaker: 'Curator Naila',
    text: 'Choose your first Corebeast now. Your journey begins at Starter Town.'
  }
];

export class IntroScene extends Phaser.Scene {
  private audio!: AudioSystem;

  private backdrop!: Phaser.GameObjects.Rectangle;

  private dialogPanel!: Phaser.GameObjects.Rectangle;

  private titleText!: Phaser.GameObjects.Text;

  private subtitleText!: Phaser.GameObjects.Text;

  private speakerText!: Phaser.GameObjects.Text;

  private lineText!: Phaser.GameObjects.Text;

  private hintText!: Phaser.GameObjects.Text;

  private preLineIndex = 0;

  private postLineIndex = 0;

  private phase: 'preDialog' | 'naming' | 'postDialog' = 'preDialog';

  private nameValue = 'Player';

  private inputAdapter!: InputAdapter;

  private revealEvent: Phaser.Time.TimerEvent | null = null;

  private fullLineText = '';

  private revealIndex = 0;

  private revealing = false;

  private viewportUnsubscribe: (() => void) | null = null;

  private keydownHandler = (event: KeyboardEvent): void => {
    if (this.phase !== 'naming') {
      return;
    }

    if (event.key === 'Backspace') {
      this.nameValue = this.nameValue.slice(0, -1);
      this.refreshNamingPrompt();
      return;
    }

    if (event.key === 'Enter') {
      this.confirmName();
      return;
    }

    if (!/^[a-zA-Z0-9 ]$/.test(event.key)) {
      return;
    }

    if (this.nameValue.length >= 12) {
      return;
    }

    this.nameValue += event.key;
    this.refreshNamingPrompt();
  };

  public constructor() {
    super(SCENE_KEYS.INTRO);
  }

  public create(): void {
    this.audio = new AudioSystem(this);
    this.audio.playMusic('title');
    this.backdrop = this.add.rectangle(0, 0, 10, 10, 0x040912, 1).setOrigin(0);
    this.dialogPanel = this.add
      .rectangle(0, 0, 10, 10, 0x071526, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0x8eb8dd, 1);

    this.titleText = this.add
      .text(0, 0, 'CORE ARCHIVE', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '30px',
        color: '#f4d97a',
        stroke: '#2a1b00',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    this.subtitleText = this.add
      .text(0, 0, 'Prologue', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '18px',
        color: '#9ecbea'
      })
      .setOrigin(0.5);

    this.speakerText = this.add.text(0, 0, '', {
      fontFamily: UI_THEME.fontFamily,
      fontSize: '16px',
      color: '#f3e194'
    });

    this.lineText = this.add.text(0, 0, '', {
      fontFamily: UI_THEME.fontFamily,
      fontSize: '18px',
      color: '#f5fbff',
      wordWrap: {
        width: 360
      }
    });

    this.hintText = this.add.text(0, 0, 'Enter: Next', {
      fontFamily: UI_THEME.fontFamily,
      fontSize: '13px',
      color: '#9fc7e4'
    });
    this.hintText.setOrigin(1, 1);

    this.input.keyboard!.on('keydown', this.keydownHandler);
    this.inputAdapter = new InputAdapter(this);
    TouchControls.getShared().setDialogOpen(true);

    this.viewportUnsubscribe = getViewportManager().onResize((viewport) => {
      this.applyLayout(viewport);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.applyLayout(getViewportManager().getViewport());

    this.showLine(PRE_NAME_LINES[this.preLineIndex]);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.keydownHandler);
      this.stopReveal();
      TouchControls.getShared().setDialogOpen(false);
      this.viewportUnsubscribe?.();
      this.viewportUnsubscribe = null;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    });
  }

  public update(): void {
    if (!this.inputAdapter.consume('confirm')) {
      return;
    }

    if (this.revealing) {
      this.finishReveal();
      return;
    }

    if (this.phase === 'naming') {
      this.confirmName();
      return;
    }

    if (this.phase === 'preDialog') {
      this.advancePreDialog();
      return;
    }

    if (this.phase === 'postDialog') {
      this.advancePostDialog();
    }
  }

  private advancePreDialog(): void {
    this.audio.beep({ frequency: 760, durationMs: 50 });
    this.preLineIndex += 1;
    if (this.preLineIndex < PRE_NAME_LINES.length) {
      this.showLine(PRE_NAME_LINES[this.preLineIndex]);
      return;
    }

    this.beginNamingPhase();
  }

  private beginNamingPhase(): void {
    this.stopReveal();
    this.phase = 'naming';
    this.speakerText.setText('Name Entry');
    this.refreshNamingPrompt();
    this.hintText.setText('Type letters, Enter: Confirm');
  }

  private refreshNamingPrompt(): void {
    const displayed = this.nameValue.length > 0 ? this.nameValue : '_';
    this.lineText.setText(`Name: ${displayed}`);
  }

  private confirmName(): void {
    const trimmed = this.nameValue.trim();
    if (trimmed.length === 0) {
      this.audio.beep({ frequency: 250, durationMs: 80 });
      return;
    }

    this.audio.beep({ frequency: 880, durationMs: 70 });
    this.nameValue = trimmed;
    const gameState = getActiveGameState();
    gameState.player.name = this.nameValue;

    this.phase = 'postDialog';
    this.postLineIndex = 0;
    this.showLine(POST_NAME_LINES[this.postLineIndex]);
    this.hintText.setText('Enter: Continue');
  }

  private advancePostDialog(): void {
    this.audio.beep({ frequency: 760, durationMs: 50 });
    this.postLineIndex += 1;
    if (this.postLineIndex < POST_NAME_LINES.length) {
      this.showLine(POST_NAME_LINES[this.postLineIndex]);
      return;
    }

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.STARTER_SELECTION);
    });
    this.cameras.main.fadeOut(280, 0, 0, 0);
  }

  private showLine(line: IntroLine): void {
    this.speakerText.setText(line.speaker.toUpperCase());
    this.fullLineText = line.text;
    this.revealIndex = 0;
    this.lineText.setText('');
    this.startReveal();
  }

  private startReveal(): void {
    this.stopReveal();
    if (!this.fullLineText.length) {
      this.lineText.setText('');
      this.hintText.setText('Enter: Next');
      this.revealing = false;
      return;
    }

    this.revealing = true;
    this.hintText.setText('Enter: Skip');
    const charsPerSecond = getDialogCharsPerSecond(getUserSettings().textSpeed);
    const delay = Math.max(10, Math.floor(1000 / charsPerSecond));
    this.revealEvent = this.time.addEvent({
      delay,
      loop: true,
      callback: () => {
        this.revealIndex += 1;
        if (this.revealIndex >= this.fullLineText.length) {
          this.finishReveal();
          return;
        }
        this.lineText.setText(this.fullLineText.slice(0, this.revealIndex));
      }
    });
  }

  private finishReveal(): void {
    this.stopReveal();
    this.revealing = false;
    this.lineText.setText(this.fullLineText);
    this.hintText.setText(this.phase === 'naming' ? 'Type letters, Enter: Confirm' : 'Enter: Next');
  }

  private stopReveal(): void {
    this.revealEvent?.remove(false);
    this.revealEvent = null;
  }

  private handleScaleResize(): void {
    if (!this.backdrop?.active || !this.dialogPanel?.active) {
      return;
    }

    this.applyLayout(getViewportManager().getViewport());
  }

  private applyLayout(viewport: ViewportRect): void {
    if (
      !this.backdrop?.active ||
      !this.dialogPanel?.active ||
      !this.titleText?.active ||
      !this.subtitleText?.active ||
      !this.speakerText?.active ||
      !this.lineText?.active ||
      !this.hintText?.active
    ) {
      return;
    }

    const safe = getViewportManager().getSafeMargins();
    const panelPadding = 10;
    const panelWidth = Math.max(220, viewport.width - safe.left - safe.right - panelPadding * 2);
    const panelHeight = Math.max(110, Math.min(146, Math.round(viewport.height * 0.34)));
    const panelX = viewport.x + safe.left + panelPadding;
    const panelY =
      viewport.y + viewport.height - safe.bottom - panelHeight - Math.max(6, panelPadding - 2);

    this.backdrop.setPosition(viewport.x, viewport.y).setSize(viewport.width, viewport.height);
    this.dialogPanel.setPosition(panelX, panelY).setSize(panelWidth, panelHeight);

    this.titleText.setPosition(viewport.x + viewport.width / 2, viewport.y + safe.top + 28);
    this.subtitleText.setPosition(viewport.x + viewport.width / 2, viewport.y + safe.top + 64);

    this.speakerText.setPosition(panelX + 16, panelY + 10);
    this.lineText.setPosition(panelX + 16, panelY + 36).setWordWrapWidth(panelWidth - 32, true);
    this.hintText.setPosition(panelX + panelWidth - 14, panelY + panelHeight - 14);
  }
}
