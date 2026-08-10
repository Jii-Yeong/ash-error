import {
  defineEnemyAtlasSet,
  type EnemyAnimationFrame,
  type EnemySpriteConfig,
  type GroundedEnemySpriteGeometry,
} from '@/game/config/enemyAnimationAtlasConfig';

type BlockerTag = 'idle' | 'walk' | 'slam' | 'death';

/** 제공된 아틀라스 JSON에서 그대로 옮긴 프레임 범위와 프레임 시간. */
const TAG_FRAMES: Record<BlockerTag, readonly EnemyAnimationFrame[]> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 220 })),
  walk: [2, 3].map((frame) => ({ frame: `${frame}`, duration: 260 })),
  // 방패를 내리며 내리찍는 자세(take_down): 브레이스 후 강한 충격 프레임.
  slam: [
    { frame: '4', duration: 200 },
    { frame: '5', duration: 100 },
  ],
  death: [
    { frame: '6', duration: 220 },
    { frame: '7', duration: 100 },
  ],
};

export type BlockerSpriteConfig = EnemySpriteConfig<
  BlockerTag,
  GroundedEnemySpriteGeometry
>;

const BLOCKER_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'neared',
  stages: [3],
  tagFrames: TAG_FRAMES,
  loopingTags: new Set<BlockerTag>(['idle', 'walk']),
  // sourceSize 140x140, 트림 콘텐츠는 frame y=29..134(머리~발), x 중심 76.5.
  // 바디를 머리부터 발까지 덮어, 노출된 바이저(바디 상단 15%) 피격이 성립하게 함.
  sprite: {
    scale: 1,
    bodyWidth: 96,
    bodyHeight: 91,
    bodyOffsetX: 28,
    bodyOffsetY: 29,
  },
});

export const BLOCKER_ANIMATION_ATLASES = BLOCKER_ATLAS_SET.atlases;
export const STAGE_THREE_BLOCKER_SPRITE: BlockerSpriteConfig =
  BLOCKER_ATLAS_SET.sprites[3];
