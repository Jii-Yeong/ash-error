import type { MusicKey } from '@/game/config/audioConfig';
import { STAGE_FIVE_BOSS_ANIMATION_ATLAS } from '@/game/config/bossAnimationConfig';
import { BLOCKER_ANIMATION_ATLASES } from '@/game/config/blockerAnimationConfig';
import { CAPTOR_ANIMATION_ATLASES } from '@/game/config/captorAnimationConfig';
import { CEILING_MAINTAINER_ANIMATION_ATLASES } from '@/game/config/ceilingMaintainerAnimationConfig';
import {
  MELEE_SWING_CONFIG,
  type MeleeSwingConfig,
} from '@/game/config/combatConfig';
import {
  STAGE_ONE_FLYING_SPRITE,
  STAGE_TWO_FLYING_SPRITE,
  type FlyingSpriteConfig,
} from '@/game/config/flyingEnemyAnimationConfig';
import {
  STAGE_ONE_MELEE_SPRITE,
  STAGE_TWO_MELEE_SPRITE,
  type MeleeSpriteConfig,
} from '@/game/config/meleeEnemyAnimationConfig';
import { MovementMode } from '@/game/config/playerMovementConfig';
import {
  STAGE_FIVE_PLAYER_SPRITE,
  STAGE_FOUR_PLAYER_SPRITE,
  STAGE_ONE_TWO_PLAYER_SPRITE,
  STAGE_THREE_PLAYER_SPRITE,
  type PlayerSpriteConfig,
} from '@/game/config/playerAnimationConfig';
import { STAGE_FOUR_ENEMY_ANIMATION_ATLASES } from '@/game/config/stageFourEnemyConfig';
import { STAGE_FIVE_ENEMY_ANIMATION_ATLASES } from '@/game/config/stageFiveEnemyConfig';
import {
  STAGE_ONE_RANGED_SPRITE,
  STAGE_TWO_RANGED_SPRITE,
  type RangedSpriteConfig,
} from '@/game/config/rangedEnemyAnimationConfig';
import {
  STAGE_ONE_FLOOR_SKIN,
  STAGE_ONE_STOOL_SKIN,
  STAGE_FOUR_FLOOR_SKIN,
  STAGE_FOUR_STOOL_SKIN,
  STAGE_THREE_FLOOR_SKIN,
  STAGE_THREE_PIPE_SKIN,
  STAGE_THREE_STOOL_SKIN,
  STAGE_TWO_FLOOR_SKIN,
  STAGE_TWO_STOOL_SKIN,
  type SliceSkinConfig,
} from '@/game/config/terrainSkinConfig';
import type { StageRooms } from '@/game/config/roomConfig';
import type { EnemyAnimationAtlasConfig } from '@/game/config/enemyAnimationAtlasConfig';
import { CITY_ROOMS } from '@/game/config/rooms/stageOneRooms';
import { ALLEY_ROOMS } from '@/game/config/rooms/stageTwoRooms';
import { UNDERGROUND_ROOMS } from '@/game/config/rooms/stageThreeRooms';
import { INFERNO_ROOMS } from '@/game/config/rooms/stageFourRooms';
import { RETURN_ROOMS } from '@/game/config/rooms/stageFiveRooms';

export type StagePalette = {
  backgroundTop: number;
  backgroundBottom: number;
  gridLine: number;
  accentPrimary: number;
  accentSecondary: number;
  /** Randomly dims the secondary accent line to read as a failing neon sign. */
  neonFlicker?: boolean;
};

/**
 * A scripted beat that plays instead of a normal exit when the stage's final
 * room is cleared. 'siege' = androids close in, blackout, fall (act 3 → hell).
 * 'shatter' = 화면이 점차 깨지며 다음 스테이지가 드러남(act 4 → return).
 * 'ascension' = 보스 처치 3초 뒤 화면이 하얘지며 적에게 포위된 화면으로 복귀,
 *   3초 뒤 클리어(act 5 종료).
 */
export type StageEndEvent = 'siege' | 'shatter' | 'ascension';

/** Backdrop art whose source width determines its horizontal parallax speed. */
export type StageBackground = {
  key: string;
  path: string;
};

export type StageConfig = {
  id: string;
  label: string;
  playerMaxHealth: number;
  movementMode: MovementMode;
  palette: StagePalette;
  /** 배경 팔레트와 별도로 포탈에 적용할 색상. */
  portalTint?: number;
  music: MusicKey;
  rooms: StageRooms;
  endEvent?: StageEndEvent;
  background?: StageBackground;
  /**
   * 바닥을 배경이 암시하게 두지 않고, 맨 아래 바닥 타일을 보이는 띠로
   * 렌더링함(추후 픽셀 아트 타일로 스킨할 placeholder).
   */
  showFloor?: boolean;
  /** 1층 바닥용 픽셀 3-slice 스킨. 물리는 바닥 타일에 그대로 유지. */
  floorSkin?: SliceSkinConfig;
  /** 2·3층 발판(stool)용 픽셀 3-slice 스킨. */
  terrainSkin?: SliceSkinConfig;
  /** 천장형 적이 이동하는 파이프용 픽셀 3-slice 스킨. */
  pipeSkin?: SliceSkinConfig;
  /** 실제 아틀라스 비행 적 아트. 없는 스테이지는 placeholder 사용. */
  flyingSprite?: FlyingSpriteConfig;
  /** 실제 아틀라스 원거리 적 아트. 없는 스테이지는 placeholder 사용. */
  rangedSprite?: RangedSpriteConfig;
  /** 설정 시 근접 적이 접촉 데미지 대신 봉을 휘두름. */
  meleeSwing?: MeleeSwingConfig;
  /** 실제 아틀라스 근접 적 아트(휘두르기는 attack 애니메이션 + 슬래시 VFX로 표현). */
  meleeSprite?: MeleeSpriteConfig;
  /** 스테이지 고유 잡몹이 사용하는 추가 애니메이션 아틀라스. */
  enemyAtlases?: readonly EnemyAnimationAtlasConfig<string>[];
  /** 이 스테이지에서만 사용하는 플레이어 스프라이트. */
  playerSprite?: PlayerSpriteConfig;
};

export const STAGE_ONE_CONFIG: StageConfig = {
  id: 'stage-01',
  label: 'STAGE 1 // THE CITY',
  playerMaxHealth: 100,
  movementMode: MovementMode.GROUND,
  palette: {
    backgroundTop: 0x111719,
    backgroundBottom: 0x080a0b,
    gridLine: 0x243036,
    accentPrimary: 0xf0a35b,
    accentSecondary: 0xb6ffe4,
  },
  music: 'bgm-city',
  background: {
    key: 'stage-01-bg',
    path: '/assets/backgrounds/stage-01.webp',
  },
  flyingSprite: STAGE_ONE_FLYING_SPRITE,
  rangedSprite: STAGE_ONE_RANGED_SPRITE,
  meleeSwing: MELEE_SWING_CONFIG,
  meleeSprite: STAGE_ONE_MELEE_SPRITE,
  playerSprite: STAGE_ONE_TWO_PLAYER_SPRITE,
  showFloor: true,
  floorSkin: STAGE_ONE_FLOOR_SKIN,
  terrainSkin: STAGE_ONE_STOOL_SKIN,
  rooms: CITY_ROOMS,
};

export const STAGE_TWO_CONFIG: StageConfig = {
  id: 'stage-02',
  label: 'STAGE 2 // THE BACK ALLEYS',
  playerMaxHealth: 115,
  movementMode: MovementMode.GROUND,
  palette: {
    backgroundTop: 0x1a1310,
    backgroundBottom: 0x0c0908,
    gridLine: 0x3a2c20,
    accentPrimary: 0xd97a3a,
    accentSecondary: 0x3b4a6b,
    neonFlicker: true,
  },
  portalTint: 0xb6ffe4,
  music: 'bgm-alley',
  background: {
    key: 'stage-02-bg',
    path: '/assets/backgrounds/stage-02.webp',
  },
  flyingSprite: STAGE_TWO_FLYING_SPRITE,
  rangedSprite: STAGE_TWO_RANGED_SPRITE,
  meleeSwing: MELEE_SWING_CONFIG,
  meleeSprite: STAGE_TWO_MELEE_SPRITE,
  playerSprite: STAGE_ONE_TWO_PLAYER_SPRITE,
  showFloor: true,
  floorSkin: STAGE_TWO_FLOOR_SKIN,
  terrainSkin: STAGE_TWO_STOOL_SKIN,
  rooms: ALLEY_ROOMS,
};

export const STAGE_THREE_CONFIG: StageConfig = {
  id: 'stage-03',
  label: 'STAGE 3 // THE UNDERGROUND',
  playerMaxHealth: 130,
  movementMode: MovementMode.GROUND,
  palette: {
    backgroundTop: 0x10180f,
    backgroundBottom: 0x070a06,
    gridLine: 0x263620,
    accentPrimary: 0x6f8f3f,
    accentSecondary: 0xa8b84a,
    neonFlicker: true,
  },
  music: 'bgm-underground',
  background: {
    key: 'stage-03-bg',
    path: '/assets/backgrounds/stage-03.webp',
  },
  enemyAtlases: [
    ...CEILING_MAINTAINER_ANIMATION_ATLASES,
    ...CAPTOR_ANIMATION_ATLASES,
    ...BLOCKER_ANIMATION_ATLASES,
  ] as readonly EnemyAnimationAtlasConfig<string>[],
  playerSprite: STAGE_THREE_PLAYER_SPRITE,
  showFloor: true,
  floorSkin: STAGE_THREE_FLOOR_SKIN,
  terrainSkin: STAGE_THREE_STOOL_SKIN,
  pipeSkin: STAGE_THREE_PIPE_SKIN,
  rooms: UNDERGROUND_ROOMS,
  endEvent: 'siege',
};

export const STAGE_FOUR_CONFIG: StageConfig = {
  id: 'stage-04',
  label: 'STAGE 4 // HELL',
  playerMaxHealth: 150,
  movementMode: MovementMode.GROUND,
  palette: {
    backgroundTop: 0x210b0a,
    backgroundBottom: 0x080303,
    gridLine: 0x4a1712,
    accentPrimary: 0xff5a36,
    accentSecondary: 0xffb347,
    neonFlicker: true,
  },
  music: 'bgm-inferno',
  background: {
    key: 'stage-04-bg',
    path: '/assets/backgrounds/stage-04.webp',
  },
  enemyAtlases:
    STAGE_FOUR_ENEMY_ANIMATION_ATLASES as readonly EnemyAnimationAtlasConfig<string>[],
  playerSprite: STAGE_FOUR_PLAYER_SPRITE,
  showFloor: true,
  floorSkin: STAGE_FOUR_FLOOR_SKIN,
  terrainSkin: STAGE_FOUR_STOOL_SKIN,
  rooms: INFERNO_ROOMS,
  endEvent: 'shatter',
};

export const STAGE_FIVE_CONFIG: StageConfig = {
  id: 'stage-05',
  label: 'STAGE 5 // THE RETURN',
  playerMaxHealth: 175,
  movementMode: MovementMode.FLIGHT,
  palette: {
    backgroundTop: 0x171027,
    backgroundBottom: 0x07040c,
    gridLine: 0x3d2a5e,
    accentPrimary: 0xd89cff,
    accentSecondary: 0x9eeeff,
    neonFlicker: true,
  },
  music: 'bgm-return',
  background: {
    key: 'stage-05-bg',
    path: '/assets/backgrounds/stage-05.webp',
  },
  enemyAtlases: [
    ...STAGE_FIVE_ENEMY_ANIMATION_ATLASES,
    STAGE_FIVE_BOSS_ANIMATION_ATLAS,
  ] as readonly EnemyAnimationAtlasConfig<string>[],
  playerSprite: STAGE_FIVE_PLAYER_SPRITE,
  rooms: RETURN_ROOMS,
  endEvent: 'ascension',
};

export const STAGES: readonly StageConfig[] = [
  STAGE_ONE_CONFIG,
  STAGE_TWO_CONFIG,
  STAGE_THREE_CONFIG,
  STAGE_FOUR_CONFIG,
  STAGE_FIVE_CONFIG,
];

export const STARTING_STAGE_INDEX = 0;
