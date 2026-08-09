import type { EnemyAnimationAtlasConfig } from '@/game/config/enemyAnimationAtlasConfig';

/**
 * 스테이지 1 보스(city warden)의 실제 스프라이트 아틀라스.
 *
 * 이 이름들은 제공된 Aseprite JSON의 `frameTags`를 의도적으로 그대로 따름.
 * 아틀라스가 포즈 이름과 프레임 범위의 원본(source of truth).
 */
const frameName = (index: number) => `stage-1-boss ${index}.aseprite`;

export const STAGE_ONE_BOSS_ATLAS_KEY = 'stage-1-boss';
export const STAGE_ONE_BOSS_ATLAS_PNG = '/assets/bosses/stage-1-boss.png';
export const STAGE_ONE_BOSS_ATLAS_JSON = '/assets/bosses/stage-1-boss.json';

export const STAGE_ONE_BOSS_WEAPON_ASSETS = {
  charge: {
    key: 'stage-1-boss-charge-weapon',
    url: '/assets/bosses/stage-1-boss-charge-weapon.png',
    gripOffsetX: 5,
    gripOffsetY: -16,
    flippedGripOffsetY: -26,
    originX: 0,
    originY: 0,
    barrelAngle: Math.atan2(28, 46),
    barrelLength: Math.hypot(46, 28),
    flippedBarrelAngle: Math.atan2(10, 46),
    flippedBarrelLength: Math.hypot(46, 10),
    muzzleOffsetY: 0,
    flippedMuzzleOffsetY: 35,
  },
  fire: {
    key: 'stage-1-boss-weapon',
    url: '/assets/bosses/stage-1-boss-weapon.png',
    gripOffsetX: -8,
    gripOffsetY: 9,
    flippedGripOffsetY: 9,
    originX: 0,
    originY: 0.5,
    barrelAngle: Math.atan2(2.5, 77),
    barrelLength: Math.hypot(77, 2.5),
    flippedBarrelAngle: Math.atan2(-2.5, 77),
    flippedBarrelLength: Math.hypot(77, 2.5),
    muzzleOffsetY: 0,
    flippedMuzzleOffsetY: 0,
  },
} as const;

export const STAGE_ONE_BOSS_LASER_ASSETS = {
  back: {
    key: 'stage-1-boss-laser-back',
    url: '/assets/bosses/stage-1-laser/stage-1-boss-laser-back.png',
    /** 트림된 123px 이미지에서 밝은 발사구 중심의 X 좌표. */
    muzzleAnchorX: 47,
  },
  middle: {
    key: 'stage-1-boss-laser-middle',
    url: '/assets/bosses/stage-1-laser/stage-1-boss-laser-middle.png',
  },
  front: {
    key: 'stage-1-boss-laser-front',
    url: '/assets/bosses/stage-1-laser/stage-1-boss-laser-front.png',
  },
} as const;

export const STAGE_ONE_BOSS_TAGS = {
  idle: 'idle',
  walk: 'walk',
  charge: 'charge',
  fire: 'fire',
  recoil: 'recoil',
  death: 'death',
} as const;

export const STAGE_ONE_BOSS_ANIMATIONS = {
  idle: 'stage-1-boss-idle',
  walk: 'stage-1-boss-walk',
  charge: 'stage-1-boss-charge',
  fire: 'stage-1-boss-fire',
  recoil: 'stage-1-boss-recoil',
  death: 'stage-1-boss-death',
} as const;

type StageOneBossTag = keyof typeof STAGE_ONE_BOSS_TAGS;

/** 제공된 아틀라스 JSON에서 그대로 옮긴 프레임 범위와 프레임 시간. */
export const STAGE_ONE_BOSS_TAG_FRAMES: Record<
  StageOneBossTag,
  readonly { frame: string; duration: number }[]
> = {
  idle: [0, 1, 2, 3].map((index) => ({
    frame: frameName(index),
    duration: [180, 240, 180, 240][index],
  })),
  walk: [4, 5].map((index) => ({ frame: frameName(index), duration: 350 })),
  // 6번 프레임에는 팔이 포함되어 있어 별도 회전 팔과 겹치므로 제외함.
  charge: [{ frame: frameName(7), duration: 120 }],
  fire: [
    { frame: frameName(8), duration: 90 },
    { frame: frameName(9), duration: 60 },
  ],
  recoil: [{ frame: frameName(10), duration: 100 }],
  death: [
    { frame: frameName(12), duration: 100 },
    { frame: frameName(13), duration: 180 },
  ],
};

export const STAGE_ONE_BOSS_LOOPING_TAGS = new Set<StageOneBossTag>([
  'idle',
  'walk',
  'fire',
]);

/**
 * 스테이지 2 보스(alley-hunter, 기계 사냥개)의 실제 스프라이트 아틀라스.
 *
 * 이 이름들은 제공된 Aseprite JSON의 `frameTags`를 그대로 따름. 프레임 키는
 * 숫자 인덱스('0'~'10')이며, 아틀라스가 포즈 이름과 프레임 범위의 원본임.
 */
export const STAGE_TWO_BOSS_ATLAS_KEY = 'stage-2-boss';
export const STAGE_TWO_BOSS_ATLAS_PNG = '/assets/bosses/stage-2-boss.png';
export const STAGE_TWO_BOSS_ATLAS_JSON = '/assets/bosses/stage-2-boss.json';
export const STAGE_TWO_BOSS_HEAD = {
  texture: 'stage-2-boss-head',
  png: '/assets/bosses/stage-2-boss-head.png',
} as const;
export const STAGE_TWO_BOSS_ENERGY_ORB = {
  texture: 'stage-2-boss-energy-orb',
  png: '/assets/bosses/stage-2-energy-orb.png',
} as const;
export const STAGE_TWO_BOSS_SEARCHLIGHT = {
  texture: 'stage-2-boss-searchlight-asymmetric',
  png: '/assets/bosses/stage-2-searchlight-asymmetric.png',
} as const;

export const STAGE_TWO_BOSS_TAGS = {
  idle: 'idle',
  walk: 'walk',
  quest: 'quest',
  attack: 'attack',
  death: 'death',
} as const;

export const STAGE_TWO_BOSS_ANIMATIONS = {
  idle: 'stage-2-boss-idle',
  walk: 'stage-2-boss-walk',
  quest: 'stage-2-boss-quest',
  attack: 'stage-2-boss-attack',
  death: 'stage-2-boss-death',
} as const;

type StageTwoBossTag = keyof typeof STAGE_TWO_BOSS_TAGS;

/** 제공된 아틀라스 JSON에서 그대로 옮긴 프레임 범위와 프레임 시간. */
export const STAGE_TWO_BOSS_TAG_FRAMES: Record<
  StageTwoBossTag,
  readonly { frame: string; duration: number }[]
> = {
  idle: [0, 1, 2, 3].map((index) => ({ frame: String(index), duration: 220 })),
  walk: [4, 5].map((index) => ({ frame: String(index), duration: 170 })),
  // 잠금(사격 준비) 시 유지되는 웅크린 단일 포즈.
  quest: [{ frame: '6', duration: 200 }],
  attack: [
    { frame: '7', duration: 90 },
    { frame: '8', duration: 130 },
  ],
  death: [
    { frame: '9', duration: 150 },
    { frame: '10', duration: 220 },
  ],
};

export const STAGE_TWO_BOSS_LOOPING_TAGS = new Set<StageTwoBossTag>([
  'idle',
  'walk',
]);

/**
 * 스테이지 3 보스(underground-guardian, 정화 집행기)의 실제 스프라이트 아틀라스.
 *
 * 프레임 키는 숫자 인덱스('0'~'11'). take_down은 붙잡기/내려찍기 타격,
 * suction은 빨아들이기(vacuum) 패턴에 사용됨.
 */
export const STAGE_THREE_BOSS_ATLAS_KEY = 'stage-3-boss';
export const STAGE_THREE_BOSS_ATLAS_PNG = '/assets/bosses/stage-3-boss.png';
export const STAGE_THREE_BOSS_ATLAS_JSON = '/assets/bosses/stage-3-boss.json';

export const STAGE_THREE_BOSS_ANIMATIONS = {
  idle: 'stage-3-boss-idle',
  walk: 'stage-3-boss-walk',
  takeDown: 'stage-3-boss-take-down',
  // 점프 후 찍어바르기(슬램)의 단계별 단일 포즈: 준비(5)·공중(6)·내려찍기(7).
  slamWindup: 'stage-3-boss-slam-windup',
  slamAir: 'stage-3-boss-slam-air',
  slamStrike: 'stage-3-boss-slam-strike',
  suction: 'stage-3-boss-suction',
  death: 'stage-3-boss-death',
} as const;

type StageThreeBossTag = keyof typeof STAGE_THREE_BOSS_ANIMATIONS;

/** 제공된 아틀라스 JSON에서 그대로 옮긴 프레임 범위와 프레임 시간. */
export const STAGE_THREE_BOSS_TAG_FRAMES: Record<
  StageThreeBossTag,
  readonly { frame: string; duration: number }[]
> = {
  idle: [0, 1].map((index) => ({ frame: String(index), duration: 300 })),
  walk: [2, 3, 4].map((index) => ({ frame: String(index), duration: 160 })),
  takeDown: [
    { frame: '5', duration: 120 },
    { frame: '6', duration: 90 },
    { frame: '7', duration: 150 },
  ],
  slamWindup: [{ frame: '5', duration: 200 }],
  slamAir: [{ frame: '6', duration: 200 }],
  slamStrike: [{ frame: '7', duration: 200 }],
  suction: [8, 9].map((index) => ({ frame: String(index), duration: 180 })),
  death: [
    { frame: '10', duration: 160 },
    { frame: '11', duration: 260 },
  ],
};

export const STAGE_THREE_BOSS_LOOPING_TAGS = new Set<StageThreeBossTag>([
  'idle',
  'walk',
  'suction',
]);

/** 4스테이지 보스(지옥 집행체)의 실제 스프라이트 아틀라스. */
export const STAGE_FOUR_BOSS_ATLAS_KEY = 'stage-4-boss';
export const STAGE_FOUR_BOSS_ATLAS_PNG = '/assets/bosses/stage-4-boss.png';
export const STAGE_FOUR_BOSS_ATLAS_JSON = '/assets/bosses/stage-4-boss.json';

export const STAGE_FOUR_BOSS_ANIMATIONS = {
  idle: 'stage-4-boss-idle',
  walk: 'stage-4-boss-walk',
  gush: 'stage-4-boss-gush',
  rush: 'stage-4-boss-rush',
  getDown: 'stage-4-boss-get-down',
  death: 'stage-4-boss-death',
} as const;

type StageFourBossTag = keyof typeof STAGE_FOUR_BOSS_ANIMATIONS;

/** 제공된 아틀라스 JSON의 태그별 프레임과 재생 시간. */
export const STAGE_FOUR_BOSS_TAG_FRAMES: Record<
  StageFourBossTag,
  readonly { frame: string; duration: number }[]
> = {
  idle: [0, 1].map((frame) => ({ frame: String(frame), duration: 180 })),
  walk: [
    { frame: '2', duration: 220 },
    { frame: '3', duration: 280 },
  ],
  gush: [
    { frame: '4', duration: 500 },
    { frame: '5', duration: 700 },
  ],
  rush: [6, 7].map((frame) => ({ frame: String(frame), duration: 100 })),
  getDown: [{ frame: '8', duration: 100 }],
  death: [
    { frame: '9', duration: 450 },
    { frame: '10', duration: 900 },
  ],
};

export const STAGE_FOUR_BOSS_LOOPING_TAGS = new Set<StageFourBossTag>([
  'idle',
  'walk',
  'rush',
]);

/** 5스테이지 보스(귀환한 설계자)의 실제 스프라이트 아틀라스. */
export const STAGE_FIVE_BOSS_ATLAS_KEY = 'stage-5-boss';
export const STAGE_FIVE_BOSS_ATLAS_PNG = '/assets/bosses/stage-5-boss.png';
export const STAGE_FIVE_BOSS_ATLAS_JSON = '/assets/bosses/stage-5-boss.json';

export const STAGE_FIVE_BOSS_ANIMATIONS = {
  idle: 'stage-5-boss-idle',
  eyeTrack: 'stage-5-boss-eye-track',
  eyeFire: 'stage-5-boss-eye-fire',
  haloCharge: 'stage-5-boss-halo-charge',
  haloFire: 'stage-5-boss-halo-fire',
  wingsLeft: 'stage-5-boss-wings-left',
  wingsRight: 'stage-5-boss-wings-right',
  wingsBoth: 'stage-5-boss-wings-both',
  falseSalvation: 'stage-5-boss-false-salvation',
  phaseTransition: 'stage-5-boss-phase-transition',
  coreExposed: 'stage-5-boss-core-exposed',
  chorus: 'stage-5-boss-chorus',
  death: 'stage-5-boss-death',
} as const;

type StageFiveBossTag = keyof typeof STAGE_FIVE_BOSS_ANIMATIONS;

/** 중복된 원본 `eye_track` 태그를 추적(2)과 발사(8) 자세로 분리함. */
export const STAGE_FIVE_BOSS_TAG_FRAMES: Record<
  StageFiveBossTag,
  readonly { frame: string; duration: number }[]
> = {
  idle: [0, 1].map((frame) => ({ frame: String(frame), duration: 100 })),
  eyeTrack: [{ frame: '2', duration: 100 }],
  eyeFire: [{ frame: '8', duration: 100 }],
  haloCharge: [{ frame: '3', duration: 100 }],
  haloFire: [{ frame: '12', duration: 100 }],
  wingsLeft: [{ frame: '4', duration: 100 }],
  wingsRight: [{ frame: '5', duration: 100 }],
  wingsBoth: [{ frame: '6', duration: 100 }],
  falseSalvation: [{ frame: '7', duration: 100 }],
  phaseTransition: [{ frame: '9', duration: 100 }],
  coreExposed: [{ frame: '10', duration: 100 }],
  chorus: [{ frame: '11', duration: 100 }],
  death: [{ frame: '13', duration: 100 }],
};

export const STAGE_FIVE_BOSS_LOOPING_TAGS = new Set<StageFiveBossTag>([
  'idle',
]);

/** 4스테이지 진입 시 미리 불러오는 5스테이지 보스 아틀라스. */
export const STAGE_FIVE_BOSS_ANIMATION_ATLAS = {
  texture: STAGE_FIVE_BOSS_ATLAS_KEY,
  png: STAGE_FIVE_BOSS_ATLAS_PNG,
  json: STAGE_FIVE_BOSS_ATLAS_JSON,
  animations: STAGE_FIVE_BOSS_ANIMATIONS,
  tagFrames: STAGE_FIVE_BOSS_TAG_FRAMES,
  loopingTags: STAGE_FIVE_BOSS_LOOPING_TAGS,
} as const satisfies EnemyAnimationAtlasConfig<StageFiveBossTag>;

/** 초기 부팅에서 불러오는 1~4스테이지 보스 아틀라스. */
export const BOSS_ANIMATION_ATLASES = [
  {
    texture: STAGE_ONE_BOSS_ATLAS_KEY,
    png: STAGE_ONE_BOSS_ATLAS_PNG,
    json: STAGE_ONE_BOSS_ATLAS_JSON,
    animations: STAGE_ONE_BOSS_ANIMATIONS,
    tagFrames: STAGE_ONE_BOSS_TAG_FRAMES,
    loopingTags: STAGE_ONE_BOSS_LOOPING_TAGS,
  },
  {
    texture: STAGE_TWO_BOSS_ATLAS_KEY,
    png: STAGE_TWO_BOSS_ATLAS_PNG,
    json: STAGE_TWO_BOSS_ATLAS_JSON,
    animations: STAGE_TWO_BOSS_ANIMATIONS,
    tagFrames: STAGE_TWO_BOSS_TAG_FRAMES,
    loopingTags: STAGE_TWO_BOSS_LOOPING_TAGS,
  },
  {
    texture: STAGE_THREE_BOSS_ATLAS_KEY,
    png: STAGE_THREE_BOSS_ATLAS_PNG,
    json: STAGE_THREE_BOSS_ATLAS_JSON,
    animations: STAGE_THREE_BOSS_ANIMATIONS,
    tagFrames: STAGE_THREE_BOSS_TAG_FRAMES,
    loopingTags: STAGE_THREE_BOSS_LOOPING_TAGS,
  },
  {
    texture: STAGE_FOUR_BOSS_ATLAS_KEY,
    png: STAGE_FOUR_BOSS_ATLAS_PNG,
    json: STAGE_FOUR_BOSS_ATLAS_JSON,
    animations: STAGE_FOUR_BOSS_ANIMATIONS,
    tagFrames: STAGE_FOUR_BOSS_TAG_FRAMES,
    loopingTags: STAGE_FOUR_BOSS_LOOPING_TAGS,
  },
] as const satisfies readonly EnemyAnimationAtlasConfig<string>[];
