// @vitest-environment jsdom

import Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AdminStageNavigator } from '@/game/systems/AdminStageNavigator';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('AdminStageNavigator', () => {
  it('ignores load errors from assets other than the requested background', () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const restart = vi.fn();
    const load = {
      image: vi.fn(),
      off: vi.fn((event: string) => listeners.delete(event)),
      on: vi.fn((event: string, listener: (...args: never[]) => void) =>
        listeners.set(event, listener),
      ),
      once: vi.fn((event: string, listener: (...args: never[]) => void) =>
        listeners.set(event, listener),
      ),
      start: vi.fn(),
    };
    const scene = {
      load,
      scene: { restart },
      textures: { exists: vi.fn(() => false) },
    } as unknown as Phaser.Scene;
    const navigator = new AdminStageNavigator(scene, vi.fn());

    navigator.requestStage(4);

    listeners.get('loaderror')?.({ key: 'unrelated' } as never);
    expect(restart).not.toHaveBeenCalled();
    listeners.get('filecomplete-image-stage-05-bg')?.();
    expect(restart).toHaveBeenCalledOnce();
    expect(load.off).toHaveBeenCalledWith(
      'loaderror',
      expect.any(Function),
    );
  });

  it('returns a boss-room request once', () => {
    const scene = {
      load: {},
      scene: { restart: vi.fn() },
      textures: { exists: vi.fn(() => true) },
    } as unknown as Phaser.Scene;
    const navigator = new AdminStageNavigator(scene, vi.fn());

    navigator.requestStageBoss(2);

    expect(navigator.consumeRequest()).toMatchObject({
      stageIndex: 2,
      immediateEncounter: true,
    });
    expect(navigator.consumeRequest()).toEqual({ immediateEncounter: false });
  });
});
