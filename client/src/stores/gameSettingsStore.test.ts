import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIO_MIX_CONFIG } from '@/game/config/audioConfig';
import { DEFAULT_GRAPHICS_SETTINGS } from '@/game/config/graphicsConfig';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';

describe('gameSettingsStore', () => {
  beforeEach(() => {
    useGameSettingsStore.setState({
      invincible: false,
      showEnemyRanges: false,
      audioMix: { ...AUDIO_MIX_CONFIG },
      graphics: { ...DEFAULT_GRAPHICS_SETTINGS },
      settingsOpen: false,
    });
  });

  it('toggles invincibility without resetting between scenes', () => {
    useGameSettingsStore.getState().toggleInvincible();
    expect(useGameSettingsStore.getState().invincible).toBe(true);

    useGameSettingsStore.getState().toggleInvincible();
    expect(useGameSettingsStore.getState().invincible).toBe(false);
  });

  it('keeps enemy ranges hidden until admin enables them', () => {
    expect(useGameSettingsStore.getState().showEnemyRanges).toBe(false);

    useGameSettingsStore.getState().toggleEnemyRanges();
    expect(useGameSettingsStore.getState().showEnemyRanges).toBe(true);

    useGameSettingsStore.getState().toggleEnemyRanges();
    expect(useGameSettingsStore.getState().showEnemyRanges).toBe(false);
  });

  it('keeps each audio channel in the supported range', () => {
    const settings = useGameSettingsStore.getState();
    settings.setAudioMix('music', 0.25);
    settings.setAudioMix('sfx', 2);
    settings.setAudioMix('master', -1);

    expect(useGameSettingsStore.getState().audioMix).toEqual({
      master: 0,
      music: 0.25,
      sfx: 1,
    });
  });

  it('changes the display resolution without affecting audio settings', () => {
    const settings = useGameSettingsStore.getState();
    settings.setDisplayResolution('960x540');

    expect(useGameSettingsStore.getState()).toMatchObject({
      graphics: { displayResolution: '960x540' },
      audioMix: AUDIO_MIX_CONFIG,
    });
  });
});
