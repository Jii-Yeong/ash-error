// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { BossEnemy } from '@/game/entities/BossEnemy';
import { HoundBossEnemy } from '@/game/entities/HoundBossEnemy';
import { LaserBossEnemy } from '@/game/entities/LaserBossEnemy';
import { PurifierBossEnemy } from '@/game/entities/PurifierBossEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('BossEnemy sprite death sequence', () => {
  it.each([
    [HoundBossEnemy, 2_200],
    [LaserBossEnemy, 2_650],
    [PurifierBossEnemy, 2_200],
  ])(
    '%p는 스프라이트 사망 연출이 끝날 때까지 방 클리어를 지연한다',
    (BossClass, expectedDuration) => {
      const boss = Object.create(BossClass.prototype) as {
        sprite?: object;
        deathAnimationDuration: number;
      };

      expect(boss.deathAnimationDuration).toBe(0);
      boss.sprite = {};
      expect(boss.deathAnimationDuration).toBe(expectedDuration);
    },
  );
  it('전용 정리 뒤 사망 포즈와 페이드를 공통 순서로 실행한다', () => {
    let afterHold: (() => void) | undefined;
    const onDefeated = vi.fn();
    const beforePlay = vi.fn();
    const playDeathAnimation = vi.fn();
    const disableBody = vi.fn();
    const addTween = vi.fn();
    const boss = Object.assign(Object.create(BossEnemy.prototype), {
      active: true,
      dying: false,
      visible: true,
      body: {},
      onDefeated,
      clearTint: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      disableBody,
      scene: {
        time: {
          delayedCall: vi.fn((_delay: number, callback: () => void) => {
            afterHold = callback;
          }),
        },
        tweens: { add: addTween },
      },
    });

    (
      boss as unknown as {
        defeatWithSpriteAnimation(options: {
          hasSprite: boolean;
          playDeathAnimation: () => void;
          holdDuration: number;
          fadeDuration: number;
          beforePlay: () => void;
        }): void;
      }
    ).defeatWithSpriteAnimation({
      hasSprite: true,
      playDeathAnimation,
      holdDuration: 1_600,
      fadeDuration: 600,
      beforePlay,
    });

    expect(onDefeated).toHaveBeenCalledOnce();
    expect(beforePlay).toHaveBeenCalledOnce();
    expect(playDeathAnimation).toHaveBeenCalledOnce();
    expect(boss.body.enable).toBe(false);
    expect(boss.scene.time.delayedCall).toHaveBeenCalledWith(
      1_600,
      expect.any(Function),
    );

    afterHold?.();
    expect(addTween).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: boss,
        alpha: 0,
        duration: 600,
      }),
    );
    const tween = addTween.mock.calls[0]?.[0] as { onComplete(): void };
    tween.onComplete();
    expect(disableBody).toHaveBeenCalledWith(true, true);
  });
});
