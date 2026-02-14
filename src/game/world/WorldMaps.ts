import type { CreatureId } from '../data/creatures';

export const TILE_SIZE = 16;

export type TileType = 'grass' | 'wall' | 'floor' | 'water' | 'door';
export type Direction = 'up' | 'down' | 'left' | 'right';

export const MAP_IDS = [
  'starterTown',
  'healHouse',
  'route1',
  'verdantisTown',
  'verdantisHealHouse',
  'verdantTrial',
  'northPass',
  'route2',
  'brinegateTown',
  'brinegateHealHouse',
  'brinegateTrial',
  'cave1',
  'stonecrossTown',
  'stonecrossHealHouse',
  'stonecrossTrial',
  'route3',
  'coilhavenTown',
  'coilhavenHealHouse',
  'coilhavenTrial',
  'marsh1',
  'hollowmereTown',
  'hollowmereHealHouse',
  'hollowmereTrial',
  'route4',
  'obsidianForgeTown',
  'obsidianForgeHealHouse',
  'obsidianTrial',
  'bridge1',
  'skydriftSpiresTown',
  'skydriftHealHouse',
  'skydriftTrial',
  'choirfallRuins',
  'choirfallHealHouse',
  'finalTower'
] as const;

export type MapId = (typeof MAP_IDS)[number];

export type DialogEntry = {
  speaker: string;
  text: string;
};

export type TrainerNpcMeta = {
  trainerId: string;
  defeatFlag: string;
  preBattleLine: string;
  postBattleLines: string[];
  repeatLine?: string;
};

export type NpcDefinition = {
  id: string;
  name: string;
  x: number;
  y: number;
  color: number;
  lines: string[];
  interaction?: 'terminal';
  requiresFlag?: string;
  hiddenIfFlag?: string;
  trainer?: TrainerNpcMeta;
};

export type SpawnPoint = {
  x: number;
  y: number;
  facing: Direction;
};

export type EncounterEntry = {
  speciesId: CreatureId;
  weight: number;
  requiredFlag?: string;
};

export type EncounterSettings = {
  enabled: boolean;
  levelRange: {
    min: number;
    max: number;
  };
  table: EncounterEntry[];
  chance?: number;
  ultraRareRate?: number;
  ultraRareTable?: EncounterEntry[];
};

export type MapExitDefinition = {
  id: string;
  name: string;
  kind: 'door' | 'exit';
  x: number;
  y: number;
  toMapId: MapId;
  toX: number;
  toY: number;
  toFacing: Direction;
  requiredFlag?: string;
  blockedMessage?: string;
};

export type BlockedGateDefinition = {
  id: string;
  name: string;
  x: number;
  y: number;
  requiredFlag: string;
  blockedMessage: string;
  color?: number;
  accentColor?: number;
};

export type MapDefinition = {
  mapId: MapId;
  width: number;
  height: number;
  spawn: SpawnPoint;
  encounter: EncounterSettings | null;
  healOnEnter?: boolean;
  tiles: TileType[][];
  npcs: NpcDefinition[];
  exits: MapExitDefinition[];
  blockedGates: BlockedGateDefinition[];
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BuildingLayout = Rect & {
  doorX: number;
  doorY: number;
};

type TownLayoutOptions = {
  buildings: BuildingLayout[];
  lakes?: Rect[];
  floorPatches?: Rect[];
  topGateX?: number;
  bottomGateX?: number;
};

type RouteLayoutOptions = {
  width: number;
  height: number;
  centerPathX: number;
  horizontalPaths: Rect[];
  waterPatches?: Rect[];
  wallPatches?: Rect[];
  topGateX?: number;
  bottomGateX?: number;
};

type TrialMasterSpec = {
  id: string;
  name: string;
  trainerId: string;
  trialFlag: string;
  x?: number;
  y?: number;
  preBattleLine: string;
  postBattleLines: string[];
  repeatLine: string;
  color?: number;
};

const createFilledTiles = (width: number, height: number, tile: TileType): TileType[][] =>
  Array.from({ length: height }, () => Array.from({ length: width }, () => tile));

const fillRect = (
  grid: TileType[][],
  tile: TileType,
  startX: number,
  startY: number,
  width: number,
  height: number
): void => {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      if (grid[y] && grid[y][x]) {
        grid[y][x] = tile;
      }
    }
  }
};

const drawOuterWalls = (grid: TileType[][]): void => {
  const height = grid.length;
  const width = grid[0].length;

  for (let x = 0; x < width; x += 1) {
    grid[0][x] = 'wall';
    grid[height - 1][x] = 'wall';
  }

  for (let y = 0; y < height; y += 1) {
    grid[y][0] = 'wall';
    grid[y][width - 1] = 'wall';
  }
};

const placeBuilding = (grid: TileType[][], layout: BuildingLayout): void => {
  fillRect(grid, 'wall', layout.x, layout.y, layout.width, layout.height);
  fillRect(
    grid,
    'floor',
    layout.x + 1,
    layout.y + 1,
    Math.max(1, layout.width - 2),
    Math.max(1, layout.height - 2)
  );
  if (grid[layout.doorY]?.[layout.doorX]) {
    grid[layout.doorY][layout.doorX] = 'door';
  }
  if (grid[layout.doorY + 1]?.[layout.doorX]) {
    grid[layout.doorY + 1][layout.doorX] = 'floor';
  }
};

const buildTownTiles = (
  width: number,
  height: number,
  options: TownLayoutOptions
): TileType[][] => {
  const tiles = createFilledTiles(width, height, 'grass');
  drawOuterWalls(tiles);

  const centerX = Math.floor(width / 2);
  fillRect(tiles, 'floor', centerX, 1, 1, height - 2);
  fillRect(tiles, 'floor', 1, Math.max(2, height - 6), width - 2, 1);
  fillRect(tiles, 'floor', 1, 2, width - 2, 1);

  options.floorPatches?.forEach((patch) =>
    fillRect(tiles, 'floor', patch.x, patch.y, patch.width, patch.height)
  );
  options.lakes?.forEach((patch) =>
    fillRect(tiles, 'water', patch.x, patch.y, patch.width, patch.height)
  );
  options.buildings.forEach((building) => placeBuilding(tiles, building));

  const topGateX = options.topGateX ?? centerX;
  const bottomGateX = options.bottomGateX ?? centerX;
  if (tiles[0]?.[topGateX]) {
    tiles[0][topGateX] = 'door';
  }
  if (tiles[height - 1]?.[bottomGateX]) {
    tiles[height - 1][bottomGateX] = 'door';
  }

  return tiles;
};

const buildRouteTiles = (options: RouteLayoutOptions): TileType[][] => {
  const tiles = createFilledTiles(options.width, options.height, 'grass');
  drawOuterWalls(tiles);

  fillRect(tiles, 'floor', options.centerPathX, 1, 1, options.height - 2);
  options.horizontalPaths.forEach((path) =>
    fillRect(tiles, 'floor', path.x, path.y, path.width, path.height)
  );
  options.waterPatches?.forEach((patch) =>
    fillRect(tiles, 'water', patch.x, patch.y, patch.width, patch.height)
  );
  options.wallPatches?.forEach((patch) =>
    fillRect(tiles, 'wall', patch.x, patch.y, patch.width, patch.height)
  );

  const topGateX = options.topGateX ?? options.centerPathX;
  const bottomGateX = options.bottomGateX ?? options.centerPathX;
  if (tiles[0]?.[topGateX]) {
    tiles[0][topGateX] = 'door';
  }
  if (tiles[options.height - 1]?.[bottomGateX]) {
    tiles[options.height - 1][bottomGateX] = 'door';
  }

  return tiles;
};

const buildHealHouseTiles = (): TileType[][] => {
  const tiles = createFilledTiles(10, 8, 'floor');
  drawOuterWalls(tiles);
  fillRect(tiles, 'wall', 2, 2, 6, 1);
  fillRect(tiles, 'water', 3, 4, 4, 1);
  tiles[7][5] = 'door';
  return tiles;
};

const buildTrialHallTiles = (): TileType[][] => {
  const tiles = createFilledTiles(14, 10, 'floor');
  drawOuterWalls(tiles);
  fillRect(tiles, 'wall', 2, 2, 10, 1);
  fillRect(tiles, 'water', 4, 4, 6, 2);
  tiles[9][7] = 'door';
  return tiles;
};

const buildCaveTiles = (): TileType[][] => {
  const tiles = createFilledTiles(32, 18, 'floor');
  drawOuterWalls(tiles);
  fillRect(tiles, 'wall', 4, 4, 9, 2);
  fillRect(tiles, 'wall', 19, 4, 9, 2);
  fillRect(tiles, 'wall', 7, 9, 6, 2);
  fillRect(tiles, 'wall', 19, 11, 6, 2);
  fillRect(tiles, 'grass', 2, 13, 7, 3);
  fillRect(tiles, 'grass', 22, 13, 8, 3);
  fillRect(tiles, 'water', 13, 7, 6, 3);
  fillRect(tiles, 'floor', 1, 15, 30, 1);
  fillRect(tiles, 'floor', 1, 2, 30, 1);
  tiles[0][16] = 'door';
  tiles[17][16] = 'door';
  return tiles;
};

const buildMarshTiles = (): TileType[][] => {
  const tiles = createFilledTiles(32, 18, 'grass');
  drawOuterWalls(tiles);
  fillRect(tiles, 'floor', 16, 1, 1, 16);
  fillRect(tiles, 'floor', 4, 8, 24, 1);
  fillRect(tiles, 'water', 2, 3, 8, 3);
  fillRect(tiles, 'water', 22, 3, 8, 3);
  fillRect(tiles, 'water', 11, 11, 10, 4);
  fillRect(tiles, 'floor', 1, 15, 30, 1);
  fillRect(tiles, 'floor', 1, 2, 30, 1);
  tiles[0][16] = 'door';
  tiles[17][16] = 'door';
  return tiles;
};

const buildBridgeTiles = (): TileType[][] => {
  const tiles = createFilledTiles(34, 14, 'water');
  drawOuterWalls(tiles);
  fillRect(tiles, 'floor', 14, 1, 6, 12);
  fillRect(tiles, 'floor', 12, 3, 10, 2);
  fillRect(tiles, 'floor', 12, 9, 10, 2);
  fillRect(tiles, 'wall', 13, 6, 8, 1);
  fillRect(tiles, 'grass', 2, 10, 8, 3);
  fillRect(tiles, 'grass', 24, 1, 8, 3);
  tiles[0][17] = 'door';
  tiles[13][17] = 'door';
  return tiles;
};

const buildFinalTowerTiles = (): TileType[][] => {
  const tiles = createFilledTiles(24, 18, 'floor');
  drawOuterWalls(tiles);
  fillRect(tiles, 'wall', 5, 3, 14, 2);
  fillRect(tiles, 'wall', 3, 7, 6, 2);
  fillRect(tiles, 'wall', 15, 7, 6, 2);
  fillRect(tiles, 'wall', 6, 12, 12, 2);
  fillRect(tiles, 'water', 2, 15, 5, 2);
  fillRect(tiles, 'water', 17, 15, 5, 2);
  fillRect(tiles, 'floor', 11, 1, 2, 16);
  fillRect(tiles, 'floor', 1, 15, 22, 1);
  tiles[17][12] = 'door';
  return tiles;
};

const encounter = (
  min: number,
  max: number,
  table: EncounterEntry[],
  chance = 0.1,
  ultraRareTable: EncounterEntry[] = [],
  ultraRareRate = 0.015
): EncounterSettings => ({
  enabled: true,
  levelRange: { min, max },
  table,
  chance,
  ultraRareTable: ultraRareTable.length > 0 ? ultraRareTable : undefined,
  ultraRareRate: ultraRareTable.length > 0 ? ultraRareRate : undefined
});

const createTerminalNpc = (id: string): NpcDefinition => ({
  id,
  name: 'Bindery Terminal',
  x: 2,
  y: 5,
  color: 0x8fdcff,
  interaction: 'terminal',
  lines: ['Bindery Terminal online. Manage Party and Storage.']
});

const createTrialMasterNpc = (spec: TrialMasterSpec): NpcDefinition => ({
  id: spec.id,
  name: spec.name,
  x: spec.x ?? 7,
  y: spec.y ?? 3,
  color: spec.color ?? 0xf4d985,
  lines: [spec.preBattleLine],
  trainer: {
    trainerId: spec.trainerId,
    defeatFlag: spec.trialFlag,
    preBattleLine: spec.preBattleLine,
    postBattleLines: spec.postBattleLines,
    repeatLine: spec.repeatLine
  }
});

const STARTER_ROUTE_TABLE: EncounterEntry[] = [
  { speciesId: 'embercub', weight: 44 },
  { speciesId: 'bloomfin', weight: 24 },
  { speciesId: 'tidepup', weight: 20 },
  { speciesId: 'sproutle', weight: 9 },
  { speciesId: 'sparkit', weight: 3 }
];

const ROUTE1_TABLE: EncounterEntry[] = [
  { speciesId: 'embercub', weight: 38 },
  { speciesId: 'bloomfin', weight: 28 },
  { speciesId: 'tidepup', weight: 20 },
  { speciesId: 'sproutle', weight: 10 },
  { speciesId: 'drizzlep', weight: 4 }
];

const BRINE_TABLE: EncounterEntry[] = [
  { speciesId: 'tidepup', weight: 28 },
  { speciesId: 'drizzlep', weight: 22 },
  { speciesId: 'bloomfin', weight: 16 },
  { speciesId: 'coalit', weight: 14 },
  { speciesId: 'pebblit', weight: 10 },
  { speciesId: 'thornlet', weight: 6 },
  { speciesId: 'brookit', weight: 4 }
];

const CAVE1_TABLE: EncounterEntry[] = [
  { speciesId: 'stonehorn', weight: 30 },
  { speciesId: 'pebblit', weight: 24 },
  { speciesId: 'shadeowl', weight: 16 },
  { speciesId: 'sparkit', weight: 12 },
  { speciesId: 'murkit', weight: 8 },
  { speciesId: 'granigon', weight: 6 },
  { speciesId: 'noctip', weight: 4 }
];

const COIL_TABLE: EncounterEntry[] = [
  { speciesId: 'sparkit', weight: 28 },
  { speciesId: 'zapkit', weight: 22 },
  { speciesId: 'voltra', weight: 14 },
  { speciesId: 'pebblit', weight: 14 },
  { speciesId: 'stonehorn', weight: 10 },
  { speciesId: 'drizzlep', weight: 8 },
  { speciesId: 'glintid', weight: 4 }
];

const MARSH_TABLE: EncounterEntry[] = [
  { speciesId: 'tidepup', weight: 22 },
  { speciesId: 'brookit', weight: 16 },
  { speciesId: 'bloomfin', weight: 18 },
  { speciesId: 'sproutle', weight: 14 },
  { speciesId: 'coalit', weight: 12 },
  { speciesId: 'shadeowl', weight: 12 },
  { speciesId: 'murkit', weight: 6 }
];

const FORGE_TABLE: EncounterEntry[] = [
  { speciesId: 'embercub', weight: 22 },
  { speciesId: 'pyrimp', weight: 18 },
  { speciesId: 'coalit', weight: 16 },
  { speciesId: 'stonehorn', weight: 18 },
  { speciesId: 'pebblit', weight: 12 },
  { speciesId: 'brookit', weight: 10 },
  { speciesId: 'flintup', weight: 4 }
];

const SKY_TABLE: EncounterEntry[] = [
  { speciesId: 'zapkit', weight: 26 },
  { speciesId: 'sparkit', weight: 22 },
  { speciesId: 'glintid', weight: 16 },
  { speciesId: 'drizzlep', weight: 14 },
  { speciesId: 'mossip', weight: 10 },
  { speciesId: 'murkit', weight: 8 },
  { speciesId: 'stonehorn', weight: 4 }
];

const CHOIR_TABLE: EncounterEntry[] = [
  { speciesId: 'murkit', weight: 26 },
  { speciesId: 'noctip', weight: 22 },
  { speciesId: 'zapkit', weight: 16 },
  { speciesId: 'pebblit', weight: 14 },
  { speciesId: 'bloomfin', weight: 8 },
  { speciesId: 'sparkit', weight: 8 },
  { speciesId: 'shadeowl', weight: 6 }
];

const FINAL_TABLE: EncounterEntry[] = [
  { speciesId: 'emberdrake', weight: 18 },
  { speciesId: 'maelstrom', weight: 14 },
  { speciesId: 'canopyx', weight: 14 },
  { speciesId: 'tempestra', weight: 14 },
  { speciesId: 'tectitan', weight: 14 },
  { speciesId: 'eclipsorn', weight: 14 },
  { speciesId: 'ionarch', weight: 12 }
];

const ROUTE1_ULTRA_RARE_TABLE: EncounterEntry[] = [
  { speciesId: 'emberdrake', weight: 1 },
  { speciesId: 'maelstrom', weight: 1 },
  { speciesId: 'canopyx', weight: 1 }
];

const CAVE1_ULTRA_RARE_TABLE: EncounterEntry[] = [
  { speciesId: 'tectitan', weight: 2 },
  { speciesId: 'eclipsorn', weight: 1, requiredFlag: 'rareCaveUnlocked' }
];

const MARSH1_ULTRA_RARE_TABLE: EncounterEntry[] = [
  { speciesId: 'canopyx', weight: 2 },
  { speciesId: 'eclipsorn', weight: 1 },
  { speciesId: 'maelstrom', weight: 1, requiredFlag: 'rareMarshUnlocked' }
];

const ROUTE4_ULTRA_RARE_TABLE: EncounterEntry[] = [
  { speciesId: 'emberdrake', weight: 1 },
  { speciesId: 'tectitan', weight: 1 }
];

const BRIDGE1_ULTRA_RARE_TABLE: EncounterEntry[] = [
  { speciesId: 'ionarch', weight: 2 },
  { speciesId: 'tempestra', weight: 1 }
];

const CHOIR_ULTRA_RARE_TABLE: EncounterEntry[] = [
  { speciesId: 'eclipsorn', weight: 2 },
  { speciesId: 'canopyx', weight: 1 },
  { speciesId: 'ionarch', weight: 1 }
];

const FINAL_ULTRA_RARE_TABLE: EncounterEntry[] = [
  { speciesId: 'emberdrake', weight: 2 },
  { speciesId: 'maelstrom', weight: 2 },
  { speciesId: 'canopyx', weight: 2 },
  { speciesId: 'ionarch', weight: 2 },
  { speciesId: 'tectitan', weight: 2 },
  { speciesId: 'eclipsorn', weight: 2, requiredFlag: 'rareTowerUnlocked' }
];

const starterTownTiles = buildTownTiles(30, 20, {
  buildings: [{ x: 11, y: 4, width: 9, height: 7, doorX: 15, doorY: 10 }],
  lakes: [{ x: 22, y: 3, width: 6, height: 4 }],
  floorPatches: [
    { x: 11, y: 11, width: 9, height: 6 },
    { x: 2, y: 13, width: 8, height: 6 }
  ],
  topGateX: 15,
  bottomGateX: 15
});

const verdantisTownTiles = buildTownTiles(26, 16, {
  buildings: [
    { x: 4, y: 4, width: 7, height: 6, doorX: 7, doorY: 9 },
    { x: 17, y: 4, width: 7, height: 7, doorX: 20, doorY: 10 }
  ],
  floorPatches: [{ x: 9, y: 7, width: 9, height: 4 }],
  topGateX: 13,
  bottomGateX: 13
});

const brinegateTownTiles = buildTownTiles(30, 20, {
  buildings: [
    { x: 4, y: 5, width: 8, height: 7, doorX: 8, doorY: 11 },
    { x: 18, y: 4, width: 8, height: 7, doorX: 22, doorY: 10 }
  ],
  lakes: [{ x: 12, y: 3, width: 6, height: 4 }],
  floorPatches: [{ x: 12, y: 10, width: 7, height: 4 }],
  topGateX: 15,
  bottomGateX: 15
});

const stonecrossTownTiles = buildTownTiles(30, 20, {
  buildings: [
    { x: 4, y: 4, width: 8, height: 7, doorX: 8, doorY: 10 },
    { x: 18, y: 4, width: 8, height: 7, doorX: 22, doorY: 10 }
  ],
  floorPatches: [{ x: 10, y: 11, width: 11, height: 4 }],
  lakes: [{ x: 2, y: 14, width: 7, height: 3 }],
  topGateX: 15,
  bottomGateX: 15
});

const coilhavenTownTiles = buildTownTiles(30, 20, {
  buildings: [
    { x: 4, y: 5, width: 8, height: 7, doorX: 8, doorY: 11 },
    { x: 18, y: 5, width: 8, height: 7, doorX: 22, doorY: 11 }
  ],
  lakes: [{ x: 13, y: 3, width: 4, height: 5 }],
  floorPatches: [{ x: 9, y: 12, width: 13, height: 3 }],
  topGateX: 15,
  bottomGateX: 15
});

const hollowmereTownTiles = buildTownTiles(30, 20, {
  buildings: [
    { x: 4, y: 4, width: 8, height: 7, doorX: 8, doorY: 10 },
    { x: 18, y: 5, width: 8, height: 7, doorX: 22, doorY: 11 }
  ],
  lakes: [
    { x: 2, y: 3, width: 4, height: 3 },
    { x: 24, y: 3, width: 4, height: 3 }
  ],
  floorPatches: [{ x: 10, y: 11, width: 11, height: 5 }],
  topGateX: 15,
  bottomGateX: 15
});

const obsidianTownTiles = buildTownTiles(30, 20, {
  buildings: [
    { x: 4, y: 4, width: 8, height: 7, doorX: 8, doorY: 10 },
    { x: 18, y: 4, width: 8, height: 7, doorX: 22, doorY: 10 }
  ],
  floorPatches: [{ x: 8, y: 11, width: 15, height: 5 }],
  lakes: [{ x: 12, y: 3, width: 6, height: 3 }],
  topGateX: 15,
  bottomGateX: 15
});

const skydriftTownTiles = buildTownTiles(30, 20, {
  buildings: [
    { x: 4, y: 5, width: 8, height: 7, doorX: 8, doorY: 11 },
    { x: 18, y: 5, width: 8, height: 7, doorX: 22, doorY: 11 }
  ],
  lakes: [{ x: 11, y: 2, width: 8, height: 3 }],
  floorPatches: [{ x: 9, y: 12, width: 13, height: 3 }],
  topGateX: 15,
  bottomGateX: 15
});

const choirfallTiles = buildTownTiles(30, 18, {
  buildings: [{ x: 4, y: 4, width: 8, height: 7, doorX: 7, doorY: 10 }],
  lakes: [
    { x: 19, y: 4, width: 8, height: 3 },
    { x: 19, y: 11, width: 8, height: 3 }
  ],
  floorPatches: [{ x: 11, y: 9, width: 8, height: 3 }],
  topGateX: 15,
  bottomGateX: 15
});

const CORE_WORLD_MAPS = {
  starterTown: {
    mapId: 'starterTown',
    width: 30,
    height: 20,
    spawn: { x: 15, y: 16, facing: 'up' },
    encounter: encounter(2, 5, STARTER_ROUTE_TABLE, 0.1),
    tiles: starterTownTiles,
    blockedGates: [],
    npcs: [
      {
        id: 'nurse-nova',
        name: 'Nurse Nova',
        x: 13,
        y: 12,
        color: 0xff9bd4,
        lines: [
          'Welcome to Starter Town.',
          'The heal house restores every Corebeast in your party.'
        ]
      },
      {
        id: 'ranger-ash',
        name: 'Ranger Ash',
        x: 18,
        y: 14,
        color: 0x8ed6ff,
        lines: ['Route 1 is north.', 'Trial sigils unlock farther regions.']
      }
    ],
    exits: [
      {
        id: 'starter-heal-door',
        name: 'Starter Heal House',
        kind: 'door',
        x: 15,
        y: 10,
        toMapId: 'healHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'starter-north-exit',
        name: 'Starter North Gate',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'route1',
        toX: 20,
        toY: 18,
        toFacing: 'up'
      }
    ]
  },
  healHouse: {
    mapId: 'healHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-starter')],
    exits: [
      {
        id: 'starter-heal-exit',
        name: 'Starter Town Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'starterTown',
        toX: 15,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  route1: {
    mapId: 'route1',
    width: 40,
    height: 20,
    spawn: { x: 20, y: 18, facing: 'up' },
    encounter: encounter(4, 8, ROUTE1_TABLE, 0.1, ROUTE1_ULTRA_RARE_TABLE, 0.015),
    tiles: buildRouteTiles({
      width: 40,
      height: 20,
      centerPathX: 20,
      horizontalPaths: [
        { x: 8, y: 8, width: 25, height: 1 },
        { x: 5, y: 13, width: 31, height: 1 }
      ],
      waterPatches: [{ x: 3, y: 15, width: 10, height: 3 }],
      topGateX: 20,
      bottomGateX: 20
    }),
    blockedGates: [],
    npcs: [
      {
        id: 'scout-pella',
        name: 'Scout Pella',
        x: 14,
        y: 8,
        color: 0xffc37d,
        lines: ['Stay focused when the grass gets deep.'],
        trainer: {
          trainerId: 'route1_scout_pella',
          defeatFlag: 'route1TrainerPellaDefeated',
          preBattleLine: 'Route 1 check. Show me your stance.',
          postBattleLines: ['Solid form. You can pass.']
        }
      },
      {
        id: 'guard-tovin',
        name: 'Guard Tovin',
        x: 26,
        y: 13,
        color: 0x9bb9ff,
        lines: ['Do not neglect your defense rhythm.'],
        trainer: {
          trainerId: 'route1_guard_tovin',
          defeatFlag: 'route1TrainerTovinDefeated',
          preBattleLine: 'Road security drill starts now.',
          postBattleLines: ['Discipline confirmed. Keep moving.']
        }
      },
      {
        id: 'rival-rowan',
        name: 'Rival Rowan',
        x: 20,
        y: 3,
        color: 0xff8f9f,
        hiddenIfFlag: 'rivalRowanDefeated',
        lines: ['Verdantis is mine to claim first.'],
        trainer: {
          trainerId: 'rival_rowan',
          defeatFlag: 'rivalRowanDefeated',
          preBattleLine: 'You made it this far? Prove you belong here.',
          postBattleLines: ['Fine. Verdantis is open. Heal up before your Trial.']
        }
      }
    ],
    exits: [
      {
        id: 'route1-south-exit',
        name: 'Route 1 South Gate',
        kind: 'exit',
        x: 20,
        y: 19,
        toMapId: 'starterTown',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'route1-north-exit',
        name: 'Route 1 North Gate',
        kind: 'exit',
        x: 20,
        y: 0,
        toMapId: 'verdantisTown',
        toX: 13,
        toY: 14,
        toFacing: 'up',
        requiredFlag: 'rivalRowanDefeated',
        blockedMessage: 'Rowan blocks the way. Beat your rival before entering Verdantis.'
      }
    ]
  },
  verdantisTown: {
    mapId: 'verdantisTown',
    width: 26,
    height: 16,
    spawn: { x: 13, y: 14, facing: 'up' },
    encounter: null,
    tiles: verdantisTownTiles,
    blockedGates: [
      {
        id: 'verdantis-north-gate-block',
        name: 'Verdantis North Gate',
        x: 13,
        y: 0,
        requiredFlag: 'trial1Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'warden-lia',
        name: 'Warden Lia',
        x: 10,
        y: 10,
        color: 0xa5f2ca,
        lines: ['Earn the Verdant Sigil to unlock the north gate.']
      },
      {
        id: 'scribe-iona',
        name: 'Scribe Iona',
        x: 15,
        y: 8,
        color: 0xb6d4ff,
        lines: ['Trial masters test control, not just power.']
      }
    ],
    exits: [
      {
        id: 'verdantis-south-exit',
        name: 'Verdantis South Gate',
        kind: 'exit',
        x: 13,
        y: 15,
        toMapId: 'route1',
        toX: 20,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'verdantis-heal-door',
        name: 'Verdantis Heal House',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'verdantisHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'verdantis-trial-door',
        name: 'Verdant Trial Hall',
        kind: 'door',
        x: 20,
        y: 10,
        toMapId: 'verdantTrial',
        toX: 7,
        toY: 8,
        toFacing: 'up'
      },
      {
        id: 'verdantis-north-exit',
        name: 'Verdantis North Gate',
        kind: 'exit',
        x: 13,
        y: 0,
        toMapId: 'northPass',
        toX: 11,
        toY: 10,
        toFacing: 'up',
        requiredFlag: 'trial1Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  verdantisHealHouse: {
    mapId: 'verdantisHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-verdantis')],
    exits: [
      {
        id: 'verdantis-heal-exit',
        name: 'Verdantis Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'verdantisTown',
        toX: 7,
        toY: 10,
        toFacing: 'down'
      }
    ]
  },
  verdantTrial: {
    mapId: 'verdantTrial',
    width: 14,
    height: 10,
    spawn: { x: 7, y: 8, facing: 'up' },
    encounter: null,
    tiles: buildTrialHallTiles(),
    blockedGates: [],
    npcs: [
      createTrialMasterNpc({
        id: 'trial-master-lyra',
        name: 'Trial Master Lyra',
        trainerId: 'trial_master_verdant',
        trialFlag: 'trial1Complete',
        preBattleLine: 'Show me your command of rhythm and restraint.',
        postBattleLines: ['You passed the first Trial. Accept the Verdant Sigil.'],
        repeatLine: 'You already cleared this Trial. Guard your Sigil well.'
      })
    ],
    exits: [
      {
        id: 'verdant-trial-exit',
        name: 'Trial Hall Exit',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'verdantisTown',
        toX: 20,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  northPass: {
    mapId: 'northPass',
    width: 22,
    height: 12,
    spawn: { x: 11, y: 10, facing: 'up' },
    encounter: encounter(8, 12, BRINE_TABLE, 0.08),
    tiles: buildRouteTiles({
      width: 22,
      height: 12,
      centerPathX: 11,
      horizontalPaths: [{ x: 6, y: 5, width: 11, height: 1 }],
      waterPatches: [
        { x: 2, y: 2, width: 4, height: 3 },
        { x: 16, y: 7, width: 4, height: 3 }
      ],
      topGateX: 11,
      bottomGateX: 11
    }),
    blockedGates: [],
    npcs: [
      {
        id: 'sentinel-kade',
        name: 'Sentinel Kade',
        x: 11,
        y: 5,
        color: 0xa4dcff,
        lines: ['North passage is open. Brinegate lies ahead.']
      }
    ],
    exits: [
      {
        id: 'northpass-south',
        name: 'Return to Verdantis',
        kind: 'exit',
        x: 11,
        y: 11,
        toMapId: 'verdantisTown',
        toX: 13,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'northpass-north',
        name: 'To Route 2',
        kind: 'exit',
        x: 11,
        y: 0,
        toMapId: 'route2',
        toX: 20,
        toY: 18,
        toFacing: 'up'
      }
    ]
  }
} as const satisfies Partial<Record<MapId, MapDefinition>>;

const MID_WORLD_MAPS = {
  route2: {
    mapId: 'route2',
    width: 40,
    height: 20,
    spawn: { x: 20, y: 18, facing: 'up' },
    encounter: encounter(10, 15, BRINE_TABLE, 0.1),
    tiles: buildRouteTiles({
      width: 40,
      height: 20,
      centerPathX: 20,
      horizontalPaths: [
        { x: 3, y: 6, width: 34, height: 1 },
        { x: 7, y: 13, width: 28, height: 1 }
      ],
      waterPatches: [
        { x: 3, y: 2, width: 8, height: 3 },
        { x: 28, y: 14, width: 9, height: 4 }
      ],
      wallPatches: [{ x: 14, y: 9, width: 4, height: 2 }],
      topGateX: 20,
      bottomGateX: 20
    }),
    blockedGates: [],
    npcs: [
      {
        id: 'mariner-rho',
        name: 'Mariner Rho',
        x: 24,
        y: 6,
        color: 0x9ad7ff,
        lines: ['Brinegate Trial waits in the next town.']
      }
    ],
    exits: [
      {
        id: 'route2-south',
        name: 'Back to North Pass',
        kind: 'exit',
        x: 20,
        y: 19,
        toMapId: 'northPass',
        toX: 11,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'route2-north',
        name: 'To Brinegate Town',
        kind: 'exit',
        x: 20,
        y: 0,
        toMapId: 'brinegateTown',
        toX: 15,
        toY: 18,
        toFacing: 'up'
      }
    ]
  }
} as const satisfies Partial<Record<MapId, MapDefinition>>;

const REGION_TWO_MAPS = {
  brinegateTown: {
    mapId: 'brinegateTown',
    width: 30,
    height: 20,
    spawn: { x: 15, y: 18, facing: 'up' },
    encounter: null,
    tiles: brinegateTownTiles,
    blockedGates: [
      {
        id: 'brinegate-north-gate-block',
        name: 'Brinegate North Gate',
        x: 15,
        y: 0,
        requiredFlag: 'trial2Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'dockmaster-sela',
        name: 'Dockmaster Sela',
        x: 14,
        y: 12,
        color: 0x9ad7ff,
        lines: ['Trial 2 proves command over flowing momentum.']
      },
      {
        id: 'vendor-maro',
        name: 'Vendor Maro',
        x: 19,
        y: 12,
        color: 0xffcb9f,
        lines: ['Stonecross lies beyond the sealed cave gate.']
      }
    ],
    exits: [
      {
        id: 'brinegate-south',
        name: 'Back to Route 2',
        kind: 'exit',
        x: 15,
        y: 19,
        toMapId: 'route2',
        toX: 20,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'brinegate-heal-door',
        name: 'Brinegate Heal House',
        kind: 'door',
        x: 8,
        y: 11,
        toMapId: 'brinegateHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'brinegate-trial-door',
        name: 'Brinegate Trial Hall',
        kind: 'door',
        x: 22,
        y: 10,
        toMapId: 'brinegateTrial',
        toX: 7,
        toY: 8,
        toFacing: 'up'
      },
      {
        id: 'brinegate-north',
        name: 'To Cave 1',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'cave1',
        toX: 16,
        toY: 16,
        toFacing: 'up',
        requiredFlag: 'trial2Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  brinegateHealHouse: {
    mapId: 'brinegateHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-brinegate')],
    exits: [
      {
        id: 'brinegate-heal-exit',
        name: 'Brinegate Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'brinegateTown',
        toX: 8,
        toY: 12,
        toFacing: 'down'
      }
    ]
  },
  brinegateTrial: {
    mapId: 'brinegateTrial',
    width: 14,
    height: 10,
    spawn: { x: 7, y: 8, facing: 'up' },
    encounter: null,
    tiles: buildTrialHallTiles(),
    blockedGates: [],
    npcs: [
      createTrialMasterNpc({
        id: 'trial-master-neri',
        name: 'Trial Master Neri',
        trainerId: 'trial_master_brine',
        trialFlag: 'trial2Complete',
        preBattleLine: 'Flow around force and strike when it opens.',
        postBattleLines: ['Trial 2 complete. The Brine Sigil is yours.'],
        repeatLine: 'You already carry the Brine Sigil.'
      })
    ],
    exits: [
      {
        id: 'brinegate-trial-exit',
        name: 'Trial Hall Exit',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'brinegateTown',
        toX: 22,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  cave1: {
    mapId: 'cave1',
    width: 32,
    height: 18,
    spawn: { x: 16, y: 16, facing: 'up' },
    encounter: encounter(12, 15, CAVE1_TABLE, 0.12, CAVE1_ULTRA_RARE_TABLE, 0.02),
    tiles: buildCaveTiles(),
    blockedGates: [],
    npcs: [
      {
        id: 'spelunker-voss',
        name: 'Spelunker Voss',
        x: 11,
        y: 15,
        color: 0xd8c6aa,
        lines: ['Stonecross sits just beyond this cavern.']
      },
      {
        id: 'postgame-boss-cave',
        name: 'Depth Warden Arct',
        x: 21,
        y: 14,
        color: 0xc3d1e8,
        requiresFlag: 'postgameUnlocked',
        hiddenIfFlag: 'postgameBossCaveDefeated',
        lines: ['Postgame challenge accepted. Descend and endure.'],
        trainer: {
          trainerId: 'postgame_boss_cave',
          defeatFlag: 'postgameBossCaveDefeated',
          preBattleLine: 'Let the bedrock judge your command.',
          postBattleLines: ['The deep seal breaks. A new rare resonance stirs in this cave.'],
          repeatLine: 'The cavern already acknowledged your victory.'
        }
      }
    ],
    exits: [
      {
        id: 'cave1-south',
        name: 'Back to Brinegate',
        kind: 'exit',
        x: 16,
        y: 17,
        toMapId: 'brinegateTown',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'cave1-north',
        name: 'To Stonecross Town',
        kind: 'exit',
        x: 16,
        y: 0,
        toMapId: 'stonecrossTown',
        toX: 15,
        toY: 18,
        toFacing: 'up'
      }
    ]
  },
  stonecrossTown: {
    mapId: 'stonecrossTown',
    width: 30,
    height: 20,
    spawn: { x: 15, y: 18, facing: 'up' },
    encounter: null,
    tiles: stonecrossTownTiles,
    blockedGates: [
      {
        id: 'stonecross-north-gate-block',
        name: 'Stonecross North Gate',
        x: 15,
        y: 0,
        requiredFlag: 'trial3Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'mason-bera',
        name: 'Mason Bera',
        x: 11,
        y: 12,
        color: 0xd7c9b3,
        lines: ['Our Trial Master hardens tamers like granite.']
      },
      {
        id: 'runner-dex',
        name: 'Runner Dex',
        x: 18,
        y: 12,
        color: 0x9ac6ff,
        lines: ['Route 3 opens after Trial 3.']
      }
    ],
    exits: [
      {
        id: 'stonecross-south',
        name: 'Back to Cave 1',
        kind: 'exit',
        x: 15,
        y: 19,
        toMapId: 'cave1',
        toX: 16,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'stonecross-heal-door',
        name: 'Stonecross Heal House',
        kind: 'door',
        x: 8,
        y: 10,
        toMapId: 'stonecrossHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'stonecross-trial-door',
        name: 'Stonecross Trial Hall',
        kind: 'door',
        x: 22,
        y: 10,
        toMapId: 'stonecrossTrial',
        toX: 7,
        toY: 8,
        toFacing: 'up'
      },
      {
        id: 'stonecross-north',
        name: 'To Route 3',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'route3',
        toX: 20,
        toY: 18,
        toFacing: 'up',
        requiredFlag: 'trial3Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  stonecrossHealHouse: {
    mapId: 'stonecrossHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-stonecross')],
    exits: [
      {
        id: 'stonecross-heal-exit',
        name: 'Stonecross Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'stonecrossTown',
        toX: 8,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  stonecrossTrial: {
    mapId: 'stonecrossTrial',
    width: 14,
    height: 10,
    spawn: { x: 7, y: 8, facing: 'up' },
    encounter: null,
    tiles: buildTrialHallTiles(),
    blockedGates: [],
    npcs: [
      createTrialMasterNpc({
        id: 'trial-master-garn',
        name: 'Trial Master Garn',
        trainerId: 'trial_master_stone',
        trialFlag: 'trial3Complete',
        preBattleLine: 'Weight your choices. Every hit should mean something.',
        postBattleLines: ['Trial 3 complete. Accept the Stone Sigil.'],
        repeatLine: 'Your Stone Sigil already proves this trial.'
      })
    ],
    exits: [
      {
        id: 'stonecross-trial-exit',
        name: 'Trial Hall Exit',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'stonecrossTown',
        toX: 22,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  route3: {
    mapId: 'route3',
    width: 40,
    height: 20,
    spawn: { x: 20, y: 18, facing: 'up' },
    encounter: encounter(15, 20, COIL_TABLE, 0.11),
    tiles: buildRouteTiles({
      width: 40,
      height: 20,
      centerPathX: 20,
      horizontalPaths: [
        { x: 5, y: 6, width: 30, height: 1 },
        { x: 8, y: 12, width: 24, height: 1 }
      ],
      waterPatches: [
        { x: 2, y: 2, width: 8, height: 3 },
        { x: 29, y: 14, width: 8, height: 3 }
      ],
      wallPatches: [
        { x: 12, y: 9, width: 5, height: 2 },
        { x: 23, y: 9, width: 5, height: 2 }
      ],
      topGateX: 20,
      bottomGateX: 20
    }),
    blockedGates: [],
    npcs: [
      {
        id: 'spark-rider-lux',
        name: 'Spark Rider Lux',
        x: 24,
        y: 6,
        color: 0xbf9bff,
        lines: ['Coilhaven sits beyond this route. Keep momentum.']
      }
    ],
    exits: [
      {
        id: 'route3-south',
        name: 'Back to Stonecross',
        kind: 'exit',
        x: 20,
        y: 19,
        toMapId: 'stonecrossTown',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'route3-north',
        name: 'To Coilhaven Town',
        kind: 'exit',
        x: 20,
        y: 0,
        toMapId: 'coilhavenTown',
        toX: 15,
        toY: 18,
        toFacing: 'up'
      }
    ]
  },
  coilhavenTown: {
    mapId: 'coilhavenTown',
    width: 30,
    height: 20,
    spawn: { x: 15, y: 18, facing: 'up' },
    encounter: null,
    tiles: coilhavenTownTiles,
    blockedGates: [
      {
        id: 'coilhaven-north-gate-block',
        name: 'Coilhaven North Gate',
        x: 15,
        y: 0,
        requiredFlag: 'trial4Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'engineer-vira',
        name: 'Engineer Vira',
        x: 12,
        y: 12,
        color: 0xb9a6ff,
        lines: ['Trial 4 tests control under pressure.']
      },
      {
        id: 'tech-korin',
        name: 'Tech Korin',
        x: 18,
        y: 12,
        color: 0x8fd7ff,
        lines: ['Marsh routes stay sealed without this trial.']
      }
    ],
    exits: [
      {
        id: 'coilhaven-south',
        name: 'Back to Route 3',
        kind: 'exit',
        x: 15,
        y: 19,
        toMapId: 'route3',
        toX: 20,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'coilhaven-heal-door',
        name: 'Coilhaven Heal House',
        kind: 'door',
        x: 8,
        y: 11,
        toMapId: 'coilhavenHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'coilhaven-trial-door',
        name: 'Coilhaven Trial Hall',
        kind: 'door',
        x: 22,
        y: 11,
        toMapId: 'coilhavenTrial',
        toX: 7,
        toY: 8,
        toFacing: 'up'
      },
      {
        id: 'coilhaven-north',
        name: 'To Marsh 1',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'marsh1',
        toX: 16,
        toY: 16,
        toFacing: 'up',
        requiredFlag: 'trial4Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  coilhavenHealHouse: {
    mapId: 'coilhavenHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-coilhaven')],
    exits: [
      {
        id: 'coilhaven-heal-exit',
        name: 'Coilhaven Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'coilhavenTown',
        toX: 8,
        toY: 12,
        toFacing: 'down'
      }
    ]
  },
  coilhavenTrial: {
    mapId: 'coilhavenTrial',
    width: 14,
    height: 10,
    spawn: { x: 7, y: 8, facing: 'up' },
    encounter: null,
    tiles: buildTrialHallTiles(),
    blockedGates: [],
    npcs: [
      createTrialMasterNpc({
        id: 'trial-master-voltis',
        name: 'Trial Master Voltis',
        trainerId: 'trial_master_coil',
        trialFlag: 'trial4Complete',
        preBattleLine: 'Precision before speed. Then strike.',
        postBattleLines: ['Trial 4 complete. You earned the Coil Sigil.'],
        repeatLine: 'You already passed this trial.'
      })
    ],
    exits: [
      {
        id: 'coilhaven-trial-exit',
        name: 'Trial Hall Exit',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'coilhavenTown',
        toX: 22,
        toY: 12,
        toFacing: 'down'
      }
    ]
  },
  marsh1: {
    mapId: 'marsh1',
    width: 32,
    height: 18,
    spawn: { x: 16, y: 16, facing: 'up' },
    encounter: encounter(18, 22, MARSH_TABLE, 0.12, MARSH1_ULTRA_RARE_TABLE, 0.02),
    tiles: buildMarshTiles(),
    blockedGates: [],
    npcs: [
      {
        id: 'marsh-guide-quill',
        name: 'Guide Quill',
        x: 13,
        y: 15,
        color: 0xa6d68f,
        lines: ['Hollowmere lies ahead. Keep antidotes ready.']
      },
      {
        id: 'postgame-boss-marsh',
        name: 'Bog Empress Nym',
        x: 19,
        y: 9,
        color: 0xd1b6ff,
        requiresFlag: 'postgameUnlocked',
        hiddenIfFlag: 'postgameBossMarshDefeated',
        lines: ['Only postgame tamers can weather this mire.'],
        trainer: {
          trainerId: 'postgame_boss_marsh',
          defeatFlag: 'postgameBossMarshDefeated',
          preBattleLine: 'The marsh crown does not yield easily.',
          postBattleLines: ['You endure the mire. The marsh rare line now answers your call.'],
          repeatLine: 'The swamp already knows your strength.'
        }
      }
    ],
    exits: [
      {
        id: 'marsh1-south',
        name: 'Back to Coilhaven',
        kind: 'exit',
        x: 16,
        y: 17,
        toMapId: 'coilhavenTown',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'marsh1-north',
        name: 'To Hollowmere Town',
        kind: 'exit',
        x: 16,
        y: 0,
        toMapId: 'hollowmereTown',
        toX: 15,
        toY: 18,
        toFacing: 'up'
      }
    ]
  }
} as const satisfies Partial<Record<MapId, MapDefinition>>;

const REGION_THREE_MAPS = {
  hollowmereTown: {
    mapId: 'hollowmereTown',
    width: 30,
    height: 20,
    spawn: { x: 15, y: 18, facing: 'up' },
    encounter: null,
    tiles: hollowmereTownTiles,
    blockedGates: [
      {
        id: 'hollowmere-north-gate-block',
        name: 'Hollowmere North Gate',
        x: 15,
        y: 0,
        requiredFlag: 'trial5Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'warden-noct',
        name: 'Warden Noct',
        x: 12,
        y: 12,
        color: 0xc3a6ff,
        lines: ['The marsh trial tests discipline under pressure.']
      },
      {
        id: 'nurse-sil',
        name: 'Nurse Sil',
        x: 18,
        y: 12,
        color: 0xa9dbff,
        lines: ['Heal before crossing to the forge lands.']
      }
    ],
    exits: [
      {
        id: 'hollowmere-south',
        name: 'Back to Marsh 1',
        kind: 'exit',
        x: 15,
        y: 19,
        toMapId: 'marsh1',
        toX: 16,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'hollowmere-heal-door',
        name: 'Hollowmere Heal House',
        kind: 'door',
        x: 8,
        y: 10,
        toMapId: 'hollowmereHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'hollowmere-trial-door',
        name: 'Hollowmere Trial Hall',
        kind: 'door',
        x: 22,
        y: 11,
        toMapId: 'hollowmereTrial',
        toX: 7,
        toY: 8,
        toFacing: 'up'
      },
      {
        id: 'hollowmere-north',
        name: 'To Route 4',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'route4',
        toX: 20,
        toY: 18,
        toFacing: 'up',
        requiredFlag: 'trial5Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  hollowmereHealHouse: {
    mapId: 'hollowmereHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-hollowmere')],
    exits: [
      {
        id: 'hollowmere-heal-exit',
        name: 'Hollowmere Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'hollowmereTown',
        toX: 8,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  hollowmereTrial: {
    mapId: 'hollowmereTrial',
    width: 14,
    height: 10,
    spawn: { x: 7, y: 8, facing: 'up' },
    encounter: null,
    tiles: buildTrialHallTiles(),
    blockedGates: [],
    npcs: [
      createTrialMasterNpc({
        id: 'trial-master-mire',
        name: 'Trial Master Mire',
        trainerId: 'trial_master_hollow',
        trialFlag: 'trial5Complete',
        preBattleLine: 'Endure the pressure and stay sharp.',
        postBattleLines: ['Trial 5 complete. Receive the Hollow Sigil.'],
        repeatLine: 'You already earned this sigil.'
      })
    ],
    exits: [
      {
        id: 'hollowmere-trial-exit',
        name: 'Trial Hall Exit',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'hollowmereTown',
        toX: 22,
        toY: 12,
        toFacing: 'down'
      }
    ]
  },
  route4: {
    mapId: 'route4',
    width: 40,
    height: 20,
    spawn: { x: 20, y: 18, facing: 'up' },
    encounter: encounter(24, 30, FORGE_TABLE, 0.12, ROUTE4_ULTRA_RARE_TABLE, 0.015),
    tiles: buildRouteTiles({
      width: 40,
      height: 20,
      centerPathX: 20,
      horizontalPaths: [
        { x: 4, y: 5, width: 32, height: 1 },
        { x: 6, y: 13, width: 29, height: 1 }
      ],
      waterPatches: [
        { x: 3, y: 15, width: 10, height: 3 },
        { x: 28, y: 2, width: 9, height: 3 }
      ],
      wallPatches: [
        { x: 14, y: 8, width: 5, height: 2 },
        { x: 22, y: 9, width: 5, height: 2 }
      ],
      topGateX: 20,
      bottomGateX: 20
    }),
    blockedGates: [],
    npcs: [
      {
        id: 'forge-runner-prax',
        name: 'Runner Prax',
        x: 24,
        y: 5,
        color: 0xd7c29b,
        lines: ['Obsidian Forge is ahead. Their trial is brutal.']
      }
    ],
    exits: [
      {
        id: 'route4-south',
        name: 'Back to Hollowmere',
        kind: 'exit',
        x: 20,
        y: 19,
        toMapId: 'hollowmereTown',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'route4-north',
        name: 'To Obsidian Forge',
        kind: 'exit',
        x: 20,
        y: 0,
        toMapId: 'obsidianForgeTown',
        toX: 15,
        toY: 18,
        toFacing: 'up'
      }
    ]
  },
  obsidianForgeTown: {
    mapId: 'obsidianForgeTown',
    width: 30,
    height: 20,
    spawn: { x: 15, y: 18, facing: 'up' },
    encounter: null,
    tiles: obsidianTownTiles,
    blockedGates: [
      {
        id: 'obsidian-north-gate-block',
        name: 'Obsidian Forge North Gate',
        x: 15,
        y: 0,
        requiredFlag: 'trial6Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'smith-varda',
        name: 'Smith Varda',
        x: 12,
        y: 12,
        color: 0xd8c29c,
        lines: ['Trial 6 tempers skill in relentless battles.']
      },
      {
        id: 'keeper-ashen',
        name: 'Keeper Ashen',
        x: 18,
        y: 12,
        color: 0xa9c4dc,
        lines: ['The sky bridge opens only to sigil bearers.']
      }
    ],
    exits: [
      {
        id: 'obsidian-south',
        name: 'Back to Route 4',
        kind: 'exit',
        x: 15,
        y: 19,
        toMapId: 'route4',
        toX: 20,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'obsidian-heal-door',
        name: 'Obsidian Heal House',
        kind: 'door',
        x: 8,
        y: 10,
        toMapId: 'obsidianForgeHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'obsidian-trial-door',
        name: 'Obsidian Trial Hall',
        kind: 'door',
        x: 22,
        y: 10,
        toMapId: 'obsidianTrial',
        toX: 7,
        toY: 8,
        toFacing: 'up'
      },
      {
        id: 'obsidian-north',
        name: 'To Bridge 1',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'bridge1',
        toX: 17,
        toY: 12,
        toFacing: 'up',
        requiredFlag: 'trial6Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  obsidianForgeHealHouse: {
    mapId: 'obsidianForgeHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-obsidian')],
    exits: [
      {
        id: 'obsidian-heal-exit',
        name: 'Obsidian Forge Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'obsidianForgeTown',
        toX: 8,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  obsidianTrial: {
    mapId: 'obsidianTrial',
    width: 14,
    height: 10,
    spawn: { x: 7, y: 8, facing: 'up' },
    encounter: null,
    tiles: buildTrialHallTiles(),
    blockedGates: [],
    npcs: [
      createTrialMasterNpc({
        id: 'trial-master-brack',
        name: 'Trial Master Brack',
        trainerId: 'trial_master_obsidian',
        trialFlag: 'trial6Complete',
        preBattleLine: 'Your line breaks here if your will does.',
        postBattleLines: ['Trial 6 complete. Take the Forge Sigil.'],
        repeatLine: 'The Forge Sigil is already yours.'
      })
    ],
    exits: [
      {
        id: 'obsidian-trial-exit',
        name: 'Trial Hall Exit',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'obsidianForgeTown',
        toX: 22,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  bridge1: {
    mapId: 'bridge1',
    width: 34,
    height: 14,
    spawn: { x: 17, y: 12, facing: 'up' },
    encounter: encounter(30, 36, SKY_TABLE, 0.08, BRIDGE1_ULTRA_RARE_TABLE, 0.015),
    tiles: buildBridgeTiles(),
    blockedGates: [],
    npcs: [
      {
        id: 'bridge-warden-lyne',
        name: 'Warden Lyne',
        x: 17,
        y: 6,
        color: 0xb9d3ff,
        lines: ['Skydrift Spires are just ahead.']
      }
    ],
    exits: [
      {
        id: 'bridge1-south',
        name: 'Back to Obsidian Forge',
        kind: 'exit',
        x: 17,
        y: 13,
        toMapId: 'obsidianForgeTown',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'bridge1-north',
        name: 'To Skydrift Spires',
        kind: 'exit',
        x: 17,
        y: 0,
        toMapId: 'skydriftSpiresTown',
        toX: 15,
        toY: 18,
        toFacing: 'up'
      }
    ]
  },
  skydriftSpiresTown: {
    mapId: 'skydriftSpiresTown',
    width: 30,
    height: 20,
    spawn: { x: 15, y: 18, facing: 'up' },
    encounter: null,
    tiles: skydriftTownTiles,
    blockedGates: [
      {
        id: 'skydrift-north-gate-block',
        name: 'Skydrift North Gate',
        x: 15,
        y: 0,
        requiredFlag: 'trial7Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'seer-ela',
        name: 'Seer Ela',
        x: 12,
        y: 12,
        color: 0xb6d8ff,
        lines: ['Choirfall will open only after this trial.']
      },
      {
        id: 'captain-rai',
        name: 'Captain Rai',
        x: 18,
        y: 12,
        color: 0x9fc7ff,
        lines: ['Beyond Choirfall stands the Final Tower.']
      }
    ],
    exits: [
      {
        id: 'skydrift-south',
        name: 'Back to Bridge 1',
        kind: 'exit',
        x: 15,
        y: 19,
        toMapId: 'bridge1',
        toX: 17,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'skydrift-heal-door',
        name: 'Skydrift Heal House',
        kind: 'door',
        x: 8,
        y: 11,
        toMapId: 'skydriftHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'skydrift-trial-door',
        name: 'Skydrift Trial Hall',
        kind: 'door',
        x: 22,
        y: 11,
        toMapId: 'skydriftTrial',
        toX: 7,
        toY: 8,
        toFacing: 'up'
      },
      {
        id: 'skydrift-north',
        name: 'To Choirfall Ruins',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'choirfallRuins',
        toX: 15,
        toY: 16,
        toFacing: 'up',
        requiredFlag: 'trial7Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  skydriftHealHouse: {
    mapId: 'skydriftHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-skydrift')],
    exits: [
      {
        id: 'skydrift-heal-exit',
        name: 'Skydrift Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'skydriftSpiresTown',
        toX: 8,
        toY: 12,
        toFacing: 'down'
      }
    ]
  },
  skydriftTrial: {
    mapId: 'skydriftTrial',
    width: 14,
    height: 10,
    spawn: { x: 7, y: 8, facing: 'up' },
    encounter: null,
    tiles: buildTrialHallTiles(),
    blockedGates: [],
    npcs: [
      createTrialMasterNpc({
        id: 'trial-master-aeris',
        name: 'Trial Master Aeris',
        trainerId: 'trial_master_skydrift',
        trialFlag: 'trial7Complete',
        preBattleLine: 'Balance speed and precision. One mistake ends the climb.',
        postBattleLines: ['Trial 7 complete. You gained the Sky Sigil.'],
        repeatLine: 'You already climbed past this trial.'
      })
    ],
    exits: [
      {
        id: 'skydrift-trial-exit',
        name: 'Trial Hall Exit',
        kind: 'door',
        x: 7,
        y: 9,
        toMapId: 'skydriftSpiresTown',
        toX: 22,
        toY: 12,
        toFacing: 'down'
      }
    ]
  },
  choirfallRuins: {
    mapId: 'choirfallRuins',
    width: 30,
    height: 18,
    spawn: { x: 15, y: 16, facing: 'up' },
    encounter: encounter(36, 40, CHOIR_TABLE, 0.1, CHOIR_ULTRA_RARE_TABLE, 0.015),
    tiles: choirfallTiles,
    blockedGates: [
      {
        id: 'choirfall-north-gate-block',
        name: 'Final Tower Seal',
        x: 15,
        y: 0,
        requiredFlag: 'trial7Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ],
    npcs: [
      {
        id: 'ruins-guide-omia',
        name: 'Guide Omia',
        x: 12,
        y: 11,
        color: 0xcad5e8,
        lines: ['Only seven-sigil tamers may challenge the Final Tower.']
      },
      {
        id: 'watcher-rune',
        name: 'Watcher Rune',
        x: 18,
        y: 11,
        color: 0xa7b6cb,
        lines: ['Two guardians wait inside before the final master.']
      }
    ],
    exits: [
      {
        id: 'choirfall-south',
        name: 'Back to Skydrift',
        kind: 'exit',
        x: 15,
        y: 17,
        toMapId: 'skydriftSpiresTown',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      },
      {
        id: 'choirfall-heal-door',
        name: 'Choirfall Heal House',
        kind: 'door',
        x: 7,
        y: 10,
        toMapId: 'choirfallHealHouse',
        toX: 5,
        toY: 6,
        toFacing: 'up'
      },
      {
        id: 'choirfall-north',
        name: 'To Final Tower',
        kind: 'exit',
        x: 15,
        y: 0,
        toMapId: 'finalTower',
        toX: 12,
        toY: 15,
        toFacing: 'up',
        requiredFlag: 'trial7Complete',
        blockedMessage: 'A strange seal blocks the path...'
      }
    ]
  },
  choirfallHealHouse: {
    mapId: 'choirfallHealHouse',
    width: 10,
    height: 8,
    spawn: { x: 5, y: 6, facing: 'down' },
    encounter: null,
    healOnEnter: true,
    tiles: buildHealHouseTiles(),
    blockedGates: [],
    npcs: [createTerminalNpc('bindery-terminal-choirfall')],
    exits: [
      {
        id: 'choirfall-heal-exit',
        name: 'Choirfall Exit',
        kind: 'door',
        x: 5,
        y: 7,
        toMapId: 'choirfallRuins',
        toX: 7,
        toY: 11,
        toFacing: 'down'
      }
    ]
  },
  finalTower: {
    mapId: 'finalTower',
    width: 24,
    height: 18,
    spawn: { x: 12, y: 15, facing: 'up' },
    encounter: encounter(40, 45, FINAL_TABLE, 0.07, FINAL_ULTRA_RARE_TABLE, 0.02),
    tiles: buildFinalTowerTiles(),
    blockedGates: [],
    npcs: [
      {
        id: 'tower-warden-astra',
        name: 'Warden Astra',
        x: 9,
        y: 11,
        color: 0xc2d7ff,
        lines: ['No one reaches the summit without clearing us.'],
        trainer: {
          trainerId: 'tower_warden_astra',
          defeatFlag: 'towerWardenAstraDefeated',
          preBattleLine: 'First gate battle. Show your resolve.',
          postBattleLines: ['Proceed. Morrow waits ahead.'],
          repeatLine: 'I already tested your resolve.'
        }
      },
      {
        id: 'tower-warden-morrow',
        name: 'Warden Morrow',
        x: 15,
        y: 8,
        color: 0xbfa4d8,
        lines: ['One more test before the summit.'],
        trainer: {
          trainerId: 'tower_warden_morrow',
          defeatFlag: 'towerWardenMorrowDefeated',
          preBattleLine: 'Second gate battle. Hold your formation.',
          postBattleLines: ['The summit opens. Face the final master.'],
          repeatLine: 'You already passed my gate.'
        }
      },
      createTrialMasterNpc({
        id: 'trial-master-zenith',
        name: 'Final Master Zenith',
        trainerId: 'trial_master_final',
        trialFlag: 'trial8Complete',
        x: 12,
        y: 3,
        preBattleLine: 'Eight trials end here. Show me your full command.',
        postBattleLines: ['You have conquered the Final Tower.'],
        repeatLine: 'Your victory already echoes through the tower.',
        color: 0xf4e6aa
      }),
      {
        id: 'postgame-boss-tower',
        name: 'Echo Sovereign Rael',
        x: 12,
        y: 6,
        color: 0xffd9a3,
        requiresFlag: 'postgameUnlocked',
        hiddenIfFlag: 'postgameBossTowerDefeated',
        lines: ['The true summit duel begins now.'],
        trainer: {
          trainerId: 'postgame_boss_tower',
          defeatFlag: 'postgameBossTowerDefeated',
          preBattleLine: 'Show me your final postgame formation.',
          postBattleLines: ['A final rare seal breaks across the tower heights.'],
          repeatLine: 'You already mastered this rematch.'
        }
      }
    ],
    exits: [
      {
        id: 'finaltower-south',
        name: 'Back to Choirfall',
        kind: 'exit',
        x: 12,
        y: 17,
        toMapId: 'choirfallRuins',
        toX: 15,
        toY: 1,
        toFacing: 'down'
      }
    ]
  }
} as const satisfies Partial<Record<MapId, MapDefinition>>;

export const MAP_DEFINITIONS: Record<MapId, MapDefinition> = {
  ...CORE_WORLD_MAPS,
  ...MID_WORLD_MAPS,
  ...REGION_TWO_MAPS,
  ...REGION_THREE_MAPS
} as Record<MapId, MapDefinition>;

export const TOWN_WARP_MAPS: MapId[] = [
  'starterTown',
  'verdantisTown',
  'brinegateTown',
  'stonecrossTown',
  'coilhavenTown',
  'hollowmereTown',
  'obsidianForgeTown',
  'skydriftSpiresTown',
  'choirfallRuins',
  'finalTower'
];
