import {
  CREATURE_DEFINITIONS,
  calculateCreatureStats,
  getCreatureDefinition,
  getLearnsetMovesAtLevel,
  type CreatureId,
  type EvolutionRule,
  type FriendshipEvolutionRule,
  type LevelEvolutionRule,
  type RegionEvolutionRule,
  type TimedEvolutionRule,
  type UseItemEvolutionRule
} from '../data/creatures';
import type { MoveId } from '../data/moves';
import type { CreatureInstance } from '../state/GameState';

const XP_BASE = 25;
const XP_GROWTH = 1.18;
const MAX_LEVEL = 50;

export const getMaxMovesForLevel = (level: number): number => {
  const normalizedLevel = Math.max(1, Math.floor(level));
  if (normalizedLevel >= 25) {
    return 5;
  }

  if (normalizedLevel >= 10) {
    return 4;
  }

  return 3;
};

export type EvolutionProgress = {
  fromSpeciesId: CreatureId;
  toSpeciesId: CreatureId;
};

export type LevelUpProgress = {
  previousLevel: number;
  level: number;
  previousMaxHp: number;
  nextMaxHp: number;
  learnedMoves: MoveId[];
  evolution: EvolutionProgress | null;
};

export type ProgressionResult = {
  gainedXp: number;
  levelUps: LevelUpProgress[];
  finalLevel: number;
};

export type EvolutionTrigger = 'levelUp' | 'item';

export type EvolutionContext = {
  trigger: EvolutionTrigger;
  mapId?: string;
  storyFlags?: Record<string, boolean>;
  itemId?: string;
};

type ExperienceGainOptions = {
  mapId?: string;
  storyFlags?: Record<string, boolean>;
};

export const xpToNextLevel = (level: number): number => {
  const normalizedLevel = Math.max(1, Math.floor(level));
  return Math.max(10, Math.floor(XP_BASE * Math.pow(XP_GROWTH, normalizedLevel - 1)));
};

export const calculateBattleXpReward = (
  enemyLevel: number,
  battleType: 'wild' | 'trainer'
): number => {
  const base = 18 + Math.max(1, Math.floor(enemyLevel)) * 12;
  return battleType === 'trainer' ? Math.floor(base * 1.2) : base;
};

const evolveCreature = (creature: CreatureInstance, toSpeciesId: CreatureId): EvolutionProgress => {
  const fromSpeciesId = creature.speciesId;
  const hpRatio = creature.currentHp / Math.max(1, creature.stats.hp);

  creature.speciesId = toSpeciesId;
  creature.stats = calculateCreatureStats(toSpeciesId, creature.level);
  creature.currentHp = Math.max(
    1,
    Math.min(creature.stats.hp, Math.ceil(hpRatio * creature.stats.hp))
  );

  return {
    fromSpeciesId,
    toSpeciesId
  };
};

const hasRequiredStoryFlag = (
  storyFlags: Record<string, boolean> | undefined,
  requiredFlag: string | undefined
): boolean => {
  if (!requiredFlag) {
    return true;
  }

  return storyFlags?.[requiredFlag] === true;
};

const isLevelRule = (rule: EvolutionRule): rule is LevelEvolutionRule =>
  !rule.method || rule.method === 'level';

const isFriendshipRule = (rule: EvolutionRule): rule is FriendshipEvolutionRule =>
  rule.method === 'friendship';

const isUseItemRule = (rule: EvolutionRule): rule is UseItemEvolutionRule =>
  rule.method === 'useItem';

const isRegionRule = (rule: EvolutionRule): rule is RegionEvolutionRule => rule.method === 'region';

const isTimedRule = (rule: EvolutionRule): rule is TimedEvolutionRule => rule.method === 'timed';

const canEvolveByRule = (
  creature: CreatureInstance,
  rule: EvolutionRule,
  context: EvolutionContext
): boolean => {
  if (isLevelRule(rule)) {
    return context.trigger === 'levelUp' && creature.level >= rule.atLevel;
  }

  if (isFriendshipRule(rule)) {
    const minLevel = rule.minLevel ?? 1;
    return (
      context.trigger === 'levelUp' &&
      creature.level >= minLevel &&
      creature.bond >= rule.friendshipLevel
    );
  }

  if (isUseItemRule(rule)) {
    const minLevel = rule.minLevel ?? 1;
    return (
      context.trigger === 'item' && creature.level >= minLevel && context.itemId === rule.itemId
    );
  }

  if (isRegionRule(rule)) {
    return (
      context.trigger === 'levelUp' &&
      creature.level >= rule.atLevel &&
      typeof context.mapId === 'string' &&
      rule.mapIds.includes(context.mapId)
    );
  }

  if (isTimedRule(rule)) {
    if (context.trigger !== 'levelUp' || creature.level < rule.atLevel) {
      return false;
    }

    if (!hasRequiredStoryFlag(context.storyFlags, rule.requiredFlag)) {
      return false;
    }

    if (rule.levelParity === 'odd' && creature.level % 2 === 0) {
      return false;
    }

    if (rule.levelParity === 'even' && creature.level % 2 !== 0) {
      return false;
    }

    return true;
  }

  return false;
};

export const tryTriggerEvolution = (
  creature: CreatureInstance,
  context: EvolutionContext
): EvolutionProgress | null => {
  const definition = getCreatureDefinition(creature.speciesId);
  const evolutionRule = definition.evolution;
  if (!evolutionRule) {
    return null;
  }

  if (!canEvolveByRule(creature, evolutionRule, context)) {
    return null;
  }

  const nextSpeciesId = evolutionRule.toSpeciesId as CreatureId;
  if (!(nextSpeciesId in CREATURE_DEFINITIONS) || nextSpeciesId === creature.speciesId) {
    return null;
  }

  return evolveCreature(creature, nextSpeciesId);
};

export const applyItemEvolution = (
  creature: CreatureInstance,
  itemId: string,
  context: Omit<EvolutionContext, 'trigger' | 'itemId'> = {}
): EvolutionProgress | null =>
  tryTriggerEvolution(creature, {
    trigger: 'item',
    itemId,
    mapId: context.mapId,
    storyFlags: context.storyFlags
  });

export const applyExperienceGain = (
  creature: CreatureInstance,
  gainedXp: number,
  options: ExperienceGainOptions = {}
): ProgressionResult => {
  const normalizedGain = Math.max(0, Math.floor(gainedXp));
  creature.xp = Math.max(0, creature.xp + normalizedGain);
  if (normalizedGain > 0) {
    creature.bond = Math.min(999, creature.bond + Math.max(1, Math.floor(normalizedGain / 20)));
  }

  const levelUps: LevelUpProgress[] = [];
  let safety = 0;

  while (
    creature.level < MAX_LEVEL &&
    creature.xp >= xpToNextLevel(creature.level) &&
    safety < MAX_LEVEL * 2
  ) {
    safety += 1;

    const previousLevel = creature.level;
    const previousMaxHp = creature.stats.hp;
    const xpCost = xpToNextLevel(creature.level);
    creature.xp -= xpCost;
    creature.level += 1;

    const learnedMoves = getLearnsetMovesAtLevel(creature.speciesId, creature.level).filter(
      (moveId) => !creature.moves.includes(moveId)
    );

    const leveledStats = calculateCreatureStats(creature.speciesId, creature.level);
    const hpDelta = leveledStats.hp - creature.stats.hp;
    creature.stats = leveledStats;
    creature.currentHp = Math.max(1, Math.min(creature.stats.hp, creature.currentHp + hpDelta));

    const evolution =
      tryTriggerEvolution(creature, {
        trigger: 'levelUp',
        mapId: options.mapId,
        storyFlags: options.storyFlags
      }) ?? null;

    levelUps.push({
      previousLevel,
      level: creature.level,
      previousMaxHp,
      nextMaxHp: creature.stats.hp,
      learnedMoves,
      evolution
    });
  }

  return {
    gainedXp: normalizedGain,
    levelUps,
    finalLevel: creature.level
  };
};
