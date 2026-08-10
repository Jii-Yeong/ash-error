// @vitest-environment jsdom

import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { BLOCKER_CONFIG } from '@/game/config/stageThreeEnemyConfig';
import { BlockerEnemy } from '@/game/entities/BlockerEnemy';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

function createEnemy() {
  const setVelocityX = vi.fn();
  const rigPlay = vi.fn();
  const slam = vi.fn();
  const setFlipX = vi.fn();
  const enemy = Object.assign(Object.create(BlockerEnemy.prototype), {
    active: true,
    x: 500,
    aggroRadius: BLOCKER_CONFIG.aggroRadius,
    blockerState: 'patrol',
    stateEndsAt: 0,
    nextSlamAt: 0,
    chargeStartedAt: 0,
    patrolDirection: 1,
    patrolCenterX: 500,
    dying: false,
    body: {
      blocked: { left: false, right: false },
      top: FLOOR_SURFACE_Y - 80,
    },
    rig: { play: rigPlay },
    setFlipX,
    setVelocityX,
    slam,
  }) as BlockerEnemy;

  return { enemy, rigPlay, setFlipX, setVelocityX, slam };
}

function createTarget(x: number, airborne = false) {
  return {
    x,
    body: {
      blocked: { down: !airborne },
      bottom: airborne ? FLOOR_SURFACE_Y - 100 : FLOOR_SURFACE_Y,
    },
  } as Phaser.Physics.Arcade.Sprite;
}

describe('BlockerEnemy charge combo', () => {
  it('patrols until it detects the player, then charges faster', () => {
    const { enemy, setVelocityX } = createEnemy();

    expect(
      enemy.updateCombat(
        0,
        { x: 1100 } as Phaser.Physics.Arcade.Sprite,
        vi.fn(),
      ),
    ).toBe(false);
    expect(setVelocityX).toHaveBeenLastCalledWith(BLOCKER_CONFIG.moveSpeed);

    enemy.updateCombat(
      100,
      { x: 900 } as Phaser.Physics.Arcade.Sprite,
      vi.fn(),
    );
    expect(setVelocityX).toHaveBeenLastCalledWith(BLOCKER_CONFIG.chargeSpeed);
  });

  it('chains a close charge into the existing slam', () => {
    const { enemy, setVelocityX, slam } = createEnemy();
    const target = createTarget(650);

    enemy.updateCombat(100, target, vi.fn());
    expect(setVelocityX).toHaveBeenLastCalledWith(BLOCKER_CONFIG.chargeSpeed);

    enemy.updateCombat(
      100 + BLOCKER_CONFIG.minimumChargeDuration,
      target,
      vi.fn(),
    );
    expect(setVelocityX).toHaveBeenLastCalledWith(0);

    enemy.updateCombat(
      100 +
        BLOCKER_CONFIG.minimumChargeDuration +
        BLOCKER_CONFIG.slamWarningDuration,
      target,
      vi.fn(),
    );
    expect(slam).toHaveBeenCalledWith(target);
  });

  it('waits without turning back and forth under an airborne player', () => {
    const { enemy, rigPlay, setFlipX, setVelocityX } = createEnemy();

    enemy.updateCombat(100, createTarget(510, true), vi.fn());
    enemy.updateCombat(116, createTarget(490, true), vi.fn());

    expect(setVelocityX.mock.calls).toEqual([[0], [0]]);
    expect(setFlipX).not.toHaveBeenCalled();
    expect(rigPlay).toHaveBeenLastCalledWith(BLOCKER_CONFIG.animations.idle);
  });

  it('does not overwrite the death animation with a pending attack', () => {
    const { enemy, rigPlay, setVelocityX, slam } = createEnemy();
    Object.assign(enemy, {
      blockerState: 'windup',
      dying: true,
      stateEndsAt: 0,
    });

    expect(
      enemy.updateCombat(
        1_000,
        { x: 520 } as Phaser.Physics.Arcade.Sprite,
        vi.fn(),
      ),
    ).toBe(false);
    expect(setVelocityX).not.toHaveBeenCalled();
    expect(rigPlay).not.toHaveBeenCalled();
    expect(slam).not.toHaveBeenCalled();
  });
});
