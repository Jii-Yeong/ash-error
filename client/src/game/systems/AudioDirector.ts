import Phaser from 'phaser';
import { resolveAudioAssets } from '@/game/config/audioAssets';
import {
  AUDIO_MIX_CONFIG,
  clampAudioMixValue,
  MUSIC_CONFIG,
  SFX_CONFIG,
  WEAPON_FIRE_SFX,
  type AudioAssetKey,
  type AudioMix,
  type MusicKey,
  type SfxKey,
  type SfxLayerConfig,
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
 * Owns every sound in the game. It is bound to the Phaser.Game rather than a
 * Scene so music survives scene.restart() and the title-to-game handover, and
 * it only listens to gameEvents so no gameplay system has to know audio exists.
 *
 * Cues whose asset has not been produced yet are skipped silently: sound design
 * can land one file at a time without touching gameplay code.
 */
export class AudioDirector {
  private readonly mix: AudioMix = { ...AUDIO_MIX_CONFIG };
  private readonly playedAt = new Map<SfxKey, number>();
  private music?: VolumeControlledSound;
  /** What should be playing, whether or not its file has arrived yet. */
  private wantedMusic?: MusicKey;
  /** Tracks already fetched, so a revisited stage does not download twice. */
  private readonly requested = new Set<MusicKey>();
  /** 지금 진행 중인 스테이지. 일부 스테이지에서만 울리는 큐를 가르는 데 쓴다. */
  private stageId?: string;

  constructor(private readonly game: Phaser.Game) {
    this.game.sound.on(Phaser.Sound.Events.DECODED, this.handleDecoded);

    gameEvents.on('scene-changed', this.handleSceneChanged);
    gameEvents.on('stage-changed', this.handleStageChanged);
    gameEvents.on('phase-changed', this.handlePhaseChanged);
    gameEvents.on('room-state-changed', this.handleRoomStateChanged);
    gameEvents.on('audio-mix-changed', this.handleAudioMixChanged);
    gameEvents.on('weapon-fired', this.handleWeaponFired);
    gameEvents.on('player-damaged', this.handlePlayerDamaged);
    gameEvents.on('player-dashed', this.handlePlayerDashed);
    gameEvents.on('enemy-damaged', this.handleEnemyDamaged);
    gameEvents.on('enemy-defeated', this.handleEnemyDefeated);
  }

  destroy() {
    gameEvents.off('scene-changed', this.handleSceneChanged);
    gameEvents.off('stage-changed', this.handleStageChanged);
    gameEvents.off('phase-changed', this.handlePhaseChanged);
    gameEvents.off('room-state-changed', this.handleRoomStateChanged);
    gameEvents.off('audio-mix-changed', this.handleAudioMixChanged);
    gameEvents.off('weapon-fired', this.handleWeaponFired);
    gameEvents.off('player-damaged', this.handlePlayerDamaged);
    gameEvents.off('player-dashed', this.handlePlayerDashed);
    gameEvents.off('enemy-damaged', this.handleEnemyDamaged);
    gameEvents.off('enemy-defeated', this.handleEnemyDefeated);
    this.game.sound.off(Phaser.Sound.Events.DECODED, this.handleDecoded);
    this.stopMusic();
    this.playedAt.clear();
  }

  /** Built once; the glob behind it is resolved at build time. */
  private musicUrls?: Map<string, string>;

  private urlFor(key: MusicKey) {
    if (!this.musicUrls) {
      this.musicUrls = new Map(
        resolveAudioAssets()
          .assets.filter((asset) => asset.key in MUSIC_CONFIG)
          .map((asset) => [asset.key, asset.url]),
      );
    }

    return this.musicUrls.get(key);
  }

  /**
   * 스테이지 음악은 부팅 중이 아니라 이후에 가져온다. 타이틀 곡은 예외로,
   * BootScene에서 미리 불러와 플레이어가 브라우저 시작 안내를 통과하는 즉시
   * 재생을 시도할 수 있게 한다. 효과음 전체는 113KB지만 음악 한 곡은 1MB가 넘는다.
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
  private requestMusic(key: MusicKey | undefined) {
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

  private readonly handleSceneChanged = (scene: GameSceneKey) => {
    if (scene !== 'title') {
      return;
    }

    // 타이틀로 돌아가면 진행 중이던 스테이지가 끝난 것이므로, 스테이지가
    // 걸린 레이어가 다음 판까지 살아남으면 안 된다.
    this.stageId = undefined;
    this.requestMusic('bgm-title');
    // The title is where the player reads and presses ENTER, which is the only
    // free moment stage one's track ever gets.
    this.requestMusic(STAGES[0]?.music);
    this.playMusic('bgm-title');
  };

  private readonly handleStageChanged = (stageId: string) => {
    const index = STAGES.findIndex((candidate) => candidate.id === stageId);

    if (index < 0) {
      return;
    }

    this.stageId = stageId;
    this.requestMusic(STAGES[index].music);
    this.requestMusic(STAGES[index + 1]?.music);
    this.playMusic(STAGES[index].music);
  };

  private readonly handlePhaseChanged = (phase: GamePhase) => {
    if (phase === 'dead') {
      this.playSfx('sfx-player-death');
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

  private readonly handleEnemyDamaged = () => {
    this.playSfx('sfx-enemy-hit');
  };

  private readonly handleEnemyDefeated = () => {
    this.playSfx('sfx-enemy-down');
  };

  /**
   * 큐를 울리고, 실제로 울렸을 때만 그 큐가 달고 있는 레이어를 함께 울린다.
   * 레이어도 같은 경로를 지나므로 자기 볼륨과 스로틀을 그대로 따르지만,
   * 레이어가 또 레이어를 갖지는 못한다 — 한 겹으로 묶어 두면 설정이 자기를
   * 가리켜도 무한 재귀가 되지 않는다.
   */
  private playSfx(key: SfxKey) {
    if (!this.emitSfx(key)) {
      return;
    }

    const layer = SFX_CONFIG[key].layer;

    if (layer && this.hearsLayer(layer)) {
      this.emitSfx(layer.key);
    }
  }

  /** 지금 스테이지가 이 레이어를 위해 적어 둔 스테이지인지. */
  private hearsLayer(layer: SfxLayerConfig) {
    return !layer.stages || layer.stages.includes(this.stageId ?? '');
  }

  /** 큐가 사운드 매니저까지 도달했는지 돌려준다. */
  private emitSfx(key: SfxKey) {
    const config = SFX_CONFIG[key];
    const now = Date.now();
    const playedAt = this.playedAt.get(key);

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

    this.playedAt.set(key, now);
    this.game.sound.play(key, {
      volume: config.volume * this.mix.sfx * this.mix.master,
      rate: this.jitteredRate(config.rateJitter),
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

  private jitteredRate(rateJitter = 0) {
    return rateJitter === 0 ? 1 : 1 + (Math.random() * 2 - 1) * rateJitter;
  }
}
