export type TextSpeed = 'slow' | 'normal' | 'fast';

export type UserSettings = {
  musicEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  textSpeed: TextSpeed;
};

const SETTINGS_STORAGE_KEY = 'corebeasts_settings_v1';

const DEFAULT_SETTINGS: UserSettings = {
  musicEnabled: true,
  musicVolume: 0.45,
  sfxVolume: 0.65,
  textSpeed: 'normal'
};

let cachedSettings: UserSettings | null = null;

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const clampVolume = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
};

const normalizeTextSpeed = (value: unknown): TextSpeed => {
  if (value === 'slow' || value === 'normal' || value === 'fast') {
    return value;
  }

  return DEFAULT_SETTINGS.textSpeed;
};

const normalizeSettings = (value: unknown): UserSettings => {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const record = value as Record<string, unknown>;
  return {
    musicEnabled:
      typeof record.musicEnabled === 'boolean'
        ? record.musicEnabled
        : DEFAULT_SETTINGS.musicEnabled,
    musicVolume: clampVolume(record.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clampVolume(record.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    textSpeed: normalizeTextSpeed(record.textSpeed)
  };
};

const readFromStorage = (): UserSettings => {
  if (!canUseStorage()) {
    return { ...DEFAULT_SETTINGS };
  }

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const writeToStorage = (settings: UserSettings): void => {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures and keep runtime values.
  }
};

export const getUserSettings = (): UserSettings => {
  if (!cachedSettings) {
    cachedSettings = readFromStorage();
  }

  return { ...cachedSettings };
};

export const setUserSettings = (next: Partial<UserSettings>): UserSettings => {
  const current = getUserSettings();
  cachedSettings = normalizeSettings({
    ...current,
    ...next
  });
  writeToStorage(cachedSettings);
  return { ...cachedSettings };
};

export const resetUserSettings = (): UserSettings => {
  cachedSettings = { ...DEFAULT_SETTINGS };
  writeToStorage(cachedSettings);
  return { ...cachedSettings };
};

export const getBattleMessageSpeedMultiplier = (textSpeed: TextSpeed): number => {
  if (textSpeed === 'slow') {
    return 1.32;
  }

  if (textSpeed === 'fast') {
    return 0.76;
  }

  return 1;
};

export const getDialogCharsPerSecond = (textSpeed: TextSpeed): number => {
  if (textSpeed === 'slow') {
    return 26;
  }

  if (textSpeed === 'fast') {
    return 70;
  }

  return 44;
};

export const getSettingsStorageKey = (): string => SETTINGS_STORAGE_KEY;
