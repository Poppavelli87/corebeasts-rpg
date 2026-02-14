import type { CreatureInstance } from '../state/GameState';

export interface AbilityContext {
  source: CreatureInstance;
  target?: CreatureInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  battleState: any;
}

export interface AbilityDefinition {
  description: string;
  onEnter?: (ctx: AbilityContext) => void;
  onHit?: (ctx: AbilityContext) => void;
  onLowHP?: (ctx: AbilityContext) => void;
  onFaint?: (ctx: AbilityContext) => void;
  onTurnStart?: (ctx: AbilityContext) => void;
}

type AbilityBridge = {
  enqueueAbilityMessage?: (text: string) => void;
  hasAbilityEventTag?: (tag: string) => boolean;
  markAbilityEventTag?: (tag: string) => void;
};

const toCreatureLabel = (creature: CreatureInstance): string => {
  const nickname = creature.nickname?.trim();
  if (nickname) {
    return nickname;
  }

  const speciesId = creature.speciesId;
  return `${speciesId.charAt(0).toUpperCase()}${speciesId.slice(1)}`;
};

const getBridge = (ctx: AbilityContext): AbilityBridge => {
  if (!ctx.battleState || typeof ctx.battleState !== 'object') {
    return {};
  }

  return ctx.battleState as AbilityBridge;
};

const emitOnce = (
  ctx: AbilityContext,
  abilityId: string,
  hookId: string,
  messageBuilder: (sourceName: string) => string
): void => {
  const bridge = getBridge(ctx);
  const source = ctx.source;
  const sourceKey = `${source.speciesId}:${source.level}:${source.nickname ?? ''}`;
  const tag = `${abilityId}:${hookId}:${sourceKey}`;

  if (bridge.hasAbilityEventTag?.(tag)) {
    return;
  }

  bridge.markAbilityEventTag?.(tag);
  bridge.enqueueAbilityMessage?.(messageBuilder(toCreatureLabel(source)));
};

const makeEnterAbility = (abilityId: string, description: string): AbilityDefinition => ({
  description,
  onEnter: (ctx) => emitOnce(ctx, abilityId, 'enter', (source) => `${source}'s ${description}`)
});

const makeHitAbility = (abilityId: string, description: string): AbilityDefinition => ({
  description,
  onHit: (ctx) => emitOnce(ctx, abilityId, 'hit', (source) => `${source}'s ${description}`)
});

const makeLowHpAbility = (abilityId: string, description: string): AbilityDefinition => ({
  description,
  onLowHP: (ctx) => emitOnce(ctx, abilityId, 'lowhp', (source) => `${source}'s ${description}`)
});

const makeFaintAbility = (abilityId: string, description: string): AbilityDefinition => ({
  description,
  onFaint: (ctx) => emitOnce(ctx, abilityId, 'faint', (source) => `${source}'s ${description}`)
});

export const ABILITIES: Record<string, AbilityDefinition> = {
  emberInstinct: makeEnterAbility('emberInstinct', 'Ember Instinct flares.'),
  emberGuard: makeHitAbility('emberGuard', 'Ember Guard hardens its stance.'),
  emberOverdrive: makeLowHpAbility('emberOverdrive', 'Ember Overdrive ignites!'),

  tideInstinct: makeEnterAbility('tideInstinct', 'Tide Instinct settles the field.'),
  tideGuard: makeHitAbility('tideGuard', 'Tide Guard absorbs the impact.'),
  tideUndertow: makeLowHpAbility('tideUndertow', 'Tide Undertow surges!'),

  bloomInstinct: makeEnterAbility('bloomInstinct', 'Bloom Instinct takes root.'),
  bloomGuard: makeHitAbility('bloomGuard', 'Bloom Guard steadies itself.'),
  bloomResurgence: makeLowHpAbility('bloomResurgence', 'Bloom Resurgence blossoms!'),

  voltInstinct: makeEnterAbility('voltInstinct', 'Volt Instinct crackles.'),
  voltGuard: makeHitAbility('voltGuard', 'Volt Guard redirects the shock.'),
  voltSurge: makeLowHpAbility('voltSurge', 'Volt Surge spikes!'),

  stoneInstinct: makeEnterAbility('stoneInstinct', 'Stone Instinct anchors it.'),
  stoneGuard: makeHitAbility('stoneGuard', 'Stone Guard braces.'),
  stoneBulwark: makeLowHpAbility('stoneBulwark', 'Stone Bulwark stands firm!'),

  shadeInstinct: makeEnterAbility('shadeInstinct', 'Shade Instinct veils the air.'),
  shadeGuard: makeHitAbility('shadeGuard', 'Shade Guard slips the blow.'),
  shadeRequiem: makeFaintAbility('shadeRequiem', 'Shade Requiem echoes.'),

  mythicBlaze: makeEnterAbility('mythicBlaze', 'Mythic Blaze scorches the horizon.'),
  abyssalCurrent: makeLowHpAbility('abyssalCurrent', 'Abyssal Current drags the field deeper.'),
  ancientCanopy: makeHitAbility('ancientCanopy', 'Ancient Canopy absorbs the impact.'),
  stormCrown: makeEnterAbility('stormCrown', 'Storm Crown charges the air.'),
  worldAnchor: makeLowHpAbility('worldAnchor', 'World Anchor locks into bedrock.'),
  voidHalo: makeFaintAbility('voidHalo', 'Void Halo leaves an eerie afterglow.')
};
