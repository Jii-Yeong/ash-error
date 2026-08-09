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
  | 'sfx-monitor-beep';

export type AudioAssetKey = MusicKey | SfxKey;

/**
 * 다른 큐 위에 겹쳐 울리는 큐. 레이어도 `SFX_CONFIG`에 자기 항목을 갖는다.
 * 볼륨과 스로틀을 부모에 파묻지 않고 다른 큐와 같은 자리에서 고치기 위해서다.
 */
export type SfxLayerConfig = {
  key: SfxKey;
  /** 이 레이어가 울리는 스테이지 id. 없으면 모든 스테이지에서 울린다. */
  stages?: readonly string[];
};

export type SfxConfig = {
  /** Trim relative to the sfx bus. Cues that repeat fastest sit lowest. */
  volume: number;
  /** Playback rate is randomised by +/- this much so repeats do not phase. */
  rateJitter?: number;
  /** Drops repeats fired inside this window, e.g. shotgun pellets landing together. */
  minInterval?: number;
  /** 이 큐와 함께 울리는 큐. `SfxLayerConfig` 참고. */
  layer?: SfxLayerConfig;
};

/**
 * 1~3스테이지는 아직 플레이어에게 도시 이야기를 들려주고 있는 구간이다.
 * `stageConfig`에서 읽지 않고 문자열로 적어 둔 이유는, 그 모듈이 `MusicKey`
 * 때문에 이미 이 파일을 참조하고 있어서 반대 방향으로 `STAGES`를 끌어오면
 * 순환이 닫히기 때문이다.
 */
const MONITOR_MOTIF_STAGES = ['stage-01', 'stage-02', 'stage-03'] as const;

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
  'bgm-underground': { volume: 0.6 },
  'bgm-inferno': { volume: 0.6 },
  'bgm-return': { volume: 0.6 },
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
  // 이 큐 아래 깔리는 모니터 비프가 기획서 복선의 사운드 쪽 절반이다.
  // 주인공은 병상에 누워 있고, 피격 하나하나가 어딘가의 기계에 기록된다.
  // 한 대 맞으면 한 번 뛴다.
  'sfx-player-hit': {
    volume: 0.8,
    layer: { key: 'sfx-monitor-beep', stages: MONITOR_MOTIF_STAGES },
  },
  'sfx-player-dash': { volume: 0.5, rateJitter: 0.06 },
  'sfx-player-death': { volume: 0.9 },
  // Both fire once per room, so they are trimmed below the combat cues: a
  // sound heard on every transition wears out faster than one heard mid-fight.
  'sfx-room-locked': { volume: 0.6 },
  'sfx-room-cleared': { volume: 0.45 },
  // 복선은 들려야 성립하고, 타격음 아래에 있어야 복선으로 남는다. 이 파일은
  // 지속음이라 트랜지언트와 견주면 RMS보다 훨씬 크게 들린다 — 여기서 유일하게
  // 계측기가 아니라 귀로 정해야 하는 값이다. 지터는 주지 않는다. 음정이
  // 흔들리는 모니터는 고장난 모니터다.
  'sfx-monitor-beep': { volume: 0.12 },
};

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
