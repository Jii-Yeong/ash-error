// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { STAGE_FIVE_PLAYER_SPRITE } from '@/game/config/playerAnimationConfig';
import { PlayerLifeCycle } from '@/game/systems/PlayerLifeCycle';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('PlayerLifeCycle', () => {
  it('공중 사망 시 바닥에 닿은 뒤 착지 프레임으로 전환한다', () => {
    const setFrame = vi.fn();
    const stopAnimation = vi.fn();
    const addTween = vi.fn();
    const body = {
      blocked: { down: false },
      bottom: 300,
      enable: true,
    };
    const player = {
      anims: { stop: stopAnimation },
      body,
      setFrame,
      y: 250,
    };
    const lifeCycle = new PlayerLifeCycle({
      player,
      scene: { tweens: { add: addTween } },
      playerSprite: () => STAGE_FIVE_PLAYER_SPRITE,
    } as unknown as ConstructorParameters<typeof PlayerLifeCycle>[0]);

    (
      lifeCycle as unknown as { playDeathAnimation(): void }
    ).playDeathAnimation();

    expect(body.enable).toBe(false);
    expect(stopAnimation).toHaveBeenCalledOnce();
    expect(setFrame).toHaveBeenCalledWith(
      STAGE_FIVE_PLAYER_SPRITE.deathFrames?.[0],
    );
    const tween = addTween.mock.calls[0]?.[0] as {
      onComplete: () => void;
      y: number;
    };
    expect(tween.y).toBeGreaterThan(player.y);
    tween.onComplete();
    expect(setFrame).toHaveBeenLastCalledWith(
      STAGE_FIVE_PLAYER_SPRITE.deathFrames?.[1],
    );
  });
});
