// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { SanctumEnforcerEnemy } from '@/game/entities/SanctumEnforcerEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('SanctumEnforcerEnemy cross spears', () => {
  it('fires two leftward spears that cross at the locked player position', () => {
    const spawn = vi.fn();
    const enemy = Object.assign(
      Object.create(SanctumEnforcerEnemy.prototype),
      {
        activePattern: 'cross',
        enforcerState: 'warning',
        lockedX: 400,
        lockedY: 360,
        projectileField: { spawn },
        warningLine: { clear: vi.fn() },
        x: 1_000,
        y: 360,
      },
    ) as SanctumEnforcerEnemy;

    (enemy as unknown as { beginFiring(time: number): void }).beginFiring(0);

    const shots = spawn.mock.calls.map(([shot]) =>
      shot as { angle: number; x: number; y: number },
    );
    expect(shots).toHaveLength(2);
    expect(shots.every(({ angle }) => Math.cos(angle) < 0)).toBe(true);
    expect(Math.sign(Math.sin(shots[0]!.angle))).toBe(1);
    expect(Math.sign(Math.sin(shots[1]!.angle))).toBe(-1);
    for (const shot of shots) {
      const crossingY =
        shot.y + Math.tan(shot.angle) * (400 - shot.x);
      expect(crossingY).toBeCloseTo(360);
    }
  });
});
