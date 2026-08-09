// @vitest-environment jsdom
// Phaser touches `window` on import, so only this file pays for a DOM.
import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioAssetKey } from '@/game/config/audioConfig';
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
  volumeUpdates: number[];
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
  let unlockListener: (() => void) | undefined;
  const decodedListeners = new Set<(key: string) => void>();

  const game = {
    cache: {
      audio: { exists: (key: string) => loaded.has(key) },
    },
    sound: {
      locked: options.locked ?? false,
      play: (key: string, config: Phaser.Types.Sound.SoundConfig) => {
        played.push({ key, config });
        return true;
      },
      add: (key: string, config: Phaser.Types.Sound.SoundConfig) => {
        const music: AddedMusic = {
          key,
          config,
          playCount: 0,
          stopped: false,
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
          setVolume: (volume: number) => {
            music.volumeUpdates.push(volume);
            return true;
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
  };

  return {
    game: game as unknown as Phaser.Game,
    played,
    added,
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

  it('drops repeated hit cues that land inside the same throttle window', () => {
    const { game, played } = createFakeGame({ loaded: ['sfx-enemy-hit'] });
    director = new AudioDirector(game);

    for (let pellet = 0; pellet < 5; pellet += 1) {
      gameEvents.emit('enemy-damaged', 0, 0);
    }

    expect(played).toHaveLength(1);
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

  it('fetches only the stage in play and the one after it', async () => {
    const urls = captureFetches();
    const { game } = createFakeGame({ canDecode: true });
    director = new AudioDirector(game);

    gameEvents.emit('stage-changed', 'stage-01');
    await Promise.resolve();

    // Fetching the whole soundtrack up front would make a player who quits in
    // stage 1 pay for the stage 5 music, and that transfer would compete with
    // the stage 1 background they are actually waiting on.
    //
    // Only cues with a file produce a request, so this counts at most two and
    // grows into a real assertion as the remaining tracks land.
    const reachable = [STAGES[0].music, STAGES[1]?.music]
      .filter((key) => key !== undefined)
      .map((key) => key.replace('bgm-', ''));

    expect(urls.length).toBeLessThanOrEqual(2);
    expect(
      urls.every((url) => reachable.some((name) => url.includes(name))),
    ).toBe(true);
    expect(urls.some((url) => url.includes('city'))).toBe(true);
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
