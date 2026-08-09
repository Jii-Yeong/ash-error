import Phaser from 'phaser';
import { resolveAudioAssets } from '@/game/config/audioAssets';
import {
  AUDIO_MIX_CONFIG,
  clampAudioMixValue,
  DEFERRED_SFX_BY_STAGE,
  FOOTSTEP_SFX_BY_STAGE,
  MUSIC_CONFIG,
  PROJECTILE_BLOCK_SFX_BY_KIND,
  SFX_CONFIG,
  STAGE_FIVE_BOSS_SFX_BY_CUE,
  STAGE_FOUR_BOSS_SFX_BY_CUE,
  STAGE_ONE_BOSS_LASER_SFX_BY_CUE,
  STAGE_THREE_BOSS_SFX_BY_CUE,
  STAGE_TWO_BOSS_ORB_SHOT_SFX,
  STAGE_TWO_BOSS_SCAN_SFX_BY_CUE,
  SUSTAINED_SFX,
  WEAPON_FIRE_SFX,
  type AudioAssetKey,
  type AudioMix,
  type FootstepStageId,
  type MusicKey,
  type SfxKey,
  type SfxLayerConfig,
  type StageFiveBossCue,
  type StageFourBossCue,
  type StageThreeBossCue,
  type SustainedSfxId,
} from '@/game/config/audioConfig';
import { STAGES } from '@/game/config/stageConfig';
import { gameEvents } from '@/game/events/gameEvents';
import type { GamePhase } from '@/game/state/gamePhase';
import type { GameSceneKey } from '@/game/state/gameSceneKey';
import type { RoomState } from '@/game/state/roomState';

/**
 * `decodeAudio` lives on the Web Audio manager only. The HTML5 and no-audio
 * managers do not expose it, so deferred music is skipped there rather than
 * crashing — the same silent degradation every cue already has.
 */
type DecodingSoundManager = Phaser.Sound.BaseSoundManager & {
  decodeAudio(key: string, data: ArrayBuffer): void;
};

/** `BaseSoundManager`에서 런타임에 반환되는 구체적인 사운드 타입을 보완한다. */
type VolumeControlledSound = Phaser.Sound.BaseSound & {
  setVolume(value: number): Phaser.Sound.BaseSound;
};

function canDecode(
  manager: Phaser.Sound.BaseSoundManager,
): manager is DecodingSoundManager {
  return 'decodeAudio' in manager && typeof manager.decodeAudio === 'function';
}

/**
 * A start one-shot that hands over to a seamless loop.
 *
 * `active` is separate from the two sounds because the handover is asynchronous:
 * a stop that arrives while the start sound is still playing has nothing to
 * stop yet, and without the flag the loop would begin after the thing that
 * wanted it silenced had already gone.
 */
type SustainedCue = {
  active: boolean;
  start?: VolumeControlledSound;
  loop?: VolumeControlledSound;
};

/**
 * Owns every sound in the game. It is bound to the Phaser.Game rather than a
 * Scene so music survives scene.restart() and the title-to-game handover, and
 * it only listens to gameEvents so no gameplay system has to know audio exists.
 *
 * Cues whose asset has not been produced yet are skipped silently: sound design
 * can land one file at a time without touching gameplay code.
 */
export class AudioDirector {
  private readonly mix: AudioMix = { ...AUDIO_MIX_CONFIG };
  private readonly playedAt = new Map<string, number>();
  private music?: VolumeControlledSound;
  /** Every sustained bed currently running, keyed by SUSTAINED_SFX id. */
  private readonly sustained = new Map<SustainedSfxId, SustainedCue>();
  /** What should be playing, whether or not its file has arrived yet. */
  private wantedMusic?: MusicKey;
  private currentStageId?: string;
  /** Tracks already fetched, so a revisited stage does not download twice. */
  private readonly requested = new Set<AudioAssetKey>();

  constructor(private readonly game: Phaser.Game) {
    this.game.sound.on(Phaser.Sound.Events.DECODED, this.handleDecoded);
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleGameBlur);

    gameEvents.on('scene-changed', this.handleSceneChanged);
    gameEvents.on('stage-changed', this.handleStageChanged);
    gameEvents.on('phase-changed', this.handlePhaseChanged);
    gameEvents.on('room-state-changed', this.handleRoomStateChanged);
    gameEvents.on('audio-mix-changed', this.handleAudioMixChanged);
    gameEvents.on('weapon-fired', this.handleWeaponFired);
    gameEvents.on('player-damaged', this.handlePlayerDamaged);
    gameEvents.on('player-dashed', this.handlePlayerDashed);
    gameEvents.on('player-stepped', this.handlePlayerStepped);
    gameEvents.on('enemy-damaged', this.handleEnemyDamaged);
    gameEvents.on('enemy-projectile-blocked', this.handleProjectileBlocked);
    gameEvents.on('enemy-defeated', this.handleEnemyDefeated);
    gameEvents.on('boss-laser-fired', this.handleBossLaserFired);
    gameEvents.on('boss-scan-cue', this.handleBossScanCue);
    gameEvents.on('boss-orb-fired', this.handleBossOrbFired);
    gameEvents.on('boss-purifier-cue', this.handlePurifierCue);
    gameEvents.on('boss-infernal-cue', this.handleInfernalCue);
    gameEvents.on('boss-architect-cue', this.handleArchitectCue);
    gameEvents.on('ending-ascension-cue', this.handleEndingAscensionCue);
    gameEvents.on('pause-changed', this.handlePauseChanged);
  }

  destroy() {
    this.game.events.off(Phaser.Core.Events.BLUR, this.handleGameBlur);
    gameEvents.off('scene-changed', this.handleSceneChanged);
    gameEvents.off('stage-changed', this.handleStageChanged);
    gameEvents.off('phase-changed', this.handlePhaseChanged);
    gameEvents.off('room-state-changed', this.handleRoomStateChanged);
    gameEvents.off('audio-mix-changed', this.handleAudioMixChanged);
    gameEvents.off('weapon-fired', this.handleWeaponFired);
    gameEvents.off('player-damaged', this.handlePlayerDamaged);
    gameEvents.off('player-dashed', this.handlePlayerDashed);
    gameEvents.off('player-stepped', this.handlePlayerStepped);
    gameEvents.off('enemy-damaged', this.handleEnemyDamaged);
    gameEvents.off('enemy-projectile-blocked', this.handleProjectileBlocked);
    gameEvents.off('enemy-defeated', this.handleEnemyDefeated);
    gameEvents.off('boss-laser-fired', this.handleBossLaserFired);
    gameEvents.off('boss-scan-cue', this.handleBossScanCue);
    gameEvents.off('boss-orb-fired', this.handleBossOrbFired);
    gameEvents.off('boss-purifier-cue', this.handlePurifierCue);
    gameEvents.off('boss-infernal-cue', this.handleInfernalCue);
    gameEvents.off('boss-architect-cue', this.handleArchitectCue);
    gameEvents.off('ending-ascension-cue', this.handleEndingAscensionCue);
    gameEvents.off('pause-changed', this.handlePauseChanged);
    this.game.sound.off(Phaser.Sound.Events.DECODED, this.handleDecoded);
    this.stopAllSustained();
    this.stopMusic();
    this.playedAt.clear();
  }

  /** Built once; the glob behind it is resolved at build time. */
  private assetUrls?: Map<string, string>;

  private urlFor(key: AudioAssetKey) {
    if (!this.assetUrls) {
      this.assetUrls = new Map(
        resolveAudioAssets().assets.map((asset) => [asset.key, asset.url]),
      );
    }

    return this.assetUrls.get(key);
  }

  /** 도달할 스테이지의 전용 큐를 미리 가져온다. 정책은 음악과 같다. */
  private requestStageSfx(stageId: string | undefined) {
    if (!stageId) {
      return;
    }

    for (const key of DEFERRED_SFX_BY_STAGE[stageId] ?? []) {
      this.requestAudio(key);
    }
  }

  /**
   * 스테이지 음악은 부팅 중이 아니라 이후에 가져온다. 타이틀 곡은 예외로,
   * BootScene에서 미리 불러와 플레이어가 브라우저 시작 안내를 통과하는 즉시
   * 재생을 시도할 수 있게 한다. 작은 효과음 묶음과 달리 음악 한 곡은 1MB가 넘는다.
   *
   * Only the track that is about to be needed is fetched, plus the one for the
   * stage after it. Fetching every track up front would mean a player who
   * quits during stage 1 still pays for the stage 5 music, and that download
   * would compete with the stage 1 background the player is actually waiting
   * on. The one-stage lead is 2~3 minutes of play against roughly a second of
   * transfer, which is what keeps the handover silent-gap free.
   *
   * Decoding goes through the sound manager instead of a Scene loader because
   * no Scene outlives the boot to title to game handover; a loader started in
   * one is torn down with it.
   */
  private requestAudio(key: AudioAssetKey | undefined) {
    const manager = this.game.sound;

    // BootScene이 타이틀 곡을 미리 불러오므로 타이틀 표시 즉시 재생할 수 있다.
    // 같은 파일을 다시 가져와 디코딩하지 않는다.
    if (
      !key ||
      this.isLoaded(key) ||
      this.requested.has(key) ||
      !canDecode(manager)
    ) {
      return;
    }

    const url = this.urlFor(key);

    if (!url) {
      return;
    }

    this.requested.add(key);

    // A track that fails to arrive leaves its cue silent, which is the same
    // outcome as a cue whose file was never produced.
    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => manager.decodeAudio(key, data))
      .catch(() => undefined);
  }

  private readonly handleDecoded = (key: string) => {
    if (key === this.wantedMusic) {
      this.startMusic();
    }
  };

  /** 화면 복귀 때 레이저 효과음의 큰 구간이 갑자기 재개되지 않게 끊는다. */
  private readonly handleGameBlur = () => {
    for (const key of Object.values(STAGE_ONE_BOSS_LASER_SFX_BY_CUE)) {
      this.game.sound.stopByKey(key);
    }
  };

  private readonly handleSceneChanged = (scene: GameSceneKey) => {
    if (scene !== 'title') {
      return;
    }

    this.stopAllSustained();
    this.currentStageId = undefined;
    this.requestAudio('bgm-title');
    // The title is where the player reads and presses ENTER, which is the only
    // free moment stage one's track ever gets.
    this.requestAudio(STAGES[0]?.music);
    this.requestStageSfx(STAGES[0]?.id);
    this.playMusic('bgm-title');
  };

  private readonly handleStageChanged = (stageId: string) => {
    this.stopAllSustained();
    const index = STAGES.findIndex((candidate) => candidate.id === stageId);

    if (index < 0) {
      return;
    }

    this.currentStageId = stageId;

    this.requestAudio(STAGES[index].music);
    this.requestAudio(STAGES[index + 1]?.music);
    this.requestStageSfx(stageId);
    this.requestStageSfx(STAGES[index + 1]?.id);
    this.playMusic(STAGES[index].music);
  };

  /**
   * Death silences every sustained bed. The bosses that own them stop emitting
   * the moment their update loop stops running, so nothing else is left that
   * could ask for the loop to end — and an unended loop plays over the death
   * prompt until the player restarts.
   */
  private readonly handlePhaseChanged = (phase: GamePhase) => {
    if (phase === 'dead') {
      this.stopAllSustained();
      this.playSfx('sfx-player-death');
    }
  };

  /** Beds are suspended rather than dropped, so unpausing resumes mid-fight. */
  private readonly handlePauseChanged = (paused: boolean) => {
    for (const cue of this.sustained.values()) {
      if (paused) {
        cue.start?.pause();
        cue.loop?.pause();
      } else {
        cue.start?.resume();
        cue.loop?.resume();
      }
    }
  };

  private readonly handleRoomStateChanged = (state: RoomState) => {
    if (state === 'locked') {
      this.playSfx('sfx-room-locked');
      return;
    }

    if (state === 'cleared') {
      this.playSfx('sfx-room-cleared');
    }
  };

  private readonly handleAudioMixChanged = (mix: AudioMix) => {
    this.setMix(mix);
  };

  setMix(mix: AudioMix) {
    this.mix.master = clampAudioMixValue(mix.master);
    this.mix.music = clampAudioMixValue(mix.music);
    this.mix.sfx = clampAudioMixValue(mix.sfx);

    if (this.music && this.wantedMusic) {
      this.music.setVolume(this.musicVolume(this.wantedMusic));
    }

    for (const [id, cue] of this.sustained) {
      cue.start?.setVolume(this.sfxVolume(SUSTAINED_SFX[id].start));
      cue.loop?.setVolume(this.sfxVolume(SUSTAINED_SFX[id].loop));
    }
  }

  private readonly handleWeaponFired = (weaponId: string) => {
    const key = WEAPON_FIRE_SFX[weaponId];

    if (key) {
      this.playSfx(key);
    }
  };

  private readonly handlePlayerDamaged = () => {
    this.playSfx('sfx-player-hit');
  };

  private readonly handlePlayerDashed = () => {
    this.playSfx('sfx-player-dash');
  };

  /** 발소리가 없는 스테이지(비행 구간)는 조회 결과가 비어 그대로 지나간다. */
  private readonly handlePlayerStepped = () => {
    const footsteps = this.currentStageId
      ? FOOTSTEP_SFX_BY_STAGE[this.currentStageId as FootstepStageId]
      : undefined;

    if (!footsteps) {
      return;
    }

    this.playSfx(this.pickRandom(footsteps));
  };

  private readonly handleEnemyDamaged = () => {
    this.playSfx('sfx-enemy-hit');
  };

  private readonly handleProjectileBlocked = (
    kind: keyof typeof PROJECTILE_BLOCK_SFX_BY_KIND,
  ) => {
    this.playSfx(this.pickRandom(PROJECTILE_BLOCK_SFX_BY_KIND[kind]), kind);
  };

  private readonly handleEnemyDefeated = () => {
    this.playSfx('sfx-enemy-down');
  };

  private readonly handleBossLaserFired = (
    cue: keyof typeof STAGE_ONE_BOSS_LASER_SFX_BY_CUE,
  ) => {
    this.playSfx(STAGE_ONE_BOSS_LASER_SFX_BY_CUE[cue]);
  };

  private readonly handleBossOrbFired = () => {
    this.playSfx(this.pickRandom(STAGE_TWO_BOSS_ORB_SHOT_SFX));
  };

  private readonly handleBossScanCue = (
    cue: 'start' | 'target-lock' | 'end',
  ) => {
    if (cue === 'start') {
      this.startSustained('stage2-boss-scan');
      return;
    }

    if (cue === 'target-lock') {
      this.playSfx(STAGE_TWO_BOSS_SCAN_SFX_BY_CUE['target-lock']);
      return;
    }

    this.stopSustained('stage2-boss-scan');
    this.playSfx(STAGE_TWO_BOSS_SCAN_SFX_BY_CUE.end);
  };

  private readonly handlePurifierCue = (cue: StageThreeBossCue) => {
    if (cue === 'vacuum-start') {
      this.startSustained('stage3-boss-vacuum');
      return;
    }

    if (cue === 'vacuum-end') {
      this.stopSustained('stage3-boss-vacuum');
      this.playSfx(STAGE_THREE_BOSS_SFX_BY_CUE['vacuum-end']);
      return;
    }

    this.playSfx(STAGE_THREE_BOSS_SFX_BY_CUE[cue]);
  };

  private readonly handleInfernalCue = (cue: StageFourBossCue) => {
    this.playSfx(STAGE_FOUR_BOSS_SFX_BY_CUE[cue]);
  };

  private readonly handleArchitectCue = (cue: StageFiveBossCue) => {
    this.playSfx(STAGE_FIVE_BOSS_SFX_BY_CUE[cue]);
  };

  /** 엔딩 포위 장면은 음악 없이 3스테이지 발소리만 재사용함. */
  private readonly handleEndingAscensionCue = (
    cue: 'transition-start' | 'silence' | 'siege-footstep',
  ) => {
    if (cue === 'transition-start') {
      this.stopAllSustained();
      this.stopMusic();
      this.playSfx('sfx-stage5-ending-transition');
      return;
    }

    if (cue === 'silence') {
      this.stopAllSustained();
      this.stopMusic();
      this.requestStageSfx('stage-03');
      return;
    }

    this.playSfx(
      this.pickRandom(FOOTSTEP_SFX_BY_STAGE['stage-03']),
      'ending-siege-footstep',
      0.65,
    );
  };

  /** 시작음을 끝까지 재생한 뒤 반복음을 잇는다. */
  private startSustained(id: SustainedSfxId) {
    this.stopSustained(id);

    const cue: SustainedCue = { active: true };
    this.sustained.set(id, cue);

    const key = SUSTAINED_SFX[id].start;
    if (!this.isLoaded(key) || this.game.sound.locked) {
      return;
    }

    const sound = this.game.sound.add(key, {
      volume: this.sfxVolume(key),
    }) as VolumeControlledSound;
    cue.start = sound;
    sound.once(Phaser.Sound.Events.COMPLETE, () => {
      if (cue.start !== sound) {
        return;
      }

      cue.start = undefined;
      sound.destroy();
      this.startSustainedLoop(id, cue);
    });
    sound.play();
  }

  private startSustainedLoop(id: SustainedSfxId, cue: SustainedCue) {
    const key = SUSTAINED_SFX[id].loop;
    if (!cue.active || !this.isLoaded(key) || this.game.sound.locked) {
      return;
    }

    cue.loop = this.game.sound.add(key, {
      loop: true,
      volume: this.sfxVolume(key),
    }) as VolumeControlledSound;
    cue.loop.play();
  }

  private stopSustained(id: SustainedSfxId) {
    const cue = this.sustained.get(id);

    if (!cue) {
      return;
    }

    cue.active = false;
    this.sustained.delete(id);

    const { start, loop } = cue;
    cue.start = undefined;
    cue.loop = undefined;
    start?.stop();
    start?.destroy();
    loop?.stop();
    loop?.destroy();
  }

  /**
   * `stopSustained` deletes the entry it is given, which is safe to do while
   * iterating: a Map iterator only skips entries deleted *before* it reaches
   * them, and this one deletes the entry it has just been handed.
   */
  private stopAllSustained() {
    for (const id of this.sustained.keys()) {
      this.stopSustained(id);
    }
  }

  /**
   * 큐를 울리고, 실제로 울렸을 때만 그 큐가 달고 있는 레이어를 함께 울린다.
   * 레이어도 같은 경로를 지나므로 자기 볼륨과 스로틀을 그대로 따르지만,
   * 레이어가 또 레이어를 갖지는 못한다 — 한 겹으로 묶어 두면 설정이 자기를
   * 가리켜도 무한 재귀가 되지 않는다.
   */
  private playSfx(
    key: SfxKey,
    intervalKey: string = key,
    volumeMultiplier = 1,
  ) {
    if (!this.emitSfx(key, intervalKey, volumeMultiplier)) {
      return;
    }

    const layer = SFX_CONFIG[key].layer;

    if (layer && this.hearsLayer(layer)) {
      this.emitSfx(layer.key, layer.key, volumeMultiplier);
    }
  }

  /** 지금 스테이지가 이 레이어를 위해 적어 둔 스테이지인지. */
  private hearsLayer(layer: SfxLayerConfig) {
    return !layer.stages || layer.stages.includes(this.currentStageId ?? '');
  }

  /** 큐가 사운드 매니저까지 도달했는지 돌려준다. */
  private emitSfx(
    key: SfxKey,
    intervalKey: string = key,
    volumeMultiplier = 1,
  ) {
    const config = SFX_CONFIG[key];
    const now = Date.now();
    const playedAt = this.playedAt.get(intervalKey);

    if (
      config.minInterval !== undefined &&
      playedAt !== undefined &&
      now - playedAt < config.minInterval
    ) {
      return false;
    }

    // Cues are momentary, so anything triggered before the browser grants audio
    // is dropped rather than queued — a delayed gunshot reads as a bug.
    if (!this.isLoaded(key) || this.game.sound.locked) {
      return false;
    }

    this.playedAt.set(intervalKey, now);
    this.game.sound.play(key, {
      volume:
        config.volume *
        this.jitteredVolume(config.volumeJitter) *
        this.mix.sfx *
        this.mix.master *
        volumeMultiplier,
      rate: (config.rate ?? 1) * this.jitteredRate(config.rateJitter),
    });

    return true;
  }

  private playMusic(key: MusicKey) {
    if (this.wantedMusic === key) {
      return;
    }

    this.stopMusic();
    this.wantedMusic = key;
    this.startMusic();
  }

  /**
   * Runs when music is requested and again when a deferred track finishes
   * decoding, so a stage entered before its file arrived still gets scored.
   */
  private startMusic() {
    const key = this.wantedMusic;

    if (!key || this.music || !this.isLoaded(key)) {
      return;
    }

    this.music = this.game.sound.add(key, {
      loop: true,
      volume: this.musicVolume(key),
    }) as VolumeControlledSound;

    if (this.game.sound.locked) {
      this.game.sound.once(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked);
      return;
    }

    this.music.play();
  }

  /** 플레이어가 시작 안내를 누를 때까지 Web Audio는 잠긴 상태로 유지된다. */
  private readonly handleUnlocked = () => {
    this.music?.play();
  };

  private stopMusic() {
    this.game.sound.off(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked);
    this.music?.stop();
    this.music?.destroy();
    this.music = undefined;
    this.wantedMusic = undefined;
  }

  private isLoaded(key: AudioAssetKey) {
    return this.game.cache.audio.exists(key);
  }

  private musicVolume(key: MusicKey) {
    return MUSIC_CONFIG[key].volume * this.mix.music * this.mix.master;
  }

  private sfxVolume(key: SfxKey) {
    return SFX_CONFIG[key].volume * this.mix.sfx * this.mix.master;
  }

  private jitteredRate(rateJitter = 0) {
    return rateJitter === 0 ? 1 : 1 + (Math.random() * 2 - 1) * rateJitter;
  }

  /** 아래로만 흔든다. `volume`이 이 큐가 낼 수 있는 최대여야 믹스를 읽을 수 있다. */
  private jitteredVolume(volumeJitter = 0) {
    return volumeJitter === 0 ? 1 : 1 - Math.random() * volumeJitter;
  }

  /** 여러 변형 중 하나를 무작위로 골라 같은 효과음이 반복되지 않게 한다. */
  private pickRandom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)]!;
  }
}
