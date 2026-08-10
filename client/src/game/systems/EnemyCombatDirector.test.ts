// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import { BossEnemy } from '@/game/entities/BossEnemy';
import type { Enemy } from '@/game/entities/Enemy';
import { FlyingEnemy } from '@/game/entities/FlyingEnemy';
import { EnemyCombatDirector } from '@/game/systems/EnemyCombatDirector';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('EnemyCombatDirector', () => {
  it('drops a minor enemy as soon as its center enters a pit', () => {
    const setCollideWorldBounds = vi.fn();
    const notifyEnemyDefeated = vi.fn();
    const clearFrom = vi.fn();
    const body = {
      bottom: FLOOR_SURFACE_Y,
      center: { x: 640 },
      checkCollision: { none: false },
      setCollideWorldBounds,
      top: FLOOR_SURFACE_Y - 48,
    };
    const enemy = Object.assign(Object.create(FlyingEnemy.prototype), {
      active: true,
      body,
      despawnAfterPitFall: vi.fn(),
      projectile: { kind: 'flying', muzzleOffset: 18 },
    }) as Enemy;
    const director = Object.assign(
      Object.create(EnemyCombatDirector.prototype),
      {
        fallingEnemies: new Set<Enemy>(),
        options: {
          enemies: [enemy],
          isOverPit: (x: number) => x === 640,
          notifyEnemyDefeated,
        },
        projectilePools: {
          flying: { clearFrom },
          ranged: { clearFrom: vi.fn() },
        },
      },
    ) as EnemyCombatDirector;

    director.handlePitFalls();

    expect(setCollideWorldBounds).toHaveBeenCalledWith(false);
    expect(body.checkCollision.none).toBe(true);
    expect(clearFrom).toHaveBeenCalledWith(enemy);
    expect(notifyEnemyDefeated).toHaveBeenCalledWith(enemy);

    body.top = GAME_HEIGHT + 97;
    director.handlePitFalls();
    expect(enemy.despawnAfterPitFall).toHaveBeenCalledOnce();
  });

  it('clears an animated minor enemy from the room immediately', () => {
    const clearFrom = vi.fn();
    const delayedCall = vi.fn();
    const notifyEnemyDefeated = vi.fn();
    const enemy = Object.assign(Object.create(FlyingEnemy.prototype), {
      x: 320,
      y: 240,
      projectile: { kind: 'flying', muzzleOffset: 18 },
      defeat: vi.fn(),
    }) as Enemy;
    Object.defineProperty(enemy, 'playsOwnDeathAnimation', { value: true });
    Object.defineProperty(enemy, 'deathAnimationDuration', { value: 2200 });
    const director = Object.assign(
      Object.create(EnemyCombatDirector.prototype),
      {
        options: { scene: { time: { delayedCall } }, notifyEnemyDefeated },
        projectilePools: {
          flying: { clearFrom },
          ranged: { clearFrom: vi.fn() },
        },
      },
    ) as EnemyCombatDirector;

    (
      director as unknown as { defeatEnemy(defeatedEnemy: Enemy): void }
    ).defeatEnemy(enemy);

    expect(clearFrom).toHaveBeenCalledWith(enemy);
    expect(delayedCall).not.toHaveBeenCalled();
    expect(notifyEnemyDefeated).toHaveBeenCalledWith(enemy);
  });

  it('waits for a boss death animation before clearing the room', () => {
    const notifyEnemyDefeated = vi.fn();
    let finishDeath: (() => void) | undefined;
    const delayedCall = vi.fn((_delay: number, callback: () => void) => {
      finishDeath = callback;
    });
    const enemy = Object.assign(Object.create(BossEnemy.prototype), {
      x: 320,
      y: 240,
      defeat: vi.fn(),
    }) as Enemy;
    Object.defineProperty(enemy, 'deathAnimationDuration', { value: 2200 });
    const director = Object.assign(
      Object.create(EnemyCombatDirector.prototype),
      {
        options: {
          scene: { time: { delayedCall } },
          dropBossReward: vi.fn(),
          notifyEnemyDefeated,
        },
      },
    ) as EnemyCombatDirector;

    (
      director as unknown as { defeatEnemy(defeatedEnemy: Enemy): void }
    ).defeatEnemy(enemy);

    expect(delayedCall).toHaveBeenCalledWith(2200, expect.any(Function));
    expect(notifyEnemyDefeated).not.toHaveBeenCalled();
    finishDeath?.();
    expect(notifyEnemyDefeated).toHaveBeenCalledWith(enemy);
  });
});
