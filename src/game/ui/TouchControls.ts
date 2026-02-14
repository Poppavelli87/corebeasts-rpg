import { isSmallScreen, isTouchDevice } from '../systems/Device';
import { getLayoutManager, type LayoutProfile } from './LayoutManager';

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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export class TouchControls {
  private static shared: TouchControls | null = null;

  public static getShared(): TouchControls {
    if (!TouchControls.shared) {
      TouchControls.shared = new TouchControls();
    }

    return TouchControls.shared;
  }

  private root: HTMLDivElement | null = null;

  private dpadRoot: HTMLDivElement | null = null;

  private actionsRoot: HTMLDivElement | null = null;

  private upButton: HTMLButtonElement | null = null;

  private downButton: HTMLButtonElement | null = null;

  private leftButton: HTMLButtonElement | null = null;

  private rightButton: HTMLButtonElement | null = null;

  private confirmButton: HTMLButtonElement | null = null;

  private cancelButton: HTMLButtonElement | null = null;

  private menuButton: HTMLButtonElement | null = null;

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

    getLayoutManager().onResize((profile) => {
      this.applyLayout(profile);
    });

    this.syncVisibility();
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

  private applyLayout(profile: LayoutProfile): void {
    if (!this.root || !this.dpadRoot || !this.actionsRoot) {
      return;
    }

    const safe = getLayoutManager().getSafeMargins();
    const isPortrait = profile.formFactor === 'mobile-portrait';
    const isLandscapeMobile = profile.formFactor === 'mobile-landscape';

    const shortEdge = Math.min(profile.width, profile.height);
    const dpadButton = clamp(
      Math.round(shortEdge * (isPortrait ? 0.16 : 0.13)),
      56,
      isPortrait ? 88 : 76
    );
    const dpadGap = clamp(Math.round(dpadButton * 0.14), 6, 12);
    const dpadSize = dpadButton * 3 + dpadGap * 2;
    const actionButton = clamp(dpadButton + (isPortrait ? 10 : 6), 62, 96);
    const menuHeight = clamp(Math.round(actionButton * 0.74), 52, 76);

    this.root.style.paddingTop = `${Math.max(8, safe.top + 8)}px`;
    this.root.style.paddingRight = `${Math.max(8, safe.right + 8)}px`;
    this.root.style.paddingBottom = `${Math.max(8, safe.bottom + 8)}px`;
    this.root.style.paddingLeft = `${Math.max(8, safe.left + 8)}px`;
    this.root.style.gap = `${clamp(Math.round(profile.width * 0.02), 12, 26)}px`;

    if (isPortrait) {
      this.root.style.alignItems = 'flex-end';
      this.root.style.justifyContent = 'space-between';
    } else if (isLandscapeMobile || profile.formFactor === 'tablet') {
      this.root.style.alignItems = 'center';
      this.root.style.justifyContent = 'space-between';
    } else {
      this.root.style.alignItems = 'flex-end';
      this.root.style.justifyContent = 'space-between';
    }

    this.dpadRoot.style.width = `${dpadSize}px`;
    this.dpadRoot.style.height = `${dpadSize}px`;
    this.actionsRoot.style.gap = `${clamp(Math.round(actionButton * 0.12), 8, 14)}px`;

    if (this.upButton && this.downButton && this.leftButton && this.rightButton) {
      const directional = [this.upButton, this.downButton, this.leftButton, this.rightButton];
      directional.forEach((button) => {
        button.style.width = `${dpadButton}px`;
        button.style.height = `${dpadButton}px`;
        button.style.borderRadius = `${Math.max(12, Math.round(dpadButton * 0.2))}px`;
        button.style.fontSize = `${Math.max(15, Math.round(dpadButton * 0.34))}px`;
      });

      this.upButton.style.left = `${dpadButton + dpadGap}px`;
      this.upButton.style.top = '0px';
      this.downButton.style.left = `${dpadButton + dpadGap}px`;
      this.downButton.style.bottom = '0px';
      this.leftButton.style.left = '0px';
      this.leftButton.style.top = `${dpadButton + dpadGap}px`;
      this.rightButton.style.right = '0px';
      this.rightButton.style.top = `${dpadButton + dpadGap}px`;
    }

    if (this.confirmButton && this.cancelButton) {
      [this.confirmButton, this.cancelButton].forEach((button) => {
        button.style.width = `${actionButton}px`;
        button.style.height = `${actionButton}px`;
        button.style.fontSize = `${Math.max(18, Math.round(actionButton * 0.34))}px`;
      });
    }

    if (this.menuButton) {
      this.menuButton.style.height = `${menuHeight}px`;
      this.menuButton.style.fontSize = `${Math.max(14, Math.round(menuHeight * 0.32))}px`;
    }
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
    this.dpadRoot = left;

    const up = this.createButton('navUp', 'U', 'cb-touch-up', true);
    const leftBtn = this.createButton('navLeft', 'L', 'cb-touch-left', true);
    const rightBtn = this.createButton('navRight', 'R', 'cb-touch-right', true);
    const down = this.createButton('navDown', 'D', 'cb-touch-down', true);
    this.upButton = up;
    this.leftButton = leftBtn;
    this.rightButton = rightBtn;
    this.downButton = down;

    left.append(up, leftBtn, rightBtn, down);

    const right = document.createElement('div');
    right.className = 'cb-touch-actions';
    this.actionsRoot = right;

    const confirm = this.createButton('confirm', 'A', 'cb-touch-a');
    const cancel = this.createButton('cancel', 'B', 'cb-touch-b');
    const menu = this.createButton('menu', 'MENU', 'cb-touch-menu');
    this.confirmButton = confirm;
    this.cancelButton = cancel;
    this.menuButton = menu;

    right.append(confirm, cancel, menu);

    root.append(left, right);
    return root;
  }
}
