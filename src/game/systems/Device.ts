export type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const parseCssPixels = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value.replace('px', '').trim());
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const hasTouchEvents = 'ontouchstart' in window;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  return hasTouchPoints || hasTouchEvents || coarsePointer;
};

export const isSmallScreen = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  return shortEdge <= 820;
};

export const getSafeAreaInsets = (): SafeAreaInsets => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const rootStyle = window.getComputedStyle(document.documentElement);

  return {
    top: parseCssPixels(rootStyle.getPropertyValue('--safe-area-top')),
    right: parseCssPixels(rootStyle.getPropertyValue('--safe-area-right')),
    bottom: parseCssPixels(rootStyle.getPropertyValue('--safe-area-bottom')),
    left: parseCssPixels(rootStyle.getPropertyValue('--safe-area-left'))
  };
};
