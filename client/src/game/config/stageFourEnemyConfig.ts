import {
  defineEnemyAtlasSet,
  type EnemyAnimationFrame,
} from '@/game/config/enemyAnimationAtlasConfig';

type InfernalHoundTag = 'idle' | 'attack' | 'walk' | 'death';
type ExecutionerDollTag =
  | 'idle'
  | 'fly'
  | 'takeDown'
  | 'slam'
  | 'land'
  | 'deathFall'
  | 'deathLand';
type JudgmentEyeTag = 'idle' | 'attack' | 'deathFall' | 'deathLand';

const INFERNAL_HOUND_TAG_FRAMES: Record<
  InfernalHoundTag,
  readonly EnemyAnimationFrame[]
> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  attack: [2, 3, 4].map((frame) => ({
    frame: `${frame}`,
    duration: frame === 3 ? 300 : 180,
  })),
  walk: [5, 6].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  death: [7, 8].map((frame) => ({ frame: `${frame}`, duration: 180 })),
};

/** 제공된 아틀라스 JSON의 태그별 프레임과 재생 시간. */
const EXECUTIONER_DOLL_TAG_FRAMES: Record<
  ExecutionerDollTag,
  readonly EnemyAnimationFrame[]
> = {
  idle: [0, 1].map((frame) => ({
    frame: `${frame}`,
    duration: 220,
  })),
  fly: [2, 3].map((frame) => ({
    frame: `${frame}`,
    duration: 180,
  })),
  // 화면상 5·6·7번 모션은 JSON 프레임 4·5·6에 대응함.
  takeDown: [{ frame: '4', duration: 1_000 }],
  slam: [{ frame: '5', duration: 1_000 }],
  land: [{ frame: '6', duration: 1_000 }],
  deathFall: [{ frame: '7', duration: 500 }],
  deathLand: [{ frame: '8', duration: 180 }],
};

const JUDGMENT_EYE_TAG_FRAMES: Record<
  JudgmentEyeTag,
  readonly EnemyAnimationFrame[]
> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  attack: [
    { frame: '2', duration: 180 },
    { frame: '3', duration: 130 },
  ],
  deathFall: [{ frame: '4', duration: 500 }],
  deathLand: [{ frame: '5', duration: 180 }],
};

const INFERNAL_HOUND_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'dog',
  stages: [4],
  tagFrames: INFERNAL_HOUND_TAG_FRAMES,
  loopingTags: new Set<InfernalHoundTag>(['idle', 'walk']),
  sprite: {
    scale: 1,
    bodyWidth: 68,
    bodyHeight: 34,
    bodyOffsetX: 26,
    bodyOffsetY: 39,
  },
});

const EXECUTIONER_DOLL_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'takedown',
  stages: [4],
  tagFrames: EXECUTIONER_DOLL_TAG_FRAMES,
  loopingTags: new Set<ExecutionerDollTag>(['idle', 'fly']),
  // sourceSize 140x140에서 불투명 픽셀 하단(y=135)에 바디 하단을 맞춤.
  sprite: {
    scale: 1,
    bodyWidth: 54,
    bodyHeight: 78,
    bodyOffsetX: 43,
    bodyOffsetY: 57,
  },
});

export const EXECUTIONER_DOLL_ANIMATION_ATLASES =
  EXECUTIONER_DOLL_ATLAS_SET.atlases;

const JUDGMENT_EYE_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'floating',
  stages: [4],
  tagFrames: JUDGMENT_EYE_TAG_FRAMES,
  loopingTags: new Set<JudgmentEyeTag>(['idle', 'attack']),
  sprite: {
    scale: 1,
    bodyWidth: 52,
    bodyHeight: 52,
    bodyOffsetX: 22,
    bodyOffsetY: 22,
  },
});

export const STAGE_FOUR_ENEMY_ANIMATION_ATLASES = [
  ...INFERNAL_HOUND_ATLAS_SET.atlases,
  ...EXECUTIONER_DOLL_ATLAS_SET.atlases,
  ...JUDGMENT_EYE_ATLAS_SET.atlases,
];

export const INFERNAL_HOUND_CONFIG = {
  ...INFERNAL_HOUND_ATLAS_SET.sprites[4],
  maxHealth: 85,
  aggroRadius: 680,
  prowlSpeed: 150,
  warningDuration: 650,
  chargeSpeed: 820,
  maxChargeDuration: 1_000,
  stunDuration: 700,
  attackCooldown: 1_450,
  chargeDamage: 20,
  trailInterval: 90,
  trailLifetime: 1_000,
  trailDamage: 4,
  trailDamageCooldown: 400,
} as const;

export const EXECUTIONER_DOLL_CONFIG = {
  ...EXECUTIONER_DOLL_ATLAS_SET.sprites[4],
  maxHealth: 100,
  aggroRadius: 700,
  hoverSpeed: 230,
  hoverOffset: 190,
  warningDuration: 700,
  slamSpeed: 1_000,
  recoveryDuration: 700,
  attackCooldown: 1_700,
  shockwaveRange: 180,
  shockwaveDamage: 16,
} as const;

export const JUDGMENT_EYE_CONFIG = {
  ...JUDGMENT_EYE_ATLAS_SET.sprites[4],
  // sourceSize 96의 하단 투명 여백과 지면 그림자를 고려해 11px 내림.
  deathLandOffsetY: 11,
  bulletTexture: 'judgment-eye-bullet-placeholder',
  maxHealth: 75,
  aggroRadius: 720,
  moveSpeed: 150,
  trackingDuration: 600,
  orbChargeDuration: 300,
  orbLifetime: 1_000,
  bulletSpeed: 220,
  bulletLifetime: 1_800,
  bulletDamage: 8,
  attackCooldown: 2_100,
  repositionDuration: 800,
} as const;

export const JUDGMENT_EYE_RETICLE = {
  texture: 'stage-4-judgment-eye-reticle',
  png: '/assets/enemies/stage-4-judgment-eye-reticle.png',
} as const;

export const JUDGMENT_EYE_ORB = {
  texture: 'stage-4-judgment-eye-orb',
  png: '/assets/enemies/stage-4-judgment-eye-orb.png',
} as const;
