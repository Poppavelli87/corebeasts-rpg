import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import { getSafeAreaInsets, type SafeAreaInsets } from '../systems/Device';

export type ViewportOrientation = 'portrait' | 'landscape';
export type ViewportFormFactor = 'mobile' | 'tablet' | 'desktop';

export type ViewportRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  orientation: ViewportOrientation;
  formFactor: ViewportFormFactor;
  screenWidth: number;
  screenHeight: number;
};

export type ViewportSafeMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TouchFootprint = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type ResizeCallback = (viewport: ViewportRect) => void;

const RESIZE_DEBOUNCE_MS = 120;
const FORM_FACTOR_MOBILE = 768;
const FORM_FACTOR_TABLET = 1200;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const isSameViewport = (a: ViewportRect, b: ViewportRect): boolean =>
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height &&
  Math.round(a.scale * 1000) === Math.round(b.scale * 1000) &&
  a.orientation === b.orientation &&
  a.formFactor === b.formFactor &&
  a.screenWidth === b.screenWidth &&
  a.screenHeight === b.screenHeight;

const isSameFootprint = (a: TouchFootprint, b: TouchFootprint): boolean =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

export class ViewportManager {
  private static shared: ViewportManager | null = null;

  public static getShared(): ViewportManager {
    if (!ViewportManager.shared) {
      ViewportManager.shared = new ViewportManager();
    }

    return ViewportManager.shared;
  }

  private readonly callbacks = new Set<ResizeCallback>();

  private viewport: ViewportRect;

  private safeInsets: SafeAreaInsets;

  private touchFootprint: TouchFootprint = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };

  private resizeTimer: number | null = null;

  private constructor() {
    this.viewport = this.computeViewport();
    this.safeInsets = getSafeAreaInsets();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleWindowResize, { passive: true });
      window.addEventListener('orientationchange', this.handleWindowResize, { passive: true });
    }
  }

  public getViewport(): ViewportRect {
    return { ...this.viewport };
  }

  public onResize(callback: ResizeCallback): () => void {
    this.callbacks.add(callback);
    callback(this.getViewport());

    return () => {
      this.callbacks.delete(callback);
    };
  }

  public setTouchFootprint(next: Partial<TouchFootprint>): void {
    const updated: TouchFootprint = {
      top: Math.max(0, Math.round(next.top ?? 0)),
      right: Math.max(0, Math.round(next.right ?? 0)),
      bottom: Math.max(0, Math.round(next.bottom ?? 0)),
      left: Math.max(0, Math.round(next.left ?? 0))
    };

    if (isSameFootprint(this.touchFootprint, updated)) {
      return;
    }

    this.touchFootprint = updated;
    this.emitResize();
  }

  public clearTouchFootprint(): void {
    this.setTouchFootprint({ top: 0, right: 0, bottom: 0, left: 0 });
  }

  public getSafeMargins(): ViewportSafeMargins {
    const viewport = this.viewport;
    const portraitPadding = viewport.orientation === 'portrait' ? 10 : 4;

    return {
      top: this.safeInsets.top + this.touchFootprint.top + 6,
      right: this.safeInsets.right + this.touchFootprint.right + 6,
      bottom: this.safeInsets.bottom + this.touchFootprint.bottom + portraitPadding,
      left: this.safeInsets.left + this.touchFootprint.left + 6
    };
  }

  private handleWindowResize = (): void => {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }

    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.recalculate();
    }, RESIZE_DEBOUNCE_MS);
  };

  private recalculate(): void {
    this.safeInsets = getSafeAreaInsets();
    const nextViewport = this.computeViewport();

    if (!isSameViewport(this.viewport, nextViewport)) {
      this.viewport = nextViewport;
      this.emitResize();
      return;
    }

    this.emitResize();
  }

  private emitResize(): void {
    const payload = this.getViewport();
    this.callbacks.forEach((callback) => {
      callback(payload);
    });
  }

  private computeViewport(): ViewportRect {
    const screenWidth =
      typeof window === 'undefined' ? GAME_WIDTH : Math.max(320, Math.floor(window.innerWidth));
    const screenHeight =
      typeof window === 'undefined' ? GAME_HEIGHT : Math.max(180, Math.floor(window.innerHeight));

    const orientation: ViewportOrientation = screenHeight > screenWidth ? 'portrait' : 'landscape';
    const formFactor: ViewportFormFactor =
      screenWidth < FORM_FACTOR_MOBILE
        ? 'mobile'
        : screenWidth < FORM_FACTOR_TABLET
          ? 'tablet'
          : 'desktop';

    const baseWidth =
      formFactor === 'mobile' && orientation === 'portrait' ? GAME_HEIGHT : GAME_WIDTH;
    const baseHeight =
      formFactor === 'mobile' && orientation === 'portrait' ? GAME_WIDTH : GAME_HEIGHT;

    const fitScale = Math.min(screenWidth / baseWidth, screenHeight / baseHeight);
    const integerScale = Math.floor(fitScale);
    const scale = integerScale >= 1 ? integerScale : clamp(Number(fitScale.toFixed(3)), 0.5, 0.999);

    const width = Math.max(1, Math.floor(baseWidth * scale));
    const height = Math.max(1, Math.floor(baseHeight * scale));
    const x = Math.floor((screenWidth - width) / 2);
    const y = Math.floor((screenHeight - height) / 2);

    return {
      x,
      y,
      width,
      height,
      scale,
      orientation,
      formFactor,
      screenWidth,
      screenHeight
    };
  }
}

export const getViewportManager = (): ViewportManager => ViewportManager.getShared();
