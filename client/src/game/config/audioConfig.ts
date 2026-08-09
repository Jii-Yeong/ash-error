/**
 * Audio asset keys are a shared contract: gameplay code emits semantic events
 * and only this file decides which sound answers them. Renaming a key here is
 * the single edit needed when an asset is replaced.
 */
export type MusicKey =
  | 'bgm-title'
  | 'bgm-city'
  | 'bgm-alley'
  | 'bgm-underground'
  | 'bgm-inferno'
  | 'bgm-return';

export type SfxKey =
  | 'sfx-smg-fire'
  | 'sfx-shotgun-fire'
  | 'sfx-burst-rifle-fire'
  | 'sfx-rail-rifle-fire'
  | 'sfx-enemy-hit'
  | 'sfx-enemy-down'
  | 'sfx-player-hit'
  | 'sfx-player-dash'
  | 'sfx-player-death'
  | 'sfx-room-locked'
  | 'sfx-room-cleared'
  | 'sfx-shield-block-01'
  | 'sfx-shield-block-02'
  | 'sfx-shield-block-03'
  | 'sfx-shield-block-04'
  | 'sfx-boss-invulnerable-01'
  | 'sfx-boss-invulnerable-02'
  | 'sfx-boss-invulnerable-03'
  | 'sfx-boss-invulnerable-04'
  | 'sfx-stage1-boss-laser-single'
  | 'sfx-stage1-boss-laser-double-first'
  | 'sfx-stage1-boss-laser-double-second'
  | 'sfx-stage2-boss-scan-start'
  | 'sfx-stage2-boss-scan-loop'
  | 'sfx-stage2-boss-scan-end'
  | 'sfx-stage2-boss-target-lock'
  | 'sfx-stage2-boss-orb-shot-01'
  | 'sfx-stage2-boss-orb-shot-02'
  | 'sfx-stage2-boss-orb-shot-03'
  | 'sfx-stage2-boss-orb-shot-04'
  | 'sfx-stage3-boss-slam-warn'
  | 'sfx-stage3-boss-slam-leap'
  | 'sfx-stage3-boss-slam-impact'
  | 'sfx-stage3-boss-shockwave'
  | 'sfx-stage3-boss-vacuum-start'
  | 'sfx-stage3-boss-vacuum-loop'
  | 'sfx-stage3-boss-vacuum-end'
  | 'sfx-stage4-boss-rupture-warn'
  | 'sfx-stage4-boss-rupture-erupt'
  | 'sfx-stage4-boss-charge-warn'
  | 'sfx-stage4-boss-charge-rush'
  | 'sfx-stage4-boss-charge-impact'
  | 'sfx-stage4-boss-shard-fall'
  | 'sfx-stage4-boss-shard-impact'
  | 'sfx-stage4-boss-phase-shift'
  | 'sfx-stage5-boss-halo-warn'
  | 'sfx-stage5-boss-halo-ring'
  | 'sfx-stage5-boss-wings-warn'
  | 'sfx-stage5-boss-wings-fan'
  | 'sfx-stage5-boss-eye-track'
  | 'sfx-stage5-boss-eye-lock'
  | 'sfx-stage5-boss-eye-orb'
  | 'sfx-stage5-boss-phase-shift'
  | 'sfx-stage5-boss-salvation'
  | 'sfx-stage5-boss-core-exposed'
  | 'sfx-stage1-footstep-01'
  | 'sfx-stage1-footstep-02'
  | 'sfx-stage1-footstep-03'
  | 'sfx-stage1-footstep-04'
  | 'sfx-stage2-footstep-01'
  | 'sfx-stage2-footstep-02'
  | 'sfx-stage2-footstep-03'
  | 'sfx-stage2-footstep-04'
  | 'sfx-stage3-footstep-01'
  | 'sfx-stage3-footstep-02'
  | 'sfx-stage3-footstep-03'
  | 'sfx-stage3-footstep-04'
  | 'sfx-stage4-footstep-01'
  | 'sfx-stage4-footstep-02'
  | 'sfx-stage4-footstep-03'
  | 'sfx-stage4-footstep-04';

export type AudioAssetKey = MusicKey | SfxKey;

export type SfxConfig = {
  /** Trim relative to the sfx bus. Cues that repeat fastest sit lowest. */
  volume: number;
  /** 원본보다 높고 짧게 들려줄 기준 재생률. */
  rate?: number;
  /** Playback rate is randomised by +/- this much so repeats do not phase. */
  rateJitter?: number;
  /**
   * Volume is randomised *downward* by up to this much, so a cue that repeats
   * on a fixed interval does not read as a loop.
   *
   * Declared here rather than at the call site for the same reason `rateJitter`
   * is: the number in `volume` has to stay the loudest this cue can be, or the
   * mix cannot be read off this file.
   */
  volumeJitter?: number;
  /** Drops repeats fired inside this window, e.g. shotgun pellets landing together. */
  minInterval?: number;
};

export type MusicConfig = {
  volume: number;
};

export type AudioMix = {
  master: number;
  music: number;
  sfx: number;
};

/** Three buses so the title screen can expose master/music/sfx separately. */
export const AUDIO_MIX_CONFIG: AudioMix = {
  master: 0.9,
  music: 0.45,
  sfx: 0.8,
};

export function clampAudioMixValue(value: number) {
  return Math.min(1, Math.max(0, value));
}

export const MUSIC_CONFIG: Record<MusicKey, MusicConfig> = {
  'bgm-title': { volume: 0.7 },
  'bgm-city': { volume: 0.6 },
  'bgm-alley': { volume: 0.65 },
  // Stages 3-5 have their own BGM slot; the files are not produced yet, so
  // AudioDirector skips them silently until they land in assets/audio/music/.
  'bgm-underground': { volume: 0.6 },
  'bgm-inferno': { volume: 0.6 },
  'bgm-return': { volume: 0.6 },
};

/**
 * 방어된 탄의 금속 링. **게임에서 음정이 가장 뚜렷한 큐다** — 피크 대 중앙값이
 * 97.8dB로, 총소리 4종(40~45dB)보다 두 배 넘게 음정이 서 있다.
 *
 * 그런 소리를 방패 적에게 쏘는 **탄마다** 반복하면 금속음이 아니라 음계로
 * 들린다. 그래서 두 가지를 되돌린다:
 *
 * - `rate`를 1.1에서 1.0으로. 피치를 올릴수록 링이 또렷해져 음처럼 굳는다.
 * - `rateJitter`를 0.02에서 0.09로. 0.02는 반복이 거의 같은 높이로 쌓여
 *   연타가 한 음의 연속으로 들리던 폭이다. 무기 큐가 같은 이유로 쓰는
 *   폭(0.08~0.12)에 맞췄다.
 */
const PROJECTILE_BLOCK_SFX_CONFIG: SfxConfig = {
  volume: 0.45,
  rateJitter: 0.09,
  minInterval: 45,
};

const STAGE_ONE_BOSS_LASER_SFX_CONFIG: SfxConfig = {
  volume: 0.7,
};

/**
 * 발소리는 게임에서 가장 자주 나는 큐다. 240ms 간격으로 계속 반복되므로
 * 재생률과 음량을 함께 흔들어야 루프로 들리지 않는다.
 */
const FOOTSTEP_SFX_CONFIG: SfxConfig = {
  volume: 1,
  rateJitter: 0.03,
  volumeJitter: 0.1,
};

const STAGE_TWO_BOSS_ORB_SHOT_SFX_CONFIG: SfxConfig = {
  volume: 0.75,
};

/**
 * Boss cue mix, stages 3-5.
 *
 * Three levels, assigned by what the cue tells the player rather than by how
 * big it is: a telegraph has to be heard over the fight but must not compete
 * with the hit it predicts, and the hit is the loudest thing on screen.
 * Sustained beds sit lowest because they are the only cues that are still
 * playing while the player is trying to hear everything else.
 */
const BOSS_TELEGRAPH_SFX_CONFIG: SfxConfig = {
  volume: 0.55,
  rateJitter: 0.02,
};

const BOSS_IMPACT_SFX_CONFIG: SfxConfig = {
  volume: 0.8,
  rateJitter: 0.03,
};

const BOSS_SUSTAIN_SFX_CONFIG: SfxConfig = {
  volume: 0.42,
};

export const SFX_CONFIG: Record<SfxKey, SfxConfig> = {
  'sfx-smg-fire': { volume: 0.35, rateJitter: 0.08 },
  'sfx-shotgun-fire': { volume: 0.6, rateJitter: 0.04 },
  // Three rounds land inside 144ms, so the jitter is wide enough that a burst
  // does not read as one sound played three times.
  'sfx-burst-rifle-fire': { volume: 0.42, rateJitter: 0.1 },
  'sfx-rail-rifle-fire': { volume: 0.7, rateJitter: 0.03 },
  'sfx-enemy-hit': { volume: 0.45, rateJitter: 0.12, minInterval: 45 },
  'sfx-enemy-down': { volume: 0.7, rateJitter: 0.05 },
  'sfx-player-hit': { volume: 0.8 },
  'sfx-player-dash': { volume: 0.5, rateJitter: 0.06 },
  'sfx-player-death': { volume: 0.9 },
  // Both fire once per room, so they are trimmed below the combat cues: a
  // sound heard on every transition wears out faster than one heard mid-fight.
  'sfx-room-locked': { volume: 0.6 },
  'sfx-room-cleared': { volume: 0.45 },
  'sfx-shield-block-01': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-shield-block-02': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-shield-block-03': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-shield-block-04': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-boss-invulnerable-01': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-boss-invulnerable-02': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-boss-invulnerable-03': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-boss-invulnerable-04': PROJECTILE_BLOCK_SFX_CONFIG,
  'sfx-stage1-boss-laser-single': STAGE_ONE_BOSS_LASER_SFX_CONFIG,
  'sfx-stage1-boss-laser-double-first': STAGE_ONE_BOSS_LASER_SFX_CONFIG,
  'sfx-stage1-boss-laser-double-second': STAGE_ONE_BOSS_LASER_SFX_CONFIG,
  'sfx-stage2-boss-scan-start': { volume: 0.7 },
  'sfx-stage2-boss-scan-loop': { volume: 0.5 },
  'sfx-stage2-boss-scan-end': { volume: 0.7 },
  'sfx-stage2-boss-target-lock': { volume: 0.8 },
  'sfx-stage2-boss-orb-shot-01': STAGE_TWO_BOSS_ORB_SHOT_SFX_CONFIG,
  'sfx-stage2-boss-orb-shot-02': STAGE_TWO_BOSS_ORB_SHOT_SFX_CONFIG,
  'sfx-stage2-boss-orb-shot-03': STAGE_TWO_BOSS_ORB_SHOT_SFX_CONFIG,
  'sfx-stage2-boss-orb-shot-04': STAGE_TWO_BOSS_ORB_SHOT_SFX_CONFIG,
  'sfx-stage3-boss-slam-warn': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage3-boss-slam-leap': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage3-boss-slam-impact': BOSS_IMPACT_SFX_CONFIG,
  // Lands with the impact it belongs to, so it is trimmed below it: the pair
  // has to read as one event with an aftermath, not as two hits.
  'sfx-stage3-boss-shockwave': { volume: 0.5, rateJitter: 0.03 },
  'sfx-stage3-boss-vacuum-start': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage3-boss-vacuum-loop': BOSS_SUSTAIN_SFX_CONFIG,
  'sfx-stage3-boss-vacuum-end': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage4-boss-rupture-warn': BOSS_TELEGRAPH_SFX_CONFIG,
  // Three columns erupt 250ms apart, so the jitter is wide enough that the
  // sequence does not read as one sound played three times.
  'sfx-stage4-boss-rupture-erupt': { volume: 0.75, rateJitter: 0.07 },
  'sfx-stage4-boss-charge-warn': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage4-boss-charge-rush': { volume: 0.7, rateJitter: 0.02 },
  'sfx-stage4-boss-charge-impact': BOSS_IMPACT_SFX_CONFIG,
  'sfx-stage4-boss-shard-fall': BOSS_TELEGRAPH_SFX_CONFIG,
  // Four lanes land in the same frame. Without the window they stack into one
  // cue four times as loud as the mix was set for.
  'sfx-stage4-boss-shard-impact': {
    volume: 0.7,
    rateJitter: 0.04,
    minInterval: 90,
  },
  'sfx-stage4-boss-phase-shift': { volume: 0.85 },
  'sfx-stage5-boss-halo-warn': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage5-boss-halo-ring': { volume: 0.7, rateJitter: 0.02 },
  'sfx-stage5-boss-wings-warn': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage5-boss-wings-fan': { volume: 0.65, rateJitter: 0.03 },
  'sfx-stage5-boss-eye-track': BOSS_TELEGRAPH_SFX_CONFIG,
  'sfx-stage5-boss-eye-lock': { volume: 0.8 },
  'sfx-stage5-boss-eye-orb': BOSS_IMPACT_SFX_CONFIG,
  'sfx-stage5-boss-phase-shift': { volume: 0.85 },
  // The one cue the fight is built around. Nothing else is allowed to be
  // louder, and it plays exactly once per run.
  'sfx-stage5-boss-salvation': { volume: 0.95 },
  'sfx-stage5-boss-core-exposed': { volume: 0.7 },
  'sfx-stage1-footstep-01': FOOTSTEP_SFX_CONFIG,
  'sfx-stage1-footstep-02': FOOTSTEP_SFX_CONFIG,
  'sfx-stage1-footstep-03': FOOTSTEP_SFX_CONFIG,
  'sfx-stage1-footstep-04': FOOTSTEP_SFX_CONFIG,
  'sfx-stage2-footstep-01': FOOTSTEP_SFX_CONFIG,
  'sfx-stage2-footstep-02': FOOTSTEP_SFX_CONFIG,
  'sfx-stage2-footstep-03': FOOTSTEP_SFX_CONFIG,
  'sfx-stage2-footstep-04': FOOTSTEP_SFX_CONFIG,
  'sfx-stage3-footstep-01': FOOTSTEP_SFX_CONFIG,
  'sfx-stage3-footstep-02': FOOTSTEP_SFX_CONFIG,
  'sfx-stage3-footstep-03': FOOTSTEP_SFX_CONFIG,
  'sfx-stage3-footstep-04': FOOTSTEP_SFX_CONFIG,
  'sfx-stage4-footstep-01': FOOTSTEP_SFX_CONFIG,
  'sfx-stage4-footstep-02': FOOTSTEP_SFX_CONFIG,
  'sfx-stage4-footstep-03': FOOTSTEP_SFX_CONFIG,
  'sfx-stage4-footstep-04': FOOTSTEP_SFX_CONFIG,
};

export const PROJECTILE_BLOCK_SFX_BY_KIND = {
  shield: [
    'sfx-shield-block-01',
    'sfx-shield-block-02',
    'sfx-shield-block-03',
    'sfx-shield-block-04',
  ],
  boss: [
    'sfx-boss-invulnerable-01',
    'sfx-boss-invulnerable-02',
    'sfx-boss-invulnerable-03',
    'sfx-boss-invulnerable-04',
  ],
} as const satisfies Record<'shield' | 'boss', readonly SfxKey[]>;

export const STAGE_ONE_BOSS_LASER_SFX_BY_CUE = {
  single: 'sfx-stage1-boss-laser-single',
  'double-first': 'sfx-stage1-boss-laser-double-first',
  'double-second': 'sfx-stage1-boss-laser-double-second',
} as const satisfies Record<
  'single' | 'double-first' | 'double-second',
  SfxKey
>;

export const STAGE_TWO_BOSS_SCAN_SFX_BY_CUE = {
  start: 'sfx-stage2-boss-scan-start',
  loop: 'sfx-stage2-boss-scan-loop',
  end: 'sfx-stage2-boss-scan-end',
  'target-lock': 'sfx-stage2-boss-target-lock',
} as const satisfies Record<
  'start' | 'loop' | 'end' | 'target-lock',
  SfxKey
>;

export const STAGE_TWO_BOSS_ORB_SHOT_SFX = [
  'sfx-stage2-boss-orb-shot-01',
  'sfx-stage2-boss-orb-shot-02',
  'sfx-stage2-boss-orb-shot-03',
  'sfx-stage2-boss-orb-shot-04',
] as const satisfies readonly SfxKey[];

/**
 * Stage 3-5 boss cues.
 *
 * One map per boss, keyed by the pattern moment rather than by the file, so a
 * boss emits `'slam-impact'` and never names an asset. The cue union each
 * boss's event carries is derived from its map below, which is what keeps a
 * cue from being emitted that no sound answers.
 */
export const STAGE_THREE_BOSS_SFX_BY_CUE = {
  'slam-warn': 'sfx-stage3-boss-slam-warn',
  'slam-leap': 'sfx-stage3-boss-slam-leap',
  'slam-impact': 'sfx-stage3-boss-slam-impact',
  shockwave: 'sfx-stage3-boss-shockwave',
  'vacuum-start': 'sfx-stage3-boss-vacuum-start',
  'vacuum-loop': 'sfx-stage3-boss-vacuum-loop',
  'vacuum-end': 'sfx-stage3-boss-vacuum-end',
} as const satisfies Record<string, SfxKey>;

export const STAGE_FOUR_BOSS_SFX_BY_CUE = {
  'rupture-warn': 'sfx-stage4-boss-rupture-warn',
  'rupture-erupt': 'sfx-stage4-boss-rupture-erupt',
  'charge-warn': 'sfx-stage4-boss-charge-warn',
  'charge-rush': 'sfx-stage4-boss-charge-rush',
  'charge-impact': 'sfx-stage4-boss-charge-impact',
  'shard-fall': 'sfx-stage4-boss-shard-fall',
  'shard-impact': 'sfx-stage4-boss-shard-impact',
  'phase-shift': 'sfx-stage4-boss-phase-shift',
} as const satisfies Record<string, SfxKey>;

export const STAGE_FIVE_BOSS_SFX_BY_CUE = {
  'halo-warn': 'sfx-stage5-boss-halo-warn',
  'halo-ring': 'sfx-stage5-boss-halo-ring',
  'wings-warn': 'sfx-stage5-boss-wings-warn',
  'wings-fan': 'sfx-stage5-boss-wings-fan',
  'eye-track': 'sfx-stage5-boss-eye-track',
  'eye-lock': 'sfx-stage5-boss-eye-lock',
  'eye-orb': 'sfx-stage5-boss-eye-orb',
  'phase-shift': 'sfx-stage5-boss-phase-shift',
  salvation: 'sfx-stage5-boss-salvation',
  'core-exposed': 'sfx-stage5-boss-core-exposed',
} as const satisfies Record<string, SfxKey>;

export type StageThreeBossCue = keyof typeof STAGE_THREE_BOSS_SFX_BY_CUE;
export type StageFourBossCue = keyof typeof STAGE_FOUR_BOSS_SFX_BY_CUE;
export type StageFiveBossCue = keyof typeof STAGE_FIVE_BOSS_SFX_BY_CUE;

/**
 * Cues that keep playing until something stops them.
 *
 * A one-shot that is never stopped simply ends; a loop that is never stopped
 * plays over the death screen forever. Listing them here lets AudioDirector
 * silence every sustained bed from one place whenever the fight ends, instead
 * of relying on each boss to emit its own stop from inside an update that has
 * already been switched off.
 */
export const SUSTAINED_SFX = {
  'stage2-boss-scan': {
    start: 'sfx-stage2-boss-scan-start',
    loop: 'sfx-stage2-boss-scan-loop',
  },
  'stage3-boss-vacuum': {
    start: 'sfx-stage3-boss-vacuum-start',
    loop: 'sfx-stage3-boss-vacuum-loop',
  },
} as const satisfies Record<string, { start: SfxKey; loop: SfxKey }>;

export type SustainedSfxId = keyof typeof SUSTAINED_SFX;

export type FootstepStageId =
  | 'stage-01'
  | 'stage-02'
  | 'stage-03'
  | 'stage-04';

export const FOOTSTEP_SFX_BY_STAGE: Readonly<
  Record<FootstepStageId, readonly SfxKey[]>
> = {
  'stage-01': [
    'sfx-stage1-footstep-01',
    'sfx-stage1-footstep-02',
    'sfx-stage1-footstep-03',
    'sfx-stage1-footstep-04',
  ],
  'stage-02': [
    'sfx-stage2-footstep-01',
    'sfx-stage2-footstep-02',
    'sfx-stage2-footstep-03',
    'sfx-stage2-footstep-04',
  ],
  'stage-03': [
    'sfx-stage3-footstep-01',
    'sfx-stage3-footstep-02',
    'sfx-stage3-footstep-03',
    'sfx-stage3-footstep-04',
  ],
  'stage-04': [
    'sfx-stage4-footstep-01',
    'sfx-stage4-footstep-02',
    'sfx-stage4-footstep-03',
    'sfx-stage4-footstep-04',
  ],
};

/**
 * 해당 스테이지에 도달해야 비로소 필요한 큐.
 *
 * 부팅 배치는 이걸 건너뛰고, AudioDirector가 음악과 **같은 정책**으로 가져온다
 * — 지금 스테이지와 그 다음 하나. 도달하지도 않을 스테이지의 보스 큐까지
 * 타이틀 화면 앞에서 기다릴 이유가 없다.
 *
 * 한 스테이지 앞서 받는 것이 핵심이다. 큐는 순간음이라 아직 도착하지 않았으면
 * 큐에 쌓이지 않고 그냥 버려지므로(늦게 나는 총소리는 버그로 들린다), 실제로
 * 필요해지는 시점보다 2~3분 앞서 요청이 나가야 한다.
 */
export const DEFERRED_SFX_BY_STAGE: Readonly<
  Record<string, readonly SfxKey[]>
> = {
  'stage-01': [
    ...Object.values(STAGE_ONE_BOSS_LASER_SFX_BY_CUE),
    ...FOOTSTEP_SFX_BY_STAGE['stage-01'],
  ],
  'stage-02': [
    ...Object.values(STAGE_TWO_BOSS_SCAN_SFX_BY_CUE),
    ...STAGE_TWO_BOSS_ORB_SHOT_SFX,
    ...FOOTSTEP_SFX_BY_STAGE['stage-02'],
  ],
  'stage-03': [
    ...Object.values(STAGE_THREE_BOSS_SFX_BY_CUE),
    ...FOOTSTEP_SFX_BY_STAGE['stage-03'],
  ],
  'stage-04': [
    ...Object.values(STAGE_FOUR_BOSS_SFX_BY_CUE),
    ...FOOTSTEP_SFX_BY_STAGE['stage-04'],
  ],
  // 5스테이지는 비행 구간이라 발소리가 없다.
  'stage-05': Object.values(STAGE_FIVE_BOSS_SFX_BY_CUE),
};

/** BootScene이 즉시 로드 대상에서 걸러내는 집합. */
export const DEFERRED_SFX_KEYS: ReadonlySet<string> = new Set(
  Object.values(DEFERRED_SFX_BY_STAGE).flat(),
);

/**
 * Weapon ids come from WeaponConfig.id. The mapping lives here rather than on
 * WeaponConfig so combat balance and sound design stay separately owned.
 */
export const WEAPON_FIRE_SFX: Record<string, SfxKey | undefined> = {
  smg: 'sfx-smg-fire',
  shotgun: 'sfx-shotgun-fire',
  'burst-rifle': 'sfx-burst-rifle-fire',
  'rail-rifle': 'sfx-rail-rifle-fire',
};
