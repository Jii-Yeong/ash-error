// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});import { Enemy } from '@/game/entities/Enemy';

describe('Enemy pit-fall cleanup', () => {
  it('cleans up immediately without routing through a death animation', () => {
    const onDefeated = vi.fn();
    const disableBody = vi.fn();
    const enemy = Object.assign(Object.create(Enemy.prototype), {
      active: true,
      onDefeated,
      disableBody,
    }) as Enemy;

    enemy.despawnAfterPitFall();

    expect(onDefeated).toHaveBeenCalledOnce();
    expect(disableBody).toHaveBeenCalledWith(true, true);
  });
});