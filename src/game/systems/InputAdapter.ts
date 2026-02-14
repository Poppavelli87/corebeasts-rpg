import Phaser from 'phaser';
import { isSmallScreen, isTouchDevice } from './Device';
import { TouchControls, type TouchAction, type TouchActionState } from '../ui/TouchControls';

export type InputAction =
  | 'navUp'
  | 'navDown'
  | 'navLeft'
  | 'navRight'
  | 'confirm'
  | 'cancel'
  | 'menu';

type AdapterKeys = {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  esc: Phaser.Input.Keyboard.Key;
};

type InputAdapterOptions = {
  enableTouchControls?: boolean;
  keyboardEnabled?: boolean;
};

export class InputAdapter {
  private readonly scene: Phaser.Scene;

  private readonly keys?: AdapterKeys;

  private readonly touchEnabled: boolean;

  private readonly queue: InputAction[] = [];

  private readonly heldActions = new Set<InputAction>();

  private unsubscribeTouch: (() => void) | null = null;

  private destroyed = false;

  public constructor(scene: Phaser.Scene, options: InputAdapterOptions = {}) {
    this.scene = scene;

    const keyboardEnabled = options.keyboardEnabled ?? true;
    if (keyboardEnabled && this.scene.input.keyboard) {
      this.keys = this.scene.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        w: Phaser.Input.Keyboard.KeyCodes.W,
        a: Phaser.Input.Keyboard.KeyCodes.A,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        d: Phaser.Input.Keyboard.KeyCodes.D,
        enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        esc: Phaser.Input.Keyboard.KeyCodes.ESC
      }) as AdapterKeys;
    }

    this.touchEnabled =
      (options.enableTouchControls ?? true) && (isTouchDevice() || isSmallScreen());

    if (this.touchEnabled) {
      const touchControls = TouchControls.getShared();
      if (touchControls.isAvailable()) {
        touchControls.acquire();
        this.unsubscribeTouch = touchControls.subscribe((action, state) => {
          this.handleTouchAction(action, state);
        });
      }
    }

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });

    this.scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.destroy();
    });
  }

  public usesTouchControls(): boolean {
    return this.touchEnabled;
  }

  public consume(action: InputAction): boolean {
    if (this.consumeQueued(action)) {
      return true;
    }

    return this.isKeyboardJustDown(action);
  }

  public isHeld(action: InputAction): boolean {
    if (this.heldActions.has(action)) {
      return true;
    }

    return this.isKeyboardDown(action);
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.heldActions.clear();
    this.queue.length = 0;

    this.unsubscribeTouch?.();
    this.unsubscribeTouch = null;

    if (this.touchEnabled) {
      TouchControls.getShared().release();
    }
  }

  private consumeQueued(action: InputAction): boolean {
    const index = this.queue.indexOf(action);
    if (index < 0) {
      return false;
    }

    this.queue.splice(index, 1);
    return true;
  }

  private enqueue(action: InputAction): void {
    this.queue.push(action);
    if (this.queue.length > 32) {
      this.queue.shift();
    }
  }

  private handleTouchAction(action: TouchAction, state: TouchActionState): void {
    if (!this.scene.scene.isActive()) {
      return;
    }

    if (state === 'down') {
      this.heldActions.add(action);
      this.enqueue(action);
      return;
    }

    if (state === 'up') {
      this.heldActions.delete(action);
      return;
    }

    this.enqueue(action);
  }

  private isKeyboardJustDown(action: InputAction): boolean {
    if (!this.keys) {
      return false;
    }

    if (action === 'navUp') {
      return (
        Phaser.Input.Keyboard.JustDown(this.keys.up) || Phaser.Input.Keyboard.JustDown(this.keys.w)
      );
    }

    if (action === 'navDown') {
      return (
        Phaser.Input.Keyboard.JustDown(this.keys.down) ||
        Phaser.Input.Keyboard.JustDown(this.keys.s)
      );
    }

    if (action === 'navLeft') {
      return (
        Phaser.Input.Keyboard.JustDown(this.keys.left) ||
        Phaser.Input.Keyboard.JustDown(this.keys.a)
      );
    }

    if (action === 'navRight') {
      return (
        Phaser.Input.Keyboard.JustDown(this.keys.right) ||
        Phaser.Input.Keyboard.JustDown(this.keys.d)
      );
    }

    if (action === 'confirm') {
      return (
        Phaser.Input.Keyboard.JustDown(this.keys.enter) ||
        Phaser.Input.Keyboard.JustDown(this.keys.space)
      );
    }

    if (action === 'cancel') {
      return Phaser.Input.Keyboard.JustDown(this.keys.esc);
    }

    return false;
  }

  private isKeyboardDown(action: InputAction): boolean {
    if (!this.keys) {
      return false;
    }

    if (action === 'navUp') {
      return this.keys.up.isDown || this.keys.w.isDown;
    }

    if (action === 'navDown') {
      return this.keys.down.isDown || this.keys.s.isDown;
    }

    if (action === 'navLeft') {
      return this.keys.left.isDown || this.keys.a.isDown;
    }

    if (action === 'navRight') {
      return this.keys.right.isDown || this.keys.d.isDown;
    }

    return false;
  }
}
