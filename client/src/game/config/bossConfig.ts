import {
  STAGE_ONE_BOSS_ANIMATIONS,
  STAGE_ONE_BOSS_ATLAS_KEY,
  STAGE_TWO_BOSS_ANIMATIONS,
  STAGE_TWO_BOSS_ATLAS_KEY,
  STAGE_THREE_BOSS_ANIMATIONS,
  STAGE_THREE_BOSS_ATLAS_KEY,
  STAGE_FOUR_BOSS_ANIMATIONS,
  STAGE_FOUR_BOSS_ATLAS_KEY,
  STAGE_FIVE_BOSS_ANIMATIONS,
  STAGE_FIVE_BOSS_ATLAS_KEY,
} from '@/game/config/bossAnimationConfig';
import type {
  ArchitectBossSpriteConfig,
  BossCombatConfig,
  BossPatternConfig,
  BossSpriteConfig,
  HoundBossSpriteConfig,
  InfernalBossSpriteConfig,
  PurifierBossSpriteConfig,
} from '@/game/config/bossConfigTypes';

export const hasBossPattern = <Type extends BossPatternConfig['type']>(
  config: BossCombatConfig,
  type: Type,
): config is BossCombatConfig<Extract<BossPatternConfig, { type: Type }>> =>
  config.pattern.type === type;

/**
 * Boss stats and pattern tuning live together while their runtime behavior is
 * split into dedicated enemy classes.
 */
export const BOSS_COMBAT_CONFIGS = {
  'city-warden': {
    texture: STAGE_ONE_BOSS_ATLAS_KEY,
    placeholder: {
      bodyColor: 0x286783,
      accentColor: 0x8ee3ff,
    },
    maxHealth: 1200,
    aggroRadius: 1500,
    aggroIndicatorColor: 0x61c6ff,
    contactDamage: 18,
    contactDamageCooldown: 700,
    pattern: {
      type: 'laser-cannon',
      moveSpeed: 95,
      enragedMoveSpeed: 125,
      enrageHealthRatio: 0.5,
      preferredDistance: 360,
      distanceTolerance: 90,
      firstAttackDelay: 800,
      chargeDuration: 900,
      enragedChargeDuration: 700,
      aimLockDuration: 300,
      followUpChargeDuration: 500,
      fireDuration: 220,
      recoveryDuration: 1250,
      enragedRecoveryDuration: 950,
      range: 1700,
      width: 30,
      damage: 20,
      // Battle-pose cannon muzzle sits at source (+64, +10) from the sprite
      // centre, so the beam leaves the barrel rather than the chest.
      muzzleOffset: 64,
      muzzleOffsetY: 10,
      telegraphColor: 0x8ee3ff,
      beamColor: 0xc8f7ff,
    },
  },
  'alley-hunter': {
    texture: STAGE_TWO_BOSS_ATLAS_KEY,
    placeholder: {
      bodyColor: 0x7a3821,
      accentColor: 0xffb06f,
    },
    maxHealth: 2900,
    aggroRadius: 1600,
    aggroIndicatorColor: 0xff9a52,
    contactDamage: 22,
    contactDamageCooldown: 650,
    pattern: {
      type: 'hound',
      railRifleDamageMultiplier: 0.42,
      moveSpeed: 130,
      enragedMoveSpeed: 190,
      enrageHealthRatio: 0.55,
      preferredDistance: 470,
      distanceTolerance: 90,
      firstAttackDelay: 800,
      recoveryDuration: 950,
      enragedRecoveryDuration: 700,
      cone: {
        range: 720,
        // 전체 감시각 40°.
        halfAngleDegrees: 20,
        tiltDegrees: 14,
        // 머리(눈)에서 부채꼴이 나오도록 전방·위쪽으로 이동.
        apexOffsetY: -50,
        apexOffsetX: 70,
      },
      orb: {
        lockDuration: 420,
        enragedLockDuration: 300,
        speed: 430,
        radius: 16,
        damage: 22,
      },
    },
  },
  'underground-guardian': {
    texture: STAGE_THREE_BOSS_ATLAS_KEY,
    placeholder: {
      bodyColor: 0x3f5c28,
      accentColor: 0xc5ec72,
    },
    maxHealth: 8500,
    aggroRadius: 2600,
    aggroIndicatorColor: 0xa8d65c,
    contactDamage: 25,
    contactDamageCooldown: 600,
    pattern: {
      type: 'purifier',
      railRifleDamageMultiplier: 0.42,
      moveSpeed: 90,
      enragedMoveSpeed: 120,
      enrageHealthRatio: 0.5,
      preferredDistance: 430,
      distanceTolerance: 80,
      firstAttackDelay: 800,
      recoveryDuration: 900,
      enragedRecoveryDuration: 700,
      telegraphColor: 0x66ff8c,
      slam: {
        warnDuration: 900,
        strikeDuration: 300,
        launchSpeedY: 720,
        // 마지막 경고 지점까지 낮고 빠르게 "휙" 날아가도록 수평 속도 상한을
        // 크게 잡음. 이 상한으로 못 채우는 아주 먼 거리만 궤적이 늘어남.
        maxTravelSpeedX: 1800,
        landingRadius: 110,
        shockwaveSpeed: 420,
        shockwaveDamage: 18,
        shockwaveWidth: 46,
        shockwaveHeight: 46,
        shockwaveRange: 1400,
      },
      vacuum: {
        warnDuration: 700,
        duration: 2400,
        pullSpeed: 250,
        enragedPullSpeed: 280,
      },
    },
  },
  'infernal-executioner': {
    texture: STAGE_FOUR_BOSS_ATLAS_KEY,
    placeholder: {
      bodyColor: 0x7d1f16,
      accentColor: 0xff6a3d,
    },
    maxHealth: 3500,
    aggroRadius: 2200,
    aggroIndicatorColor: 0xff5a36,
    contactDamage: 20,
    contactDamageCooldown: 560,
    pattern: {
      type: 'infernal',
      railRifleDamageMultiplier: 0.49,
      enrageHealthRatio: 0.5,
      firstAttackDelay: 1800,
      recoveryDuration: 750,
      enragedRecoveryDuration: 550,
      phaseTransitionDuration: 700,
      telegraphColor: 0xff5a36,
      magmaColor: 0xff8a2b,
      rupture: {
        count: 3,
        warnDuration: 700,
        activeDuration: 350,
        markerInterval: 250,
        width: 92,
        height: 250,
        damage: 20,
      },
      charge: {
        warnDuration: 850,
        duration: 600,
        speed: 2200,
        enragedSpeedMultiplier: 1.15,
        damage: 26,
        staggerDuration: 900,
        coreDamageMultiplier: 1.5,
        wallPadding: 90,
      },
      shards: {
        warnDuration: 650,
        impactDamage: 16,
        magmaDamage: 4,
        magmaTickInterval: 400,
        magmaDuration: 1500,
        followUpDelay: 450,
        zoneWidth: 300,
        zoneHeight: 26,
        laneCount: 4,
      },
    },
  },
  'returning-architect': {
    texture: STAGE_FIVE_BOSS_ATLAS_KEY,
    placeholder: {
      bodyColor: 0x46306f,
      accentColor: 0xf0c8ff,
    },
    // 마지막 10% 코어의 2배 피해까지 포함한 유효 체력은 약 15,000임.
    maxHealth: 15_790,
    aggroRadius: 1900,
    aggroIndicatorColor: 0xd89cff,
    contactDamage: 32,
    contactDamageCooldown: 520,
    pattern: {
      type: 'architect',
      // 관통 3회 적중을 합쳐도 한 발의 총 피해가 95가 되도록 방어함.
      railRifleDamageMultiplier: 19 / 45,
      enrageHealthRatio: 0.5,
      salvationHealthRatio: 0.1,
      firstAttackDelay: 1000,
      recoveryDuration: 900,
      enragedRecoveryDuration: 700,
      phaseTransitionDuration: 1000,
      goldColor: 0xffff66,
      skyColor: 0x9eeeff,
      corruptionColor: 0x17131f,
      aerial: {
        minY: 150,
        maxY: 570,
        moveSpeed: 240,
      },
      projectile: {
        speed: 260,
        lifetime: 6500,
        radius: 7,
      },
      halo: {
        warnDuration: 700,
        bulletCount: 18,
        phaseOneRings: 2,
        phaseTwoRings: 3,
        ringInterval: 450,
        gapWidth: Math.PI / 2,
        gapStep: Math.PI / 4,
        damage: 9,
      },
      wings: {
        warnDuration: 550,
        bulletCount: 7,
        simultaneousBulletCount: 5,
        stepInterval: 500,
        recoveryDuration: 800,
        spread: Math.PI / 3,
        simultaneousSeparation: 0.62,
        speed: 340,
        damage: 10,
      },
      eye: {
        trackingDuration: 800,
        lockedWarningDuration: 350,
        orbDuration: 1200,
        phaseTwoFollowUpDelay: 650,
        orbRadius: 38,
        directDamage: 15,
        splitBulletCount: 8,
        splitDamage: 8,
      },
      salvation: {
        transitionDuration: 900,
        ringDuration: 2800,
        ringCount: 3,
        bulletCount: 24,
        innerRadius: 90,
        radiusStep: 64,
        gapWidth: Math.PI / 2.4,
        bulletSpeed: 125,
        damage: 9,
        coreDamageMultiplier: 2,
      },
    },
  },
} satisfies Record<string, BossCombatConfig>;

export type BossVariant = keyof typeof BOSS_COMBAT_CONFIGS;

/**
 * 실제 아틀라스가 있는 보스의 렌더링 설정. 전투 튜닝과 분리해 combat-config
 * 유니온이 균일하게(패턴-타입 exhaustiveness 유지) 남도록 함. 각 보스 클래스가
 * 필요로 하는 애니메이션 태그 집합이 다르므로 보스 계열별로 나눠 둠. 여기에
 * 없는 보스는 생성된 placeholder로 폴백함.
 */
export const LASER_BOSS_SPRITES: Partial<Record<BossVariant, BossSpriteConfig>> =
  {
    'city-warden': {
      animations: STAGE_ONE_BOSS_ANIMATIONS,
      scale: 1,
      bodyWidth: 72,
      bodyHeight: 132,
    },
  };

export const HOUND_BOSS_SPRITES: Partial<
  Record<BossVariant, HoundBossSpriteConfig>
> = {
  'alley-hunter': {
    animations: STAGE_TWO_BOSS_ANIMATIONS,
    scale: 1,
    // 사족보행 메카는 프레임을 가로로 꽉 채움(300x250). 다리/몸통에 바디를
    // 맞추고, 발이 바닥에 닿도록 하단 정렬. 프레임 아래쪽 그림자 여백만큼
    // 오프셋을 줄여, 스프라이트가 바닥에 더 붙게 함.
    bodyWidth: 220,
    bodyHeight: 150,
    bodyOffsetX: 40,
    bodyOffsetY: 69,
    // 아트는 머리(귀·눈)가 왼쪽 — 기본 좌향이므로 flip 방향을 반전.
    facesLeft: true,
  },
};

export const PURIFIER_BOSS_SPRITES: Partial<
  Record<BossVariant, PurifierBossSpriteConfig>
> = {
  'underground-guardian': {
    animations: STAGE_THREE_BOSS_ANIMATIONS,
    scale: 1,
    // 거미형 메카. 프레임(256x256)의 콘텐츠는 y[59,247]에 몸통·다리가 있음.
    // 다리/몸통에 바디를 맞추고 발이 바닥에 닿도록 하단 정렬.
    bodyWidth: 200,
    bodyHeight: 132,
    bodyOffsetX: 28,
    bodyOffsetY: 103,
  },
};

export const INFERNAL_BOSS_SPRITES: Partial<
  Record<BossVariant, InfernalBossSpriteConfig>
> = {
  'infernal-executioner': {
    animations: STAGE_FOUR_BOSS_ANIMATIONS,
    scale: 0.86,
    bodyWidth: 150,
    bodyHeight: 200,
    bodyOffsetX: 53,
    bodyOffsetY: 49,
    facesLeft: true,
  },
};

export const ARCHITECT_BOSS_SPRITES: Partial<
  Record<BossVariant, ArchitectBossSpriteConfig>
> = {
  'returning-architect': {
    animations: STAGE_FIVE_BOSS_ANIMATIONS,
    // 원본 불투명 높이 267px를 게임 내 보스 높이 350px로 표시함.
    scale: 350 / 267,
    bodyWidth: 110,
    bodyHeight: 190,
  },
};
