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
  it('keeps updating active projectiles after detaching, then unsubscribes when empty', () => {
    const on = vi.fn();
    const off = vi.fn();
    const active = [{}];
    const target = { active: true };
    const updateProjectiles = vi.fn(() => {
      active.length = 0;
    });
    // 실제 생성자를 거쳐 detach 루프를 세운 뒤, 스프라이트를 만들지 않도록
    // 내부 상태만 가짜로 덮는다.
    const field = new CelestialProjectileField(
      { events: { on, off } } as unknown as Phaser.Scene,
      {} as never,
    );
    Object.assign(field, { active, target, updateProjectiles });

    field.detach();

    expect(on).toHaveBeenCalledWith(
      Phaser.Scenes.Events.UPDATE,
      expect.any(Function),
    );
    const tick = on.mock.calls[0]?.[1] as (time: number) => void;
    tick(1_200);
    expect(updateProjectiles).toHaveBeenCalledWith(1_200, target);
    // 탄환이 모두 사라지면 같은 리스너로 구독을 해제한다.
    expect(off).toHaveBeenCalledWith(Phaser.Scenes.Events.UPDATE, tick);
  });
});
