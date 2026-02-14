import Phaser from 'phaser';
import {
  MAP_DEFINITIONS,
  TILE_SIZE,
  type BossConfig,
  type BlockedGateDefinition,
  type DialogEntry,
  type Direction,
  type MapDefinition,
  type MapExitDefinition,
  type MapId,
  type NpcDefinition,
  type SpawnPoint,
  type TileType,
  type TrainerNpcMeta
} from '../world/WorldMaps';

export {
  MAP_DEFINITIONS,
  TILE_SIZE,
  type BossConfig,
  type BlockedGateDefinition,
  type DialogEntry,
  type Direction,
  type MapDefinition,
  type MapId,
  type NpcDefinition,
  type SpawnPoint,
  type TileType,
  type TrainerNpcMeta
};

export type MapTransition = MapExitDefinition;

const TILE_TEXTURE_KEYS: Record<TileType, string[]> = {
  grass: ['tile-grass-0', 'tile-grass-1', 'tile-grass-2'],
  wall: ['tile-wall-0', 'tile-wall-1', 'tile-wall-2'],
  floor: ['tile-floor-0', 'tile-floor-1', 'tile-floor-2'],
  water: ['tile-water-0', 'tile-water-1', 'tile-water-2'],
  door: ['tile-door-0', 'tile-door-1']
};

export class TileMap {
  private readonly scene: Phaser.Scene;

  private readonly tileSize: number;

  private tileSprites: Phaser.GameObjects.Image[] = [];

  private currentMap: MapDefinition = MAP_DEFINITIONS.starterTown;

  public constructor(scene: Phaser.Scene, tileSize = TILE_SIZE) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.ensureTileTextures();
  }

  public load(mapId: MapId): MapDefinition {
    this.clearRenderedTiles();
    this.currentMap = MAP_DEFINITIONS[mapId];

    this.currentMap.tiles.forEach((row, tileY) => {
      row.forEach((tileType, tileX) => {
        const worldX = tileX * this.tileSize;
        const worldY = tileY * this.tileSize;
        const textureKey = this.getTileTextureKey(tileType, tileX, tileY);

        const sprite = this.scene.add.image(worldX, worldY, textureKey).setOrigin(0).setDepth(0);

        this.tileSprites.push(sprite);
      });
    });

    return this.currentMap;
  }

  public getCurrentMap(): MapDefinition {
    return this.currentMap;
  }

  public getPixelWidth(): number {
    return this.currentMap.width * this.tileSize;
  }

  public getPixelHeight(): number {
    return this.currentMap.height * this.tileSize;
  }

  public tileToWorld(tileX: number, tileY: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(tileX * this.tileSize, tileY * this.tileSize);
  }

  public getTileType(tileX: number, tileY: number): TileType | null {
    if (!this.isInBounds(tileX, tileY)) {
      return null;
    }

    return this.currentMap.tiles[tileY][tileX];
  }

  public isWalkable(tileX: number, tileY: number): boolean {
    const tileType = this.getTileType(tileX, tileY);
    if (!tileType) {
      return false;
    }

    return tileType !== 'wall' && tileType !== 'water';
  }

  public getTransitionAt(tileX: number, tileY: number): MapTransition | null {
    return (
      this.currentMap.exits.find(
        (transition) => transition.x === tileX && transition.y === tileY
      ) ?? null
    );
  }

  public isInBounds(tileX: number, tileY: number): boolean {
    return (
      tileX >= 0 && tileX < this.currentMap.width && tileY >= 0 && tileY < this.currentMap.height
    );
  }

  public destroy(): void {
    this.clearRenderedTiles();
  }

  private clearRenderedTiles(): void {
    this.tileSprites.forEach((tileSprite) => tileSprite.destroy());
    this.tileSprites = [];
  }

  private ensureTileTextures(): void {
    this.createTextureIfMissing('tile-grass-0', (graphics) => {
      graphics.fillStyle(0x3f8f42, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x58aa56, 1);
      graphics.fillRect(2, 2, 2, 2);
      graphics.fillRect(10, 4, 2, 2);
      graphics.fillRect(6, 10, 2, 2);
      graphics.fillStyle(0x2d6d35, 1);
      graphics.fillRect(12, 11, 2, 2);
      graphics.fillRect(4, 13, 1, 1);
    });

    this.createTextureIfMissing('tile-grass-1', (graphics) => {
      graphics.fillStyle(0x3c8b40, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x56a953, 1);
      graphics.fillRect(1, 3, 2, 2);
      graphics.fillRect(8, 5, 2, 2);
      graphics.fillRect(12, 9, 2, 2);
      graphics.fillStyle(0x2c6b33, 1);
      graphics.fillRect(4, 11, 2, 2);
      graphics.fillRect(10, 13, 1, 1);
    });

    this.createTextureIfMissing('tile-grass-2', (graphics) => {
      graphics.fillStyle(0x419245, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x5aae58, 1);
      graphics.fillRect(2, 2, 1, 1);
      graphics.fillRect(5, 6, 2, 2);
      graphics.fillRect(11, 4, 2, 2);
      graphics.fillStyle(0x2a6832, 1);
      graphics.fillRect(3, 12, 2, 2);
      graphics.fillRect(13, 10, 1, 1);
    });

    this.createTextureIfMissing('tile-wall-0', (graphics) => {
      graphics.fillStyle(0x555967, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x7a7f90, 1);
      graphics.fillRect(1, 1, this.tileSize - 2, 2);
      graphics.fillRect(1, this.tileSize - 3, this.tileSize - 2, 2);
      graphics.fillStyle(0x343846, 1);
      graphics.fillRect(3, 5, 3, 3);
      graphics.fillRect(10, 9, 4, 3);
    });

    this.createTextureIfMissing('tile-wall-1', (graphics) => {
      graphics.fillStyle(0x535867, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x7f8595, 1);
      graphics.fillRect(2, 1, this.tileSize - 4, 2);
      graphics.fillRect(2, this.tileSize - 3, this.tileSize - 4, 2);
      graphics.fillStyle(0x343846, 1);
      graphics.fillRect(3, 6, 3, 2);
      graphics.fillRect(9, 10, 5, 2);
    });

    this.createTextureIfMissing('tile-wall-2', (graphics) => {
      graphics.fillStyle(0x505563, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x7a7f90, 1);
      graphics.fillRect(1, 2, this.tileSize - 2, 2);
      graphics.fillRect(1, this.tileSize - 4, this.tileSize - 2, 2);
      graphics.fillStyle(0x343846, 1);
      graphics.fillRect(2, 6, 4, 3);
      graphics.fillRect(10, 8, 3, 4);
    });

    this.createTextureIfMissing('tile-floor-0', (graphics) => {
      graphics.fillStyle(0xb6a57b, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0xcdb98a, 1);
      graphics.fillRect(0, 4, this.tileSize, 1);
      graphics.fillRect(0, 10, this.tileSize, 1);
      graphics.fillStyle(0x97825e, 1);
      graphics.fillRect(5, 1, 1, this.tileSize - 2);
      graphics.fillRect(11, 1, 1, this.tileSize - 2);
    });

    this.createTextureIfMissing('tile-floor-1', (graphics) => {
      graphics.fillStyle(0xb29f74, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0xc6b17f, 1);
      graphics.fillRect(0, 3, this.tileSize, 1);
      graphics.fillRect(0, 9, this.tileSize, 1);
      graphics.fillStyle(0x947e59, 1);
      graphics.fillRect(4, 1, 1, this.tileSize - 2);
      graphics.fillRect(10, 1, 1, this.tileSize - 2);
    });

    this.createTextureIfMissing('tile-floor-2', (graphics) => {
      graphics.fillStyle(0xb9a97f, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0xd0bc8f, 1);
      graphics.fillRect(0, 5, this.tileSize, 1);
      graphics.fillRect(0, 11, this.tileSize, 1);
      graphics.fillStyle(0x987f59, 1);
      graphics.fillRect(6, 1, 1, this.tileSize - 2);
      graphics.fillRect(12, 1, 1, this.tileSize - 2);
    });

    this.createTextureIfMissing('tile-water-0', (graphics) => {
      graphics.fillStyle(0x2a67b5, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x4b8ce0, 1);
      graphics.fillRect(0, 3, this.tileSize, 2);
      graphics.fillRect(0, 9, this.tileSize, 2);
      graphics.fillStyle(0x1f4f8f, 1);
      graphics.fillRect(4, 13, 6, 2);
    });

    this.createTextureIfMissing('tile-water-1', (graphics) => {
      graphics.fillStyle(0x2b69b7, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x4f92e3, 1);
      graphics.fillRect(0, 2, this.tileSize, 2);
      graphics.fillRect(0, 8, this.tileSize, 2);
      graphics.fillStyle(0x1e4d89, 1);
      graphics.fillRect(2, 13, 7, 2);
    });

    this.createTextureIfMissing('tile-water-2', (graphics) => {
      graphics.fillStyle(0x2964b1, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x4a8bdd, 1);
      graphics.fillRect(0, 4, this.tileSize, 2);
      graphics.fillRect(0, 10, this.tileSize, 2);
      graphics.fillStyle(0x1d4b87, 1);
      graphics.fillRect(6, 13, 6, 2);
    });

    this.createTextureIfMissing('tile-door-0', (graphics) => {
      graphics.fillStyle(0xb6a57b, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x5e3d22, 1);
      graphics.fillRect(3, 2, 10, 14);
      graphics.fillStyle(0x7d542f, 1);
      graphics.fillRect(5, 4, 6, 10);
      graphics.fillStyle(0xd1b07d, 1);
      graphics.fillRect(10, 8, 1, 1);
    });

    this.createTextureIfMissing('tile-door-1', (graphics) => {
      graphics.fillStyle(0xb4a276, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x5a3a20, 1);
      graphics.fillRect(3, 2, 10, 14);
      graphics.fillStyle(0x7b512d, 1);
      graphics.fillRect(5, 4, 6, 10);
      graphics.fillStyle(0xd5b786, 1);
      graphics.fillRect(9, 8, 1, 1);
    });
  }

  private createTextureIfMissing(
    textureKey: string,
    drawer: (graphics: Phaser.GameObjects.Graphics) => void
  ): void {
    if (this.scene.textures.exists(textureKey)) {
      return;
    }

    const graphics = this.scene.add.graphics();
    drawer(graphics);
    graphics.generateTexture(textureKey, this.tileSize, this.tileSize);
    graphics.destroy();
  }

  private getTileTextureKey(tileType: TileType, tileX: number, tileY: number): string {
    const variants = TILE_TEXTURE_KEYS[tileType];
    if (variants.length === 1) {
      return variants[0];
    }

    const hash = this.deterministicTileHash(tileX, tileY, tileType);
    return variants[hash % variants.length];
  }

  private deterministicTileHash(tileX: number, tileY: number, tileType: TileType): number {
    const typeSalt = tileType.charCodeAt(0) * 131 + tileType.charCodeAt(tileType.length - 1) * 17;
    const mixed = (tileX * 73856093) ^ (tileY * 19349663) ^ typeSalt;
    return Math.abs(mixed) >>> 0;
  }
}
