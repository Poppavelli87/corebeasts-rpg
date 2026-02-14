import type { BattleType } from '../systems/TypeChart';

export type StatusEffect = {
  kind: 'atk_up' | 'def_up';
  stages: number;
  target: 'self' | 'opponent';
};

export type MoveDefinition = {
  id: string;
  name: string;
  type: BattleType;
  power: number;
  statusEffect?: StatusEffect;
};

export const MOVE_DEFINITIONS = {
  cinderJab: {
    id: 'cinderJab',
    name: 'Cinder Jab',
    type: 'Ember',
    power: 26
  },
  magmaBurst: {
    id: 'magmaBurst',
    name: 'Magma Burst',
    type: 'Ember',
    power: 34
  },
  infernoRush: {
    id: 'infernoRush',
    name: 'Inferno Rush',
    type: 'Ember',
    power: 38
  },
  emberClaw: {
    id: 'emberClaw',
    name: 'Ember Claw',
    type: 'Ember',
    power: 31
  },
  ashSpiral: {
    id: 'ashSpiral',
    name: 'Ash Spiral',
    type: 'Ember',
    power: 37
  },
  solarKick: {
    id: 'solarKick',
    name: 'Solar Kick',
    type: 'Ember',
    power: 40
  },
  flameWard: {
    id: 'flameWard',
    name: 'Flame Ward',
    type: 'Ember',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  },
  pyreFocus: {
    id: 'pyreFocus',
    name: 'Pyre Focus',
    type: 'Ember',
    power: 0,
    statusEffect: {
      kind: 'atk_up',
      stages: 1,
      target: 'self'
    }
  },
  splashKick: {
    id: 'splashKick',
    name: 'Splash Kick',
    type: 'Tide',
    power: 24
  },
  tidalCrush: {
    id: 'tidalCrush',
    name: 'Tidal Crush',
    type: 'Tide',
    power: 33
  },
  currentBite: {
    id: 'currentBite',
    name: 'Current Bite',
    type: 'Tide',
    power: 30
  },
  brineLance: {
    id: 'brineLance',
    name: 'Brine Lance',
    type: 'Tide',
    power: 36
  },
  riptideSnap: {
    id: 'riptideSnap',
    name: 'Riptide Snap',
    type: 'Tide',
    power: 39
  },
  foamRush: {
    id: 'foamRush',
    name: 'Foam Rush',
    type: 'Tide',
    power: 28
  },
  mistGuard: {
    id: 'mistGuard',
    name: 'Mist Guard',
    type: 'Tide',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  },
  surgeHowl: {
    id: 'surgeHowl',
    name: 'Surge Howl',
    type: 'Tide',
    power: 0,
    statusEffect: {
      kind: 'atk_up',
      stages: 1,
      target: 'self'
    }
  },
  petalSlash: {
    id: 'petalSlash',
    name: 'Petal Slash',
    type: 'Bloom',
    power: 25
  },
  briarLash: {
    id: 'briarLash',
    name: 'Briar Lash',
    type: 'Bloom',
    power: 31
  },
  vineCrash: {
    id: 'vineCrash',
    name: 'Vine Crash',
    type: 'Bloom',
    power: 36
  },
  pollenDart: {
    id: 'pollenDart',
    name: 'Pollen Dart',
    type: 'Bloom',
    power: 29
  },
  sunblossom: {
    id: 'sunblossom',
    name: 'Sun Blossom',
    type: 'Bloom',
    power: 40
  },
  photosynthPulse: {
    id: 'photosynthPulse',
    name: 'Photosynth Pulse',
    type: 'Bloom',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  },
  seedFocus: {
    id: 'seedFocus',
    name: 'Seed Focus',
    type: 'Bloom',
    power: 0,
    statusEffect: {
      kind: 'atk_up',
      stages: 1,
      target: 'self'
    }
  },
  thicketWall: {
    id: 'thicketWall',
    name: 'Thicket Wall',
    type: 'Bloom',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  },
  sparkShot: {
    id: 'sparkShot',
    name: 'Spark Shot',
    type: 'Volt',
    power: 26
  },
  staticClaw: {
    id: 'staticClaw',
    name: 'Static Claw',
    type: 'Volt',
    power: 30
  },
  voltDash: {
    id: 'voltDash',
    name: 'Volt Dash',
    type: 'Volt',
    power: 35
  },
  arcBurst: {
    id: 'arcBurst',
    name: 'Arc Burst',
    type: 'Volt',
    power: 38
  },
  ionPulse: {
    id: 'ionPulse',
    name: 'Ion Pulse',
    type: 'Volt',
    power: 33
  },
  tempestCall: {
    id: 'tempestCall',
    name: 'Tempest Call',
    type: 'Volt',
    power: 40
  },
  focusRoar: {
    id: 'focusRoar',
    name: 'Focus Roar',
    type: 'Volt',
    power: 0,
    statusEffect: {
      kind: 'atk_up',
      stages: 1,
      target: 'self'
    }
  },
  shockGuard: {
    id: 'shockGuard',
    name: 'Shock Guard',
    type: 'Volt',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  },
  shaleSlam: {
    id: 'shaleSlam',
    name: 'Shale Slam',
    type: 'Stone',
    power: 29
  },
  quarryBreak: {
    id: 'quarryBreak',
    name: 'Quarry Break',
    type: 'Stone',
    power: 35
  },
  oreSpike: {
    id: 'oreSpike',
    name: 'Ore Spike',
    type: 'Stone',
    power: 32
  },
  basaltCrush: {
    id: 'basaltCrush',
    name: 'Basalt Crush',
    type: 'Stone',
    power: 37
  },
  tectoCharge: {
    id: 'tectoCharge',
    name: 'Tecto Charge',
    type: 'Stone',
    power: 40
  },
  ironBark: {
    id: 'ironBark',
    name: 'Iron Bark',
    type: 'Stone',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  },
  gritFocus: {
    id: 'gritFocus',
    name: 'Grit Focus',
    type: 'Stone',
    power: 0,
    statusEffect: {
      kind: 'atk_up',
      stages: 1,
      target: 'self'
    }
  },
  sandGuard: {
    id: 'sandGuard',
    name: 'Sand Guard',
    type: 'Stone',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  },
  duskCut: {
    id: 'duskCut',
    name: 'Dusk Cut',
    type: 'Shade',
    power: 28
  },
  nightRake: {
    id: 'nightRake',
    name: 'Night Rake',
    type: 'Shade',
    power: 34
  },
  veilStrike: {
    id: 'veilStrike',
    name: 'Veil Strike',
    type: 'Shade',
    power: 30
  },
  gloomPierce: {
    id: 'gloomPierce',
    name: 'Gloom Pierce',
    type: 'Shade',
    power: 36
  },
  shadowPounce: {
    id: 'shadowPounce',
    name: 'Shadow Pounce',
    type: 'Shade',
    power: 39
  },
  eclipseFang: {
    id: 'eclipseFang',
    name: 'Eclipse Fang',
    type: 'Shade',
    power: 40
  },
  voidGlare: {
    id: 'voidGlare',
    name: 'Void Glare',
    type: 'Shade',
    power: 0,
    statusEffect: {
      kind: 'atk_up',
      stages: 1,
      target: 'self'
    }
  },
  mistVeil: {
    id: 'mistVeil',
    name: 'Mist Veil',
    type: 'Shade',
    power: 0,
    statusEffect: {
      kind: 'def_up',
      stages: 1,
      target: 'self'
    }
  }
} as const satisfies Record<string, MoveDefinition>;

export type MoveId = keyof typeof MOVE_DEFINITIONS;

export const getMoveDefinition = (moveId: MoveId): MoveDefinition => MOVE_DEFINITIONS[moveId];
