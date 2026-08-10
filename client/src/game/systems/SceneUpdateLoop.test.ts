import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { SceneUpdateLoop } from '@/game/systems/SceneUpdateLoop';

function fakeScene() {
  const on = vi.fn();
  const off = vi.fn();
  return {
    on,
    off,
    scene: { events: { on, off } } as unknown as Phaser.Scene,
  };
}

describe('SceneUpdateLoop', () => {
  it('subscribes once and forwards the tick to the callback', () => {
    const { scene, on } = fakeScene();
    const onUpdate = vi.fn();
    const loop = new SceneUpdateLoop(scene, onUpdate);

    loop.start();
    loop.start(); // idempotent: no second subscription

    expect(loop.isRunning).toBe(true);
    expect(on).toHaveBeenCalledTimes(1);
    const [event, tick] = on.mock.calls[0]!;
    expect(event).toBe('update');
    (tick as (time: number) => void)(1_200);
    expect(onUpdate).toHaveBeenCalledWith(1_200);
  });

  it('unsubscribes with the same listener it subscribed', () => {
    const { scene, on, off } = fakeScene();
    const loop = new SceneUpdateLoop(scene, vi.fn());

    loop.start();
    loop.stop();
    loop.stop(); // idempotent: no second removal

    expect(loop.isRunning).toBe(false);
    expect(off).toHaveBeenCalledTimes(1);
    expect(off.mock.calls[0]![1]).toBe(on.mock.calls[0]![1]);
  });

  it('does nothing when stopped before starting', () => {
    const { scene, off } = fakeScene();
    const loop = new SceneUpdateLoop(scene, vi.fn());

    loop.stop();

    expect(loop.isRunning).toBe(false);
    expect(off).not.toHaveBeenCalled();
  });
});
