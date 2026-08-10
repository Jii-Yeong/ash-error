import {
  defineEnemyAtlasSet,
  type EnemyAnimationFrame,
} from '@/game/config/enemyAnimationAtlasConfig';

type ChoirSupporterTag =
  | 'idle'
  | 'fly'
  | 'crossShot'
  | 'homingPair'
  | 'noteWave'
  | 'deathFall'
  | 'deathLand';

type SanctumEnforcerTag =
  | 'idle'
  | 'fly'
  | 'fanShot'
  | 'crossShot'
  | 'spearThrow'
  | 'deathFall'
  | 'deathLand';

type CelestialOracleTag =
  | 'idle'
  | 'fly'
  | 'spiral'
  | 'walls'
  | 'books'
  | 'deathFall'
  | 'deathLand';

const CHOIR_SUPPORTER_TAG_FRAMES: Record<
  ChoirSupporterTag,
  readonly EnemyAnimationFrame[]
> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  fly: [2, 3].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  crossShot: [{ frame: '4', duration: 100 }],
  homingPair: [{ frame: '5', duration: 100 }],
  noteWave: [{ frame: '6', duration: 100 }],
  deathFall: [{ frame: '7', duration: 500 }],
  deathLand: [{ frame: '8', duration: 180 }],
};

const SANCTUM_ENFORCER_TAG_FRAMES: Record<
  SanctumEnforcerTag,
  readonly EnemyAnimationFrame[]
> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  fly: [2, 3].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  fanShot: [{ frame: '4', duration: 100 }],
  crossShot: [{ frame: '5', duration: 100 }],
  spearThrow: [{ frame: '6', duration: 100 }],
  deathFall: [{ frame: '7', duration: 500 }],
  deathLand: [{ frame: '8', duration: 180 }],
};

const CELESTIAL_ORACLE_TAG_FRAMES: Record<
  CelestialOracleTag,
  readonly EnemyAnimationFrame[]
> = {
  idle: [0, 1].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  fly: [2, 3].map((frame) => ({ frame: `${frame}`, duration: 180 })),
  spiral: [{ frame: '4', duration: 100 }],
  walls: [{ frame: '5', duration: 100 }],
  books: [{ frame: '6', duration: 100 }],
  deathFall: [{ frame: '7', duration: 500 }],
  deathLand: [{ frame: '8', duration: 180 }],
};

const CHOIR_SUPPORTER_SCALE = 72 / 78;
const CHOIR_SUPPORTER_SOURCE_SIZE = 120;
const CHOIR_SUPPORTER_BODY_SIZE = 42 / CHOIR_SUPPORTER_SCALE;
const SANCTUM_ENFORCER_SCALE = 100 / 115;
const CELESTIAL_ORACLE_SCALE = 120 / 195;
const CELESTIAL_ORACLE_SOURCE_SIZE = 220;
const CELESTIAL_ORACLE_BODY_SIZE = 72 / CELESTIAL_ORACLE_SCALE;

const CHOIR_SUPPORTER_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'supporter',
  stages: [5],
  tagFrames: CHOIR_SUPPORTER_TAG_FRAMES,
  loopingTags: new Set<ChoirSupporterTag>(['idle', 'fly']),
  sprite: {
    // 원본 불투명 높이 78px를 게임 내 권장 높이 72px로 표시함.
    scale: CHOIR_SUPPORTER_SCALE,
    bodyWidth: CHOIR_SUPPORTER_BODY_SIZE,
    bodyHeight: CHOIR_SUPPORTER_BODY_SIZE,
    bodyOffset: (CHOIR_SUPPORTER_SOURCE_SIZE - CHOIR_SUPPORTER_BODY_SIZE) / 2,
  },
});

const SANCTUM_ENFORCER_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'executor',
  stages: [5],
  tagFrames: SANCTUM_ENFORCER_TAG_FRAMES,
  loopingTags: new Set<SanctumEnforcerTag>(['idle', 'fly']),
  sprite: {
    // 원본 불투명 높이 115px를 게임 내 권장 높이 100px로 표시함.
    scale: SANCTUM_ENFORCER_SCALE,
    bodyWidth: 52 / SANCTUM_ENFORCER_SCALE,
    bodyHeight: 72 / SANCTUM_ENFORCER_SCALE,
  },
});

const CELESTIAL_ORACLE_ATLAS_SET = defineEnemyAtlasSet({
  slug: 'oracle',
  stages: [5],
  tagFrames: CELESTIAL_ORACLE_TAG_FRAMES,
  loopingTags: new Set<CelestialOracleTag>(['idle', 'fly']),
  sprite: {
    // 원본 불투명 높이 195px를 게임 내 권장 높이 120px로 표시함.
    scale: CELESTIAL_ORACLE_SCALE,
    bodyWidth: CELESTIAL_ORACLE_BODY_SIZE,
    bodyHeight: CELESTIAL_ORACLE_BODY_SIZE,
    bodyOffset:
      (CELESTIAL_ORACLE_SOURCE_SIZE - CELESTIAL_ORACLE_BODY_SIZE) / 2,
  },
});

export const CHOIR_SUPPORTER_ANIMATION_ATLASES =
  CHOIR_SUPPORTER_ATLAS_SET.atlases;
export const SANCTUM_ENFORCER_ANIMATION_ATLASES =
  SANCTUM_ENFORCER_ATLAS_SET.atlases;
export const CELESTIAL_ORACLE_ANIMATION_ATLASES =
  CELESTIAL_ORACLE_ATLAS_SET.atlases;

export const STAGE_FIVE_ENEMY_ANIMATION_ATLASES = [
  ...CHOIR_SUPPORTER_ANIMATION_ATLASES,
  ...SANCTUM_ENFORCER_ANIMATION_ATLASES,
  ...CELESTIAL_ORACLE_ANIMATION_ATLASES,
];

export const CHOIR_SUPPORTER_CONFIG = {
  ...CHOIR_SUPPORTER_ATLAS_SET.sprites[5],
  // death 프레임의 불투명 영역은 sourceSize 하단보다 18px 위에서 끝남.
  deathLandOffsetY: (120 - 102) * CHOIR_SUPPORTER_SCALE,
  bulletTexture: 'celestial-bullet-placeholder',
  maxHealth: 55,
  aggroRadius: 900,
  moveSpeed: 190,
  warningDuration: 500,
  attackCooldown: 1_250,
  bulletSpeed: 210,
  bulletDamage: 7,
  homingDuration: 600,
  homingTurnRate: 2.8,
} as const;

export const SANCTUM_ENFORCER_CONFIG = {
  ...SANCTUM_ENFORCER_ATLAS_SET.sprites[5],
  // death 프레임의 불투명 영역은 sourceSize 하단보다 2px 위에서 끝남.
  deathLandOffsetY: (140 - 138) * SANCTUM_ENFORCER_SCALE,
  spearTexture: 'celestial-spear-placeholder',
  maxHealth: 115,
  aggroRadius: 940,
  moveSpeed: 250,
  warningDuration: 450,
  attackCooldown: 1_500,
  spearSpeed: 620,
  spearDamage: 12,
  crossSpread: 130,
} as const;

export const CELESTIAL_ORACLE_CONFIG = {
  ...CELESTIAL_ORACLE_ATLAS_SET.sprites[5],
  // death 프레임의 불투명 영역은 sourceSize 하단보다 13px 위에서 끝남.
  deathLandOffsetY: (220 - 207) * CELESTIAL_ORACLE_SCALE,
  bulletTexture: 'celestial-bullet-placeholder',
  maxHealth: 230,
  aggroRadius: 1_100,
  moveSpeed: 150,
  warningDuration: 520,
  attackCooldown: 1_800,
  bulletSpeed: 245,
  wallSpeed: 180,
  bulletDamage: 9,
} as const;

export const CELESTIAL_PROJECTILE_BOUNDS = {
  top: 72,
  bottom: 672,
  padding: 96,
} as const;
