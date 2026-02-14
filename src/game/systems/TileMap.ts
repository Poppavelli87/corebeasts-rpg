import Phaser from 'phaser';
import {
  MAP_DEFINITIONS,
  TILE_SIZE,
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

const TILE_TEXTURE_KEYS: Record<TileType, string> = {
  grass: 'tile-grass',
  wall: 'tile-wall',
  floor: 'tile-floor',
  water: 'tile-water',
  door: 'tile-door'
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

        const sprite = this.scene.add
          .image(worldX, worldY, TILE_TEXTURE_KEYS[tileType])
          .setOrigin(0)
          .setDepth(0);

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
    this.createTextureIfMissing(TILE_TEXTURE_KEYS.grass, (graphics) => {
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

    this.createTextureIfMissing(TILE_TEXTURE_KEYS.wall, (graphics) => {
      graphics.fillStyle(0x555967, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x7a7f90, 1);
      graphics.fillRect(1, 1, this.tileSize - 2, 2);
      graphics.fillRect(1, this.tileSize - 3, this.tileSize - 2, 2);
      graphics.fillStyle(0x343846, 1);
      graphics.fillRect(3, 5, 3, 3);
      graphics.fillRect(10, 9, 4, 3);
    });

    this.createTextureIfMissing(TILE_TEXTURE_KEYS.floor, (graphics) => {
      graphics.fillStyle(0xb6a57b, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0xcdb98a, 1);
      graphics.fillRect(0, 4, this.tileSize, 1);
      graphics.fillRect(0, 10, this.tileSize, 1);
      graphics.fillStyle(0x97825e, 1);
      graphics.fillRect(5, 1, 1, this.tileSize - 2);
      graphics.fillRect(11, 1, 1, this.tileSize - 2);
    });

    this.createTextureIfMissing(TILE_TEXTURE_KEYS.water, (graphics) => {
      graphics.fillStyle(0x2a67b5, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x4b8ce0, 1);
      graphics.fillRect(0, 3, this.tileSize, 2);
      graphics.fillRect(0, 9, this.tileSize, 2);
      graphics.fillStyle(0x1f4f8f, 1);
      graphics.fillRect(4, 13, 6, 2);
    });

    this.createTextureIfMissing(TILE_TEXTURE_KEYS.door, (graphics) => {
      graphics.fillStyle(0xb6a57b, 1);
      graphics.fillRect(0, 0, this.tileSize, this.tileSize);
      graphics.fillStyle(0x5e3d22, 1);
      graphics.fillRect(3, 2, 10, 14);
      graphics.fillStyle(0x7d542f, 1);
      graphics.fillRect(5, 4, 6, 10);
      graphics.fillStyle(0xd1b07d, 1);
      graphics.fillRect(10, 8, 1, 1);
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
}
