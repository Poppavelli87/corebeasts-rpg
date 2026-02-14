import {
  getSafeAreaInsets,
  isSmallScreen,
  isTouchDevice,
  type SafeAreaInsets
} from '../systems/Device';

export type LayoutOrientation = 'portrait' | 'landscape';

export type LayoutFormFactor = 'mobile-portrait' | 'mobile-landscape' | 'tablet' | 'desktop';

export type LayoutProfile = {
  width: number;
  height: number;
  orientation: LayoutOrientation;
  formFactor: LayoutFormFactor;
  touchMode: boolean;
  smallScreen: boolean;
  uiScale: number;
  fontScale: number;
};

export type LayoutSafeMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  touchTop: number;
  touchRight: number;
  touchBottom: number;
  touchLeft: number;
};

type ResizeCallback = (profile: LayoutProfile) => void;

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1200;
const RESIZE_DEBOUNCE_MS = 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sameProfile = (a: LayoutProfile, b: LayoutProfile): boolean =>
  a.width === b.width &&
  a.height === b.height &&
  a.orientation === b.orientation &&
  a.formFactor === b.formFactor &&
  a.touchMode === b.touchMode &&
  a.smallScreen === b.smallScreen;

export class LayoutManager {
  private static shared: LayoutManager | null = null;

  public static getShared(): LayoutManager {
    if (!LayoutManager.shared) {
      LayoutManager.shared = new LayoutManager();
    }

    return LayoutManager.shared;
  }

  private readonly callbacks = new Set<ResizeCallback>();

  private profile: LayoutProfile;

  private safeInsets: SafeAreaInsets;

  private resizeTimer: number | null = null;

  private constructor() {
    this.profile = this.computeLayoutProfile();
    this.safeInsets = getSafeAreaInsets();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleWindowResize, { passive: true });
      window.addEventListener('orientationchange', this.handleWindowResize, { passive: true });
    }
  }

  public getLayoutProfile(): LayoutProfile {
    return { ...this.profile };
  }

  public onResize(callback: ResizeCallback): () => void {
    this.callbacks.add(callback);
    callback(this.getLayoutProfile());

    return () => {
      this.callbacks.delete(callback);
    };
  }

  public getSafeMargins(): LayoutSafeMargins {
    const profile = this.profile;
    const shouldReserveTouchSpace =
      profile.touchMode || profile.smallScreen || profile.formFactor.startsWith('mobile');

    let touchTop = 0;
    let touchRight = 0;
    let touchBottom = 0;
    let touchLeft = 0;

    if (shouldReserveTouchSpace) {
      const shortEdge = Math.min(profile.width, profile.height);
      const buttonSize = clamp(
        Math.round(shortEdge * (profile.orientation === 'portrait' ? 0.16 : 0.13)),
        56,
        88
      );

      if (profile.formFactor === 'mobile-portrait') {
        touchBottom = Math.round(buttonSize * 2.2 + 52);
        touchLeft = Math.round(buttonSize * 1.9);
        touchRight = Math.round(buttonSize * 1.9);
      } else if (profile.formFactor === 'mobile-landscape') {
        touchLeft = Math.round(buttonSize * 2.7 + 20);
        touchRight = Math.round(buttonSize * 2.7 + 20);
        touchBottom = Math.round(buttonSize * 0.55);
        touchTop = 8;
      } else if (profile.formFactor === 'tablet') {
        if (profile.orientation === 'landscape') {
          touchBottom = Math.round(buttonSize * 0.5 + 16);
          touchLeft = Math.round(buttonSize * 2.35 + 22);
          touchRight = Math.round(buttonSize * 2.35 + 22);
        } else {
          touchBottom = Math.round(buttonSize * 1.8 + 26);
          touchLeft = Math.round(buttonSize * 2.2);
          touchRight = Math.round(buttonSize * 2.2);
        }
      }
    }

    return {
      top: this.safeInsets.top,
      right: this.safeInsets.right,
      bottom: this.safeInsets.bottom,
      left: this.safeInsets.left,
      touchTop,
      touchRight,
      touchBottom,
      touchLeft
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
      this.recalculateLayout();
    }, RESIZE_DEBOUNCE_MS);
  };

  private recalculateLayout(): void {
    const nextProfile = this.computeLayoutProfile();
    this.safeInsets = getSafeAreaInsets();

    if (sameProfile(this.profile, nextProfile)) {
      return;
    }

    this.profile = nextProfile;
    const payload = this.getLayoutProfile();

    this.callbacks.forEach((callback) => {
      callback(payload);
    });
  }

  private computeLayoutProfile(): LayoutProfile {
    const width =
      typeof window === 'undefined' ? 640 : Math.max(320, Math.floor(window.innerWidth));
    const height =
      typeof window === 'undefined' ? 360 : Math.max(180, Math.floor(window.innerHeight));

    const orientation: LayoutOrientation = height > width ? 'portrait' : 'landscape';
    const formFactor = this.resolveFormFactor(width, orientation);

    return {
      width,
      height,
      orientation,
      formFactor,
      touchMode: isTouchDevice(),
      smallScreen: isSmallScreen(),
      uiScale: clamp(width / 640, 0.82, 1.75),
      fontScale: clamp(width / 760, 0.85, 1.5)
    };
  }

  private resolveFormFactor(width: number, orientation: LayoutOrientation): LayoutFormFactor {
    if (width < MOBILE_BREAKPOINT) {
      return orientation === 'portrait' ? 'mobile-portrait' : 'mobile-landscape';
    }

    if (width < TABLET_BREAKPOINT) {
      return 'tablet';
    }

    return 'desktop';
  }
}

export const getLayoutManager = (): LayoutManager => LayoutManager.getShared();
