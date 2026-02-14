import Phaser from 'phaser';
import type { CreatureInstance } from '../state/GameState';

type StatusLike = CreatureInstance['status'] | 'gloom' | 'root' | 'shock';

type MessageOptions = {
  durationMs?: number;
  locked?: boolean;
};

export type BossContext = {
  activeCreature: CreatureInstance | null;
  opponentCreature: CreatureInstance | null;
  battleState: Record<string, unknown>;
  scene: Phaser.Scene;
  enqueueMessage: (text: string, options?: MessageOptions) => void;
  applyStatus: (target: 'active' | 'opponent' | 'both', status: StatusLike) => void;
  modifyDamageTemp: (multiplier: number, target?: 'active' | 'opponent' | 'both') => void;
  forceSwitch: (mode?: 'next' | 'final') => void;
  setBattleModifier: (key: string, value: unknown) => void;
};

export const BOSS_BEHAVIORS: Record<string, (ctx: BossContext) => void> = {
  stone_master_start: (ctx) => {
    ctx.setBattleModifier('stoneWardEnabled', true);
    ctx.setBattleModifier('stoneWardSetupRequested', true);
    ctx.enqueueMessage("The arena hardens under Stone Master's command!");
  },

  shade_archivist_start: (ctx) => {
    ctx.applyStatus('both', 'gloom');
    ctx.setBattleModifier('damageModifier', 1.1);
    ctx.enqueueMessage('A dark ritual shrouds the field!');
  },

  volt_twins_shift: (ctx) => {
    const turnNumber = Number(ctx.battleState.turnNumber ?? 0);
    if (!Number.isFinite(turnNumber) || turnNumber <= 0 || turnNumber % 2 !== 0) {
      return;
    }

    const lastSwitchTurn = Number(ctx.battleState.lastSwitchTurn ?? -1);
    if (Number.isFinite(lastSwitchTurn) && lastSwitchTurn === turnNumber) {
      return;
    }

    ctx.setBattleModifier('lastSwitchTurn', turnNumber);
    ctx.enqueueMessage('The twins shift positions!');
    ctx.forceSwitch('next');
  },

  final_aether_surge: (ctx) => {
    if (ctx.battleState.finalPhaseTriggered) {
      return;
    }

    ctx.setBattleModifier('finalPhaseTriggered', true);
    ctx.enqueueMessage('You feel the Aether surge!', { locked: true, durationMs: 660 });
    ctx.setBattleModifier('damageModifierDelta', 0.1);
    ctx.setBattleModifier('triggerFinalPhaseMusic', true);
    ctx.forceSwitch('final');
  }
};
