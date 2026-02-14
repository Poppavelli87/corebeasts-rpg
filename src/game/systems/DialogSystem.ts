import Phaser from 'phaser';
import type { DialogEntry } from './TileMap';
import { getDialogCharsPerSecond, getUserSettings } from './UserSettings';
import { UI_THEME } from '../ui/UiTheme';
import { getViewportManager } from '../ui/ViewportManager';

export class DialogSystem {
  private readonly scene: Phaser.Scene;

  private readonly background: Phaser.GameObjects.Rectangle;

  private readonly border: Phaser.GameObjects.Rectangle;

  private readonly speakerLabel: Phaser.GameObjects.Text;

  private readonly bodyLabel: Phaser.GameObjects.Text;

  private readonly hintLabel: Phaser.GameObjects.Text;

  private queue: DialogEntry[] = [];

  private index = 0;

  private active = false;

  private onComplete: (() => void) | undefined;

  private revealEvent: Phaser.Time.TimerEvent | null = null;

  private fullLineText = '';

  private revealedChars = 0;

  private revealing = false;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.background = this.scene.add
      .rectangle(0, 0, 0, 0, 0x05070d, 0.95)
      .setOrigin(0)
      .setDepth(9000)
      .setScrollFactor(0)
      .setVisible(false);

    this.border = this.scene.add
      .rectangle(0, 0, 0, 0, 0x000000, 0)
      .setOrigin(0)
      .setDepth(9001)
      .setStrokeStyle(2, 0x8fd4ff, 1)
      .setScrollFactor(0)
      .setVisible(false);

    this.speakerLabel = this.scene.add
      .text(0, 0, '', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '14px',
        color: '#f7e089'
      })
      .setDepth(9002)
      .setScrollFactor(0)
      .setVisible(false);

    this.bodyLabel = this.scene.add
      .text(0, 0, '', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '16px',
        color: '#f5f9ff'
      })
      .setDepth(9002)
      .setScrollFactor(0)
      .setVisible(false);

    this.hintLabel = this.scene.add
      .text(0, 0, 'Enter: Next', {
        fontFamily: UI_THEME.fontFamily,
        fontSize: '12px',
        color: '#8bb0d0'
      })
      .setDepth(9002)
      .setScrollFactor(0)
      .setVisible(false);

    this.layout();
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  public start(queue: DialogEntry[], onComplete?: () => void): void {
    if (queue.length === 0) {
      return;
    }

    this.queue = queue;
    this.index = 0;
    this.active = true;
    this.onComplete = onComplete;

    this.setVisible(true);
    this.renderCurrentLine();
  }

  public advance(): void {
    if (!this.active) {
      return;
    }

    if (this.revealing) {
      this.finishReveal();
      return;
    }

    this.index += 1;
    if (this.index >= this.queue.length) {
      this.close();
      return;
    }

    this.renderCurrentLine();
  }

  public isActive(): boolean {
    return this.active;
  }

  public close(): void {
    if (!this.active) {
      return;
    }

    this.stopReveal();
    this.active = false;
    this.queue = [];
    this.index = 0;
    this.setVisible(false);

    const callback = this.onComplete;
    this.onComplete = undefined;
    callback?.();
  }

  private renderCurrentLine(): void {
    const entry = this.queue[this.index];
    this.speakerLabel.setText(entry.speaker.toUpperCase());
    this.fullLineText = entry.text;
    this.revealedChars = 0;
    this.bodyLabel.setText('');
    this.startReveal();
  }

  private layout(): void {
    const viewport = getViewportManager().getViewport();
    const safeMargins = getViewportManager().getSafeMargins();
    const margin = 10;
    const width = Math.max(220, viewport.width - safeMargins.left - safeMargins.right - margin * 2);
    const height = Math.max(92, Math.min(122, Math.round(viewport.height * 0.3)));
    const x = viewport.x + safeMargins.left + margin;
    const y = viewport.y + viewport.height - safeMargins.bottom - height - Math.max(6, margin - 2);

    this.background.setPosition(x, y).setSize(width, height);
    this.border.setPosition(x, y).setSize(width, height);
    this.speakerLabel.setPosition(x + 10, y + 8);
    this.bodyLabel.setPosition(x + 10, y + 30).setWordWrapWidth(width - 20, true);
    this.hintLabel.setPosition(x + width - 88, y + height - 18);
  }

  private setVisible(visible: boolean): void {
    this.background.setVisible(visible);
    this.border.setVisible(visible);
    this.speakerLabel.setVisible(visible);
    this.bodyLabel.setVisible(visible);
    this.hintLabel.setVisible(visible);
  }

  private startReveal(): void {
    this.stopReveal();
    const text = this.fullLineText;
    if (!text.length) {
      this.bodyLabel.setText('');
      this.revealing = false;
      this.hintLabel.setText('Enter: Next');
      return;
    }

    const charsPerSecond = getDialogCharsPerSecond(getUserSettings().textSpeed);
    const delayMs = Math.max(10, Math.floor(1000 / charsPerSecond));

    this.revealing = true;
    this.hintLabel.setText('Enter: Skip');
    this.revealEvent = this.scene.time.addEvent({
      delay: delayMs,
      loop: true,
      callback: () => {
        this.revealedChars += 1;
        if (this.revealedChars >= text.length) {
          this.finishReveal();
          return;
        }
        this.bodyLabel.setText(text.slice(0, this.revealedChars));
      }
    });
  }

  private finishReveal(): void {
    this.stopReveal();
    this.revealing = false;
    this.bodyLabel.setText(this.fullLineText);
    this.hintLabel.setText('Enter: Next');
  }

  private stopReveal(): void {
    this.revealEvent?.remove(false);
    this.revealEvent = null;
  }
}
