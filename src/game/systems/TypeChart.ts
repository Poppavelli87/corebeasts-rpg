export type BattleType = 'Ember' | 'Bloom' | 'Tide' | 'Volt' | 'Stone' | 'Shade';

const STRONG_AGAINST: Record<BattleType, BattleType[]> = {
  Ember: ['Bloom'],
  Bloom: ['Tide'],
  Tide: ['Ember', 'Stone'],
  Volt: ['Tide'],
  Stone: ['Volt', 'Shade'],
  Shade: ['Bloom', 'Ember']
};

const STRONG_MULTIPLIER = 1.5;
const WEAK_MULTIPLIER = 0.75;
const NEUTRAL_MULTIPLIER = 1.0;

export const getTypeMultiplier = (attackingType: BattleType, defendingType: BattleType): number => {
  if (STRONG_AGAINST[attackingType].includes(defendingType)) {
    return STRONG_MULTIPLIER;
  }

  if (STRONG_AGAINST[defendingType].includes(attackingType)) {
    return WEAK_MULTIPLIER;
  }

  return NEUTRAL_MULTIPLIER;
};
