import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AUDIO_MIX_CONFIG,
  clampAudioMixValue,
  type AudioMix,
} from '@/game/config/audioConfig';
import {
  DEFAULT_GRAPHICS_SETTINGS,
  type DisplayResolution,
  type GraphicsSettings,
} from '@/game/config/graphicsConfig';

type GameSettingsState = {
  invincible: boolean;
  showEnemyRanges: boolean;
  audioMix: AudioMix;
  graphics: GraphicsSettings;
  settingsOpen: boolean;
  setInvincible: (invincible: boolean) => void;
  toggleInvincible: () => void;
  toggleEnemyRanges: () => void;
  setAudioMix: (channel: keyof AudioMix, value: number) => void;
  resetAudioMix: () => void;
  setDisplayResolution: (resolution: DisplayResolution) => void;
  resetGraphics: () => void;
  openSettings: () => void;
  closeSettings: () => void;
};

export const useGameSettingsStore = create<GameSettingsState>()(
  persist(
    (set) => ({
      invincible: false,
      showEnemyRanges: false,
      audioMix: { ...AUDIO_MIX_CONFIG },
      graphics: { ...DEFAULT_GRAPHICS_SETTINGS },
      settingsOpen: false,
      setInvincible: (invincible) => set({ invincible }),
      toggleInvincible: () =>
        set((state) => ({ invincible: !state.invincible })),
      toggleEnemyRanges: () =>
        set((state) => ({ showEnemyRanges: !state.showEnemyRanges })),
      setAudioMix: (channel, value) =>
        set((state) => ({
          audioMix: {
            ...state.audioMix,
            [channel]: clampAudioMixValue(value),
          },
        })),
      resetAudioMix: () => set({ audioMix: { ...AUDIO_MIX_CONFIG } }),
      setDisplayResolution: (displayResolution) =>
        set({ graphics: { displayResolution } }),
      resetGraphics: () =>
        set({ graphics: { ...DEFAULT_GRAPHICS_SETTINGS } }),
      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
    }),
    {
      name: 'soot-settings',
      partialize: (state) => ({
        audioMix: state.audioMix,
        graphics: state.graphics,
      }),
    },
  ),
);
