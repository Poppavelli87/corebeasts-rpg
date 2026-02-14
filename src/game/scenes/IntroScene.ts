import Phaser from 'phaser';
import { SCENE_KEYS } from '../constants';
import { getActiveGameState } from '../state/GameState';
import { AudioSystem } from '../systems/AudioSystem';

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

  private speakerText!: Phaser.GameObjects.Text;

  private lineText!: Phaser.GameObjects.Text;

  private hintText!: Phaser.GameObjects.Text;

  private preLineIndex = 0;

  private postLineIndex = 0;

  private phase: 'preDialog' | 'naming' | 'postDialog' = 'preDialog';

  private nameValue = 'Player';

  private enterKey!: Phaser.Input.Keyboard.Key;

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
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x040912, 1).setOrigin(0);
    this.add
      .rectangle(0, height - 124, width, 124, 0x071526, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0x8eb8dd, 1);

    this.add
      .text(width / 2, 40, 'CORE ARCHIVE', {
        fontFamily: '"Courier New", monospace',
        fontSize: '30px',
        color: '#f4d97a',
        stroke: '#2a1b00',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 76, 'Prologue', {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#9ecbea'
      })
      .setOrigin(0.5);

    this.speakerText = this.add.text(16, height - 116, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#f3e194'
    });

    this.lineText = this.add.text(16, height - 92, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#f5fbff',
      wordWrap: {
        width: width - 32
      }
    });

    this.hintText = this.add.text(width - 14, height - 14, 'Enter: Next', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#9fc7e4'
    });
    this.hintText.setOrigin(1, 1);

    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.input.keyboard!.on('keydown', this.keydownHandler);

    this.showLine(PRE_NAME_LINES[this.preLineIndex]);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.keydownHandler);
    });
  }

  public update(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.enterKey)) {
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
    this.lineText.setText(line.text);
  }
}
