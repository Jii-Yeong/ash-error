import {
  defineEnemyAtlasSet,
  type EnemyAnimationFrame,
  type EnemySpriteConfig,
  type GroundedEnemySpriteGeometry,
} from '@/game/config/enemyAnimationAtlasConfig';

type RangedTag = 'idle' | 'walk' | 'attack' | 'death';

/** 제공된 아틀라스 JSON에서 그대로 옮긴 프레임 범위와 프레임 시간. */
const TAG_FRAMES: Record<RangedTag, readonly EnemyAnimationFrame[]> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 100 })),
  walk: [2, 3].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  attack: [4, 5].map((frame) => ({ frame: `${frame}`, duration: 100 })),
  death: [
    { frame: '6', duration: 200 },
    { frame: '7', duration: 100 },
  ],
};

export type RangedSpriteConfig = EnemySpriteConfig<
  RangedTag,
  GroundedEnemySpriteGeometry
>;

const RANGED_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'ranged',
  stages: [1, 2],
  tagFrames: TAG_FRAMES,
  loopingTags: new Set<RangedTag>(['idle', 'walk']),
  // 트림된 sourceSize는 120x120. 발은 y=112 부근, 중심은 x=66 부근.
  sprite: {
    // 실제 캐릭터 영역 101px을 91px로 표시해 근접 적보다 3px 작게 맞춤.
    scale: 91 / 101,
    bodyWidth: 44,
    bodyHeight: 79,
    bodyOffsetX: 44,
    bodyOffsetY: 26,
  },
});

export const RANGED_ENEMY_ANIMATION_ATLASES = RANGED_ATLAS_SET.atlases;
export const STAGE_ONE_RANGED_SPRITE: RangedSpriteConfig =
  RANGED_ATLAS_SET.sprites[1];
export const STAGE_TWO_RANGED_SPRITE: RangedSpriteConfig =
  RANGED_ATLAS_SET.sprites[2];
