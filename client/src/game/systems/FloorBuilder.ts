import Phaser from 'phaser';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import type { RoomConfig } from '@/game/config/roomConfig';
import type { SliceSkinConfig } from '@/game/config/terrainSkinConfig';
import { drawSliceSkin } from '@/game/systems/SliceSkin';

export const FLOOR_TILE = 64;
export const FLOOR_SURFACE_Y = GAME_HEIGHT - FLOOR_TILE;
/** 캐릭터(적 0, 플레이어 8) 뒤, 배경(-10) 앞. */
const FLOOR_DEPTH = -9;
const ENEMY_PIT_BARRIER_WIDTH = 8;
const ENEMY_PIT_BARRIER_HEIGHT = 160;

export type PitBounds = { start: number; end: number };

export function enemyPitBarrierXs(pits: readonly PitBounds[]) {
  return pits.flatMap(({ start, end }) => [start, end]);
}

/**
 * 현재 방의 바닥을 static body로 타일링하고, 방이 정의한 구덩이(pit) 위치는
 * 비워 둠. 그 구덩이들의 위치에 대한 단일 원본(source of truth) 역할도 함.
 *
 * 바닥 그룹과 그 플레이어 collider는 방 전환에도 유지되므로, `build`는
 * 제자리에서 비우고 다시 타일링함 — 한 방의 구덩이가 다음의 독립된
 * 아레나로 새어 나가지 않음.
 */
export class FloorBuilder {
  readonly group: Phaser.Physics.Arcade.StaticGroup;
  /** 지상 적만 사용하는, 보이지 않는 구덩이 가장자리 벽. */
  readonly enemyPitBarriers: Phaser.Physics.Arcade.StaticGroup;
  private pits: PitBounds[] = [];
  private skinObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.group = scene.physics.add.staticGroup();
    this.enemyPitBarriers = scene.physics.add.staticGroup();
  }

  build(
    room: RoomConfig,
    backdropSuppliesGround: boolean,
    showFloor = false,
    skin?: SliceSkinConfig,
  ) {
    this.group.clear(true, true);
    this.enemyPitBarriers.clear(true, true);
    this.clearSkin();
    this.pits = (room.pits ?? []).map((pit) => ({
      start: pit.x,
      end: pit.x + pit.width,
    }));
    for (const x of enemyPitBarrierXs(this.pits)) {
      const barrier = this.scene.add.zone(
        x,
        FLOOR_SURFACE_Y - ENEMY_PIT_BARRIER_HEIGHT / 2,
        ENEMY_PIT_BARRIER_WIDTH,
        ENEMY_PIT_BARRIER_HEIGHT,
      );
      this.enemyPitBarriers.add(barrier);
      const body = barrier.body as Phaser.Physics.Arcade.StaticBody;
      body.updateFromGameObject();
    }

    const width = room.worldWidth;
    for (let x = 32; x < width; x += FLOOR_TILE) {
      if (this.isOverPit(x)) {
        continue;
      }
      const tile = this.group.create(
        x,
        FLOOR_SURFACE_Y + FLOOR_TILE / 2,
        'floor-placeholder',
      ) as Phaser.GameObjects.Image;
      // 캐릭터 뒤에 두어, 캐릭터가 띠 위에 서 있게 함.
      tile.setDepth(FLOOR_DEPTH);
    }

    if (skin) {
      // 픽셀 스킨이 바닥을 덮으므로 placeholder 타일은 물리 용도로만 쓰임.
      // 각 solid(구덩이 아닌) 구간에 3-slice를 그림.
      this.group.setVisible(false);
      for (const [startX, endX] of this.solidSpans(width)) {
        this.skinObjects.push(
          ...drawSliceSkin(
            this.scene,
            skin,
            startX,
            endX,
            FLOOR_SURFACE_Y,
            FLOOR_DEPTH,
          ),
        );
      }
      return;
    }

    // 스테이지가 선택하면 바닥 띠를 보여줌(픽셀 타일로 스킨할 placeholder).
    // 그 외에는 실제 배경 아트가 바닥을 제공하고 타일은 숨김 — 단, 구덩이가
    // 있는 스테이지는 그 사이 틈이 구멍으로 보이도록 타일을 보이게 함.
    this.group.setVisible(
      showFloor || !backdropSuppliesGround || this.pits.length > 0,
    );
  }

  /** [0, width] 구간의 연속된 solid 바닥, 즉 구덩이 사이의 구간들. */
  private solidSpans(width: number): [number, number][] {
    const sorted = [...this.pits].sort((a, b) => a.start - b.start);
    const spans: [number, number][] = [];
    let cursor = 0;
    for (const pit of sorted) {
      if (pit.start > cursor) {
        spans.push([cursor, pit.start]);
      }
      cursor = Math.max(cursor, pit.end);
    }
    if (cursor < width) {
      spans.push([cursor, width]);
    }
    return spans;
  }

  private clearSkin() {
    for (const obj of this.skinObjects) {
      obj.destroy();
    }
    this.skinObjects = [];
  }

  isOverPit(x: number) {
    return this.pits.some((pit) => x > pit.start && x < pit.end);
  }

  /** The pit the world-x sits over (within `tolerance` of its left edge), if any. */
  findPitAt(x: number, tolerance: number): PitBounds | undefined {
    return this.pits.find((pit) => x >= pit.start - tolerance && x <= pit.end);
  }
}
