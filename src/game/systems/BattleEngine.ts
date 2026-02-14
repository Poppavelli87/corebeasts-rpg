import Phaser from 'phaser';
import { getCreatureDefinition } from '../data/creatures';
import type { MoveDefinition, MoveId } from '../data/moves';
import { getMoveDefinition } from '../data/moves';
import type { CreatureInstance } from '../state/GameState';
import { getTypeMultiplier } from './TypeChart';

type BattleRole = 'player' | 'enemy';

type BattleEngineOptions = {
  rng?: () => number;
  enemyStatusEffectChance?: number;
  damageAdjuster?: (input: DamageAdjusterInput) => number;
};

type StatStages = {
  atk: number;
  def: number;
};

export type BattleCombatant = {
  role: BattleRole;
  speciesId: CreatureInstance['speciesId'];
  name: string;
  type: ReturnType<typeof getCreatureDefinition>['type'];
  level: number;
  maxHp: number;
  currentHp: number;
  atk: number;
  def: number;
  spd: number;
  moves: MoveId[];
  status: CreatureInstance['status'];
  stages: StatStages;
};

export type BattleAction =
  | {
      type: 'message';
      text: string;
    }
  | {
      type: 'damage';
      attacker: BattleRole;
      defender: BattleRole;
      move: MoveDefinition;
      damage: number;
      remainingHp: number;
      multiplier: number;
    }
  | {
      type: 'status';
      actor: BattleRole;
      move: MoveDefinition;
      text: string;
    }
  | {
      type: 'faint';
      target: BattleRole;
    };

export type BattleTurnResult = {
  actions: BattleAction[];
  winner: BattleRole | null;
  player: BattleCombatant;
  enemy: BattleCombatant;
  selectedMoves: {
    playerMove: MoveId | null;
    enemyMove: MoveId | null;
  };
};

export type DamageAdjusterInput = {
  attacker: BattleRole;
  defender: BattleRole;
  move: MoveDefinition;
  damage: number;
  multiplier: number;
};

const clampStage = (value: number): number => Phaser.Math.Clamp(value, -3, 3);

const stageMultiplier = (stage: number): number => 1 + stage * 0.25;

export class BattleEngine {
  private readonly rng: () => number;

  private readonly enemyStatusEffectChance: number;

  private readonly damageAdjuster?: (input: DamageAdjusterInput) => number;

  private player: BattleCombatant;

  private enemy: BattleCombatant;

  public constructor(
    playerSeed: CreatureInstance,
    enemySeed: CreatureInstance,
    options: BattleEngineOptions = {}
  ) {
    this.rng = options.rng ?? Math.random;
    this.enemyStatusEffectChance = Phaser.Math.Clamp(options.enemyStatusEffectChance ?? 1, 0, 1);
    this.damageAdjuster = options.damageAdjuster;
    this.player = this.createCombatant('player', playerSeed);
    this.enemy = this.createCombatant('enemy', enemySeed);
  }

  public getState(): { player: BattleCombatant; enemy: BattleCombatant } {
    return {
      player: this.cloneCombatant(this.player),
      enemy: this.cloneCombatant(this.enemy)
    };
  }

  public chooseEnemyMove(): MoveId {
    const index = Math.floor(this.rng() * this.enemy.moves.length);
    return this.enemy.moves[index];
  }

  public heal(role: BattleRole, amount: number): { before: number; after: number; maxHp: number } {
    const target = role === 'player' ? this.player : this.enemy;
    const before = target.currentHp;
    target.currentHp = Math.min(target.maxHp, target.currentHp + Math.max(0, Math.floor(amount)));

    return {
      before,
      after: target.currentHp,
      maxHp: target.maxHp
    };
  }

  public clearStatus(role: BattleRole): boolean {
    const target = role === 'player' ? this.player : this.enemy;
    if (!target.status) {
      return false;
    }

    target.status = null;
    return true;
  }

  public toCreatureInstance(role: BattleRole): CreatureInstance {
    const source = role === 'player' ? this.player : this.enemy;

    return {
      speciesId: source.speciesId,
      level: source.level,
      xp: 0,
      bond: 0,
      nickname:
        source.name === getCreatureDefinition(source.speciesId).name ? undefined : source.name,
      stats: {
        hp: source.maxHp,
        atk: source.atk,
        def: source.def,
        spd: source.spd
      },
      currentHp: Math.max(1, source.currentHp),
      status: source.status ?? null,
      moves: [...source.moves]
    };
  }

  public resolveTurn(playerMove: MoveId, enemyMoveOverride?: MoveId): BattleTurnResult {
    const enemyMove = enemyMoveOverride ?? this.chooseEnemyMove();
    const turnActions: BattleAction[] = [];

    const turnOrder = this.resolveTurnOrder();

    for (const role of turnOrder) {
      this.resolveSingleAction(turnActions, role, role === 'player' ? playerMove : enemyMove);
    }

    const winner =
      this.enemy.currentHp <= 0 ? 'player' : this.player.currentHp <= 0 ? 'enemy' : null;

    return {
      actions: turnActions,
      winner,
      player: this.cloneCombatant(this.player),
      enemy: this.cloneCombatant(this.enemy),
      selectedMoves: {
        playerMove,
        enemyMove
      }
    };
  }

  public resolveEnemyTurn(enemyMoveOverride?: MoveId): BattleTurnResult {
    const enemyMove = enemyMoveOverride ?? this.chooseEnemyMove();
    const turnActions: BattleAction[] = [];

    this.resolveSingleAction(turnActions, 'enemy', enemyMove);

    const winner =
      this.enemy.currentHp <= 0 ? 'player' : this.player.currentHp <= 0 ? 'enemy' : null;

    return {
      actions: turnActions,
      winner,
      player: this.cloneCombatant(this.player),
      enemy: this.cloneCombatant(this.enemy),
      selectedMoves: {
        playerMove: null,
        enemyMove
      }
    };
  }

  public resolvePlayerTurn(playerMove: MoveId): BattleTurnResult {
    const turnActions: BattleAction[] = [];

    this.resolveSingleAction(turnActions, 'player', playerMove);

    const winner =
      this.enemy.currentHp <= 0 ? 'player' : this.player.currentHp <= 0 ? 'enemy' : null;

    return {
      actions: turnActions,
      winner,
      player: this.cloneCombatant(this.player),
      enemy: this.cloneCombatant(this.enemy),
      selectedMoves: {
        playerMove,
        enemyMove: null
      }
    };
  }

  private resolveSingleAction(actions: BattleAction[], role: BattleRole, moveId: MoveId): void {
    const attacker = role === 'player' ? this.player : this.enemy;
    const defender = role === 'player' ? this.enemy : this.player;

    if (attacker.currentHp <= 0 || defender.currentHp <= 0) {
      return;
    }

    const move = getMoveDefinition(moveId);

    actions.push({
      type: 'message',
      text: `${attacker.name} used ${move.name}!`
    });

    if (move.power <= 0 && move.statusEffect) {
      const statusText = this.applyStatusEffect(attacker, defender, move, role);
      actions.push({
        type: 'status',
        actor: role,
        move,
        text: statusText
      });
      return;
    }

    const damage = this.calculateDamage(attacker, defender, move);
    const adjustedDamage = this.damageAdjuster
      ? Math.max(
          1,
          Math.floor(
            this.damageAdjuster({
              attacker: role,
              defender: role === 'player' ? 'enemy' : 'player',
              move,
              damage: damage.value,
              multiplier: damage.multiplier
            })
          )
        )
      : damage.value;
    defender.currentHp = Math.max(0, defender.currentHp - adjustedDamage);

    actions.push({
      type: 'damage',
      attacker: role,
      defender: role === 'player' ? 'enemy' : 'player',
      move,
      damage: adjustedDamage,
      remainingHp: defender.currentHp,
      multiplier: damage.multiplier
    });

    if (damage.multiplier > 1.0) {
      actions.push({
        type: 'message',
        text: 'Super effective!'
      });
    } else if (damage.multiplier < 1.0) {
      actions.push({
        type: 'message',
        text: 'Not very effective...'
      });
    }

    if (defender.currentHp <= 0) {
      actions.push({
        type: 'faint',
        target: role === 'player' ? 'enemy' : 'player'
      });
    }
  }

  private resolveTurnOrder(): [BattleRole, BattleRole] {
    if (this.player.spd > this.enemy.spd) {
      return ['player', 'enemy'];
    }

    if (this.enemy.spd > this.player.spd) {
      return ['enemy', 'player'];
    }

    return this.rng() < 0.5 ? ['player', 'enemy'] : ['enemy', 'player'];
  }

  private applyStatusEffect(
    attacker: BattleCombatant,
    defender: BattleCombatant,
    move: MoveDefinition,
    actorRole: BattleRole
  ): string {
    if (!move.statusEffect) {
      return 'Nothing happened.';
    }

    if (actorRole === 'enemy' && this.rng() > this.enemyStatusEffectChance) {
      return 'But it failed.';
    }

    const target = move.statusEffect.target === 'self' ? attacker : defender;

    if (move.statusEffect.kind === 'atk_up') {
      const previous = target.stages.atk;
      target.stages.atk = clampStage(target.stages.atk + move.statusEffect.stages);
      if (target.stages.atk === previous) {
        return `${target.name}'s Attack cannot go higher.`;
      }
      return `${target.name}'s Attack rose!`;
    }

    const previous = target.stages.def;
    target.stages.def = clampStage(target.stages.def + move.statusEffect.stages);
    if (target.stages.def === previous) {
      return `${target.name}'s Defense cannot go higher.`;
    }

    return `${target.name}'s Defense rose!`;
  }

  private calculateDamage(
    attacker: BattleCombatant,
    defender: BattleCombatant,
    move: MoveDefinition
  ): { value: number; multiplier: number } {
    const base = move.power;
    const atkValue = attacker.atk * stageMultiplier(attacker.stages.atk);
    const defValue = defender.def * stageMultiplier(defender.stages.def);
    const scaled = base * (atkValue / Math.max(1, defValue));
    const variance = 0.9 + this.rng() * 0.2;
    const multiplier = getTypeMultiplier(move.type, defender.type);

    const damage = Math.max(1, Math.floor(scaled * variance * multiplier));
    return { value: damage, multiplier };
  }

  private createCombatant(role: BattleRole, seed: CreatureInstance): BattleCombatant {
    const definition = getCreatureDefinition(seed.speciesId);
    const moves = seed.moves.length > 0 ? [...seed.moves] : [...definition.moves];

    return {
      role,
      speciesId: seed.speciesId,
      name: seed.nickname?.trim() || definition.name,
      type: definition.type,
      level: seed.level,
      maxHp: Math.max(1, seed.stats.hp),
      currentHp: Phaser.Math.Clamp(seed.currentHp, 1, Math.max(1, seed.stats.hp)),
      atk: Math.max(1, seed.stats.atk),
      def: Math.max(1, seed.stats.def),
      spd: Math.max(1, seed.stats.spd),
      moves,
      status: seed.status ?? null,
      stages: {
        atk: 0,
        def: 0
      }
    };
  }

  private cloneCombatant(combatant: BattleCombatant): BattleCombatant {
    return {
      ...combatant,
      moves: [...combatant.moves],
      stages: { ...combatant.stages }
    };
  }
}
