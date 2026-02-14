import type { MoveId } from './moves';
import type { BattleType } from '../systems/TypeChart';

export type CreatureStats = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
};

export type CreatureStatus = 'burn' | 'poison' | 'stun' | null;

export type LearnsetEntry = {
  level: number;
  moveId: MoveId;
};

export type LevelEvolutionRule = {
  method?: 'level';
  toSpeciesId: string;
  atLevel: number;
};

export type FriendshipEvolutionRule = {
  method: 'friendship';
  toSpeciesId: string;
  friendshipLevel: number;
  minLevel?: number;
};

export type UseItemEvolutionRule = {
  method: 'useItem';
  toSpeciesId: string;
  itemId: string;
  minLevel?: number;
};

export type RegionEvolutionRule = {
  method: 'region';
  toSpeciesId: string;
  atLevel: number;
  mapIds: string[];
};

export type TimedEvolutionRule = {
  method: 'timed';
  toSpeciesId: string;
  atLevel: number;
  levelParity?: 'odd' | 'even';
  requiredFlag?: string;
};

export type EvolutionRule =
  | LevelEvolutionRule
  | FriendshipEvolutionRule
  | UseItemEvolutionRule
  | RegionEvolutionRule
  | TimedEvolutionRule;

export type CreatureDefinition = {
  id: string;
  name: string;
  type: BattleType;
  stats: CreatureStats;
  baseStats: CreatureStats;
  baseCatchRate: number;
  rareFlag?: boolean;
  abilityId?: string | null;
  moves: [MoveId, MoveId, MoveId];
  learnset: LearnsetEntry[];
  evolution: EvolutionRule | null;
  encounterEligible?: boolean;
};

type SpeciesStage = {
  id: string;
  name: string;
};

type EvolutionLineTemplate = {
  type: BattleType;
  stages: [SpeciesStage, SpeciesStage, SpeciesStage];
  baseStats: CreatureStats;
  movePool: [MoveId, MoveId, MoveId, MoveId, MoveId, MoveId];
  abilityIds?: [string | null, string | null, string | null];
  catchRates?: [number, number, number];
};

const DEFAULT_LINE_ABILITIES: Record<BattleType, [string, string, string]> = {
  Ember: ['emberInstinct', 'emberGuard', 'emberOverdrive'],
  Tide: ['tideInstinct', 'tideGuard', 'tideUndertow'],
  Bloom: ['bloomInstinct', 'bloomGuard', 'bloomResurgence'],
  Volt: ['voltInstinct', 'voltGuard', 'voltSurge'],
  Stone: ['stoneInstinct', 'stoneGuard', 'stoneBulwark'],
  Shade: ['shadeInstinct', 'shadeGuard', 'shadeRequiem']
};

type RareSpeciesOverride = {
  abilityId?: string | null;
  catchRate?: number;
  statBoost?: Partial<CreatureStats>;
};

const RARE_SPECIES_OVERRIDES: Record<string, RareSpeciesOverride> = {
  emberdrake: {
    abilityId: 'mythicBlaze',
    catchRate: 0.08,
    statBoost: { hp: 10, atk: 8, spd: 4 }
  },
  maelstrom: {
    abilityId: 'abyssalCurrent',
    catchRate: 0.08,
    statBoost: { hp: 9, def: 8, spd: 4 }
  },
  canopyx: {
    abilityId: 'ancientCanopy',
    catchRate: 0.09,
    statBoost: { hp: 10, def: 6, atk: 4 }
  },
  ionarch: {
    abilityId: 'stormCrown',
    catchRate: 0.08,
    statBoost: { atk: 8, spd: 8 }
  },
  tectitan: {
    abilityId: 'worldAnchor',
    catchRate: 0.07,
    statBoost: { hp: 12, atk: 6, def: 8 }
  },
  eclipsorn: {
    abilityId: 'voidHalo',
    catchRate: 0.08,
    statBoost: { atk: 8, spd: 6, def: 4 }
  }
};

const applyStatBoost = (
  baseStats: CreatureStats,
  statBoost?: Partial<CreatureStats>
): CreatureStats => {
  if (!statBoost) {
    return baseStats;
  }

  return {
    hp: Math.max(1, baseStats.hp + (statBoost.hp ?? 0)),
    atk: Math.max(1, baseStats.atk + (statBoost.atk ?? 0)),
    def: Math.max(1, baseStats.def + (statBoost.def ?? 0)),
    spd: Math.max(1, baseStats.spd + (statBoost.spd ?? 0))
  };
};

const makeStageStats = (base: CreatureStats, stage: 1 | 2 | 3): CreatureStats => {
  if (stage === 1) {
    return { ...base };
  }

  if (stage === 2) {
    return {
      hp: Math.floor(base.hp * 1.27) + 8,
      atk: Math.floor(base.atk * 1.27) + 6,
      def: Math.floor(base.def * 1.27) + 6,
      spd: Math.floor(base.spd * 1.25) + 5
    };
  }

  return {
    hp: Math.floor(base.hp * 1.6) + 18,
    atk: Math.floor(base.atk * 1.58) + 12,
    def: Math.floor(base.def * 1.58) + 12,
    spd: Math.floor(base.spd * 1.54) + 10
  };
};

const makeLearnset = (
  movePool: EvolutionLineTemplate['movePool'],
  stage: 1 | 2 | 3
): LearnsetEntry[] => {
  if (stage === 1) {
    return [
      { level: 7, moveId: movePool[3] },
      { level: 12, moveId: movePool[4] },
      { level: 15, moveId: movePool[5] }
    ];
  }

  if (stage === 2) {
    return [
      { level: 20, moveId: movePool[4] },
      { level: 28, moveId: movePool[5] },
      { level: 34, moveId: movePool[1] }
    ];
  }

  return [
    { level: 40, moveId: movePool[5] },
    { level: 44, moveId: movePool[2] },
    { level: 48, moveId: movePool[0] }
  ];
};

const buildLine = (template: EvolutionLineTemplate): Record<string, CreatureDefinition> => {
  const [first, second, third] = template.stages;
  const catchRates = template.catchRates ?? [0.4, 0.24, 0.12];
  const [firstAbilityId, secondAbilityId, thirdAbilityId] =
    template.abilityIds ?? DEFAULT_LINE_ABILITIES[template.type];

  const firstOverride = RARE_SPECIES_OVERRIDES[first.id];
  const secondOverride = RARE_SPECIES_OVERRIDES[second.id];
  const thirdOverride = RARE_SPECIES_OVERRIDES[third.id];

  const firstStats = applyStatBoost(
    makeStageStats(template.baseStats, 1),
    firstOverride?.statBoost
  );
  const secondStats = applyStatBoost(
    makeStageStats(template.baseStats, 2),
    secondOverride?.statBoost
  );
  const thirdStats = applyStatBoost(
    makeStageStats(template.baseStats, 3),
    thirdOverride?.statBoost
  );

  return {
    [first.id]: {
      id: first.id,
      name: first.name,
      type: template.type,
      stats: firstStats,
      baseStats: firstStats,
      baseCatchRate: firstOverride?.catchRate ?? catchRates[0],
      rareFlag: Boolean(firstOverride),
      abilityId: firstOverride?.abilityId ?? firstAbilityId,
      moves: [template.movePool[0], template.movePool[1], template.movePool[2]],
      learnset: makeLearnset(template.movePool, 1),
      evolution: {
        method: 'level',
        toSpeciesId: second.id,
        atLevel: 16
      }
    },
    [second.id]: {
      id: second.id,
      name: second.name,
      type: template.type,
      stats: secondStats,
      baseStats: secondStats,
      baseCatchRate: secondOverride?.catchRate ?? catchRates[1],
      rareFlag: Boolean(secondOverride),
      abilityId: secondOverride?.abilityId ?? secondAbilityId,
      moves: [template.movePool[1], template.movePool[2], template.movePool[3]],
      learnset: makeLearnset(template.movePool, 2),
      evolution: {
        method: 'level',
        toSpeciesId: third.id,
        atLevel: 36
      }
    },
    [third.id]: {
      id: third.id,
      name: third.name,
      type: template.type,
      stats: thirdStats,
      baseStats: thirdStats,
      baseCatchRate: thirdOverride?.catchRate ?? catchRates[2],
      rareFlag: Boolean(thirdOverride),
      abilityId: thirdOverride?.abilityId ?? thirdAbilityId,
      moves: [template.movePool[2], template.movePool[3], template.movePool[4]],
      learnset: makeLearnset(template.movePool, 3),
      evolution: null
    }
  };
};

const EVOLUTION_LINES: EvolutionLineTemplate[] = [
  {
    type: 'Ember',
    stages: [
      { id: 'embercub', name: 'Embercub' },
      { id: 'cindelope', name: 'Cindelope' },
      { id: 'emberdrake', name: 'Emberdrake' }
    ],
    baseStats: { hp: 74, atk: 38, def: 32, spd: 35 },
    movePool: ['cinderJab', 'magmaBurst', 'flameWard', 'infernoRush', 'emberClaw', 'pyreFocus'],
    catchRates: [0.28, 0.2, 0.12]
  },
  {
    type: 'Ember',
    stages: [
      { id: 'pyrimp', name: 'Pyrimp' },
      { id: 'flarelynx', name: 'Flarelynx' },
      { id: 'calamaw', name: 'Calamaw' }
    ],
    baseStats: { hp: 70, atk: 40, def: 30, spd: 37 },
    movePool: ['cinderJab', 'emberClaw', 'ashSpiral', 'infernoRush', 'solarKick', 'flameWard']
  },
  {
    type: 'Ember',
    stages: [
      { id: 'coalit', name: 'Coalit' },
      { id: 'blazeroar', name: 'Blazeroar' },
      { id: 'solvyrm', name: 'Solvyrm' }
    ],
    baseStats: { hp: 78, atk: 36, def: 34, spd: 31 },
    movePool: ['magmaBurst', 'cinderJab', 'flameWard', 'ashSpiral', 'solarKick', 'pyreFocus']
  },
  {
    type: 'Tide',
    stages: [
      { id: 'tidepup', name: 'Tidepup' },
      { id: 'reefray', name: 'Reefray' },
      { id: 'tidefang', name: 'Tidefang' }
    ],
    baseStats: { hp: 78, atk: 33, def: 34, spd: 31 },
    movePool: ['splashKick', 'currentBite', 'tidalCrush', 'foamRush', 'brineLance', 'mistGuard'],
    catchRates: [0.32, 0.22, 0.14]
  },
  {
    type: 'Tide',
    stages: [
      { id: 'drizzlep', name: 'Drizzlep' },
      { id: 'surfhound', name: 'Surfhound' },
      { id: 'maelstrom', name: 'Maelstrom' }
    ],
    baseStats: { hp: 74, atk: 35, def: 32, spd: 35 },
    movePool: ['splashKick', 'foamRush', 'brineLance', 'tidalCrush', 'riptideSnap', 'surgeHowl']
  },
  {
    type: 'Tide',
    stages: [
      { id: 'brookit', name: 'Brookit' },
      { id: 'torrento', name: 'Torrento' },
      { id: 'aqualith', name: 'Aqualith' }
    ],
    baseStats: { hp: 80, atk: 34, def: 36, spd: 30 },
    movePool: ['currentBite', 'splashKick', 'mistGuard', 'tidalCrush', 'riptideSnap', 'brineLance']
  },
  {
    type: 'Bloom',
    stages: [
      { id: 'bloomfin', name: 'Bloomfin' },
      { id: 'thornlet', name: 'Thornlet' },
      { id: 'petalara', name: 'Petalara' }
    ],
    baseStats: { hp: 76, atk: 32, def: 34, spd: 30 },
    movePool: [
      'petalSlash',
      'briarLash',
      'photosynthPulse',
      'pollenDart',
      'vineCrash',
      'seedFocus'
    ],
    catchRates: [0.3, 0.22, 0.14]
  },
  {
    type: 'Bloom',
    stages: [
      { id: 'sproutle', name: 'Sproutle' },
      { id: 'bramblit', name: 'Bramblit' },
      { id: 'florazor', name: 'Florazor' }
    ],
    baseStats: { hp: 74, atk: 34, def: 33, spd: 32 },
    movePool: ['petalSlash', 'pollenDart', 'briarLash', 'vineCrash', 'sunblossom', 'thicketWall']
  },
  {
    type: 'Bloom',
    stages: [
      { id: 'mossip', name: 'Mossip' },
      { id: 'vinehart', name: 'Vinehart' },
      { id: 'canopyx', name: 'Canopyx' }
    ],
    baseStats: { hp: 80, atk: 31, def: 36, spd: 29 },
    movePool: ['photosynthPulse', 'petalSlash', 'briarLash', 'seedFocus', 'sunblossom', 'vineCrash']
  },
  {
    type: 'Volt',
    stages: [
      { id: 'sparkit', name: 'Sparkit' },
      { id: 'voltra', name: 'Voltra' },
      { id: 'stormyrm', name: 'Stormyrm' }
    ],
    baseStats: { hp: 70, atk: 36, def: 29, spd: 39 },
    movePool: ['sparkShot', 'staticClaw', 'focusRoar', 'voltDash', 'arcBurst', 'ionPulse'],
    catchRates: [0.3, 0.2, 0.13]
  },
  {
    type: 'Volt',
    stages: [
      { id: 'zapkit', name: 'Zapkit' },
      { id: 'coilhawk', name: 'Coilhawk' },
      { id: 'tempestra', name: 'Tempestra' }
    ],
    baseStats: { hp: 72, atk: 35, def: 30, spd: 38 },
    movePool: ['sparkShot', 'voltDash', 'focusRoar', 'arcBurst', 'tempestCall', 'shockGuard']
  },
  {
    type: 'Volt',
    stages: [
      { id: 'glintid', name: 'Glintid' },
      { id: 'pulseon', name: 'Pulseon' },
      { id: 'ionarch', name: 'Ionarch' }
    ],
    baseStats: { hp: 74, atk: 34, def: 32, spd: 36 },
    movePool: ['staticClaw', 'sparkShot', 'shockGuard', 'ionPulse', 'tempestCall', 'focusRoar']
  },
  {
    type: 'Stone',
    stages: [
      { id: 'stonehorn', name: 'Stonehorn' },
      { id: 'granigon', name: 'Granigon' },
      { id: 'shaleon', name: 'Shaleon' }
    ],
    baseStats: { hp: 82, atk: 34, def: 38, spd: 24 },
    movePool: ['shaleSlam', 'oreSpike', 'ironBark', 'quarryBreak', 'basaltCrush', 'gritFocus'],
    catchRates: [0.26, 0.2, 0.14]
  },
  {
    type: 'Stone',
    stages: [
      { id: 'pebblit', name: 'Pebblit' },
      { id: 'cragoon', name: 'Cragoon' },
      { id: 'monolisk', name: 'Monolisk' }
    ],
    baseStats: { hp: 84, atk: 33, def: 39, spd: 23 },
    movePool: ['shaleSlam', 'ironBark', 'oreSpike', 'quarryBreak', 'tectoCharge', 'sandGuard']
  },
  {
    type: 'Stone',
    stages: [
      { id: 'flintup', name: 'Flintup' },
      { id: 'bouldrax', name: 'Bouldrax' },
      { id: 'tectitan', name: 'Tectitan' }
    ],
    baseStats: { hp: 80, atk: 36, def: 37, spd: 25 },
    movePool: ['oreSpike', 'shaleSlam', 'gritFocus', 'basaltCrush', 'tectoCharge', 'quarryBreak']
  },
  {
    type: 'Shade',
    stages: [
      { id: 'shadeowl', name: 'Shadeowl' },
      { id: 'gloomoth', name: 'Gloomoth' },
      { id: 'umbrant', name: 'Umbrant' }
    ],
    baseStats: { hp: 73, atk: 35, def: 30, spd: 36 },
    movePool: ['duskCut', 'veilStrike', 'nightRake', 'gloomPierce', 'shadowPounce', 'voidGlare'],
    catchRates: [0.28, 0.2, 0.13]
  },
  {
    type: 'Shade',
    stages: [
      { id: 'murkit', name: 'Murkit' },
      { id: 'duskar', name: 'Duskar' },
      { id: 'rowraith', name: 'Rowraith' }
    ],
    baseStats: { hp: 72, atk: 34, def: 31, spd: 37 },
    movePool: ['duskCut', 'gloomPierce', 'mistVeil', 'nightRake', 'shadowPounce', 'voidGlare']
  },
  {
    type: 'Shade',
    stages: [
      { id: 'noctip', name: 'Noctip' },
      { id: 'veilfang', name: 'Veilfang' },
      { id: 'eclipsorn', name: 'Eclipsorn' }
    ],
    baseStats: { hp: 74, atk: 36, def: 32, spd: 35 },
    movePool: ['veilStrike', 'duskCut', 'nightRake', 'mistVeil', 'eclipseFang', 'voidGlare']
  }
];

type TemplateCreatureId = (typeof EVOLUTION_LINES)[number]['stages'][number]['id'];

const builtDefinitions = EVOLUTION_LINES.reduce<Record<TemplateCreatureId, CreatureDefinition>>(
  (accumulator, lineTemplate) => ({
    ...accumulator,
    ...(buildLine(lineTemplate) as Record<TemplateCreatureId, CreatureDefinition>)
  }),
  {} as Record<TemplateCreatureId, CreatureDefinition>
);

// Benchmark 9: showcase flexible evolution methods beyond plain level thresholds.
builtDefinitions.sproutle.evolution = {
  method: 'friendship',
  toSpeciesId: 'bramblit',
  friendshipLevel: 28,
  minLevel: 14
};
builtDefinitions.pebblit.evolution = {
  method: 'useItem',
  toSpeciesId: 'cragoon',
  itemId: 'trialSigil',
  minLevel: 16
};
builtDefinitions.murkit.evolution = {
  method: 'region',
  toSpeciesId: 'duskar',
  atLevel: 16,
  mapIds: ['marsh1', 'hollowmereTown', 'hollowmereTrial']
};
builtDefinitions.noctip.evolution = {
  method: 'timed',
  toSpeciesId: 'veilfang',
  atLevel: 16,
  levelParity: 'odd',
  requiredFlag: 'trial4Complete'
};

export const CREATURE_DEFINITIONS: Record<TemplateCreatureId, CreatureDefinition> =
  builtDefinitions;

export type CreatureId = TemplateCreatureId;

export type CreatureRuntimeState = {
  creatureId: CreatureId;
  level: number;
  currentHp: number;
  status?: CreatureStatus;
};

export const CREATURE_IDS = Object.keys(CREATURE_DEFINITIONS) as CreatureId[];

export const ENCOUNTER_CREATURE_IDS = CREATURE_IDS.filter(
  (creatureId) =>
    (CREATURE_DEFINITIONS[creatureId] as CreatureDefinition).encounterEligible !== false
) as CreatureId[];

export const isRareSpecies = (creatureId: CreatureId): boolean =>
  getCreatureDefinition(creatureId).rareFlag === true;

export const getCreatureDefinition = (creatureId: CreatureId): CreatureDefinition =>
  CREATURE_DEFINITIONS[creatureId];

export const getLearnsetMovesAtLevel = (creatureId: CreatureId, level: number): MoveId[] =>
  getCreatureDefinition(creatureId)
    .learnset.filter((entry) => entry.level === level)
    .map((entry) => entry.moveId);

const scaleStat = (base: number, level: number, hp: boolean): number => {
  const levelScale = hp ? 0.62 + level * 0.076 : 0.66 + level * 0.066;
  return Math.max(1, Math.floor(base * levelScale));
};

export const calculateCreatureStats = (creatureId: CreatureId, level: number): CreatureStats => {
  const normalizedLevel = Math.max(1, Math.floor(level));
  const baseStats = getCreatureDefinition(creatureId).baseStats;

  return {
    hp: scaleStat(baseStats.hp, normalizedLevel, true),
    atk: scaleStat(baseStats.atk, normalizedLevel, false),
    def: scaleStat(baseStats.def, normalizedLevel, false),
    spd: scaleStat(baseStats.spd, normalizedLevel, false)
  };
};

export const createStarterCreature = (): CreatureRuntimeState => {
  const level = 5;
  const stats = calculateCreatureStats('embercub', level);

  return {
    creatureId: 'embercub',
    level,
    currentHp: stats.hp,
    status: null
  };
};

export const normalizeRuntimeState = (state: CreatureRuntimeState): CreatureRuntimeState => {
  const stats = calculateCreatureStats(state.creatureId, state.level);

  return {
    creatureId: state.creatureId,
    level: Math.max(1, Math.floor(state.level)),
    currentHp: Math.max(1, Math.min(stats.hp, Math.floor(state.currentHp))),
    status: state.status ?? null
  };
};
