import {
  defineEnemyAtlasSet,
  type EnemyAnimationFrame,
  type EnemySpriteConfig,
  type GroundedEnemySpriteGeometry,
} from '@/game/config/enemyAnimationAtlasConfig';

type CaptorTag = 'idle' | 'pull' | 'walk' | 'attack' | 'death';

/** 제공된 아틀라스 JSON에서 그대로 옮긴 프레임 범위와 프레임 시간. */
const TAG_FRAMES: Record<CaptorTag, readonly EnemyAnimationFrame[]> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  // 케이블(포박)을 던지고 감는 단일 포즈.
  pull: [{ frame: '2', duration: 200 }],
  walk: [3, 4].map((frame) => ({ frame: `${frame}`, duration: 160 })),
  attack: [5, 6].map((frame) => ({ frame: `${frame}`, duration: 110 })),
  death: [
    { frame: '7', duration: 160 },
    { frame: '8', duration: 220 },
  ],
};

export type CaptorSpriteConfig = EnemySpriteConfig<
  CaptorTag,
  GroundedEnemySpriteGeometry
>;

const CAPTOR_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'ranged',
  stages: [3],
  tagFrames: TAG_FRAMES,
  loopingTags: new Set<CaptorTag>(['idle', 'walk']),
  // 트림된 sourceSize는 120x120. 발은 y=119 부근, 중심은 x=61 부근이라
  // 바디를 발 기준으로 하단 정렬함.
  sprite: {
    scale: 1,
    bodyWidth: 48,
    bodyHeight: 74,
    bodyOffsetX: 37,
    bodyOffsetY: 28,
  },
});

export const CAPTOR_ANIMATION_ATLASES = CAPTOR_ATLAS_SET.atlases;
export const STAGE_THREE_CAPTOR_SPRITE: CaptorSpriteConfig =
  CAPTOR_ATLAS_SET.sprites[3];

export const STAGE_THREE_CAPTOR_TETHER = {
  line: {
    texture: 'stage-3-ranged-line',
    png: '/assets/enemies/stage-3-ranged-line.png',
    height: 5,
  },
  claw: {
    texture: 'stage-3-ranged-claw',
    png: '/assets/enemies/stage-3-ranged-claw.png',
  },
} as const;
