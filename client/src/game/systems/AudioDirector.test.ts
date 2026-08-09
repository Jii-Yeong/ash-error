// @vitest-environment jsdom
// Phaser touches `window` on import, so only this file pays for a DOM.
import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_MIX_CONFIG,
  DEFERRED_SFX_BY_STAGE,
  FOOTSTEP_SFX_BY_STAGE,
  PROJECTILE_BLOCK_SFX_BY_KIND,
  STAGE_FIVE_BOSS_SFX_BY_CUE,
  STAGE_FOUR_BOSS_SFX_BY_CUE,
  STAGE_ONE_BOSS_LASER_SFX_BY_CUE,
  STAGE_THREE_BOSS_SFX_BY_CUE,
  STAGE_TWO_BOSS_ORB_SHOT_SFX,
  STAGE_TWO_BOSS_SCAN_SFX_BY_CUE,
  type AudioAssetKey,
  type StageFiveBossCue,
  type StageFourBossCue,
} from '@/game/config/audioConfig';
import { STAGES } from '@/game/config/stageConfig';
import { gameEvents } from '@/game/events/gameEvents';
import { AudioDirector } from '@/game/systems/AudioDirector';

vi.hoisted(() => {
  // jsdom ships no canvas backend, and Phaser probes a 2D context while it is
  // being imported. Only the few calls made by that probe need to answer.
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

type PlayedSfx = {
  key: string;
  config: Phaser.Types.Sound.SoundConfig;
};

type AddedMusic = {
  key: string;
  config: Phaser.Types.Sound.SoundConfig;
  playCount: number;
  stopped: boolean;
  paused: boolean;
  volumeUpdates: number[];
  complete?: () => void;
};

function createFakeGame(
  options: {
    loaded?: AudioAssetKey[];
    locked?: boolean;
    canDecode?: boolean;
  } = {},
) {
  const loaded = new Set<string>(options.loaded ?? []);
  const played: PlayedSfx[] = [];
  const added: AddedMusic[] = [];
  const stopped: string[] = [];
  const active = new Set<string>();
  let unlockListener: (() => void) | undefined;
  const decodedListeners = new Set<(key: string) => void>();
  const gameListeners = new Map<string, Set<() => void>>();

  const game = {
    cache: {
      audio: { exists: (key: string) => loaded.has(key) },
    },
    sound: {
      locked: options.locked ?? false,
      play: (key: string, config: Phaser.Types.Sound.SoundConfig) => {
        played.push({ key, config });
        active.add(key);
        return true;
      },
      stopByKey: (key: string) => {
        if (!active.delete(key)) {
          return 0;
        }

        stopped.push(key);
        return 1;
      },
      add: (key: string, config: Phaser.Types.Sound.SoundConfig) => {
        const music: AddedMusic = {
          key,
          config,
          playCount: 0,
          stopped: false,
          paused: false,
          volumeUpdates: [],
        };
        added.push(music);

        const sound = {
          play: () => {
            music.playCount += 1;
            return true;
          },
          stop: () => {
            music.stopped = true;
            return true;
          },
          pause: () => {
            music.paused = true;
            return true;
          },
          resume: () => {
            music.paused = false;
            return true;
          },
          setVolume: (volume: number) => {
            music.volumeUpdates.push(volume);
            return true;
          },
          once: (_event: string, listener: () => void) => {
            music.complete = listener;
            return sound;
          },
          destroy: () => {},
        };

        return sound;
      },
      once: (_event: string, listener: () => void) => {
        unlockListener = listener;
      },
      // Present only when the test asks for it, so the default fake still
      // exercises the path where a manager cannot take deferred music.
      ...(options.canDecode
        ? {
            decodeAudio: (key: string) => {
              loaded.add(key);
              for (const listener of decodedListeners) listener(key);
            },
          }
        : {}),
      on: (_event: string, listener: (key: string) => void) => {
        decodedListeners.add(listener);
      },
      off: (_event: string, listener: (key: string) => void) => {
        if (unlockListener === listener) {
          unlockListener = undefined;
        }

        decodedListeners.delete(listener);
      },
    },
    events: {
      on: (event: string, listener: () => void) => {
        const listeners = gameListeners.get(event) ?? new Set();
        listeners.add(listener);
        gameListeners.set(event, listeners);
      },
      off: (event: string, listener: () => void) => {
        gameListeners.get(event)?.delete(listener);
      },
    },
  };

  return {
    game: game as unknown as Phaser.Game,
    played,
    added,
    stopped,
    blur: () => {
      for (const listener of gameListeners.get('blur') ?? []) {
        listener();
      }
    },
    unlock: () => unlockListener?.(),
    /** Mimics a background track arriving after the game already asked for it. */
    finishDecoding: (key: string) => {
      loaded.add(key);
      for (const listener of decodedListeners) {
        listener(key);
      }
    },
  };
}

describe('AudioDirector', () => {
  let director: AudioDirector | undefined;

  afterEach(() => {
    director?.destroy();
    director = undefined;
    vi.unstubAllGlobals();
  });

  /**
   * 큐 이름은 하이픈, 파일명은 팩마다 하이픈이거나 언더스코어다. 에셋 매처가
   * 쓰는 것과 같은 정규화를 거쳐야 URL과 큐를 맞댈 수 있다.
   */
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, '');

  /** Records which tracks the director actually goes to the network for. */
  function captureFetches() {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    });

    return urls;
  }

  it('stays silent for cues whose asset has not been produced yet', () => {
    const { game, played } = createFakeGame();
    director = new AudioDirector(game);

    gameEvents.emit('weapon-fired', 'smg', 0, 0);
    gameEvents.emit('player-damaged', 0, 0);
    gameEvents.emit('enemy-defeated', 0, 0);

    expect(played).toEqual([]);
  });

  it('plays the sfx mapped to the weapon that fired', () => {
    const { game, played } = createFakeGame({ loaded: ['sfx-smg-fire'] });
    director = new AudioDirector(game);

    gameEvents.emit('weapon-fired', 'smg', 0, 0);
    gameEvents.emit('weapon-fired', 'unmapped-weapon', 0, 0);

    expect(played).toHaveLength(1);
    expect(played[0].key).toBe('sfx-smg-fire');
    expect(played[0].config.volume).toBeGreaterThan(0);
  });

  it('updates active music and future effects when the mix changes', () => {
    const { game, added, played } = createFakeGame({
      loaded: ['bgm-title', 'sfx-smg-fire'],
    });
    director = new AudioDirector(game);

    gameEvents.emit('scene-changed', 'title');
    gameEvents.emit('audio-mix-changed', {
      master: 0.5,
      music: 0.25,
      sfx: 0.4,
    });
    gameEvents.emit('weapon-fired', 'smg', 0, 0);

    expect(added[0].volumeUpdates).toEqual([0.7 * 0.5 * 0.25]);
    expect(played[0].config.volume).toBe(0.35 * 0.5 * 0.4);
  });

  it('plays one burst-rifle cue for every volley event', () => {
    const { game, played } = createFakeGame({
      loaded: ['sfx-burst-rifle-fire'],
    });
    director = new AudioDirector(game);

    for (let round = 0; round < 3; round += 1) {
      gameEvents.emit('weapon-fired', 'burst-rifle', 0, 0);
    }

    expect(played).toHaveLength(3);
    expect(played.every((cue) => cue.key === 'sfx-burst-rifle-fire')).toBe(
      true,
    );
  });

  it('randomises footsteps inside each ground stage sound set', () => {
    const loaded = Object.values(FOOTSTEP_SFX_BY_STAGE).flat();
    const { game, played } = createFakeGame({ loaded });
    director = new AudioDirector(game);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    for (const stageId of [
      'stage-01',
      'stage-02',
      'stage-03',
      'stage-04',
    ]) {
      gameEvents.emit('stage-changed', stageId);
      gameEvents.emit('player-stepped');
    }
    gameEvents.emit('stage-changed', 'stage-05');
    gameEvents.emit('player-stepped');

    expect(played.map(({ key }) => key)).toEqual([
      'sfx-stage1-footstep-04',
      'sfx-stage2-footstep-04',
      'sfx-stage3-footstep-04',
      'sfx-stage4-footstep-04',
    ]);
    expect(
      played.every(
        ({ config }) =>
          config.volume! >=
            0.9 * AUDIO_MIX_CONFIG.sfx * AUDIO_MIX_CONFIG.master &&
          config.volume! <= AUDIO_MIX_CONFIG.sfx * AUDIO_MIX_CONFIG.master &&
          config.rate! >= 0.97 &&
          config.rate! <= 1.03,
      ),
    ).toBe(true);
  });

  it('drops repeated hit cues that land inside the same throttle window', () => {
    const { game, played } = createFakeGame({ loaded: ['sfx-enemy-hit'] });
    director = new AudioDirector(game);

    for (let pellet = 0; pellet < 5; pellet += 1) {
      gameEvents.emit('enemy-damaged', 0, 0);
    }

    expect(played).toHaveLength(1);
  });

  it('picks a different variant for shield and boss blocks', () => {
    const loaded = [
      'sfx-enemy-hit',
      ...Object.values(PROJECTILE_BLOCK_SFX_BY_KIND).flat(),
    ] as AudioAssetKey[];
    const { game, played } = createFakeGame({ loaded });
    director = new AudioDirector(game);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    gameEvents.emit('enemy-damaged', 0, 0);
    gameEvents.emit('enemy-projectile-blocked', 'shield');
    gameEvents.emit('enemy-projectile-blocked', 'boss');

    expect(played.map(({ key }) => key)).toEqual([
      'sfx-enemy-hit',
      'sfx-shield-block-03',
      'sfx-boss-invulnerable-03',
    ]);
  });

  /**
   * 방어음은 게임에서 음정이 가장 뚜렷한 큐이고 방패 적에게 쏘는 탄마다 난다.
   * 피치를 올려 두면 링이 더 또렷해져 연타가 음계처럼 들리므로, 기준 재생률은
   * 피격음과 같은 자리에 있어야 하고 흔들림은 넓어야 한다.
   */
  it('keeps block cues off a fixed pitch above the hit cue', () => {
    const loaded = [
      'sfx-enemy-hit',
      ...Object.values(PROJECTILE_BLOCK_SFX_BY_KIND).flat(),
    ] as AudioAssetKey[];
    const { game, played } = createFakeGame({ loaded });
    director = new AudioDirector(game);

    // 지터 중앙값. 남는 것은 각 큐의 기준 재생률뿐이다.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    gameEvents.emit('enemy-damaged', 0, 0);
    gameEvents.emit('enemy-projectile-blocked', 'shield');

    expect(played[1].config.rate).toBe(played[0].config.rate);

    // 지터 상단. 좁은 폭(0.02)이면 반복이 거의 같은 높이로 쌓인다.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    gameEvents.emit('enemy-projectile-blocked', 'boss');

    expect(played[2].config.rate).toBeGreaterThan(1.05);
  });

  it('plays the matching stage one boss laser cue for each shot', () => {
    const { game, played } = createFakeGame({
      loaded: Object.values(STAGE_ONE_BOSS_LASER_SFX_BY_CUE),
    });
    director = new AudioDirector(game);

    gameEvents.emit('boss-laser-fired', 'single');
    gameEvents.emit('boss-laser-fired', 'double-first');
    gameEvents.emit('boss-laser-fired', 'double-second');

    expect(played.map(({ key }) => key)).toEqual([
      'sfx-stage1-boss-laser-single',
      'sfx-stage1-boss-laser-double-first',
      'sfx-stage1-boss-laser-double-second',
    ]);
  });

  it('stops a stage one laser cue when the game loses focus', () => {
    const { game, blur, stopped } = createFakeGame({
      loaded: Object.values(STAGE_ONE_BOSS_LASER_SFX_BY_CUE),
    });
    director = new AudioDirector(game);

    gameEvents.emit('boss-laser-fired', 'single');
    blur();

    expect(stopped).toEqual(['sfx-stage1-boss-laser-single']);
  });

  it('joins the stage two boss scan intro, loop, lock and end cues', () => {
    const { game, added, played } = createFakeGame({
      loaded: Object.values(STAGE_TWO_BOSS_SCAN_SFX_BY_CUE),
    });
    director = new AudioDirector(game);

    gameEvents.emit('boss-scan-cue', 'start');
    expect(added[0]).toMatchObject({
      key: 'sfx-stage2-boss-scan-start',
      playCount: 1,
    });

    added[0].complete?.();
    expect(added[1]).toMatchObject({
      key: 'sfx-stage2-boss-scan-loop',
      playCount: 1,
    });
    expect(added[1].config.loop).toBe(true);

    gameEvents.emit('boss-scan-cue', 'target-lock');
    gameEvents.emit('boss-scan-cue', 'end');

    expect(added[1].stopped).toBe(true);
    expect(played.map(({ key }) => key)).toEqual([
      'sfx-stage2-boss-target-lock',
      'sfx-stage2-boss-scan-end',
    ]);
  });

  it('joins the stage three boss intake intro, loop and end cues', () => {
    const { game, added, played } = createFakeGame({
      loaded: Object.values(STAGE_THREE_BOSS_SFX_BY_CUE),
    });
    director = new AudioDirector(game);

    gameEvents.emit('boss-purifier-cue', 'vacuum-start');
    expect(added[0]).toMatchObject({
      key: 'sfx-stage3-boss-vacuum-start',
      playCount: 1,
    });

    added[0].complete?.();
    expect(added[1]).toMatchObject({
      key: 'sfx-stage3-boss-vacuum-loop',
      playCount: 1,
    });
    expect(added[1].config.loop).toBe(true);

    gameEvents.emit('boss-purifier-cue', 'vacuum-end');

    expect(added[1].stopped).toBe(true);
    expect(played.map(({ key }) => key)).toEqual([
      'sfx-stage3-boss-vacuum-end',
    ]);
  });

  it('plays the stage three slam cues as one-shots', () => {
    const { game, played } = createFakeGame({
      loaded: Object.values(STAGE_THREE_BOSS_SFX_BY_CUE),
    });
    director = new AudioDirector(game);

    gameEvents.emit('boss-purifier-cue', 'slam-warn');
    gameEvents.emit('boss-purifier-cue', 'slam-leap');
    gameEvents.emit('boss-purifier-cue', 'slam-impact');
    gameEvents.emit('boss-purifier-cue', 'shockwave');

    expect(played.map(({ key }) => key)).toEqual([
      'sfx-stage3-boss-slam-warn',
      'sfx-stage3-boss-slam-leap',
      'sfx-stage3-boss-slam-impact',
      'sfx-stage3-boss-shockwave',
    ]);
  });

  /**
   * The boss that owns a loop stops emitting the moment its update stops being
   * called, which death is exactly. Without this the intake hum plays over the
   * death prompt until the player restarts.
   */
  it('silences a sustained boss bed when the player dies', () => {
    const { game, added } = createFakeGame({
      loaded: Object.values(STAGE_THREE_BOSS_SFX_BY_CUE),
    });
    director = new AudioDirector(game);

    gameEvents.emit('boss-purifier-cue', 'vacuum-start');
    added[0].complete?.();
    gameEvents.emit('phase-changed', 'dead');

    expect(added[1]).toMatchObject({
      key: 'sfx-stage3-boss-vacuum-loop',
      stopped: true,
    });
  });

  it('suspends and resumes sustained beds with the pause menu', () => {
    const { game, added } = createFakeGame({
      loaded: Object.values(STAGE_THREE_BOSS_SFX_BY_CUE),
    });
    director = new AudioDirector(game);

    gameEvents.emit('boss-purifier-cue', 'vacuum-start');
    added[0].complete?.();

    gameEvents.emit('pause-changed', true);
    expect(added[1].paused).toBe(true);

    gameEvents.emit('pause-changed', false);
    expect(added[1].paused).toBe(false);
    expect(added[1].stopped).toBe(false);
  });

  it('maps every stage four and five boss cue to its own sound', () => {
    const { game, played } = createFakeGame({
      loaded: [
        ...Object.values(STAGE_FOUR_BOSS_SFX_BY_CUE),
        ...Object.values(STAGE_FIVE_BOSS_SFX_BY_CUE),
      ],
    });
    director = new AudioDirector(game);

    for (const cue of Object.keys(
      STAGE_FOUR_BOSS_SFX_BY_CUE,
    ) as StageFourBossCue[]) {
      gameEvents.emit('boss-infernal-cue', cue);
    }
    for (const cue of Object.keys(
      STAGE_FIVE_BOSS_SFX_BY_CUE,
    ) as StageFiveBossCue[]) {
      gameEvents.emit('boss-architect-cue', cue);
    }

    expect(played.map(({ key }) => key)).toEqual([
      ...Object.values(STAGE_FOUR_BOSS_SFX_BY_CUE),
      ...Object.values(STAGE_FIVE_BOSS_SFX_BY_CUE),
    ]);
  });

  it('collapses the four shard impacts that land in the same frame', () => {
    const { game, played } = createFakeGame({
      loaded: ['sfx-stage4-boss-shard-impact'],
    });
    director = new AudioDirector(game);

    for (let lane = 0; lane < 4; lane += 1) {
      gameEvents.emit('boss-infernal-cue', 'shard-impact');
    }

    expect(played).toHaveLength(1);
  });

  it('randomises the stage two boss orb shot cue', () => {
    const { game, played } = createFakeGame({
      loaded: [...STAGE_TWO_BOSS_ORB_SHOT_SFX],
    });
    director = new AudioDirector(game);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    gameEvents.emit('boss-orb-fired');

    expect(played.map(({ key }) => key)).toEqual([
      'sfx-stage2-boss-orb-shot-04',
    ]);
  });

  it('loops stage music once and keeps it across repeated stage events', () => {
    const { game, added } = createFakeGame({ loaded: ['bgm-city'] });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    gameEvents.emit('stage-changed', 'stage-01');

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ key: 'bgm-city', playCount: 1 });
    expect(added[0].config.loop).toBe(true);
  });

  it('switches the ascension ending from music to its transition cues', () => {
    const { game, added, played } = createFakeGame({
      loaded: [
        'bgm-return',
        'sfx-stage5-ending-transition',
        ...FOOTSTEP_SFX_BY_STAGE['stage-03'],
      ],
    });
    director = new AudioDirector(game);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    gameEvents.emit('stage-changed', 'stage-05');
    gameEvents.emit('ending-ascension-cue', 'silence');
    expect(added[0]).toMatchObject({ key: 'bgm-return', stopped: true });
    expect(played).toEqual([]);

    gameEvents.emit('ending-ascension-cue', 'transition-start');
    gameEvents.emit('ending-ascension-cue', 'siege-footstep');

    expect(played.map(({ key }) => key)).toEqual([
      'sfx-stage5-ending-transition',
      'sfx-stage3-footstep-04',
    ]);
    expect(played[0].config.volume).toBe(
      0.3 * AUDIO_MIX_CONFIG.sfx * AUDIO_MIX_CONFIG.master,
    );
    expect(played[1].config.volume).toBeCloseTo(
      0.901 * 0.65 * AUDIO_MIX_CONFIG.sfx * AUDIO_MIX_CONFIG.master,
    );
  });

  it('starts a stage track that was still downloading when the stage began', () => {
    const { game, added, finishDecoding } = createFakeGame();
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    expect(added).toEqual([]);

    finishDecoding('bgm-city');

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ key: 'bgm-city', playCount: 1 });
  });

  it('ignores a track that finished downloading after the stage moved on', () => {
    const { game, added, finishDecoding } = createFakeGame();
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    gameEvents.emit('stage-changed', 'stage-02');
    finishDecoding('bgm-city');

    expect(added).toEqual([]);
  });

  it('defers music until the browser unlocks audio', () => {
    const { game, added, unlock } = createFakeGame({
      loaded: ['bgm-title'],
      locked: true,
    });
    director = new AudioDirector(game);

    gameEvents.emit('scene-changed', 'title');
    expect(added[0].playCount).toBe(0);

    unlock();
    expect(added[0].playCount).toBe(1);
  });

  it('plays the preloaded title track without downloading it again', () => {
    const urls = captureFetches();
    const { game, added } = createFakeGame({
      loaded: ['bgm-title'],
      canDecode: true,
    });
    director = new AudioDirector(game);

    gameEvents.emit('scene-changed', 'title');

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ key: 'bgm-title', playCount: 1 });
    expect(urls).not.toContainEqual(expect.stringContaining('title'));
  });

  /**
   * Fetching the whole soundtrack up front would make a player who quits in
   * stage 1 pay for the stage 5 audio, and that transfer would compete with the
   * stage 1 background they are actually waiting on. The same one-stage lead
   * covers music and the per-stage cue sets.
   */
  it('fetches only the stage in play and the one after it', async () => {
    const urls = captureFetches();
    const { game } = createFakeGame({ canDecode: true });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    await Promise.resolve();

    const reachable = [
      STAGES[0].music,
      STAGES[1]?.music,
      ...(DEFERRED_SFX_BY_STAGE[STAGES[0].id] ?? []),
      ...(DEFERRED_SFX_BY_STAGE[STAGES[1]?.id] ?? []),
    ]
      .filter((key) => key !== undefined)
      .map((key) => normalize(key.replace(/^(bgm|sfx)-/, '')));

    expect(urls.length).toBeGreaterThan(0);
    expect(
      urls.every((url) =>
        reachable.some((name) => normalize(url).includes(name)),
      ),
    ).toBe(true);
    expect(urls.some((url) => url.includes('city'))).toBe(true);
  });

  /** 도달하지 않을 스테이지의 큐는 한 건도 요청되지 않아야 한다. */
  it('never fetches a cue from two stages ahead', async () => {
    const urls = captureFetches();
    const { game } = createFakeGame({ canDecode: true });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    await Promise.resolve();

    const unreachable = STAGES.slice(2).flatMap(
      ({ id }) => DEFERRED_SFX_BY_STAGE[id] ?? [],
    );

    expect(unreachable.length).toBeGreaterThan(0);
    for (const key of unreachable) {
      const name = normalize(key.replace(/^sfx-/, ''));
      expect(urls.some((url) => normalize(url).includes(name))).toBe(false);
    }
  });

  it('survives the last stage having no stage after it', () => {
    captureFetches();
    const { game } = createFakeGame({ canDecode: true });
    director = new AudioDirector(game);

    expect(() =>
      gameEvents.emit('stage-changed', STAGES[STAGES.length - 1].id),
    ).not.toThrow();
  });

  it('does not refetch a track when a stage is revisited', async () => {
    const urls = captureFetches();
    const { game } = createFakeGame({ canDecode: true });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    gameEvents.emit('stage-changed', 'stage-02');
    gameEvents.emit('stage-changed', 'stage-01');
    await Promise.resolve();

    expect(new Set(urls).size).toBe(urls.length);
  });

  it('lays the monitor beep under a hit taken in the stages that foreshadow it', () => {
    const { game, played } = createFakeGame({
      loaded: ['sfx-player-hit', 'sfx-monitor-beep'],
    });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    gameEvents.emit('player-damaged', 0, 0);

    expect(played.map((entry) => entry.key)).toEqual([
      'sfx-player-hit',
      'sfx-monitor-beep',
    ]);
    // 복선은 타격음 아래에 있어야 복선으로 들린다.
    expect(played[1].config.volume).toBeLessThan(played[0].config.volume!);
  });

  it('drops the monitor beep once the stages it belongs to are past', () => {
    const { game, played } = createFakeGame({
      loaded: ['sfx-player-hit', 'sfx-monitor-beep'],
    });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-04');
    gameEvents.emit('player-damaged', 0, 0);

    expect(played.map((entry) => entry.key)).toEqual(['sfx-player-hit']);
  });

  it('keeps the monitor beep silent before any stage has begun', () => {
    const { game, played } = createFakeGame({
      loaded: ['sfx-player-hit', 'sfx-monitor-beep'],
    });
    director = new AudioDirector(game);

    gameEvents.emit('player-damaged', 0, 0);

    expect(played.map((entry) => entry.key)).toEqual(['sfx-player-hit']);
  });

  it('stops laying the beep after the title is returned to', () => {
    const { game, played } = createFakeGame({
      loaded: ['sfx-player-hit', 'sfx-monitor-beep', 'bgm-title'],
    });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    gameEvents.emit('scene-changed', 'title');
    gameEvents.emit('player-damaged', 0, 0);

    expect(played.map((entry) => entry.key)).toEqual(['sfx-player-hit']);
  });

  it('skips the layer while its file is missing but still plays the hit', () => {
    const { game, played } = createFakeGame({ loaded: ['sfx-player-hit'] });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    gameEvents.emit('player-damaged', 0, 0);

    expect(played.map((entry) => entry.key)).toEqual(['sfx-player-hit']);
  });

  it('stops responding to cues once destroyed', () => {
    const { game, played } = createFakeGame({ loaded: ['sfx-player-hit'] });
    director = new AudioDirector(game);
    director.destroy();
    director = undefined;

    gameEvents.emit('player-damaged', 0, 0);

    expect(played).toEqual([]);
  });
});
