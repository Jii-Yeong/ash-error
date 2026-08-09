// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { STAGE_THREE_CAPTOR_TETHER } from '@/game/config/captorAnimationConfig';
import { CaptorEnemy } from '@/game/entities/CaptorEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('CaptorEnemy attack effect', () => {
  it('stretches the line to the target and keeps the claw at its end', () => {
    const tetherLine = {
      setAlpha: vi.fn().mockReturnThis(),
      setDisplaySize: vi.fn().mockReturnThis(),
      setPosition: vi.fn().mockReturnThis(),
      setRotation: vi.fn().mockReturnThis(),
      setVisible: vi.fn().mockReturnThis(),
    };
    const tetherClaw = {
      setAlpha: vi.fn().mockReturnThis(),
      setPosition: vi.fn().mockReturnThis(),
      setRotation: vi.fn().mockReturnThis(),
      setVisible: vi.fn().mockReturnThis(),
    };
    const enemy = Object.assign(Object.create(CaptorEnemy.prototype), {
      flipX: true,
      tetherClaw,
      tetherLine,
      x: 200,
      y: 300,
    }) as unknown as {
      showTether: (targetX: number, targetY: number) => void;
    };

    enemy.showTether(500, 303);

    expect(tetherLine.setPosition).toHaveBeenCalledWith(217, 303);
    expect(tetherLine.setRotation).toHaveBeenCalledWith(0);
    expect(tetherLine.setDisplaySize).toHaveBeenCalledWith(
      283,
      STAGE_THREE_CAPTOR_TETHER.line.height,
    );
    expect(tetherLine.setAlpha).toHaveBeenCalledWith(1);
    expect(tetherLine.setVisible).toHaveBeenCalledWith(true);
    expect(tetherClaw.setPosition).toHaveBeenCalledWith(500, 303);
    expect(tetherClaw.setRotation).toHaveBeenCalledWith(-Math.PI);
    expect(tetherClaw.setAlpha).toHaveBeenCalledWith(1);
    expect(tetherClaw.setVisible).toHaveBeenCalledWith(true);
  });
});
