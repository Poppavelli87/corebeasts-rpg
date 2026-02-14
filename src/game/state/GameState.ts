import {
  CREATURE_DEFINITIONS,
  calculateCreatureStats,
  type CreatureId,
  type CreatureStats,
  type CreatureStatus
} from '../data/creatures';
import { MOVE_DEFINITIONS, type MoveId } from '../data/moves';
import { MAP_DEFINITIONS, type MapId } from '../systems/TileMap';
import { getMaxMovesForLevel } from '../systems/Progression';

export const GAME_SAVE_VERSION = 1;
export const PARTY_LIMIT = 6;
export type DifficultyMode = 'easy' | 'normal' | 'hard';

export type InventoryKey = 'coreSeal' | 'potion' | 'cleanse' | 'verdantSigil' | 'trialSigil';

export type InventoryCounts = {
  coreSeal: number;
  potion: number;
  cleanse: number;
  verdantSigil: number;
  trialSigil: number;
};

export type CreatureInstance = {
  speciesId: CreatureId;
  nickname?: string;
  level: number;
  xp: number;
  bond: number;
  stats: CreatureStats;
  currentHp: number;
  status: CreatureStatus;
  moves: MoveId[];
};

export type GameState = {
  difficulty: DifficultyMode;
  challengeMode: boolean;
  newGamePlus: boolean;
  player: {
    name: string;
    mapId: MapId;
    x: number;
    y: number;
  };
  party: CreatureInstance[];
  storage: CreatureInstance[];
  inventory: InventoryCounts;
  storyFlags: Record<string, boolean>;
  meta: {
    saveVersion: number;
    playTimeSeconds: number;
    runSeed: number;
    ngPlusCycle: number;
  };
};

let activeGameState: GameState | null = null;

const DEFAULT_INVENTORY: InventoryCounts = {
  coreSeal: 5,
  potion: 2,
  cleanse: 1,
  verdantSigil: 0,
  trialSigil: 0
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNonNegativeInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
};

const isCreatureId = (value: unknown): value is CreatureId =>
  typeof value === 'string' && value in CREATURE_DEFINITIONS;

const isMoveId = (value: unknown): value is MoveId =>
  typeof value === 'string' && value in MOVE_DEFINITIONS;

const isMapId = (value: unknown): value is MapId =>
  typeof value === 'string' && value in MAP_DEFINITIONS;

const isDifficultyMode = (value: unknown): value is DifficultyMode =>
  value === 'easy' || value === 'normal' || value === 'hard';

const generateRunSeed = (): number =>
  Math.floor((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);

const clampPlayerToMap = (mapId: MapId, x: number, y: number): { x: number; y: number } => {
  const map = MAP_DEFINITIONS[mapId];

  return {
    x: Math.max(0, Math.min(map.width - 1, Math.floor(x))),
    y: Math.max(0, Math.min(map.height - 1, Math.floor(y)))
  };
};

const normalizeMoves = (speciesId: CreatureId, level: number, moves: unknown): MoveId[] => {
  const defaults = [...CREATURE_DEFINITIONS[speciesId].moves] as MoveId[];
  const slotLimit = getMaxMovesForLevel(level);
  const minimumMoves = Math.min(3, slotLimit);
  const validMoves: MoveId[] = [];

  if (Array.isArray(moves)) {
    for (const candidate of moves) {
      if (!isMoveId(candidate) || validMoves.includes(candidate)) {
        continue;
      }

      validMoves.push(candidate);
      if (validMoves.length >= slotLimit) {
        break;
      }
    }
  }

  for (const fallbackMove of defaults) {
    if (validMoves.length >= minimumMoves) {
      break;
    }

    if (!validMoves.includes(fallbackMove)) {
      validMoves.push(fallbackMove);
    }
  }

  while (validMoves.length < minimumMoves) {
    validMoves.push(defaults[0]);
  }

  return validMoves.slice(0, slotLimit);
};

export const createCreatureInstance = (
  speciesId: CreatureId,
  level: number,
  options: {
    nickname?: string;
    xp?: number;
    bond?: number;
    status?: CreatureStatus;
    moves?: unknown;
    currentHp?: number;
  } = {}
): CreatureInstance => {
  const normalizedLevel = Math.max(1, Math.floor(level));
  const stats = calculateCreatureStats(speciesId, normalizedLevel);
  const moves = normalizeMoves(speciesId, normalizedLevel, options.moves);
  const currentHp = Math.max(
    1,
    Math.min(Math.max(1, stats.hp), Math.floor(options.currentHp ?? stats.hp))
  );

  return {
    speciesId,
    nickname: options.nickname?.trim() || undefined,
    level: normalizedLevel,
    xp: toNonNegativeInt(options.xp, 0),
    bond: toNonNegativeInt(options.bond, 0),
    stats,
    currentHp,
    status: options.status ?? null,
    moves
  };
};

export const cloneCreatureInstance = (creature: CreatureInstance): CreatureInstance => ({
  ...creature,
  stats: { ...creature.stats },
  moves: [...creature.moves]
});

export const normalizeCreatureInstance = (input: unknown): CreatureInstance | null => {
  if (!isRecord(input)) {
    return null;
  }

  const speciesId = isCreatureId(input.speciesId) ? input.speciesId : null;
  if (!speciesId) {
    return null;
  }

  const level = toNonNegativeInt(input.level, 1) || 1;
  const status: CreatureStatus =
    input.status === 'burn' || input.status === 'poison' || input.status === 'stun'
      ? input.status
      : null;

  return createCreatureInstance(speciesId, level, {
    nickname: typeof input.nickname === 'string' ? input.nickname : undefined,
    xp: toNonNegativeInt(input.xp, 0),
    bond: toNonNegativeInt(input.bond, 0),
    currentHp: toNonNegativeInt(input.currentHp, calculateCreatureStats(speciesId, level).hp),
    status,
    moves: input.moves
  });
};

const normalizeInventory = (input: unknown): InventoryCounts => {
  const inventory = isRecord(input) ? input : {};

  return {
    coreSeal: toNonNegativeInt(inventory.coreSeal, DEFAULT_INVENTORY.coreSeal),
    potion: toNonNegativeInt(inventory.potion, DEFAULT_INVENTORY.potion),
    cleanse: toNonNegativeInt(inventory.cleanse, DEFAULT_INVENTORY.cleanse),
    verdantSigil: toNonNegativeInt(inventory.verdantSigil, DEFAULT_INVENTORY.verdantSigil),
    trialSigil: toNonNegativeInt(inventory.trialSigil, DEFAULT_INVENTORY.trialSigil)
  };
};

const normalizeStoryFlags = (input: unknown): Record<string, boolean> => {
  if (!isRecord(input)) {
    return {};
  }

  return Object.entries(input).reduce<Record<string, boolean>>((accumulator, [key, value]) => {
    if (typeof value === 'boolean') {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
};

const normalizeParty = (input: unknown): CreatureInstance[] => {
  if (!Array.isArray(input)) {
    return [createCreatureInstance('embercub', 5)];
  }

  const normalized = input
    .map((entry) => normalizeCreatureInstance(entry))
    .filter((entry): entry is CreatureInstance => entry !== null);

  return normalized.slice(0, PARTY_LIMIT);
};

const normalizeStorage = (input: unknown): CreatureInstance[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => normalizeCreatureInstance(entry))
    .filter((entry): entry is CreatureInstance => entry !== null);
};

export const createNewGameState = (
  playerName = 'Player',
  includeStarter = true,
  difficulty: DifficultyMode = 'normal',
  options: {
    challengeMode?: boolean;
    newGamePlus?: boolean;
    ngPlusCycle?: number;
    runSeed?: number;
  } = {}
): GameState => {
  const spawn = MAP_DEFINITIONS.starterTown.spawn;

  return {
    difficulty,
    challengeMode: options.challengeMode ?? false,
    newGamePlus: options.newGamePlus ?? false,
    player: {
      name: playerName,
      mapId: 'starterTown',
      x: spawn.x,
      y: spawn.y
    },
    party: includeStarter ? [createCreatureInstance('embercub', 5)] : [],
    storage: [],
    inventory: { ...DEFAULT_INVENTORY },
    storyFlags: {},
    meta: {
      saveVersion: GAME_SAVE_VERSION,
      playTimeSeconds: 0,
      runSeed: options.runSeed ?? generateRunSeed(),
      ngPlusCycle: Math.max(0, Math.floor(options.ngPlusCycle ?? (options.newGamePlus ? 1 : 0)))
    }
  };
};

export const cloneGameState = (state: GameState): GameState => ({
  difficulty: state.difficulty,
  challengeMode: state.challengeMode,
  newGamePlus: state.newGamePlus,
  player: { ...state.player },
  party: state.party.map((creature) => cloneCreatureInstance(creature)),
  storage: state.storage.map((creature) => cloneCreatureInstance(creature)),
  inventory: { ...state.inventory },
  storyFlags: { ...state.storyFlags },
  meta: { ...state.meta }
});

export const normalizeGameState = (input: unknown): GameState => {
  const fallback = createNewGameState();
  if (!isRecord(input)) {
    return fallback;
  }

  const playerInput = isRecord(input.player) ? input.player : {};
  const mapId = isMapId(playerInput.mapId) ? playerInput.mapId : fallback.player.mapId;

  const clampedPosition = clampPlayerToMap(
    mapId,
    toNonNegativeInt(playerInput.x, fallback.player.x),
    toNonNegativeInt(playerInput.y, fallback.player.y)
  );

  const normalized: GameState = {
    difficulty: isDifficultyMode(input.difficulty) ? input.difficulty : 'normal',
    challengeMode: input.challengeMode === true,
    newGamePlus: input.newGamePlus === true,
    player: {
      name:
        typeof playerInput.name === 'string' && playerInput.name.trim().length > 0
          ? playerInput.name.trim()
          : fallback.player.name,
      mapId,
      x: clampedPosition.x,
      y: clampedPosition.y
    },
    party: normalizeParty(input.party),
    storage: normalizeStorage(input.storage),
    inventory: normalizeInventory(input.inventory),
    storyFlags: normalizeStoryFlags(input.storyFlags),
    meta: {
      saveVersion: GAME_SAVE_VERSION,
      playTimeSeconds: toNonNegativeInt(
        isRecord(input.meta) ? input.meta.playTimeSeconds : undefined,
        0
      ),
      runSeed: toNonNegativeInt(isRecord(input.meta) ? input.meta.runSeed : undefined, 0),
      ngPlusCycle: toNonNegativeInt(isRecord(input.meta) ? input.meta.ngPlusCycle : undefined, 0)
    }
  };

  if (normalized.meta.runSeed <= 0) {
    normalized.meta.runSeed = generateRunSeed();
  }

  if (normalized.newGamePlus && normalized.meta.ngPlusCycle <= 0) {
    normalized.meta.ngPlusCycle = 1;
  }

  return normalized;
};

export const getActiveGameState = (): GameState => {
  if (!activeGameState) {
    activeGameState = createNewGameState();
  }

  return activeGameState;
};

export const setActiveGameState = (state: GameState): GameState => {
  activeGameState = normalizeGameState(state);
  return activeGameState;
};

export const resetActiveGameState = (playerName = 'Player'): GameState => {
  activeGameState = createNewGameState(playerName);
  return activeGameState;
};

export const addCreatureToCollection = (
  state: GameState,
  creature: CreatureInstance
): 'party' | 'storage' => {
  if (state.party.length < PARTY_LIMIT) {
    state.party.push(cloneCreatureInstance(creature));
    return 'party';
  }

  state.storage.push(cloneCreatureInstance(creature));
  return 'storage';
};

export const movePartyCreatureToStorage = (state: GameState, partyIndex: number): boolean => {
  if (state.party.length <= 1) {
    return false;
  }

  if (partyIndex < 0 || partyIndex >= state.party.length) {
    return false;
  }

  const [creature] = state.party.splice(partyIndex, 1);
  if (!creature) {
    return false;
  }

  state.storage.push(creature);
  return true;
};

export const moveStorageCreatureToParty = (state: GameState, storageIndex: number): boolean => {
  if (state.party.length >= PARTY_LIMIT) {
    return false;
  }

  if (storageIndex < 0 || storageIndex >= state.storage.length) {
    return false;
  }

  const [creature] = state.storage.splice(storageIndex, 1);
  if (!creature) {
    return false;
  }

  state.party.push(creature);
  return true;
};

export const releaseStorageCreature = (
  state: GameState,
  storageIndex: number
): CreatureInstance | null => {
  if (storageIndex < 0 || storageIndex >= state.storage.length) {
    return null;
  }

  const [released] = state.storage.splice(storageIndex, 1);
  return released ?? null;
};

export const healCreature = (creature: CreatureInstance): void => {
  creature.currentHp = creature.stats.hp;
  creature.status = null;
};

export const healParty = (state: GameState): void => {
  state.party.forEach((creature) => healCreature(creature));
};

export const healCreatureByAmount = (creature: CreatureInstance, amount: number): number => {
  const before = creature.currentHp;
  creature.currentHp = Math.min(creature.stats.hp, creature.currentHp + Math.max(0, amount));
  return creature.currentHp - before;
};

export const clearCreatureStatus = (creature: CreatureInstance): boolean => {
  if (!creature.status) {
    return false;
  }

  creature.status = null;
  return true;
};

export const movePlayerTo = (state: GameState, mapId: MapId, x: number, y: number): void => {
  const next = clampPlayerToMap(mapId, x, y);
  state.player.mapId = mapId;
  state.player.x = next.x;
  state.player.y = next.y;
};

export const addInventory = (state: GameState, item: InventoryKey, amount: number): void => {
  state.inventory[item] = Math.max(0, state.inventory[item] + Math.floor(amount));
};

export const consumeInventory = (state: GameState, item: InventoryKey, amount = 1): boolean => {
  if (state.inventory[item] < amount) {
    return false;
  }

  state.inventory[item] -= amount;
  return true;
};

export const markStoryFlag = (state: GameState, flag: string): void => {
  state.storyFlags[flag] = true;
};

export const hasStoryFlag = (state: GameState, flag: string): boolean =>
  state.storyFlags[flag] === true;
