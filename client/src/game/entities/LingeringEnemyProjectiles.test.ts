// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { CelestialOracleEnemy } from '@/game/entities/CelestialOracleEnemy';
import { ChoirSupporterEnemy } from '@/game/entities/ChoirSupporterEnemy';
import { JudgmentEyeEnemy } from '@/game/entities/JudgmentEyeEnemy';
import { SanctumEnforcerEnemy } from '@/game/entities/SanctumEnforcerEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

type DefeatableEnemy = {
  onDefeated(): void;
  activePattern?: string;
};

describe('lingering enemy projectiles', () => {
  it('detaches stage four judgment eye bullets on defeat', () => {
    const clearAttackTelegraph = vi.fn();
    const detachBullets = vi.fn();
    const enemy = Object.assign(Object.create(JudgmentEyeEnemy.prototype), {
      setVelocity: vi.fn(),
      finishAttack: vi.fn(),
      flashMechanicalRemains: vi.fn(),
      clearAttackTelegraph,
      detachBullets,
    }) as DefeatableEnemy;

    enemy.onDefeated();

    expect(clearAttackTelegraph).toHaveBeenCalledOnce();
    expect(detachBullets).toHaveBeenCalledOnce();
  });

  it('detaches stage five oracle bullets on defeat', () => {
    const detach = vi.fn();
    const clearBookMarkers = vi.fn();
    const enemy = Object.assign(Object.create(CelestialOracleEnemy.prototype), {
      activePattern: 'spiral',
      setVelocity: vi.fn(),
      finishAttack: vi.fn(),
      projectileField: { detach },
      clearBookMarkers,
    }) as DefeatableEnemy;

    enemy.onDefeated();

    expect(enemy.activePattern).toBeUndefined();
    expect(clearBookMarkers).toHaveBeenCalledOnce();
    expect(detach).toHaveBeenCalledOnce();
  });

  it('detaches stage five supporter bullets on defeat', () => {
    const detach = vi.fn();
    const enemy = Object.assign(Object.create(ChoirSupporterEnemy.prototype), {
      activePattern: 'notes',
      setVelocity: vi.fn(),
      finishAttack: vi.fn(),
      projectileField: { detach },
    }) as DefeatableEnemy;

    enemy.onDefeated();

    expect(enemy.activePattern).toBeUndefined();
    expect(detach).toHaveBeenCalledOnce();
  });

  it('detaches stage five enforcer bullets on defeat', () => {
    const detach = vi.fn();
    const clearWarning = vi.fn();
    const enemy = Object.assign(Object.create(SanctumEnforcerEnemy.prototype), {
      enforcerState: 'firing',
      setVelocity: vi.fn(),
      finishAttack: vi.fn(),
      projectileField: { detach },
      clearWarning,
    }) as DefeatableEnemy & { enforcerState: string };

    enemy.onDefeated();

    expect(enemy.enforcerState).toBe('ready');
    expect(clearWarning).toHaveBeenCalledOnce();
    expect(detach).toHaveBeenCalledOnce();
  });
});
