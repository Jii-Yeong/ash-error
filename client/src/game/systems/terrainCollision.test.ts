import { describe, expect, it } from 'vitest';
import {
  terrainBlocksFlyingProjectiles,
  terrainBlocksProjectiles,
  terrainCollisionFaces,
  projectileCollisionFaces,
} from '@/game/systems/TerrainBuilder';

describe('terrain collision faces', () => {
  it('lets a platform be entered from below and stood on from above', () => {
    // 발판 아래에서 점프하면 밑면에 막히지 않고 통과해야 한다.
    expect(terrainCollisionFaces('platform')).toEqual({
      up: true,
      down: false,
      left: false,
      right: false,
    });
  });

  it('keeps a wall solid on every face', () => {
    // 벽은 위층 바닥이 아니라 넘어야 하는 장애물이므로, 밑면을 열면 플레이어가
    // 통과해 올라갈 수 있어서는 안 된다.
    expect(terrainCollisionFaces('wall')).toEqual({
      up: true,
      down: true,
      left: true,
      right: true,
    });
  });

  it('blocks regular projectiles with every terrain piece', () => {
    expect(terrainBlocksProjectiles('platform')).toBe(true);
    expect(terrainBlocksProjectiles('wall')).toBe(true);
  });

  it('lets stage one and two flying projectiles pass platforms', () => {
    expect(terrainBlocksFlyingProjectiles('platform')).toBe(false);
    expect(terrainBlocksFlyingProjectiles('wall')).toBe(true);
  });

  it('uses solid collision faces for projectiles without changing player movement', () => {
    expect(projectileCollisionFaces).toEqual({
      up: true,
      down: true,
      left: true,
      right: true,
    });
  });
});
