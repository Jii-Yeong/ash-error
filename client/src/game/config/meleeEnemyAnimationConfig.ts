import {
  defineEnemyAtlasSet,
  type EnemyAnimationFrame,
  type EnemySpriteConfig,
  type GroundedEnemySpriteGeometry,
} from '@/game/config/enemyAnimationAtlasConfig';

type MeleeTag = 'idle' | 'walk' | 'attack' | 'death';

/** 제공된 아틀라스 JSON에서 그대로 옮긴 프레임 범위와 프레임 시간. */
const TAG_FRAMES: Record<MeleeTag, readonly EnemyAnimationFrame[]> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 130 })),
  walk: [2, 3].map((frame) => ({ frame: `${frame}`, duration: 130 })),
  attack: [
    { frame: '4', duration: 200 },
    { frame: '5', duration: 100 },
  ],
  death: [
    { frame: '6', duration: 200 },
    { frame: '7', duration: 100 },
  ],
};

export type MeleeSpriteConfig = EnemySpriteConfig<
  MeleeTag,
  GroundedEnemySpriteGeometry
>;

export const MELEE_SWING_EFFECT = {
  texture: 'melee-swing-effect',
  png: '/assets/enemies/melee-swing-effect.png',
} as const;

const MELEE_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'neared',
  stages: [1, 2],
  tagFrames: TAG_FRAMES,
  loopingTags: new Set<MeleeTag>(['idle', 'walk']),
  // 트림된 sourceSize는 160x160. 발은 y=146 부근, 중심은 x=89 부근.
  sprite: {
    // 실제 캐릭터 영역 122px을 94px로 표시함.
    scale: 94 / 122,
    bodyWidth: 46,
    bodyHeight: 89,
    bodyOffsetX: 66,
    bodyOffsetY: 50,
  },
});

export const MELEE_ENEMY_ANIMATION_ATLASES = MELEE_ATLAS_SET.atlases;
export const STAGE_ONE_MELEE_SPRITE: MeleeSpriteConfig =
  MELEE_ATLAS_SET.sprites[1];
export const STAGE_TWO_MELEE_SPRITE: MeleeSpriteConfig =
  MELEE_ATLAS_SET.sprites[2];
