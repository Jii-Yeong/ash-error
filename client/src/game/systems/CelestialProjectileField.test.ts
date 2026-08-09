// @vitest-environment jsdom

import Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { CelestialProjectileField } from '@/game/systems/CelestialProjectileField';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('CelestialProjectileField', () => {
  it('continues updating active projectiles after detaching from an enemy', () => {
    const on = vi.fn();
    const off = vi.fn();
    const active = [{}];
    const target = { active: true };
    const updateProjectiles = vi.fn(() => {
      active.length = 0;
    });
    const field = Object.assign(
      Object.create(CelestialProjectileField.prototype),
      {
        active,
        target,
        detached: false,
        destroyed: false,
        scene: { events: { on, off } },
        updateProjectiles,
      },
    ) as CelestialProjectileField;

    field.detach();

    expect(on).toHaveBeenCalledWith(
      Phaser.Scenes.Events.UPDATE,
      expect.any(Function),
      field,
    );
    const updateDetached = on.mock.calls[0]?.[1] as (time: number) => void;
    updateDetached.call(field, 1_200);
    expect(updateProjectiles).toHaveBeenCalledWith(1_200, target);
    expect(off).toHaveBeenCalledWith(
      Phaser.Scenes.Events.UPDATE,
      updateDetached,
      field,
    );
  });
});
