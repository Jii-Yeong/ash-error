import { describe, expect, it } from 'vitest';
import { matchAudioAssets } from '@/game/config/audioAssets';
import {
  DEFERRED_SFX_KEYS,
  MUSIC_CONFIG,
  SFX_CONFIG,
} from '@/game/config/audioConfig';

const AUDIO_ROOT = '../../assets/audio';

function fileMap(...names: string[]) {
  return Object.fromEntries(
    names.map((name) => [`${AUDIO_ROOT}/${name}`, `/dist/${name}`]),
  );
}

describe('matchAudioAssets', () => {
  it('matches a cue regardless of extension, case or suffix', () => {
    const { assets } = matchAudioAssets(
      fileMap('sfx/SMG Fire_01.wav', 'music/city.mp3'),
    );

    expect(assets).toEqual([
      { key: 'bgm-city', url: '/dist/music/city.mp3' },
      { key: 'sfx-smg-fire', url: '/dist/sfx/SMG Fire_01.wav' },
    ]);
  });

  it('prefers the closest name when several files qualify', () => {
    const { assets } = matchAudioAssets(
      fileMap('sfx/enemy-hit-heavy-variant.ogg', 'sfx/enemy-hit.ogg'),
    );

    expect(assets).toContainEqual({
      key: 'sfx-enemy-hit',
      url: '/dist/sfx/enemy-hit.ogg',
    });
  });

  it('keeps music and sfx cues inside their own folder', () => {
    const { assets, missingKeys } = matchAudioAssets(fileMap('sfx/city.ogg'));

    expect(assets).toEqual([]);
    expect(missingKeys).toContain('bgm-city');
  });

  it('reports every cue as missing when no file exists', () => {
    const { assets, missingKeys, unusedFiles } = matchAudioAssets({});

    expect(assets).toEqual([]);
    // Counted off the config rather than written down, so adding a cue does not
    // fail a test that has nothing to do with it.
    expect(missingKeys).toHaveLength(
      Object.keys(MUSIC_CONFIG).length + Object.keys(SFX_CONFIG).length,
    );
    expect(unusedFiles).toEqual([]);
  });

  it('ignores folders that hold no cue, such as rejected takes', () => {
    const { assets, unusedFiles } = matchAudioAssets(
      fileMap('candidates/city_other-take.mp3', 'music/city.ogg'),
    );

    expect(assets).toEqual([{ key: 'bgm-city', url: '/dist/music/city.ogg' }]);
    expect(unusedFiles).toEqual([]);
  });

  /**
   * Cues are matched by name prefix, so a cue whose name is a prefix of another
   * cue's name can answer itself with the *other* cue's file the moment its own
   * is missing or renamed — silently, with the wrong sound. Keeping the names
   * mutually non-prefixing is what makes that impossible, and it is only ever
   * violated when a new cue is added, which is exactly when this runs.
   */
  it('keeps no cue name a prefix of another', () => {
    const stems = Object.keys(SFX_CONFIG).map((key) =>
      key.replace(/^sfx-/, '').replace(/[^a-z0-9]/g, ''),
    );
    const collisions = stems.filter((stem) =>
      stems.some((other) => other !== stem && other.startsWith(stem)),
    );

    expect(collisions).toEqual([]);
  });

  /**
   * 부팅 배치는 `DEFERRED_SFX_KEYS`에 없는 것을 전부 즉시 받는다. 새 스테이지
   * 큐를 추가하면서 이 집합에 넣는 것을 잊으면 조용히 부팅 페이로드로 들어가
   * 타이틀 화면을 늦춘다 — 아무것도 깨지지 않으니 알아챌 방법도 없다.
   *
   * 기준은 이름이다. `sfx-stage<N>-`로 시작하면 그 스테이지에 도달해야 필요한
   * 큐이고, 아니면 어디서나 나는 공용 큐다.
   */
  it('defers every stage-scoped cue and nothing else', () => {
    const stageScoped = Object.keys(SFX_CONFIG).filter((key) =>
      /^sfx-stage\d/.test(key),
    );
    const deferred = [...DEFERRED_SFX_KEYS].sort();

    expect(stageScoped.length).toBeGreaterThan(0);
    expect(deferred).toEqual(stageScoped.sort());
  });

  it('flags files that answer no cue so the name can be fixed', () => {
    const { unusedFiles } = matchAudioAssets(
      fileMap('sfx/gunshot.wav', 'sfx/player-dash.ogg'),
    );

    expect(unusedFiles).toEqual(['sfx/gunshot.wav']);
  });
});
