import Phaser from 'phaser';
import { getCreatureDefinition, type CreatureId } from '../data/creatures';
import { SCENE_KEYS } from '../constants';
import { AudioSystem } from '../systems/AudioSystem';
import { DialogSystem } from '../systems/DialogSystem';
import { ProcSpriteFactory } from '../systems/ProcSpriteFactory';
import { SaveSystem } from '../systems/SaveSystem';
import {
  MAP_DEFINITIONS,
  type BlockedGateDefinition,
  type DialogEntry,
  type Direction,
  type MapDefinition,
  type MapId,
  type MapTransition,
  type NpcDefinition,
  type SpawnPoint,
  TILE_SIZE,
  TileMap
} from '../systems/TileMap';
import {
  addInventory,
  createCreatureInstance,
  getActiveGameState,
  hasStoryFlag,
  healParty,
  markStoryFlag,
  movePlayerTo,
  type CreatureInstance,
  type GameState,
  type InventoryKey
} from '../state/GameState';
import { TOWN_WARP_MAPS } from '../world/WorldMaps';

type InputDirection = {
  direction: Direction;
  deltaX: number;
  deltaY: number;
};

type NpcInstance = NpcDefinition & {
  sprite: Phaser.GameObjects.Image;
};

type GateInstance = BlockedGateDefinition & {
  sprite: Phaser.GameObjects.Image;
};

type PickupDefinition = {
  id: string;
  mapId: MapId;
  x: number;
  y: number;
  item: InventoryKey;
  amount: number;
  storyFlag: string;
  textureKey: string;
};

type PickupInstance = PickupDefinition & {
  sprite: Phaser.GameObjects.Image;
};

type OverworldResumeData =
  | {
      source: 'battle';
      outcome: 'victory' | 'defeat' | 'capture' | 'escaped';
    }
  | {
      source: 'party';
    };

type ActiveTrainerEncounter = {
  trainerId: string;
  defeatFlag: string;
  npcName: string;
  team: CreatureInstance[];
  postBattleLines: string[];
  repeatLine?: string;
};

type TrainerTeamEntry = {
  speciesId: CreatureId;
  level: number;
};

type EncounterRollResult = {
  enemy: CreatureInstance;
  rareEncounter: boolean;
};

type TrialRewardDefinition = {
  flag: string;
  sigilName: string;
  marksGameComplete?: boolean;
  uniqueInventoryKey?: InventoryKey;
};

const DEFAULT_ENCOUNTER_CHANCE = 0.1;

const TRAINER_TEAM_DEFINITIONS: Record<string, 'weakStarter' | TrainerTeamEntry[]> = {
  route1_scout_pella: [
    { speciesId: 'tidepup', level: 6 },
    { speciesId: 'sproutle', level: 6 }
  ],
  route1_guard_tovin: [
    { speciesId: 'stonehorn', level: 7 },
    { speciesId: 'coalit', level: 7 }
  ],
  rival_rowan: 'weakStarter',
  trial_master_verdant: [
    { speciesId: 'bloomfin', level: 8 },
    { speciesId: 'thornlet', level: 9 },
    { speciesId: 'sproutle', level: 9 }
  ],
  trial_master_brine: [
    { speciesId: 'drizzlep', level: 12 },
    { speciesId: 'surfhound', level: 13 },
    { speciesId: 'torrento', level: 14 }
  ],
  trial_master_stone: [
    { speciesId: 'cragoon', level: 16 },
    { speciesId: 'granigon', level: 17 },
    { speciesId: 'bouldrax', level: 18 }
  ],
  trial_master_coil: [
    { speciesId: 'voltra', level: 20 },
    { speciesId: 'coilhawk', level: 21 },
    { speciesId: 'pulseon', level: 22 },
    { speciesId: 'tempestra', level: 22 }
  ],
  trial_master_hollow: [
    { speciesId: 'gloomoth', level: 24 },
    { speciesId: 'duskar', level: 25 },
    { speciesId: 'veilfang', level: 25 },
    { speciesId: 'rowraith', level: 26 }
  ],
  trial_master_obsidian: [
    { speciesId: 'cindelope', level: 28 },
    { speciesId: 'blazeroar', level: 29 },
    { speciesId: 'monolisk', level: 30 },
    { speciesId: 'tectitan', level: 30 }
  ],
  trial_master_skydrift: [
    { speciesId: 'stormyrm', level: 32 },
    { speciesId: 'tempestra', level: 33 },
    { speciesId: 'ionarch', level: 34 },
    { speciesId: 'aqualith', level: 34 },
    { speciesId: 'eclipsorn', level: 35 }
  ],
  tower_warden_astra: [
    { speciesId: 'monolisk', level: 36 },
    { speciesId: 'rowraith', level: 36 },
    { speciesId: 'tempestra', level: 37 }
  ],
  tower_warden_morrow: [
    { speciesId: 'canopyx', level: 38 },
    { speciesId: 'maelstrom', level: 38 },
    { speciesId: 'tectitan', level: 39 }
  ],
  trial_master_final: [
    { speciesId: 'emberdrake', level: 42 },
    { speciesId: 'aqualith', level: 42 },
    { speciesId: 'canopyx', level: 43 },
    { speciesId: 'tempestra', level: 43 },
    { speciesId: 'eclipsorn', level: 44 }
  ],
  postgame_boss_cave: [
    { speciesId: 'tectitan', level: 46 },
    { speciesId: 'rowraith', level: 47 },
    { speciesId: 'ionarch', level: 48 }
  ],
  postgame_boss_marsh: [
    { speciesId: 'maelstrom', level: 48 },
    { speciesId: 'eclipsorn', level: 49 },
    { speciesId: 'canopyx', level: 49 },
    { speciesId: 'ionarch', level: 50 }
  ],
  postgame_boss_tower: [
    { speciesId: 'emberdrake', level: 51 },
    { speciesId: 'maelstrom', level: 51 },
    { speciesId: 'canopyx', level: 52 },
    { speciesId: 'tectitan', level: 52 },
    { speciesId: 'eclipsorn', level: 53 }
  ]
};

const TRIAL_TEAM_ORDER: Record<string, number> = {
  trial_master_verdant: 1,
  trial_master_brine: 2,
  trial_master_stone: 3,
  trial_master_coil: 4,
  trial_master_hollow: 5,
  trial_master_obsidian: 6,
  trial_master_skydrift: 7,
  trial_master_final: 8
};

const HARD_TRIAL_BONUS_SPECIES: Partial<Record<string, CreatureId[]>> = {
  trial_master_stone: ['shaleon', 'monolisk', 'tectitan'],
  trial_master_coil: ['ionarch', 'stormyrm'],
  trial_master_hollow: ['umbrant', 'eclipsorn', 'rowraith'],
  trial_master_obsidian: ['emberdrake', 'tectitan'],
  trial_master_skydrift: ['ionarch', 'stormyrm'],
  trial_master_final: ['tectitan', 'ionarch', 'emberdrake']
};

const TRIAL_REWARDS: Record<string, TrialRewardDefinition> = {
  trial_master_verdant: {
    flag: 'trial1Complete',
    sigilName: 'Verdant Sigil',
    uniqueInventoryKey: 'verdantSigil'
  },
  trial_master_brine: { flag: 'trial2Complete', sigilName: 'Brine Sigil' },
  trial_master_stone: { flag: 'trial3Complete', sigilName: 'Stone Sigil' },
  trial_master_coil: { flag: 'trial4Complete', sigilName: 'Coil Sigil' },
  trial_master_hollow: { flag: 'trial5Complete', sigilName: 'Hollow Sigil' },
  trial_master_obsidian: { flag: 'trial6Complete', sigilName: 'Forge Sigil' },
  trial_master_skydrift: { flag: 'trial7Complete', sigilName: 'Sky Sigil' },
  trial_master_final: {
    flag: 'trial8Complete',
    sigilName: 'Zenith Sigil',
    marksGameComplete: true
  }
};

const POSTGAME_BOSS_REWARDS: Record<string, { unlockFlag: string; message: string }> = {
  postgame_boss_cave: {
    unlockFlag: 'rareCaveUnlocked',
    message: 'A deep resonance now attracts rare cave encounters.'
  },
  postgame_boss_marsh: {
    unlockFlag: 'rareMarshUnlocked',
    message: 'The marsh now hides an ultra-rare signature.'
  },
  postgame_boss_tower: {
    unlockFlag: 'rareTowerUnlocked',
    message: 'Final Tower rare echoes now answer your challenge.'
  }
};

const MAP_PICKUPS: PickupDefinition[] = [
  {
    id: 'pickup-coreseal-3',
    mapId: 'starterTown',
    x: 4,
    y: 16,
    item: 'coreSeal',
    amount: 3,
    storyFlag: 'pickup_coreseal_bundle_1',
    textureKey: 'pickup-coreseal'
  },
  {
    id: 'pickup-potion-1',
    mapId: 'starterTown',
    x: 24,
    y: 13,
    item: 'potion',
    amount: 1,
    storyFlag: 'pickup_potion_single_1',
    textureKey: 'pickup-potion'
  }
];

const HEAL_MAP_BY_REGION: Partial<Record<MapId, MapId>> = {
  starterTown: 'healHouse',
  healHouse: 'healHouse',
  route1: 'healHouse',
  verdantisTown: 'verdantisHealHouse',
  verdantisHealHouse: 'verdantisHealHouse',
  verdantTrial: 'verdantisHealHouse',
  northPass: 'brinegateHealHouse',
  route2: 'brinegateHealHouse',
  brinegateTown: 'brinegateHealHouse',
  brinegateHealHouse: 'brinegateHealHouse',
  brinegateTrial: 'brinegateHealHouse',
  cave1: 'stonecrossHealHouse',
  stonecrossTown: 'stonecrossHealHouse',
  stonecrossHealHouse: 'stonecrossHealHouse',
  stonecrossTrial: 'stonecrossHealHouse',
  route3: 'coilhavenHealHouse',
  coilhavenTown: 'coilhavenHealHouse',
  coilhavenHealHouse: 'coilhavenHealHouse',
  coilhavenTrial: 'coilhavenHealHouse',
  marsh1: 'hollowmereHealHouse',
  hollowmereTown: 'hollowmereHealHouse',
  hollowmereHealHouse: 'hollowmereHealHouse',
  hollowmereTrial: 'hollowmereHealHouse',
  route4: 'obsidianForgeHealHouse',
  obsidianForgeTown: 'obsidianForgeHealHouse',
  obsidianForgeHealHouse: 'obsidianForgeHealHouse',
  obsidianTrial: 'obsidianForgeHealHouse',
  bridge1: 'skydriftHealHouse',
  skydriftSpiresTown: 'skydriftHealHouse',
  skydriftHealHouse: 'skydriftHealHouse',
  skydriftTrial: 'skydriftHealHouse',
  choirfallRuins: 'choirfallHealHouse',
  choirfallHealHouse: 'choirfallHealHouse',
  finalTower: 'choirfallHealHouse'
};

export class OverworldScene extends Phaser.Scene {
  private tileMap!: TileMap;
  private dialogSystem!: DialogSystem;
  private audio!: AudioSystem;
  private gameState!: GameState;
  private player!: Phaser.GameObjects.Image;
  private playerTile = new Phaser.Math.Vector2(0, 0);
  private facing: Direction = 'down';
  private isMoving = false;
  private isTransitioning = false;
  private currentMap!: MapDefinition;
  private currentMapId: MapId = 'starterTown';
  private npcs: NpcInstance[] = [];
  private gateObjects: GateInstance[] = [];
  private pickups: PickupInstance[] = [];
  private activeTrainerEncounter: ActiveTrainerEncounter | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveKeys!: Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private warpKey?: Phaser.Input.Keyboard.Key;
  private devWarpOpen = false;
  private devWarpIndex = 0;
  private devWarpPanel?: Phaser.GameObjects.Rectangle;
  private devWarpText?: Phaser.GameObjects.Text;

  public constructor() {
    super(SCENE_KEYS.OVERWORLD);
  }

  public create(): void {
    this.audio = new AudioSystem(this);
    this.dialogSystem = new DialogSystem(this);
    this.tileMap = new TileMap(this, TILE_SIZE);
    this.gameState = getActiveGameState();

    if (this.gameState.party.length === 0) {
      this.gameState.party = [createCreatureInstance('embercub', 5)];
    }

    this.player = this.add
      .image(0, 0, ProcSpriteFactory.generateOverworld(this, this.gameState.party[0].speciesId))
      .setOrigin(0)
      .setDepth(500);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.moveKeys = {
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    if (import.meta.env.DEV) {
      this.warpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    }

    this.ensurePickupTextures();

    const camera = this.cameras.main;
    camera.setZoom(1);
    camera.setRoundPixels(true);
    camera.setDeadzone(64, 40);
    camera.startFollow(this.player, true, 0.25, 0.25);

    const startMapId = this.gameState.player.mapId;
    this.loadMap(startMapId, {
      x: this.gameState.player.x,
      y: this.gameState.player.y,
      facing: this.facing
    });

    this.events.on(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
    });
  }

  public update(_time: number, delta: number): void {
    this.gameState.meta.playTimeSeconds += delta / 1000;
    this.handleUpdateInput();
  }

  private handleUpdateInput(): void {
    if (import.meta.env.DEV && this.warpKey && Phaser.Input.Keyboard.JustDown(this.warpKey)) {
      if (!this.dialogSystem.isActive() && !this.isTransitioning && !this.isMoving) {
        this.toggleDevWarpPanel();
        this.publishOverworldState();
      }
    }

    if (this.devWarpOpen) {
      this.updateDevWarpInput();
      this.publishOverworldState();
      return;
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.escKey) &&
      !this.dialogSystem.isActive() &&
      !this.isTransitioning &&
      !this.isMoving &&
      !this.activeTrainerEncounter
    ) {
      this.scene.launch(SCENE_KEYS.PARTY, { source: 'menu' });
      this.scene.pause(SCENE_KEYS.OVERWORLD);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      if (this.dialogSystem.isActive()) {
        this.audio.beep({ frequency: 690, durationMs: 65 });
        this.dialogSystem.advance();
      } else if (!this.isTransitioning && !this.isMoving && !this.activeTrainerEncounter) {
        this.tryStartDialog();
      }
    }

    if (
      this.dialogSystem.isActive() ||
      this.isTransitioning ||
      this.isMoving ||
      this.activeTrainerEncounter
    ) {
      this.publishOverworldState();
      return;
    }

    const inputDirection = this.resolveMovementInput();
    if (!inputDirection) {
      this.publishOverworldState();
      return;
    }

    this.tryMove(inputDirection);
    this.publishOverworldState();
  }

  private loadMap(mapId: MapId, spawnOverride?: SpawnPoint): void {
    this.currentMapId = mapId;
    this.currentMap = this.tileMap.load(mapId);

    const spawn = spawnOverride ?? this.currentMap.spawn;
    this.playerTile.set(spawn.x, spawn.y);
    this.facing = spawn.facing;

    movePlayerTo(this.gameState, mapId, spawn.x, spawn.y);

    const worldPosition = this.tileMap.tileToWorld(spawn.x, spawn.y);
    this.player.setPosition(worldPosition.x, worldPosition.y);
    this.player.setDepth(500 + this.player.y);

    this.renderNpcs();
    this.renderGateObjects();
    this.renderPickups();

    this.cameras.main.setBounds(0, 0, this.tileMap.getPixelWidth(), this.tileMap.getPixelHeight());

    if (this.currentMap.healOnEnter) {
      healParty(this.gameState);
    }

    this.publishOverworldState();
  }

  private renderNpcs(): void {
    this.npcs.forEach((npc) => npc.sprite.destroy());
    this.npcs = [];

    this.currentMap.npcs
      .filter(
        (npc) =>
          (!npc.requiresFlag || hasStoryFlag(this.gameState, npc.requiresFlag)) &&
          (!npc.hiddenIfFlag || !hasStoryFlag(this.gameState, npc.hiddenIfFlag))
      )
      .forEach((npcDefinition) => {
        const textureKey = `npc-${npcDefinition.id}`;
        this.ensureActorTexture(textureKey, npcDefinition.color, 0x1f2f44);

        const worldPosition = this.tileMap.tileToWorld(npcDefinition.x, npcDefinition.y);
        const sprite = this.add
          .image(worldPosition.x, worldPosition.y, textureKey)
          .setOrigin(0)
          .setDepth(400 + worldPosition.y);

        this.npcs.push({
          ...npcDefinition,
          sprite
        });
      });
  }

  private renderGateObjects(): void {
    this.gateObjects.forEach((gate) => gate.sprite.destroy());
    this.gateObjects = [];

    this.currentMap.blockedGates
      .filter((gate) => !hasStoryFlag(this.gameState, gate.requiredFlag))
      .forEach((gateDefinition) => {
        const textureKey = `gate-${gateDefinition.id}`;
        this.ensureGateTexture(
          textureKey,
          gateDefinition.color ?? 0x653a97,
          gateDefinition.accentColor ?? 0xc6a8ff
        );

        const worldPosition = this.tileMap.tileToWorld(gateDefinition.x, gateDefinition.y);
        const sprite = this.add
          .image(worldPosition.x, worldPosition.y, textureKey)
          .setOrigin(0)
          .setDepth(420 + worldPosition.y);

        this.gateObjects.push({
          ...gateDefinition,
          sprite
        });
      });
  }

  private renderPickups(): void {
    this.pickups.forEach((pickup) => pickup.sprite.destroy());
    this.pickups = [];

    MAP_PICKUPS.filter(
      (pickup) =>
        pickup.mapId === this.currentMapId && !hasStoryFlag(this.gameState, pickup.storyFlag)
    ).forEach((pickup) => {
      const world = this.tileMap.tileToWorld(pickup.x, pickup.y);
      const sprite = this.add
        .image(world.x, world.y, pickup.textureKey)
        .setOrigin(0)
        .setDepth(340 + world.y);

      this.pickups.push({
        ...pickup,
        sprite
      });
    });
  }

  private resolveMovementInput(): InputDirection | null {
    const leftPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.left!) ||
      Phaser.Input.Keyboard.JustDown(this.moveKeys.a);
    const rightPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.right!) ||
      Phaser.Input.Keyboard.JustDown(this.moveKeys.d);
    const upPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
      Phaser.Input.Keyboard.JustDown(this.moveKeys.w);
    const downPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.down!) ||
      Phaser.Input.Keyboard.JustDown(this.moveKeys.s);

    if (upPressed || this.cursors.up!.isDown || this.moveKeys.w.isDown) {
      return { direction: 'up', deltaX: 0, deltaY: -1 };
    }

    if (downPressed || this.cursors.down!.isDown || this.moveKeys.s.isDown) {
      return { direction: 'down', deltaX: 0, deltaY: 1 };
    }

    if (leftPressed || this.cursors.left!.isDown || this.moveKeys.a.isDown) {
      return { direction: 'left', deltaX: -1, deltaY: 0 };
    }

    if (rightPressed || this.cursors.right!.isDown || this.moveKeys.d.isDown) {
      return { direction: 'right', deltaX: 1, deltaY: 0 };
    }

    return null;
  }

  private tryMove(inputDirection: InputDirection): void {
    this.facing = inputDirection.direction;

    const targetX = this.playerTile.x + inputDirection.deltaX;
    const targetY = this.playerTile.y + inputDirection.deltaY;

    const blockedGate = this.getGateAt(targetX, targetY);
    if (blockedGate) {
      this.audio.beep({ frequency: 240, durationMs: 70 });
      if (!this.dialogSystem.isActive()) {
        this.dialogSystem.start([{ speaker: blockedGate.name, text: blockedGate.blockedMessage }]);
      }
      return;
    }

    if (!this.tileMap.isWalkable(targetX, targetY) || this.npcBlocksTile(targetX, targetY)) {
      return;
    }

    const targetWorld = this.tileMap.tileToWorld(targetX, targetY);
    this.isMoving = true;

    this.tweens.add({
      targets: this.player,
      x: targetWorld.x,
      y: targetWorld.y,
      duration: 115,
      ease: 'Linear',
      onComplete: () => {
        this.playerTile.set(targetX, targetY);
        this.player.setDepth(500 + this.player.y);
        this.isMoving = false;

        movePlayerTo(this.gameState, this.currentMapId, targetX, targetY);

        this.checkPickupCollection(targetX, targetY);

        const transition = this.tileMap.getTransitionAt(targetX, targetY);
        if (transition) {
          this.handleTransitionTile(transition);
          this.publishOverworldState();
          return;
        }

        this.tryTriggerEncounter(targetX, targetY);
        this.publishOverworldState();
      }
    });
  }

  private handleTransitionTile(transition: MapTransition): void {
    if (transition.requiredFlag && !hasStoryFlag(this.gameState, transition.requiredFlag)) {
      if (transition.requiredFlag === 'rivalRowanDefeated') {
        const rivalNpc = this.npcs.find((npc) => npc.trainer?.trainerId === 'rival_rowan');
        if (rivalNpc) {
          this.startTrainerEncounter(rivalNpc);
          return;
        }
      }

      this.audio.beep({ frequency: 250, durationMs: 80 });
      if (transition.blockedMessage) {
        this.dialogSystem.start([
          {
            speaker: 'System',
            text: transition.blockedMessage
          }
        ]);
      }
      return;
    }

    this.transitionToMapLink(transition);
  }

  private tryTriggerEncounter(tileX: number, tileY: number): void {
    if (this.dialogSystem.isActive() || this.isTransitioning || this.activeTrainerEncounter) {
      return;
    }

    const encounterConfig = this.currentMap.encounter;
    if (!encounterConfig || !encounterConfig.enabled) {
      return;
    }

    if (this.tileMap.getTileType(tileX, tileY) !== 'grass') {
      return;
    }

    const chance = encounterConfig.chance ?? DEFAULT_ENCOUNTER_CHANCE;
    if (Math.random() >= chance) {
      return;
    }

    const encounter = this.createEncounterEnemy();
    this.startEncounterTransition(encounter);
  }

  private startEncounterTransition(encounter: EncounterRollResult): void {
    this.isTransitioning = true;
    this.audio.sweep({
      fromFrequency: 240,
      toFrequency: 1240,
      durationMs: 180,
      type: 'triangle'
    });

    const camera = this.cameras.main;
    camera.flash(90, 255, 255, 255, true);

    this.time.delayedCall(90, () => {
      camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.launch(SCENE_KEYS.BATTLE, {
          battleType: 'wild',
          enemy: encounter.enemy,
          rareEncounter: encounter.rareEncounter
        });
        this.scene.pause(SCENE_KEYS.OVERWORLD);
      });

      camera.fadeOut(260, 0, 0, 0);
    });
  }

  public createEncounterEnemy(): EncounterRollResult {
    const encounterConfig = this.currentMap.encounter;
    const table = (encounterConfig?.table ?? []).filter(
      (entry) => !entry.requiredFlag || hasStoryFlag(this.gameState, entry.requiredFlag)
    );
    const ultraRareTable = (encounterConfig?.ultraRareTable ?? []).filter(
      (entry) => !entry.requiredFlag || hasStoryFlag(this.gameState, entry.requiredFlag)
    );
    const ultraRareRate = Phaser.Math.Clamp(encounterConfig?.ultraRareRate ?? 0.015, 0.01, 0.02);
    const levelRange = encounterConfig?.levelRange ?? { min: 2, max: 4 };
    const pickEncounterSpecies = (entries: typeof table): CreatureId | null => {
      if (entries.length === 0) {
        return null;
      }

      const totalWeight = entries.reduce((sum, entry) => sum + Math.max(1, entry.weight), 0);
      let roll = Math.random() * Math.max(1, totalWeight);
      for (const entry of entries) {
        roll -= Math.max(1, entry.weight);
        if (roll <= 0) {
          return entry.speciesId;
        }
      }

      return entries[entries.length - 1]?.speciesId ?? null;
    };

    let selectedId: CreatureId =
      table[table.length - 1]?.speciesId ?? this.gameState.party[0]?.speciesId ?? 'embercub';
    let rareEncounter = false;

    if (ultraRareTable.length > 0 && Math.random() < ultraRareRate) {
      const ultraRarePick = pickEncounterSpecies(ultraRareTable);
      if (ultraRarePick) {
        selectedId = ultraRarePick;
        rareEncounter = true;
      }
    } else if (table.length > 0) {
      const regularPick = pickEncounterSpecies(table);
      if (regularPick) {
        selectedId = regularPick;
      }
    }

    const level = Phaser.Math.Between(levelRange.min, levelRange.max);
    rareEncounter = rareEncounter || getCreatureDefinition(selectedId).rareFlag === true;
    return {
      enemy: createCreatureInstance(selectedId, level),
      rareEncounter
    };
  }

  private tryStartDialog(): void {
    const facingTile = this.getFacingTile();
    const npc = this.npcs.find((entry) => entry.x === facingTile.x && entry.y === facingTile.y);
    if (!npc) {
      return;
    }

    if (npc.interaction === 'terminal') {
      this.audio.beep({ frequency: 740, durationMs: 70 });
      this.scene.launch(SCENE_KEYS.PARTY, { source: 'terminal' });
      this.scene.pause(SCENE_KEYS.OVERWORLD);
      this.publishOverworldState();
      return;
    }

    if (npc.trainer) {
      if (hasStoryFlag(this.gameState, npc.trainer.defeatFlag)) {
        const line = npc.trainer.repeatLine ?? npc.trainer.postBattleLines[0] ?? npc.lines[0];
        this.dialogSystem.start([
          {
            speaker: npc.name,
            text: line
          }
        ]);
        this.publishOverworldState();
        return;
      }

      this.startTrainerEncounter(npc);
      this.publishOverworldState();
      return;
    }

    const dialogEntries: DialogEntry[] = npc.lines.map((line) => ({
      speaker: npc.name,
      text: line
    }));

    this.audio.beep({ frequency: 840, durationMs: 70 });
    this.dialogSystem.start(dialogEntries, () => {
      this.publishOverworldState();
    });
    this.publishOverworldState();
  }

  private startTrainerEncounter(npc: NpcInstance): void {
    const trainer = npc.trainer;
    if (!trainer) {
      return;
    }

    const team = this.createTrainerTeam(trainer.trainerId);
    if (team.length === 0) {
      return;
    }

    this.activeTrainerEncounter = {
      trainerId: trainer.trainerId,
      defeatFlag: trainer.defeatFlag,
      npcName: npc.name,
      team,
      postBattleLines: trainer.postBattleLines,
      repeatLine: trainer.repeatLine
    };

    this.audio.beep({ frequency: 860, durationMs: 70 });
    this.dialogSystem.start(
      [
        {
          speaker: npc.name,
          text: trainer.preBattleLine
        }
      ],
      () => {
        this.launchTrainerBattle();
      }
    );
  }

  private launchTrainerBattle(): void {
    const encounter = this.activeTrainerEncounter;
    if (!encounter) {
      return;
    }

    this.isTransitioning = true;
    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.launch(SCENE_KEYS.BATTLE, {
        battleType: 'trainer',
        trainerName: encounter.npcName,
        enemyTeam: encounter.team
      });
      this.scene.pause(SCENE_KEYS.OVERWORLD);
    });

    camera.fadeOut(240, 0, 0, 0);
  }

  private completeTrainerEncounter(): void {
    const encounter = this.activeTrainerEncounter;
    if (!encounter) {
      return;
    }

    markStoryFlag(this.gameState, encounter.defeatFlag);

    const rewardLines = [...encounter.postBattleLines];
    const trialReward = TRIAL_REWARDS[encounter.trainerId];
    const postgameReward = POSTGAME_BOSS_REWARDS[encounter.trainerId];
    let shouldStartCredits = false;

    if (trialReward) {
      markStoryFlag(this.gameState, trialReward.flag);
      addInventory(this.gameState, 'trialSigil', 1);
      if (trialReward.uniqueInventoryKey) {
        addInventory(this.gameState, trialReward.uniqueInventoryKey, 1);
      }
      rewardLines.push(`Received ${trialReward.sigilName}!`);
      if (trialReward.marksGameComplete) {
        markStoryFlag(this.gameState, 'gameComplete');
        shouldStartCredits = true;
      }
    }

    if (postgameReward && !hasStoryFlag(this.gameState, postgameReward.unlockFlag)) {
      markStoryFlag(this.gameState, postgameReward.unlockFlag);
      rewardLines.push(postgameReward.message);
    }

    if (encounter.trainerId === 'rival_rowan') {
      rewardLines.push('You should heal in Verdantis before attempting the Trial.');
      markStoryFlag(this.gameState, 'rivalDefeated');
    }

    this.activeTrainerEncounter = null;
    this.renderNpcs();
    this.renderGateObjects();
    SaveSystem.save(this.gameState);

    const finalize = () => {
      if (!shouldStartCredits) {
        this.publishOverworldState();
        return;
      }

      this.time.delayedCall(120, () => {
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start(SCENE_KEYS.CREDITS);
        });
        this.cameras.main.fadeOut(320, 0, 0, 0);
      });
    };

    if (rewardLines.length > 0) {
      this.dialogSystem.start(
        rewardLines.map((line) => ({
          speaker: encounter.npcName,
          text: line
        })),
        finalize
      );
      return;
    }

    finalize();
  }

  private createTrainerTeam(trainerId: string): CreatureInstance[] {
    const template = TRAINER_TEAM_DEFINITIONS[trainerId];
    if (!template) {
      return [];
    }

    const difficulty = this.gameState.difficulty;
    const levelDelta = difficulty === 'easy' ? -2 : difficulty === 'hard' ? 2 : 0;

    if (template === 'weakStarter') {
      const leadType = getCreatureDefinition(this.gameState.party[0]?.speciesId ?? 'embercub').type;
      let weakSpecies: CreatureId = 'bloomfin';
      let supportSpecies: CreatureId = 'shadeowl';

      if (leadType === 'Tide') {
        weakSpecies = 'embercub';
        supportSpecies = 'pebblit';
      } else if (leadType === 'Bloom') {
        weakSpecies = 'tidepup';
        supportSpecies = 'sparkit';
      }

      return [weakSpecies, supportSpecies].map((speciesId) =>
        createCreatureInstance(speciesId, Math.max(2, Phaser.Math.Between(7, 8) + levelDelta))
      );
    }

    let adjustedEntries = template.map((entry) => ({
      speciesId: entry.speciesId,
      level: Math.max(2, entry.level + levelDelta)
    }));

    const trialOrder = TRIAL_TEAM_ORDER[trainerId] ?? null;

    if (difficulty === 'easy' && trialOrder !== null && trialOrder >= 5) {
      const targetSize = Math.max(2, adjustedEntries.length - 1);
      adjustedEntries = adjustedEntries.slice(0, targetSize);
    }

    if (
      difficulty === 'hard' &&
      trialOrder !== null &&
      trialOrder >= 3 &&
      adjustedEntries.length < 5
    ) {
      const usedSpecies = new Set(adjustedEntries.map((entry) => entry.speciesId));
      const bonusPool = HARD_TRIAL_BONUS_SPECIES[trainerId] ?? [];
      const bonusSpecies = bonusPool.find((speciesId) => !usedSpecies.has(speciesId));

      if (bonusSpecies) {
        const highestLevel = adjustedEntries.reduce(
          (maxLevel, entry) => Math.max(maxLevel, entry.level),
          adjustedEntries[0]?.level ?? 2
        );
        adjustedEntries.push({
          speciesId: bonusSpecies,
          level: Math.max(2, Math.min(45, highestLevel + 1))
        });
      }
    }

    return adjustedEntries
      .slice(0, 5)
      .map((entry) => createCreatureInstance(entry.speciesId, entry.level));
  }

  private transitionToMapLink(transition: MapTransition): void {
    if (this.isTransitioning) {
      return;
    }

    this.isTransitioning = true;
    const camera = this.cameras.main;

    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.loadMap(transition.toMapId, {
        x: transition.toX,
        y: transition.toY,
        facing: transition.toFacing
      });
      camera.fadeIn(280, 0, 0, 0);
    });

    camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.isTransitioning = false;
      SaveSystem.save(this.gameState);
      this.publishOverworldState();
    });

    camera.fadeOut(280, 0, 0, 0);
  }

  private checkPickupCollection(tileX: number, tileY: number): void {
    const pickup = this.pickups.find((entry) => entry.x === tileX && entry.y === tileY);
    if (!pickup) {
      return;
    }

    markStoryFlag(this.gameState, pickup.storyFlag);
    addInventory(this.gameState, pickup.item, pickup.amount);

    pickup.sprite.destroy();
    this.pickups = this.pickups.filter((entry) => entry.id !== pickup.id);

    const quantityLabel = pickup.amount > 1 ? `x${pickup.amount}` : '';
    const itemName = this.getItemLabel(pickup.item);

    this.audio.beep({ frequency: 920, durationMs: 90 });
    this.dialogSystem.start([
      {
        speaker: 'System',
        text: `Found ${itemName} ${quantityLabel}`.trim()
      }
    ]);
  }

  private handleSceneResume(_sys: Phaser.Scenes.Systems, data?: unknown): void {
    const payload = data as OverworldResumeData | undefined;
    if (!payload) {
      return;
    }

    this.gameState = getActiveGameState();

    if (payload.source === 'battle') {
      if (payload.outcome === 'defeat') {
        this.activeTrainerEncounter = null;
        healParty(this.gameState);

        const healTargetMap = HEAL_MAP_BY_REGION[this.currentMapId] ?? 'healHouse';
        const healTarget = MAP_DEFINITIONS[healTargetMap];
        this.loadMap(healTarget.mapId, healTarget.spawn);
        SaveSystem.save(this.gameState);
      } else if (payload.outcome === 'victory' && this.activeTrainerEncounter) {
        this.completeTrainerEncounter();
      }

      this.isTransitioning = false;
      this.isMoving = false;
      this.cameras.main.resetFX();
      this.cameras.main.fadeIn(280, 0, 0, 0);
    }

    this.syncPlayerTexture();
    this.publishOverworldState();
  }

  public syncPlayerTexture(): void {
    const leadSpecies = this.gameState.party[0]?.speciesId ?? 'embercub';
    const textureKey = ProcSpriteFactory.generateOverworld(this, leadSpecies);
    this.player.setTexture(textureKey);
  }

  private getFacingTile(): Phaser.Math.Vector2 {
    const deltas: Record<Direction, Phaser.Math.Vector2> = {
      up: new Phaser.Math.Vector2(0, -1),
      down: new Phaser.Math.Vector2(0, 1),
      left: new Phaser.Math.Vector2(-1, 0),
      right: new Phaser.Math.Vector2(1, 0)
    };

    const delta = deltas[this.facing];
    return new Phaser.Math.Vector2(this.playerTile.x + delta.x, this.playerTile.y + delta.y);
  }

  private npcBlocksTile(tileX: number, tileY: number): boolean {
    return this.npcs.some((npc) => npc.x === tileX && npc.y === tileY);
  }

  private getGateAt(tileX: number, tileY: number): GateInstance | null {
    return this.gateObjects.find((gate) => gate.x === tileX && gate.y === tileY) ?? null;
  }

  private ensureActorTexture(textureKey: string, primaryColor: number, accentColor: number): void {
    if (this.textures.exists(textureKey)) {
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(primaryColor, 1);
    graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.fillStyle(accentColor, 1);
    graphics.fillRect(2, 2, TILE_SIZE - 4, 3);
    graphics.fillRect(3, 8, TILE_SIZE - 6, 6);
    graphics.fillStyle(0x111827, 1);
    graphics.fillRect(5, 5, 2, 2);
    graphics.fillRect(9, 5, 2, 2);
    graphics.generateTexture(textureKey, TILE_SIZE, TILE_SIZE);
    graphics.destroy();
  }

  private ensureGateTexture(textureKey: string, primary: number, accent: number): void {
    if (this.textures.exists(textureKey)) {
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(primary, 1);
    graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(2, 3, TILE_SIZE - 4, 3);
    graphics.fillRect(4, 8, TILE_SIZE - 8, 2);
    graphics.fillStyle(0x1b0f2e, 1);
    graphics.fillRect(3, 12, TILE_SIZE - 6, 2);
    graphics.generateTexture(textureKey, TILE_SIZE, TILE_SIZE);
    graphics.destroy();
  }

  private ensurePickupTextures(): void {
    this.createPickupTexture('pickup-coreseal', 0x4a8fff, 0x8bc6ff);
    this.createPickupTexture('pickup-potion', 0xdf5e6b, 0xffc7cd);
    this.createPickupTexture('pickup-cleanse', 0x8fdbbd, 0xd6ffe8);
  }

  private createPickupTexture(textureKey: string, primary: number, accent: number): void {
    if (this.textures.exists(textureKey)) {
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(primary, 1);
    graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.fillStyle(accent, 1);
    graphics.fillRect(3, 3, TILE_SIZE - 6, TILE_SIZE - 6);
    graphics.fillStyle(0x122033, 1);
    graphics.fillRect(6, 2, 4, 2);
    graphics.fillRect(6, 12, 4, 2);
    graphics.generateTexture(textureKey, TILE_SIZE, TILE_SIZE);
    graphics.destroy();
  }

  private getItemLabel(item: InventoryKey): string {
    if (item === 'coreSeal') {
      return 'Core Seal';
    }

    if (item === 'potion') {
      return 'Potion';
    }

    if (item === 'cleanse') {
      return 'Cleanse';
    }

    if (item === 'trialSigil') {
      return 'Trial Sigil';
    }

    return 'Verdant Sigil';
  }

  private toggleDevWarpPanel(): void {
    if (this.devWarpOpen) {
      this.closeDevWarpPanel();
      return;
    }

    this.devWarpOpen = true;
    this.devWarpIndex = 0;

    const panelWidth = 260;
    const panelHeight = 196;
    const panelX = 16;
    const panelY = 42;

    this.devWarpPanel = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x071323, 0.95)
      .setOrigin(0)
      .setStrokeStyle(2, 0x88b7df, 1)
      .setDepth(5000);

    this.devWarpText = this.add
      .text(panelX + 10, panelY + 10, '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        color: '#d5ebff',
        lineSpacing: 3
      })
      .setDepth(5001);

    this.renderDevWarpPanel();
  }

  private closeDevWarpPanel(): void {
    this.devWarpOpen = false;
    this.devWarpPanel?.destroy();
    this.devWarpText?.destroy();
    this.devWarpPanel = undefined;
    this.devWarpText = undefined;
  }

  private renderDevWarpPanel(): void {
    if (!this.devWarpText) {
      return;
    }

    const rows = TOWN_WARP_MAPS.map(
      (mapId, index) => `${index === this.devWarpIndex ? '>' : ' '} ${mapId}`
    );
    this.devWarpText.setText([
      'DEV WARP (P)',
      'Up/Down: Select',
      'Enter: Warp    Esc: Close',
      '',
      ...rows
    ]);
  }

  private updateDevWarpInput(): void {
    if (!this.devWarpOpen) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closeDevWarpPanel();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up!)) {
      this.devWarpIndex = Phaser.Math.Wrap(this.devWarpIndex - 1, 0, TOWN_WARP_MAPS.length);
      this.renderDevWarpPanel();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.down!)) {
      this.devWarpIndex = Phaser.Math.Wrap(this.devWarpIndex + 1, 0, TOWN_WARP_MAPS.length);
      this.renderDevWarpPanel();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      const targetMapId = TOWN_WARP_MAPS[this.devWarpIndex];
      const targetMap = MAP_DEFINITIONS[targetMapId];
      this.closeDevWarpPanel();
      this.loadMap(targetMapId, targetMap.spawn);
      SaveSystem.save(this.gameState);
    }
  }

  public publishOverworldState(): void {
    const lead = this.gameState.party[0];
    const leadDefinition = lead ? getCreatureDefinition(lead.speciesId) : null;

    const completedTrials = Object.keys(this.gameState.storyFlags).filter(
      (flag) =>
        flag.startsWith('trial') &&
        flag.endsWith('Complete') &&
        this.gameState.storyFlags[flag] === true
    ).length;

    this.registry.set('gameState', {
      difficulty: this.gameState.difficulty,
      player: { ...this.gameState.player },
      party: this.gameState.party.map((creature) => ({
        speciesId: creature.speciesId,
        name: creature.nickname ?? getCreatureDefinition(creature.speciesId).name,
        level: creature.level,
        xp: creature.xp,
        currentHp: creature.currentHp,
        maxHp: creature.stats.hp,
        status: creature.status,
        moves: [...creature.moves]
      })),
      storageCount: this.gameState.storage.length,
      inventory: { ...this.gameState.inventory },
      storyFlags: { ...this.gameState.storyFlags },
      playTimeSeconds: Math.floor(this.gameState.meta.playTimeSeconds)
    });

    this.registry.set('overworldState', {
      mapId: this.currentMapId,
      player: {
        x: this.playerTile.x,
        y: this.playerTile.y,
        facing: this.facing,
        moving: this.isMoving
      },
      facingTile: this.getFacingTile(),
      dialogActive: this.dialogSystem.isActive(),
      transitioning: this.isTransitioning,
      encounterEnabled: this.currentMap.encounter?.enabled ?? false,
      encounterChance: this.currentMap.encounter?.chance ?? DEFAULT_ENCOUNTER_CHANCE,
      difficulty: this.gameState.difficulty,
      completedTrials,
      activeTrainerId: this.activeTrainerEncounter?.trainerId ?? null,
      leadCreature: lead
        ? {
            id: lead.speciesId,
            name: lead.nickname ?? leadDefinition?.name,
            level: lead.level,
            xp: lead.xp,
            currentHp: lead.currentHp,
            maxHp: lead.stats.hp
          }
        : null,
      inventory: { ...this.gameState.inventory },
      npcs: this.npcs.map((npc) => ({
        id: npc.id,
        name: npc.name,
        x: npc.x,
        y: npc.y
      })),
      gates: this.gateObjects.map((gate) => ({
        id: gate.id,
        x: gate.x,
        y: gate.y,
        requiredFlag: gate.requiredFlag
      })),
      pickups: this.pickups.map((pickup) => ({
        id: pickup.id,
        item: pickup.item,
        amount: pickup.amount,
        x: pickup.x,
        y: pickup.y
      })),
      devWarpOpen: this.devWarpOpen
    });
  }
}
