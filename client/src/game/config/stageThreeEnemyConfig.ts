import { STAGE_THREE_BLOCKER_SPRITE } from '@/game/config/blockerAnimationConfig';
import { STAGE_THREE_CAPTOR_SPRITE } from '@/game/config/captorAnimationConfig';
import { STAGE_THREE_CEILING_MAINTAINER_SPRITE } from '@/game/config/ceilingMaintainerAnimationConfig';

export const CEILING_MAINTAINER_CONFIG = {
  ...STAGE_THREE_CEILING_MAINTAINER_SPRITE,
  // 바닥 자세의 불투명 픽셀은 프레임 y=50..87. 바디 하단도 y=87에 맞춰
  // 새 바닥 스킨의 표면에 그림의 발이 정확히 닿게 함.
  floorBodyOffsetY: 1,
  maxHealth: 70,
  aggroRadius: 620,
  crawlSpeed: 155,
  warningDuration: 650,
  attackCooldown: 1450,
  dropDamage: 12,
  groundDashSpeed: 330,
  groundDashDamage: 14,
} as const;

export const CAPTOR_CONFIG = {
  ...STAGE_THREE_CAPTOR_SPRITE,
  maxHealth: 90,
  aggroRadius: 610,
  warningDuration: 620,
  attackCooldown: 1900,
  /** 이 거리보다 멀면 이 속도로 사거리 안까지 걸어서 접근한다. */
  chaseTriggerDistance: 430,
  chaseSpeed: 75,
  tetherDuration: 1000,
  tetherBreakDamage: 25,
  slowFactor: 0,
  minimumPullSpeed: 240,
  shockRange: 92,
  /** 근접까지 끌려오면 이 시간 동안 포박한 채 전기 충격을 가함. */
  captureDuration: 2000,
  /** 포박 중 도트 데미지 간격과 1회 데미지. */
  shockTickInterval: 350,
  shockDamage: 6,
  /** 포박 중 플레이어를 포획기 근처에 붙잡아두는 약한 끌림. */
  shockHoldPullSpeed: 90,
} as const;

export const BLOCKER_CONFIG = {
  ...STAGE_THREE_BLOCKER_SPRITE,
  maxHealth: 150,
  aggroRadius: 520,
  moveSpeed: 68,
  patrolDistance: 90,
  chargeSpeed: 220,
  minimumChargeDuration: 220,
  slamRange: 190,
  slamWarningDuration: 560,
  slamRecoveryDuration: 760,
  slamCooldown: 1500,
  shockwaveRange: 210,
  shockwaveDamage: 14,
  /** 바이저 폭 100% × 높이 15% = 전신 피격 면적의 정확히 15%. */
  faceWidthRatio: 1,
  faceHeightRatio: 0.15,
  projectileHitTolerance: 8,
} as const;
