// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { CEILING_MAINTAINER_CONFIG } from '@/game/config/stageThreeEnemyConfig';
import { CeilingMaintainerEnemy } from '@/game/entities/CeilingMaintainerEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('CeilingMaintainerEnemy health phases', () => {
  it('aligns its opaque floor pixels with the body bottom', () => {
    const setOffset = vi.fn();
    const updateFromGameObject = vi.fn();
    const setY = vi.fn();
    const enemy = Object.assign(
      Object.create(CeilingMaintainerEnemy.prototype),
      {
        body: {
          offset: { x: 18, y: 5 },
          setOffset,
          updateFromGameObject,
        },
        floorSpriteAligned: false,
        setY,
        y: 600,
      },
    ) as unknown as { alignFloorSprite: () => void };

    enemy.alignFloorSprite();

    expect(setY).toHaveBeenCalledWith(604);
    expect(setOffset).toHaveBeenCalledWith(18, 1);
    expect(updateFromGameObject).toHaveBeenCalledOnce();
  });

  it('drops with refilled health before the second lethal hit defeats it', () => {
    const dropFromPipe = vi.fn();
    const enemy = Object.assign(
      Object.create(CeilingMaintainerEnemy.prototype),
      {
        active: true,
        health: CEILING_MAINTAINER_CONFIG.maxHealth,
        maxHealth: CEILING_MAINTAINER_CONFIG.maxHealth,
        healthPhase: 1,
        maintainerState: 'crawl',
        groundDashStarted: false,
        dropFromPipe,
      },
    ) as CeilingMaintainerEnemy;

    expect(
      enemy.takeProjectileDamage(
        CEILING_MAINTAINER_CONFIG.maxHealth,
        0,
        0,
      ),
    ).toEqual({ applied: true, defeated: false });
    expect(enemy.phase).toBe(2);
    expect(enemy.currentHealth).toBe(CEILING_MAINTAINER_CONFIG.maxHealth);
    expect(dropFromPipe).toHaveBeenCalledOnce();

    expect(enemy.takeProjectileDamage(1, 0, 0)).toEqual({
      applied: false,
      defeated: false,
    });
    Object.assign(enemy, {
      groundDashStarted: true,
      maintainerState: 'ground-dash',
    });
    expect(
      enemy.takeProjectileDamage(
        CEILING_MAINTAINER_CONFIG.maxHealth,
        0,
        0,
      ),
    ).toEqual({ applied: true, defeated: true });
    expect(enemy.currentHealth).toBe(0);
  });

  it('keeps projectile knockback from lifting it off its surface', () => {
    const setVelocity = vi.fn();
    const setVelocityY = vi.fn();
    const enemy = Object.assign(
      Object.create(CeilingMaintainerEnemy.prototype),
      {
        active: true,
        maintainerState: 'crawl',
        setVelocity,
        setVelocityY,
      },
    ) as CeilingMaintainerEnemy;

    enemy.applyKnockback(-Math.PI / 4, 300, 100);

    expect(setVelocity).toHaveBeenCalledOnce();
    expect(setVelocityY).toHaveBeenCalledWith(0);
  });
});
