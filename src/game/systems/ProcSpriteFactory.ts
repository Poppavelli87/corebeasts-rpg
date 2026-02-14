import Phaser from 'phaser';
import { CREATURE_IDS, getCreatureDefinition, type CreatureId } from '../data/creatures';
import type { BattleType } from './TypeChart';

type SpriteVariant = 'front' | 'back' | 'overworld';
type Archetype = 'BIPED' | 'QUADRUPED' | 'WINGED' | 'SERPENT' | 'SHELLED' | 'GOLEM';
type AddOn = 'horns' | 'ears' | 'tail' | 'fins' | 'claws' | 'crest' | 'beak';

type Palette = {
  outline: number;
  shadow: number;
  base: number;
  accent: number;
  iconBase: number;
  iconAccent: number;
};

type PixelPoint = {
  x: number;
  y: number;
};

type Anchors = {
  headTop: number;
  headMid: number;
  bodyMid: number;
  bodyBottom: number;
  footY: number;
};

type CreatureDesign = {
  archetype: Archetype;
  addOns: AddOn[];
  lean: -1 | 1;
  tailStyle: 0 | 1 | 2;
};

type BattleBlueprint = {
  mask: Uint8Array;
  featureMask: Uint8Array;
  anchors: Anchors;
  eyes: [PixelPoint, PixelPoint];
  mouth: PixelPoint;
};

const FRONT_SIZE = 32;
const OVERWORLD_SIZE = 16;
const DEBUG_SHEET_NAME = '__cb_proc_debug_sheet__';

const ARCHETYPES: Archetype[] = ['BIPED', 'QUADRUPED', 'WINGED', 'SERPENT', 'SHELLED', 'GOLEM'];
const ADD_ONS: AddOn[] = ['horns', 'ears', 'tail', 'fins', 'claws', 'crest', 'beak'];

const ARCHETYPE_PREFS: Record<Archetype, AddOn[]> = {
  BIPED: ['horns', 'ears', 'claws'],
  QUADRUPED: ['tail', 'claws', 'ears'],
  WINGED: ['beak', 'crest', 'fins'],
  SERPENT: ['crest', 'tail', 'fins'],
  SHELLED: ['tail', 'claws', 'crest'],
  GOLEM: ['horns', 'claws', 'crest']
};

const TYPE_PALETTES: Record<BattleType, Palette> = {
  Ember: {
    outline: 0x2b120a,
    shadow: 0x7f2d18,
    base: 0xd65a2f,
    accent: 0xffb45a,
    iconBase: 0xc54f29,
    iconAccent: 0xffb95f
  },
  Tide: {
    outline: 0x0f1e3d,
    shadow: 0x214f95,
    base: 0x2f78cf,
    accent: 0x6de8f5,
    iconBase: 0x296dc1,
    iconAccent: 0x74e9ff
  },
  Bloom: {
    outline: 0x1b2f11,
    shadow: 0x3f7a2a,
    base: 0x5dae45,
    accent: 0xe3ed6e,
    iconBase: 0x53a440,
    iconAccent: 0xe9f27c
  },
  Volt: {
    outline: 0x21133a,
    shadow: 0x4f2e98,
    base: 0x6a45bf,
    accent: 0x63d5ff,
    iconBase: 0x5f3cb2,
    iconAccent: 0x6bd9ff
  },
  Stone: {
    outline: 0x2c2520,
    shadow: 0x655444,
    base: 0x897563,
    accent: 0xc9b08f,
    iconBase: 0x7d6b5b,
    iconAccent: 0xd3bb98
  },
  Shade: {
    outline: 0x120c1b,
    shadow: 0x2a2040,
    base: 0x3a2d57,
    accent: 0x9bf7ff,
    iconBase: 0x32264b,
    iconAccent: 0x92f2ff
  }
};

const toRgb = (color: number): [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff
];

const darken = (color: number, percent: number): number => {
  const [red, green, blue] = toRgb(color);
  const scale = (channel: number): number => Math.max(0, Math.floor(channel * (1 - percent / 100)));

  return (scale(red) << 16) | (scale(green) << 8) | scale(blue);
};

const hashString = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const createMask = (size: number): Uint8Array => new Uint8Array(size * size);

const indexFor = (size: number, x: number, y: number): number => y * size + x;

const inBounds = (size: number, x: number, y: number): boolean =>
  x >= 0 && x < size && y >= 0 && y < size;

const setPixel = (mask: Uint8Array, size: number, x: number, y: number, value: number): void => {
  if (!inBounds(size, x, y)) {
    return;
  }

  mask[indexFor(size, x, y)] = value;
};

const getPixel = (mask: Uint8Array, size: number, x: number, y: number): number => {
  if (!inBounds(size, x, y)) {
    return 0;
  }

  return mask[indexFor(size, x, y)];
};

const setMirrored = (
  mask: Uint8Array,
  size: number,
  offsetFromCenter: number,
  y: number,
  value: number,
  shift = 0
): void => {
  const leftCenter = size / 2 - 1;
  const leftX = leftCenter - offsetFromCenter + shift;
  const rightX = leftCenter + 1 + offsetFromCenter + shift;

  setPixel(mask, size, leftX, y, value);
  setPixel(mask, size, rightX, y, value);
};

const fillSymOffsets = (
  mask: Uint8Array,
  size: number,
  y: number,
  minOffset: number,
  maxOffset: number,
  value: number,
  shift = 0
): void => {
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    setMirrored(mask, size, offset, y, value, shift);
  }
};

const paintSymOval = (
  mask: Uint8Array,
  size: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  shiftFn?: (y: number) => number
): void => {
  const yMin = Math.max(0, Math.floor(centerY - radiusY));
  const yMax = Math.min(size - 1, Math.ceil(centerY + radiusY));

  for (let y = yMin; y <= yMax; y += 1) {
    const normalizedY = (y - centerY) / radiusY;
    if (Math.abs(normalizedY) > 1) {
      continue;
    }

    const rowRadius = Math.floor(radiusX * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY)));
    const shift = shiftFn ? shiftFn(y) : 0;
    fillSymOffsets(mask, size, y, 0, rowRadius, 1, shift);
  }
};

const createOutlineMask = (mask: Uint8Array, size: number): Uint8Array => {
  const outlineMask = createMask(size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (getPixel(mask, size, x, y) !== 1) {
        continue;
      }

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const targetX = x + dx;
          const targetY = y + dy;
          if (!inBounds(size, targetX, targetY)) {
            continue;
          }

          if (getPixel(mask, size, targetX, targetY) === 0) {
            setPixel(outlineMask, size, targetX, targetY, 1);
          }
        }
      }
    }
  }

  return outlineMask;
};

const chooseDistinct = <T>(rng: () => number, pool: T[], count: number): T[] => {
  const picked: T[] = [];
  const available = [...pool];

  while (picked.length < count && available.length > 0) {
    const index = Math.floor(rng() * available.length);
    const [choice] = available.splice(index, 1);
    picked.push(choice);
  }

  return picked;
};

const createCreatureDesign = (creatureId: CreatureId): CreatureDesign => {
  const rng = mulberry32(hashString(`${creatureId}:design`));
  const archetype = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const preferred = ARCHETYPE_PREFS[archetype];
  const firstFeature = preferred[Math.floor(rng() * preferred.length)];

  const desiredCount = 2 + Math.floor(rng() * 2);
  const remainingPool = ADD_ONS.filter((addOn) => addOn !== firstFeature);
  const addOns = [firstFeature, ...chooseDistinct(rng, remainingPool, desiredCount - 1)];

  return {
    archetype,
    addOns,
    lean: rng() < 0.5 ? -1 : 1,
    tailStyle: Math.floor(rng() * 3) as 0 | 1 | 2
  };
};

const buildBaseArchetype = (
  size: number,
  archetype: Archetype,
  rng: () => number
): { mask: Uint8Array; anchors: Anchors } => {
  const mask = createMask(size);
  const isFront = size === FRONT_SIZE;

  const anchors: Anchors = {
    headTop: Math.round(size * 0.16),
    headMid: Math.round(size * 0.3),
    bodyMid: Math.round(size * 0.55),
    bodyBottom: Math.round(size * 0.74),
    footY: size - 3
  };

  if (archetype === 'BIPED') {
    paintSymOval(mask, size, size * 0.54, size * 0.19, size * 0.24);
    paintSymOval(mask, size, size * 0.27, size * 0.11, size * 0.1);

    for (let y = Math.round(size * 0.72); y <= size - 2; y += 1) {
      fillSymOffsets(mask, size, y, 1, 2, 1);
      fillSymOffsets(mask, size, y, 4, 4, 1);
    }
    for (let y = Math.round(size * 0.8); y <= size - 2; y += 1) {
      setMirrored(mask, size, 0, y, 0);
    }

    for (let y = Math.round(size * 0.46); y <= Math.round(size * 0.58); y += 1) {
      fillSymOffsets(mask, size, y, 6, 7, 1);
    }
  } else if (archetype === 'QUADRUPED') {
    paintSymOval(mask, size, size * 0.55, size * 0.25, size * 0.2);
    paintSymOval(mask, size, size * 0.34, size * 0.15, size * 0.12);

    const legOffsets = [1, 3, 5, 7];
    for (let y = Math.round(size * 0.72); y <= size - 2; y += 1) {
      legOffsets.forEach((offset) => {
        setMirrored(mask, size, offset, y, 1);
      });
    }

    for (let y = Math.round(size * 0.84); y <= size - 2; y += 1) {
      [2, 4, 6].forEach((gapOffset) => {
        setMirrored(mask, size, gapOffset, y, 0);
      });
    }
  } else if (archetype === 'WINGED') {
    paintSymOval(mask, size, size * 0.56, size * 0.13, size * 0.23);
    paintSymOval(mask, size, size * 0.28, size * 0.1, size * 0.09);

    for (let y = Math.round(size * 0.3); y <= Math.round(size * 0.72); y += 1) {
      const spanBase = Math.round(size * 0.18);
      const wingSpan = spanBase - Math.floor(Math.abs(size * 0.5 - y) / 3);
      fillSymOffsets(mask, size, y, 5, Math.max(6, 5 + wingSpan), 1);
    }

    for (let y = Math.round(size * 0.78); y <= size - 2; y += 1) {
      fillSymOffsets(mask, size, y, 1, 2, 1);
    }
  } else if (archetype === 'SERPENT') {
    const shiftFn = (y: number): number => Math.round(Math.sin((y - size * 0.22) / 3.2) * 2);
    paintSymOval(mask, size, size * 0.52, size * 0.13, size * 0.32, shiftFn);
    paintSymOval(mask, size, size * 0.24, size * 0.1, size * 0.1, shiftFn);

    for (let y = Math.round(size * 0.76); y <= size - 2; y += 1) {
      const taper = Math.max(0, 2 - Math.floor((y - size * 0.76) / (isFront ? 2 : 1)));
      fillSymOffsets(mask, size, y, 0, taper, 1, shiftFn(y));
    }
  } else if (archetype === 'SHELLED') {
    paintSymOval(mask, size, size * 0.48, size * 0.28, size * 0.24);
    paintSymOval(mask, size, size * 0.66, size * 0.14, size * 0.14);
    paintSymOval(mask, size, size * 0.3, size * 0.09, size * 0.08);

    for (let y = Math.round(size * 0.6); y <= Math.round(size * 0.7); y += 1) {
      fillSymOffsets(mask, size, y, 7, 9, 0);
    }

    for (let y = Math.round(size * 0.78); y <= size - 2; y += 1) {
      fillSymOffsets(mask, size, y, 2, 3, 1);
      fillSymOffsets(mask, size, y, 5, 6, 1);
    }
  } else {
    for (let y = Math.round(size * 0.24); y <= Math.round(size * 0.34); y += 1) {
      fillSymOffsets(mask, size, y, 2, 3, 1);
    }
    for (let y = Math.round(size * 0.36); y <= Math.round(size * 0.62); y += 1) {
      fillSymOffsets(mask, size, y, 4, 7, 1);
    }
    for (let y = Math.round(size * 0.42); y <= Math.round(size * 0.54); y += 1) {
      fillSymOffsets(mask, size, y, 8, 10, 1);
    }
    for (let y = Math.round(size * 0.62); y <= size - 2; y += 1) {
      fillSymOffsets(mask, size, y, 3, 5, 1);
    }
    for (let y = Math.round(size * 0.5); y <= Math.round(size * 0.52); y += 1) {
      fillSymOffsets(mask, size, y, 5, 6, 0);
    }
  }

  if (rng() < 0.45) {
    const raisedY = Math.round(size * 0.64);
    const raisedOffset = Math.round(size * 0.22);
    const side = rng() < 0.5 ? -1 : 1;
    const centerX = size / 2 - 0.5;
    setPixel(mask, size, Math.round(centerX + side * raisedOffset), raisedY, 1);
    setPixel(mask, size, Math.round(centerX + side * (raisedOffset + 1)), raisedY - 1, 1);
  }

  return { mask, anchors };
};

const setFeaturePixel = (
  mask: Uint8Array,
  featureMask: Uint8Array,
  size: number,
  x: number,
  y: number,
  value = 1
): void => {
  setPixel(mask, size, x, y, value);
  if (value === 1) {
    setPixel(featureMask, size, x, y, 1);
  }
};

const setFeatureMirrored = (
  mask: Uint8Array,
  featureMask: Uint8Array,
  size: number,
  offset: number,
  y: number,
  value = 1,
  shift = 0
): void => {
  const leftCenter = size / 2 - 1;
  const leftX = leftCenter - offset + shift;
  const rightX = leftCenter + 1 + offset + shift;

  setFeaturePixel(mask, featureMask, size, leftX, y, value);
  setFeaturePixel(mask, featureMask, size, rightX, y, value);
};

const addTail = (
  mask: Uint8Array,
  featureMask: Uint8Array,
  size: number,
  anchors: Anchors,
  style: 0 | 1 | 2
): void => {
  const centerX = Math.floor(size / 2);
  const baseY = anchors.bodyBottom + 1;

  if (style === 0) {
    for (let step = 0; step < 4; step += 1) {
      setFeaturePixel(mask, featureMask, size, centerX, baseY + step, 1);
    }
    setFeaturePixel(mask, featureMask, size, centerX, baseY + 4, 1);
    setFeaturePixel(mask, featureMask, size, centerX - 1, baseY + 3, 1);
    setFeaturePixel(mask, featureMask, size, centerX + 1, baseY + 3, 1);
  } else if (style === 1) {
    setFeaturePixel(mask, featureMask, size, centerX, baseY + 1, 1);
    setFeaturePixel(mask, featureMask, size, centerX, baseY + 2, 1);
    setFeaturePixel(mask, featureMask, size, centerX, baseY + 3, 1);
    setFeaturePixel(mask, featureMask, size, centerX - 1, baseY + 2, 1);
    setFeaturePixel(mask, featureMask, size, centerX + 1, baseY + 2, 1);
    setFeaturePixel(mask, featureMask, size, centerX - 2, baseY + 2, 1);
    setFeaturePixel(mask, featureMask, size, centerX + 2, baseY + 2, 1);
  } else {
    setFeaturePixel(mask, featureMask, size, centerX, baseY + 1, 1);
    setFeaturePixel(mask, featureMask, size, centerX, baseY + 2, 1);
    setFeaturePixel(mask, featureMask, size, centerX, baseY + 3, 1);
    setFeaturePixel(mask, featureMask, size, centerX - 1, baseY + 3, 1);
    setFeaturePixel(mask, featureMask, size, centerX + 1, baseY + 3, 1);
    setFeaturePixel(mask, featureMask, size, centerX - 1, baseY + 4, 1);
    setFeaturePixel(mask, featureMask, size, centerX + 1, baseY + 4, 1);
  }
};

const applyAddOns = (
  mask: Uint8Array,
  featureMask: Uint8Array,
  size: number,
  anchors: Anchors,
  design: CreatureDesign,
  rng: () => number
): void => {
  const centerX = Math.floor(size / 2);

  design.addOns.forEach((addOn) => {
    if (addOn === 'horns') {
      const hornHeight = 2 + Math.floor(rng() * 2);
      for (let step = 0; step < hornHeight; step += 1) {
        setFeatureMirrored(mask, featureMask, size, 2 + step, anchors.headTop - step, 1);
      }
      if (rng() < 0.45) {
        setFeatureMirrored(mask, featureMask, size, 5, anchors.headTop - 1, 1);
      }
    } else if (addOn === 'ears') {
      setFeatureMirrored(mask, featureMask, size, 4, anchors.headMid - 1, 1);
      setFeatureMirrored(mask, featureMask, size, 5, anchors.headMid, 1);
    } else if (addOn === 'tail') {
      addTail(mask, featureMask, size, anchors, design.tailStyle);
    } else if (addOn === 'fins') {
      for (let y = anchors.bodyMid - 1; y <= anchors.bodyMid + 2; y += 1) {
        setFeatureMirrored(mask, featureMask, size, 8, y, 1);
        if (rng() < 0.65) {
          setFeatureMirrored(mask, featureMask, size, 9, y, 1);
        }
      }
    } else if (addOn === 'claws') {
      const clawY = anchors.footY + 1;
      setFeatureMirrored(mask, featureMask, size, 2, clawY, 1);
      setFeatureMirrored(mask, featureMask, size, 3, clawY, 1);
      setFeatureMirrored(mask, featureMask, size, 5, clawY, 1);
    } else if (addOn === 'crest') {
      for (let y = anchors.headTop - 1; y <= anchors.headTop + 2; y += 1) {
        setFeatureMirrored(mask, featureMask, size, 0, y, 1);
      }
      for (let y = anchors.headMid + 1; y <= anchors.bodyMid; y += 2) {
        setFeatureMirrored(mask, featureMask, size, 1, y, 1);
      }
    } else if (addOn === 'beak') {
      setFeaturePixel(mask, featureMask, size, centerX, anchors.headMid + 1, 1);
      setFeaturePixel(mask, featureMask, size, centerX, anchors.headMid + 2, 1);
      setFeaturePixel(mask, featureMask, size, centerX - 1, anchors.headMid + 2, 1);
      setFeaturePixel(mask, featureMask, size, centerX + 1, anchors.headMid + 2, 1);
    }
  });
};

const resolveEyes = (
  mask: Uint8Array,
  size: number,
  anchors: Anchors
): [PixelPoint, PixelPoint] => {
  const center = size / 2 - 0.5;
  const eyeOffset = Math.max(2, Math.round(size * 0.14));
  const startY = anchors.headMid + 1;

  const findEye = (side: -1 | 1): PixelPoint => {
    const x = Math.round(center + side * eyeOffset);
    for (let y = startY; y <= startY + 4; y += 1) {
      if (getPixel(mask, size, x, y) === 1) {
        return { x, y };
      }
    }
    return { x, y: startY + 1 };
  };

  return [findEye(-1), findEye(1)];
};

const buildBattleBlueprint = (creatureId: CreatureId, size: number): BattleBlueprint => {
  const design = createCreatureDesign(creatureId);
  const shapeRng = mulberry32(hashString(`${creatureId}:${size}:shape`));
  const addOnRng = mulberry32(hashString(`${creatureId}:${size}:addons`));

  const { mask, anchors } = buildBaseArchetype(size, design.archetype, shapeRng);
  const featureMask = createMask(size);
  applyAddOns(mask, featureMask, size, anchors, design, addOnRng);

  const eyes = resolveEyes(mask, size, anchors);
  const mouth: PixelPoint = {
    x: Math.floor(size / 2) + design.lean,
    y: anchors.headMid + 4
  };

  return {
    mask,
    featureMask,
    anchors,
    eyes,
    mouth
  };
};

const applyBaseShading = (
  layer: Uint8Array,
  mask: Uint8Array,
  size: number,
  anchors: Anchors,
  backFacing: boolean
): void => {
  const center = size / 2 - 0.5;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (getPixel(mask, size, x, y) !== 1) {
        continue;
      }

      setPixel(layer, size, x, y, 3);

      const shadowSide = backFacing ? x < center - 1 : x > center + 1;
      const shadowDepth = y > anchors.bodyMid + 2;
      if (shadowSide || shadowDepth) {
        setPixel(layer, size, x, y, 2);
      }
    }
  }
};

const applyRimLighting = (
  layer: Uint8Array,
  mask: Uint8Array,
  size: number,
  backFacing: boolean,
  eyeIndices: Set<number>
): void => {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (getPixel(mask, size, x, y) !== 1) {
        continue;
      }

      const idx = indexFor(size, x, y);
      const exposedUp = getPixel(mask, size, x, y - 1) === 0;
      const exposedLeft = getPixel(mask, size, x - 1, y) === 0;
      const exposedRight = getPixel(mask, size, x + 1, y) === 0;
      const exposedDown = getPixel(mask, size, x, y + 1) === 0;

      const highlight = backFacing ? exposedUp && exposedRight : exposedUp && exposedLeft;
      if (highlight && !eyeIndices.has(idx)) {
        setPixel(layer, size, x, y, 4);
      }

      if ((exposedDown || exposedRight) && getPixel(layer, size, x, y) !== 4) {
        setPixel(layer, size, x, y, 2);
      }
    }
  }
};

const applyFeatureAccents = (
  layer: Uint8Array,
  featureMask: Uint8Array,
  mask: Uint8Array,
  size: number,
  rng: () => number
): void => {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (getPixel(featureMask, size, x, y) !== 1 || getPixel(mask, size, x, y) !== 1) {
        continue;
      }

      if (rng() < 0.75) {
        setPixel(layer, size, x, y, 4);
      }
    }
  }
};

const applyPatternPixel = (
  layer: Uint8Array,
  mask: Uint8Array,
  size: number,
  x: number,
  y: number,
  color: number,
  eyeIndices: Set<number>
): void => {
  if (getPixel(mask, size, x, y) !== 1) {
    return;
  }

  if (eyeIndices.has(indexFor(size, x, y))) {
    return;
  }

  setPixel(layer, size, x, y, color);
};

const applyTypePattern = (
  layer: Uint8Array,
  mask: Uint8Array,
  size: number,
  type: BattleType,
  rng: () => number,
  eyeIndices: Set<number>,
  anchors: Anchors
): void => {
  if (type === 'Ember') {
    for (let y = anchors.headMid; y <= anchors.bodyBottom; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if ((x + y + Math.floor(rng() * 3)) % 7 === 0) {
          applyPatternPixel(layer, mask, size, x, y, 4, eyeIndices);
        }
      }
    }
  } else if (type === 'Tide') {
    for (let y = anchors.headMid + 2; y <= anchors.bodyBottom; y += 3) {
      for (let x = 0; x < size; x += 1) {
        if (x % 3 === 0) {
          applyPatternPixel(layer, mask, size, x, y, 4, eyeIndices);
        }
      }
    }

    for (let bubble = 0; bubble < 4; bubble += 1) {
      const cx = Math.floor(size * (0.28 + rng() * 0.44));
      const cy = Math.floor(size * (0.35 + rng() * 0.35));
      applyPatternPixel(layer, mask, size, cx, cy, 4, eyeIndices);
      applyPatternPixel(layer, mask, size, cx + 1, cy, 4, eyeIndices);
      applyPatternPixel(layer, mask, size, cx, cy + 1, 4, eyeIndices);
    }
  } else if (type === 'Bloom') {
    const centerX = Math.floor(size / 2);
    for (let y = anchors.headMid; y <= anchors.bodyBottom; y += 1) {
      applyPatternPixel(layer, mask, size, centerX, y, 4, eyeIndices);
      if (y % 3 === 0) {
        applyPatternPixel(layer, mask, size, centerX - 2, y + 1, 4, eyeIndices);
        applyPatternPixel(layer, mask, size, centerX + 2, y + 1, 4, eyeIndices);
      }
    }
  } else if (type === 'Volt') {
    let currentX = Math.floor(size / 2);
    for (let y = anchors.headTop + 1; y <= anchors.bodyBottom; y += 2) {
      applyPatternPixel(layer, mask, size, currentX, y, 4, eyeIndices);
      applyPatternPixel(layer, mask, size, size - 1 - currentX, y, 4, eyeIndices);
      currentX += rng() < 0.5 ? -1 : 1;
      currentX = Phaser.Math.Clamp(currentX, Math.floor(size * 0.28), Math.floor(size * 0.72));
    }
  } else if (type === 'Stone') {
    const crackStart = Math.floor(size * (0.4 + rng() * 0.2));
    let crackX = crackStart;
    for (let y = anchors.headMid; y <= anchors.bodyBottom; y += 1) {
      applyPatternPixel(layer, mask, size, crackX, y, 2, eyeIndices);
      if (y % 2 === 0) {
        crackX += rng() < 0.5 ? -1 : 1;
      }
      crackX = Phaser.Math.Clamp(crackX, Math.floor(size * 0.22), Math.floor(size * 0.78));
    }

    for (let fleck = 0; fleck < 10; fleck += 1) {
      applyPatternPixel(
        layer,
        mask,
        size,
        Math.floor(rng() * size),
        Math.floor(size * 0.3 + rng() * size * 0.5),
        4,
        eyeIndices
      );
    }
  } else {
    for (let y = anchors.headTop; y <= anchors.bodyBottom; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (getPixel(mask, size, x, y) !== 1) {
          continue;
        }

        if (y > anchors.bodyMid && (x + y) % 3 === 0) {
          setPixel(layer, size, x, y, 2);
        } else if (y <= anchors.bodyMid && (x + y) % 4 === 0) {
          applyPatternPixel(layer, mask, size, x, y, 4, eyeIndices);
        }
      }
    }
  }
};

const renderCanvas = (
  size: number,
  layer: Uint8Array,
  palette: Record<number, number>
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to allocate 2d context for procedural sprite rendering.');
  }

  context.imageSmoothingEnabled = false;
  const image = context.createImageData(size, size);

  for (let index = 0; index < layer.length; index += 1) {
    const colorIndex = layer[index];
    const imageOffset = index * 4;

    if (colorIndex === 0) {
      image.data[imageOffset + 3] = 0;
      continue;
    }

    const color = palette[colorIndex];
    const [red, green, blue] = toRgb(color);
    image.data[imageOffset] = red;
    image.data[imageOffset + 1] = green;
    image.data[imageOffset + 2] = blue;
    image.data[imageOffset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
  return canvas;
};

const buildBattleSprite = (creatureId: CreatureId, backFacing: boolean): HTMLCanvasElement => {
  const creature = getCreatureDefinition(creatureId);
  const palette = TYPE_PALETTES[creature.type];
  const patternRng = mulberry32(
    hashString(`${creatureId}:${backFacing ? 'back' : 'front'}:pattern`)
  );
  const detailRng = mulberry32(hashString(`${creatureId}:${backFacing ? 'back' : 'front'}:detail`));

  const blueprint = buildBattleBlueprint(creatureId, FRONT_SIZE);
  const outlineMask = createOutlineMask(blueprint.mask, FRONT_SIZE);
  const layer = createMask(FRONT_SIZE);

  for (let index = 0; index < outlineMask.length; index += 1) {
    if (outlineMask[index] === 1) {
      layer[index] = 1;
    }
  }

  applyBaseShading(layer, blueprint.mask, FRONT_SIZE, blueprint.anchors, backFacing);
  applyFeatureAccents(layer, blueprint.featureMask, blueprint.mask, FRONT_SIZE, detailRng);

  const eyeIndices = new Set<number>();
  if (!backFacing) {
    blueprint.eyes.forEach((eye) => {
      const idx = indexFor(FRONT_SIZE, eye.x, eye.y);
      eyeIndices.add(idx);
      setPixel(layer, FRONT_SIZE, eye.x, eye.y, 4);
    });
  }

  applyTypePattern(
    layer,
    blueprint.mask,
    FRONT_SIZE,
    creature.type,
    patternRng,
    eyeIndices,
    blueprint.anchors
  );

  applyRimLighting(layer, blueprint.mask, FRONT_SIZE, backFacing, eyeIndices);

  if (
    !backFacing &&
    getPixel(blueprint.mask, FRONT_SIZE, blueprint.mouth.x, blueprint.mouth.y) === 1
  ) {
    setPixel(layer, FRONT_SIZE, blueprint.mouth.x, blueprint.mouth.y, 2);
  }

  if (backFacing) {
    for (let y = blueprint.anchors.bodyMid; y <= blueprint.anchors.bodyBottom; y += 2) {
      const centerX = Math.floor(FRONT_SIZE / 2);
      applyPatternPixel(layer, blueprint.mask, FRONT_SIZE, centerX, y, 4, eyeIndices);
    }
  } else {
    blueprint.eyes.forEach((eye) => {
      setPixel(layer, FRONT_SIZE, eye.x, eye.y, 4);
    });
  }

  const paletteMap: Record<number, number> = {
    1: palette.outline,
    2: backFacing ? darken(palette.shadow, 10) : palette.shadow,
    3: backFacing ? darken(palette.base, 14) : palette.base,
    4: backFacing ? darken(palette.accent, 8) : palette.accent
  };

  return renderCanvas(FRONT_SIZE, layer, paletteMap);
};

const buildOverworldSprite = (creatureId: CreatureId): HTMLCanvasElement => {
  const creature = getCreatureDefinition(creatureId);
  const palette = TYPE_PALETTES[creature.type];
  const design = createCreatureDesign(creatureId);

  const shapeRng = mulberry32(hashString(`${creatureId}:icon:shape`));
  const addOnRng = mulberry32(hashString(`${creatureId}:icon:addons`));
  const { mask, anchors } = buildBaseArchetype(OVERWORLD_SIZE, design.archetype, shapeRng);
  const featureMask = createMask(OVERWORLD_SIZE);
  applyAddOns(mask, featureMask, OVERWORLD_SIZE, anchors, design, addOnRng);

  const outlineMask = createOutlineMask(mask, OVERWORLD_SIZE);
  const layer = createMask(OVERWORLD_SIZE);
  let accentCount = 0;

  for (let index = 0; index < outlineMask.length; index += 1) {
    if (outlineMask[index] === 1) {
      layer[index] = 1;
    }
  }

  for (let y = 0; y < OVERWORLD_SIZE; y += 1) {
    for (let x = 0; x < OVERWORLD_SIZE; x += 1) {
      if (getPixel(mask, OVERWORLD_SIZE, x, y) === 1) {
        setPixel(layer, OVERWORLD_SIZE, x, y, 2);
      }

      if (
        getPixel(featureMask, OVERWORLD_SIZE, x, y) === 1 &&
        getPixel(mask, OVERWORLD_SIZE, x, y) === 1
      ) {
        if ((x + y) % 2 === 0) {
          setPixel(layer, OVERWORLD_SIZE, x, y, 3);
          accentCount += 1;
        }
      }
    }
  }

  if (accentCount === 0) {
    const centerX = Math.floor(OVERWORLD_SIZE / 2);
    const fallbackY = Math.min(OVERWORLD_SIZE - 2, anchors.bodyMid);
    setPixel(layer, OVERWORLD_SIZE, centerX, fallbackY, 3);
  }

  const eyeY = Math.min(OVERWORLD_SIZE - 3, anchors.headMid + 1);
  const leftEyeX = Math.floor(OVERWORLD_SIZE / 2) - 2;
  const rightEyeX = Math.floor(OVERWORLD_SIZE / 2) + 1;
  if (getPixel(mask, OVERWORLD_SIZE, leftEyeX, eyeY) === 1) {
    setPixel(layer, OVERWORLD_SIZE, leftEyeX, eyeY, 3);
  }
  if (getPixel(mask, OVERWORLD_SIZE, rightEyeX, eyeY) === 1) {
    setPixel(layer, OVERWORLD_SIZE, rightEyeX, eyeY, 3);
  }

  const paletteMap: Record<number, number> = {
    1: palette.outline,
    2: palette.iconBase,
    3: palette.iconAccent
  };

  return renderCanvas(OVERWORLD_SIZE, layer, paletteMap);
};

const keyFor = (variant: SpriteVariant, creatureId: CreatureId): string => {
  if (variant === 'front') {
    return `cb_front_${creatureId}`;
  }

  if (variant === 'back') {
    return `cb_back_${creatureId}`;
  }

  return `cb_icon_${creatureId}`;
};

export class ProcSpriteFactory {
  public static prewarm(scene: Phaser.Scene): void {
    CREATURE_IDS.forEach((creatureId) => {
      this.generateFront(scene, creatureId);
      this.generateBack(scene, creatureId);
      this.generateOverworld(scene, creatureId);
    });
  }

  public static generateFront(scene: Phaser.Scene, creatureId: CreatureId): string {
    return this.ensureTexture(scene, creatureId, 'front');
  }

  public static generateBack(scene: Phaser.Scene, creatureId: CreatureId): string {
    return this.ensureTexture(scene, creatureId, 'back');
  }

  public static generateOverworld(scene: Phaser.Scene, creatureId: CreatureId): string {
    return this.ensureTexture(scene, creatureId, 'overworld');
  }

  public static generateDebugSheet(scene: Phaser.Scene): Phaser.GameObjects.Container {
    const existing = scene.children.getByName(DEBUG_SHEET_NAME);
    if (existing) {
      existing.destroy();
    }

    const container = scene.add.container(16, 16).setDepth(20_000).setName(DEBUG_SHEET_NAME);
    const columns = 3;

    CREATURE_IDS.forEach((creatureId, index) => {
      const gridX = index % columns;
      const gridY = Math.floor(index / columns);
      const offsetX = gridX * 200;
      const offsetY = gridY * 150;

      const panel = scene.add
        .rectangle(offsetX, offsetY, 184, 132, 0x08101d, 0.92)
        .setOrigin(0)
        .setStrokeStyle(2, 0x7ca7cf, 1)
        .setScrollFactor(0);

      const sprite = scene.add
        .image(offsetX + 92, offsetY + 72, this.generateFront(scene, creatureId))
        .setScale(3)
        .setOrigin(0.5)
        .setScrollFactor(0);

      const label = scene.add
        .text(offsetX + 8, offsetY + 8, creatureId, {
          fontFamily: '"Courier New", monospace',
          fontSize: '13px',
          color: '#f2f7ff'
        })
        .setScrollFactor(0);

      container.add([panel, sprite, label]);
    });

    return container;
  }

  private static ensureTexture(
    scene: Phaser.Scene,
    creatureId: CreatureId,
    variant: SpriteVariant
  ): string {
    const textureKey = keyFor(variant, creatureId);
    if (scene.textures.exists(textureKey)) {
      return textureKey;
    }

    const canvas =
      variant === 'front'
        ? buildBattleSprite(creatureId, false)
        : variant === 'back'
          ? buildBattleSprite(creatureId, true)
          : buildOverworldSprite(creatureId);

    scene.textures.addCanvas(textureKey, canvas);
    return textureKey;
  }
}

declare global {
  interface Window {
    __CB_PROC_SPRITES__?: typeof ProcSpriteFactory;
  }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__CB_PROC_SPRITES__ = ProcSpriteFactory;
}
