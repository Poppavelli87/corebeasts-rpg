import {
  GAME_SAVE_VERSION,
  cloneGameState,
  normalizeGameState,
  setActiveGameState,
  type DifficultyMode,
  type GameState
} from '../state/GameState';

export const SAVE_STORAGE_KEY = 'corebeasts_save_v1';

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export class SaveSystem {
  public static hasSave(): boolean {
    if (!canUseStorage()) {
      return false;
    }

    const data = window.localStorage.getItem(SAVE_STORAGE_KEY);
    return typeof data === 'string' && data.length > 0;
  }

  public static save(state: GameState): boolean {
    if (!canUseStorage()) {
      return false;
    }

    const normalized = normalizeGameState(state);
    normalized.meta.saveVersion = GAME_SAVE_VERSION;

    try {
      window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(normalized));
      return true;
    } catch {
      return false;
    }
  }

  public static load(): GameState | null {
    if (!canUseStorage()) {
      return null;
    }

    const rawData = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!rawData) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawData) as unknown;
      const normalized = normalizeGameState(parsed);
      normalized.meta.saveVersion = GAME_SAVE_VERSION;
      setActiveGameState(normalized);
      return cloneGameState(normalized);
    } catch {
      return null;
    }
  }

  public static getSavedDifficulty(): DifficultyMode | null {
    if (!canUseStorage()) {
      return null;
    }

    const rawData = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!rawData) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawData) as unknown;
      return normalizeGameState(parsed).difficulty;
    } catch {
      return null;
    }
  }
}
