export type LaserCannonPatternConfig = {
  type: 'laser-cannon';
  moveSpeed: number;
  enragedMoveSpeed: number;
  enrageHealthRatio: number;
  preferredDistance: number;
  distanceTolerance: number;
  firstAttackDelay: number;
  chargeDuration: number;
  enragedChargeDuration: number;
  aimLockDuration: number;
  followUpChargeDuration: number;
  fireDuration: number;
  recoveryDuration: number;
  enragedRecoveryDuration: number;
  range: number;
  width: number;
  damage: number;
  muzzleOffset: number;
  muzzleOffsetY: number;
  telegraphColor: number;
  beamColor: number;
};

/** Visual-only fields a beam effect needs; shared by any beam-firing boss. */
export type BeamVisualConfig = {
  range: number;
  width: number;
  telegraphColor: number;
  beamColor: number;
};

/** Stage-2 searchlight detection followed by a dodgeable energy orb. */
export type HoundBossPatternConfig = {
  type: 'hound';
  /** 레일건이 장갑에 명중했을 때 적용되는 피해 배율. */
  railRifleDamageMultiplier: number;
  moveSpeed: number;
  enragedMoveSpeed: number;
  enrageHealthRatio: number;
  preferredDistance: number;
  distanceTolerance: number;
  firstAttackDelay: number;
  recoveryDuration: number;
  enragedRecoveryDuration: number;
  cone: {
    range: number;
    halfAngleDegrees: number;
    tiltDegrees: number;
    apexOffsetY: number;
    /** 부채꼴 꼭짓점을 정면(머리) 쪽으로 미는 수평 오프셋. 바라보는 방향으로 적용. */
    apexOffsetX?: number;
  };
  orb: {
    lockDuration: number;
    enragedLockDuration: number;
    speed: number;
    radius: number;
    damage: number;
  };
};

/** Stage-3 targeted slam and full-arena vacuum patterns. */
export type PurifierBossPatternConfig = {
  type: 'purifier';
  /** 레일건의 관통 다단 적중을 장갑으로 줄이는 타격당 피해 배율. */
  railRifleDamageMultiplier: number;
  moveSpeed: number;
  enragedMoveSpeed: number;
  enrageHealthRatio: number;
  preferredDistance: number;
  distanceTolerance: number;
  firstAttackDelay: number;
  recoveryDuration: number;
  enragedRecoveryDuration: number;
  telegraphColor: number;
  slam: {
    warnDuration: number;
    strikeDuration: number;
    launchSpeedY: number;
    maxTravelSpeedX: number;
    landingRadius: number;
    shockwaveSpeed: number;
    shockwaveDamage: number;
    shockwaveWidth: number;
    shockwaveHeight: number;
    shockwaveRange: number;
  };
  vacuum: {
    warnDuration: number;
    duration: number;
    pullSpeed: number;
    enragedPullSpeed: number;
  };
};

/** Stage-4 ground rupture, charge, and persistent magma-shard patterns. */
export type InfernalBossPatternConfig = {
  type: 'infernal';
  railRifleDamageMultiplier: number;
  enrageHealthRatio: number;
  firstAttackDelay: number;
  recoveryDuration: number;
  enragedRecoveryDuration: number;
  phaseTransitionDuration: number;
  telegraphColor: number;
  magmaColor: number;
  rupture: {
    count: number;
    warnDuration: number;
    activeDuration: number;
    markerInterval: number;
    width: number;
    height: number;
    damage: number;
  };
  charge: {
    warnDuration: number;
    duration: number;
    speed: number;
    enragedSpeedMultiplier: number;
    damage: number;
    staggerDuration: number;
    coreDamageMultiplier: number;
    wallPadding: number;
  };
  shards: {
    warnDuration: number;
    impactDamage: number;
    magmaDamage: number;
    magmaTickInterval: number;
    magmaDuration: number;
    followUpDelay: number;
    zoneWidth: number;
    zoneHeight: number;
    laneCount: number;
  };
};

/** Stage-5 aerial bullet patterns and the final core-exposure sequence. */
export type ArchitectBossPatternConfig = {
  type: 'architect';
  /** 레일건이 최종 보스의 장갑에 명중했을 때 적용되는 피해 배율. */
  railRifleDamageMultiplier: number;
  enrageHealthRatio: number;
  salvationHealthRatio: number;
  firstAttackDelay: number;
  recoveryDuration: number;
  enragedRecoveryDuration: number;
  phaseTransitionDuration: number;
  goldColor: number;
  skyColor: number;
  corruptionColor: number;
  aerial: {
    minY: number;
    maxY: number;
    moveSpeed: number;
  };
  projectile: {
    speed: number;
    lifetime: number;
    radius: number;
  };
  halo: {
    warnDuration: number;
    bulletCount: number;
    phaseOneRings: number;
    phaseTwoRings: number;
    ringInterval: number;
    gapWidth: number;
    gapStep: number;
    damage: number;
  };
  wings: {
    warnDuration: number;
    bulletCount: number;
    simultaneousBulletCount: number;
    stepInterval: number;
    recoveryDuration: number;
    spread: number;
    simultaneousSeparation: number;
    speed: number;
    damage: number;
  };
  eye: {
    trackingDuration: number;
    lockedWarningDuration: number;
    orbDuration: number;
    phaseTwoFollowUpDelay: number;
    orbRadius: number;
    directDamage: number;
    splitBulletCount: number;
    splitDamage: number;
  };
  salvation: {
    transitionDuration: number;
    ringDuration: number;
    ringCount: number;
    bulletCount: number;
    innerRadius: number;
    radiusStep: number;
    gapWidth: number;
    bulletSpeed: number;
    damage: number;
    coreDamageMultiplier: number;
  };
};

export type BossPatternConfig =
  | LaserCannonPatternConfig
  | HoundBossPatternConfig
  | PurifierBossPatternConfig
  | InfernalBossPatternConfig
  | ArchitectBossPatternConfig;

/** 실제 아틀라스 보스가 공유하는 배치/크기 필드. */
export type BossSpriteGeometry = {
  scale: number;
  bodyWidth: number;
  bodyHeight: number;
  /** 지정 시 setSize를 중앙 정렬 대신 이 오프셋으로 배치(발을 바닥에 맞춤). */
  bodyOffsetX?: number;
  bodyOffsetY?: number;
  /** 아트가 기본적으로 왼쪽을 향할 때 true(flipX 방향을 반전). 기본값은 오른쪽. */
  facesLeft?: boolean;
};

/** 레이저포 보스(city-warden)의 스프라이트 설정. */
export type BossSpriteConfig = BossSpriteGeometry & {
  animations: {
    idle: string;
    walk: string;
    charge: string;
    fire: string;
    recoil: string;
    death: string;
  };
};

/** 사냥개 보스(alley-hunter)의 스프라이트 설정. */
export type HoundBossSpriteConfig = BossSpriteGeometry & {
  animations: {
    idle: string;
    walk: string;
    quest: string;
    attack: string;
    death: string;
  };
};

/** 정화 집행기 보스(underground-guardian)의 스프라이트 설정. */
export type PurifierBossSpriteConfig = BossSpriteGeometry & {
  animations: {
    idle: string;
    walk: string;
    takeDown: string;
    slamWindup: string;
    slamAir: string;
    slamStrike: string;
    suction: string;
    death: string;
  };
};

/** 지옥 집행체 보스의 상태별 스프라이트 설정. */
export type InfernalBossSpriteConfig = BossSpriteGeometry & {
  animations: {
    idle: string;
    walk: string;
    gush: string;
    rush: string;
    getDown: string;
    death: string;
  };
};

/** 귀환한 설계자 보스의 상태별 스프라이트 설정. */
export type ArchitectBossSpriteConfig = BossSpriteGeometry & {
  animations: {
    idle: string;
    eyeTrack: string;
    eyeFire: string;
    haloCharge: string;
    haloFire: string;
    wingsLeft: string;
    wingsRight: string;
    wingsBoth: string;
    falseSalvation: string;
    phaseTransition: string;
    coreExposed: string;
    chorus: string;
    death: string;
  };
};

export type BossCombatConfig<
  Pattern extends BossPatternConfig = BossPatternConfig,
> = {
  texture: string;
  placeholder: {
    bodyColor: number;
    accentColor: number;
  };
  maxHealth: number;
  aggroRadius: number;
  aggroIndicatorColor: number;
  contactDamage: number;
  contactDamageCooldown: number;
  pattern: Pattern;
};

export type LaserBossCombatConfig =
  BossCombatConfig<LaserCannonPatternConfig>;
export type HoundBossCombatConfig = BossCombatConfig<HoundBossPatternConfig>;
export type PurifierBossCombatConfig =
  BossCombatConfig<PurifierBossPatternConfig>;
export type InfernalBossCombatConfig =
  BossCombatConfig<InfernalBossPatternConfig>;
export type ArchitectBossCombatConfig =
  BossCombatConfig<ArchitectBossPatternConfig>;
