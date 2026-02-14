import { getSafeAreaInsets, isSmallScreen, isTouchDevice } from '../systems/Device';

export type TouchAction =
  | 'navUp'
  | 'navDown'
  | 'navLeft'
  | 'navRight'
  | 'confirm'
  | 'cancel'
  | 'menu';

export type TouchActionState = 'down' | 'up' | 'tap';

type TouchActionListener = (action: TouchAction, state: TouchActionState) => void;

export class TouchControls {
  private static shared: TouchControls | null = null;

  public static getShared(): TouchControls {
    if (!TouchControls.shared) {
      TouchControls.shared = new TouchControls();
    }

    return TouchControls.shared;
  }

  private root: HTMLDivElement | null = null;

  private listeners = new Set<TouchActionListener>();

  private pointerActions = new Map<number, TouchAction>();

  private activeConsumers = 0;

  private shouldRender: boolean;

  private constructor() {
    this.shouldRender = isTouchDevice() || isSmallScreen();
    if (!this.shouldRender || typeof document === 'undefined') {
      return;
    }

    this.root = this.buildDom();
    document.body.appendChild(this.root);
    this.syncSafeAreaInsets();
    this.syncVisibility();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
  }

  public isAvailable(): boolean {
    return this.root !== null;
  }

  public acquire(): void {
    if (!this.root) {
      return;
    }

    this.activeConsumers += 1;
    this.syncVisibility();
  }

  public release(): void {
    if (!this.root) {
      return;
    }

    this.activeConsumers = Math.max(0, this.activeConsumers - 1);
    this.syncVisibility();
  }

  public subscribe(listener: TouchActionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleResize = (): void => {
    this.syncSafeAreaInsets();
  };

  private emit(action: TouchAction, state: TouchActionState): void {
    this.listeners.forEach((listener) => {
      listener(action, state);
    });
  }

  private syncVisibility(): void {
    if (!this.root) {
      return;
    }

    this.root.style.display = this.activeConsumers > 0 ? 'flex' : 'none';
  }

  private syncSafeAreaInsets(): void {
    if (!this.root) {
      return;
    }

    const insets = getSafeAreaInsets();
    this.root.style.paddingTop = `${Math.max(6, insets.top)}px`;
    this.root.style.paddingRight = `${Math.max(6, insets.right)}px`;
    this.root.style.paddingBottom = `${Math.max(8, insets.bottom + 6)}px`;
    this.root.style.paddingLeft = `${Math.max(6, insets.left)}px`;
  }

  private createButton(
    action: TouchAction,
    label: string,
    className: string,
    holdable = false
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cb-touch-btn ${className}`;
    button.textContent = label;
    button.setAttribute('aria-label', label);

    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);

      if (holdable) {
        this.pointerActions.set(event.pointerId, action);
        this.emit(action, 'down');
        return;
      }

      this.emit(action, 'tap');
    });

    button.addEventListener('pointerup', (event) => {
      event.preventDefault();
      const mappedAction = this.pointerActions.get(event.pointerId);
      if (mappedAction) {
        this.pointerActions.delete(event.pointerId);
        this.emit(mappedAction, 'up');
      }
    });

    button.addEventListener('pointercancel', (event) => {
      const mappedAction = this.pointerActions.get(event.pointerId);
      if (mappedAction) {
        this.pointerActions.delete(event.pointerId);
        this.emit(mappedAction, 'up');
      }
    });

    button.addEventListener('pointerleave', (event) => {
      if (!holdable) {
        return;
      }

      const mappedAction = this.pointerActions.get(event.pointerId);
      if (mappedAction) {
        this.pointerActions.delete(event.pointerId);
        this.emit(mappedAction, 'up');
      }
    });

    return button;
  }

  private buildDom(): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'cb-touch-controls';

    const left = document.createElement('div');
    left.className = 'cb-touch-pad';

    const up = this.createButton('navUp', '▲', 'cb-touch-up', true);
    const leftBtn = this.createButton('navLeft', '◀', 'cb-touch-left', true);
    const rightBtn = this.createButton('navRight', '▶', 'cb-touch-right', true);
    const down = this.createButton('navDown', '▼', 'cb-touch-down', true);

    left.append(up, leftBtn, rightBtn, down);

    const right = document.createElement('div');
    right.className = 'cb-touch-actions';

    const confirm = this.createButton('confirm', 'A', 'cb-touch-a');
    const cancel = this.createButton('cancel', 'B', 'cb-touch-b');
    const menu = this.createButton('menu', 'MENU', 'cb-touch-menu');

    right.append(confirm, cancel, menu);

    root.append(left, right);
    return root;
  }
}
