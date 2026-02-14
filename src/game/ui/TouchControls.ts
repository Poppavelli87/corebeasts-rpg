import { getSafeAreaInsets, isSmallScreen, isTouchDevice } from '../systems/Device';
import { getViewportManager, type TouchFootprint, type ViewportRect } from './ViewportManager';

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

  private dialogOpen = false;

  private currentViewport = getViewportManager().getViewport();

  private currentFootprint: TouchFootprint = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };

  private constructor() {
    this.shouldRender = isTouchDevice() || isSmallScreen();
    if (!this.shouldRender || typeof document === 'undefined') {
      return;
    }

    this.root = this.buildDom();
    document.body.appendChild(this.root);

    getViewportManager().onResize((viewport) => {
      this.currentViewport = viewport;
      this.applyLayout(viewport);
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

  public getFootprint(): TouchFootprint {
    return { ...this.currentFootprint };
  }

  public setDialogOpen(isOpen: boolean): void {
    this.dialogOpen = isOpen;
    this.applyVisualState();
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
    if (this.activeConsumers > 0) {
      this.applyLayout(this.currentViewport);
      return;
    }

    this.currentFootprint = { top: 0, right: 0, bottom: 0, left: 0 };
    getViewportManager().clearTouchFootprint();
  }

  private applyLayout(viewport: ViewportRect): void {
    if (!this.root || !this.dpadRoot || !this.actionsRoot) {
      return;
    }

    if (this.activeConsumers <= 0) {
      this.currentFootprint = { top: 0, right: 0, bottom: 0, left: 0 };
      getViewportManager().clearTouchFootprint();
      return;
    }

    const safeInsets = getSafeAreaInsets();
    const isPortrait = viewport.orientation === 'portrait';
    const isMobile = viewport.formFactor === 'mobile';

    const shortEdge = Math.min(viewport.width, viewport.height);
    const dpadButton = clamp(
      Math.round(shortEdge * (isPortrait ? 0.2 : isMobile ? 0.14 : 0.12)),
      50,
      isPortrait ? 76 : 72
    );
    const dpadGap = clamp(Math.round(dpadButton * 0.14), 6, 12);
    const dpadSize = dpadButton * 3 + dpadGap * 2;
    const actionButton = clamp(dpadButton + (isPortrait ? 6 : 4), 58, 88);
    const menuHeight = clamp(Math.round(actionButton * 0.72), 46, 70);
    const actionGap = clamp(Math.round(actionButton * 0.12), 8, 14);

    this.root.style.paddingTop = '0px';
    this.root.style.paddingRight = '0px';
    this.root.style.paddingBottom = '0px';
    this.root.style.paddingLeft = '0px';
    this.root.style.gap = '0px';
    this.root.style.alignItems = 'stretch';
    this.root.style.justifyContent = 'stretch';

    this.dpadRoot.style.width = `${dpadSize}px`;
    this.dpadRoot.style.height = `${dpadSize}px`;
    this.actionsRoot.style.gap = `${actionGap}px`;

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

    const actionsWidth = actionButton * 2 + actionGap;
    const actionsHeight = actionButton * 2 + actionGap + menuHeight + actionGap;
    const sideInset = clamp(Math.round(viewport.width * 0.02), 8, 18);
    const viewportBottom = viewport.y + viewport.height;
    const viewportTop = viewport.y;
    const viewportRight = viewport.x + viewport.width;
    const belowViewportSpace = viewport.screenHeight - viewportBottom - safeInsets.bottom;
    const portraitBottomPadding = clamp(Math.round(viewport.height * 0.03), 8, 18);
    const baseBottomScreenY = viewport.screenHeight - safeInsets.bottom - 10;
    const controlsMinTop = viewportTop + safeInsets.top + 6;
    const controlsMaxBottom = viewportBottom - safeInsets.bottom - 6;

    let dpadLeft = viewport.x + sideInset + safeInsets.left;
    let dpadTop = 0;
    let actionsLeft = viewport.x + viewport.width - actionsWidth - sideInset - safeInsets.right;
    let actionsTop = 0;

    if (isPortrait) {
      if (belowViewportSpace >= Math.max(dpadSize, actionsHeight) + 12) {
        dpadTop = baseBottomScreenY - dpadSize;
        actionsTop = baseBottomScreenY - actionsHeight;
      } else {
        const fallbackBottomY = viewportBottom - portraitBottomPadding;
        dpadTop = fallbackBottomY - dpadSize;
        actionsTop = fallbackBottomY - actionsHeight;
      }
    } else {
      const hasSideGutters = viewport.x >= Math.round(Math.max(dpadSize, actionsWidth) * 0.45) + 12;
      if (hasSideGutters) {
        dpadLeft = Math.max(safeInsets.left + 8, viewport.x - dpadSize - 10);
        actionsLeft = Math.min(
          viewport.screenWidth - safeInsets.right - actionsWidth - 8,
          viewportRight + 10
        );
      }

      const centerRatio = isMobile ? 0.34 : 0.4;
      const centerY = viewportTop + Math.round(viewport.height * centerRatio);
      dpadTop = centerY - Math.round(dpadSize / 2);
      actionsTop = centerY - Math.round(actionsHeight / 2);
    }

    dpadTop = clamp(
      dpadTop,
      controlsMinTop,
      Math.max(controlsMinTop, controlsMaxBottom - dpadSize)
    );
    actionsTop = clamp(
      actionsTop,
      controlsMinTop,
      Math.max(controlsMinTop, controlsMaxBottom - actionsHeight)
    );

    this.dpadRoot.style.left = `${Math.round(dpadLeft)}px`;
    this.dpadRoot.style.top = `${Math.round(dpadTop)}px`;
    this.actionsRoot.style.left = `${Math.round(actionsLeft)}px`;
    this.actionsRoot.style.top = `${Math.round(actionsTop)}px`;

    this.updateFootprint();
    this.applyVisualState();
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
    left.style.position = 'absolute';
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
    right.style.position = 'absolute';
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

  private applyVisualState(): void {
    if (!this.root) {
      return;
    }

    const isPortrait = this.currentViewport.orientation === 'portrait';
    if (this.dialogOpen && isPortrait) {
      this.root.style.opacity = '0.3';
      return;
    }

    this.root.style.opacity = isPortrait ? '0.85' : '0.95';
  }

  private updateFootprint(): void {
    if (!this.root || !this.dpadRoot || !this.actionsRoot) {
      return;
    }

    const viewport = this.currentViewport;
    const viewportRight = viewport.x + viewport.width;
    const viewportBottom = viewport.y + viewport.height;

    const dpadRect = this.dpadRoot.getBoundingClientRect();
    const actionsRect = this.actionsRoot.getBoundingClientRect();
    const footprints = [dpadRect, actionsRect];
    const isPortrait = viewport.orientation === 'portrait';
    const lowerBandStart = viewport.y + viewport.height * (isPortrait ? 0.48 : 0.62);

    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;

    footprints.forEach((rect) => {
      const overlapsViewportVertically = rect.bottom > viewport.y && rect.top < viewportBottom;

      if (overlapsViewportVertically && rect.left < viewport.x && rect.right > viewport.x) {
        left = Math.max(left, Math.round(rect.right - viewport.x));
      }
      if (overlapsViewportVertically && rect.right > viewportRight && rect.left < viewportRight) {
        right = Math.max(right, Math.round(viewportRight - rect.left));
      }
      if (rect.top < viewport.y && rect.bottom > viewport.y) {
        top = Math.max(top, Math.round(rect.bottom - viewport.y));
      }

      const overlapTop = Math.max(rect.top, lowerBandStart);
      const overlapBottom = Math.min(rect.bottom, viewportBottom);
      if (overlapBottom > overlapTop) {
        bottom = Math.max(bottom, Math.round(overlapBottom - overlapTop) + 6);
      }
    });

    const sideCap = isPortrait ? 28 : 84;

    const next = {
      top: Math.max(0, Math.min(42, top)),
      right: Math.max(0, Math.min(sideCap, right)),
      bottom: Math.max(0, Math.min(Math.round(viewport.height * 0.45), bottom)),
      left: Math.max(0, Math.min(sideCap, left))
    };

    this.currentFootprint = next;
    getViewportManager().setTouchFootprint(next);
  }
}
