// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { MeleeEnemy } from '@/game/entities/MeleeEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('MeleeEnemy swing effect', () => {
  it('mirrors the generated effect toward the attack direction', () => {
    const slash = {
      setPosition: vi.fn(),
      setFlipX: vi.fn(),
      setDisplaySize: vi.fn(),
      setAlpha: vi.fn(),
      setVisible: vi.fn(),
    };
    for (const method of Object.values(slash)) {
      method.mockReturnValue(slash);
    }
    const enemy = Object.assign(Object.create(MeleeEnemy.prototype), {
      x: 100,
      y: 200,
      flipX: true,
      slash,
    }) as MeleeEnemy;

    (
      enemy as unknown as {
        drawSlash: (sweep: number, fade: number) => void;
      }
    ).drawSlash(1, 0);

    expect(slash.setPosition).toHaveBeenCalledWith(88, 194);
    expect(slash.setFlipX).toHaveBeenCalledWith(true);
    expect(slash.setDisplaySize).toHaveBeenCalledWith(128, 128);
    expect(slash.setVisible).toHaveBeenCalledWith(true);
  });
});
