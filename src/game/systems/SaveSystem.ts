import {
  GAME_SAVE_VERSION,
  cloneGameState,
  cloneCreatureInstance,
  normalizeGameState,
  type CreatureInstance,
  setActiveGameState,
  type DifficultyMode,
  type GameState
} from '../state/GameState';

export const SAVE_STORAGE_KEY = 'corebeasts_save_v1';
export const PROFILE_STORAGE_KEY = 'corebeasts_profile_v1';

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

type BestTimesByDifficulty = Record<DifficultyMode, number | null>;

type SaveProfile = {
  bestTimes: BestTimesByDifficulty;
};

const DEFAULT_PROFILE: SaveProfile = {
  bestTimes: {
    easy: null,
    normal: null,
    hard: null
  }
};

const normalizeProfile = (input: unknown): SaveProfile => {
  if (!input || typeof input !== 'object') {
    return {
      bestTimes: { ...DEFAULT_PROFILE.bestTimes }
    };
  }

  const record = input as Record<string, unknown>;
  const rawBestTimes =
    record.bestTimes && typeof record.bestTimes === 'object'
      ? (record.bestTimes as Record<string, unknown>)
      : {};

  const parseTime = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.floor(value));
  };

  return {
    bestTimes: {
      easy: parseTime(rawBestTimes.easy),
      normal: parseTime(rawBestTimes.normal),
      hard: parseTime(rawBestTimes.hard)
    }
  };
};

const readStoredGameState = (): GameState | null => {
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
    return normalized;
  } catch {
    return null;
  }
};

const readProfile = (): SaveProfile => {
  if (!canUseStorage()) {
    return {
      bestTimes: { ...DEFAULT_PROFILE.bestTimes }
    };
  }

  const rawData = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!rawData) {
    return {
      bestTimes: { ...DEFAULT_PROFILE.bestTimes }
    };
  }

  try {
    const parsed = JSON.parse(rawData) as unknown;
    return normalizeProfile(parsed);
  } catch {
    return {
      bestTimes: { ...DEFAULT_PROFILE.bestTimes }
    };
  }
};

const writeProfile = (profile: SaveProfile): void => {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage write failures.
  }
};

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
    const normalized = readStoredGameState();
    if (!normalized) {
      return null;
    }

    setActiveGameState(normalized);
    return cloneGameState(normalized);
  }

  public static getSavedDifficulty(): DifficultyMode | null {
    return readStoredGameState()?.difficulty ?? null;
  }

  public static getSavedChallengeMode(): boolean {
    return readStoredGameState()?.challengeMode === true;
  }

  public static hasPostgameUnlockedSave(): boolean {
    const state = readStoredGameState();
    return state?.storyFlags.postgameUnlocked === true;
  }

  public static getCarryOverCandidates(): CreatureInstance[] {
    const state = readStoredGameState();
    if (!state) {
      return [];
    }

    return state.party.map((creature) => cloneCreatureInstance(creature));
  }

  public static getNgPlusCycle(): number {
    const state = readStoredGameState();
    if (!state) {
      return 0;
    }

    return Math.max(0, state.meta.ngPlusCycle);
  }

  public static getBestTimes(): BestTimesByDifficulty {
    const profile = readProfile();
    return {
      easy: profile.bestTimes.easy,
      normal: profile.bestTimes.normal,
      hard: profile.bestTimes.hard
    };
  }

  public static recordBestTime(difficulty: DifficultyMode, totalSeconds: number): void {
    const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
    const profile = readProfile();
    const previous = profile.bestTimes[difficulty];

    if (previous === null || normalizedSeconds < previous) {
      profile.bestTimes[difficulty] = normalizedSeconds;
      writeProfile(profile);
    }
  }
}
