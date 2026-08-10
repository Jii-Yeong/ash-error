// @vitest-environment jsdom

import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { BOSS_COMBAT_CONFIGS } from '@/game/config/bossConfig';
import {
  RAIL_RIFLE_WEAPON_CONFIG,
  SMG_WEAPON_CONFIG,
} from '@/game/config/weaponConfig';
import { ArchitectBossEnemy } from '@/game/entities/ArchitectBossEnemy';
import { InfernalBossEnemy } from '@/game/entities/InfernalBossEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

function createInfernalBoss(overrides: Record<string, unknown> = {}) {
  return Object.assign(Object.create(InfernalBossEnemy.prototype), {
    active: true,
    attackState: 'recover',
    phaseTwo: false,
    health: 1_000,
    maxHealth: 1_000,
    config: {
      pattern: {
        enrageHealthRatio: 0.5,
        charge: { coreDamageMultiplier: 1.5 },
      },
    },
    showProjectileBlockedImpact: vi.fn(),
    ...overrides,
  }) as InfernalBossEnemy;
}

function createArchitectBoss(overrides: Record<string, unknown> = {}) {
  return Object.assign(Object.create(ArchitectBossEnemy.prototype), {
    active: true,
    attackState: 'recover',
    chorusActive: false,
    phaseTwo: false,
    salvationStarted: false,
    health: 1_200,
    maxHealth: 1_200,
    config: {
      pattern: {
        railRifleDamageMultiplier: 19 / 45,
        enrageHealthRatio: 0.5,
        salvationHealthRatio: 0.1,
        salvation: { coreDamageMultiplier: 2 },
      },
    },
    showProjectileBlockedImpact: vi.fn(),
    ...overrides,
  }) as ArchitectBossEnemy;
}

describe('phase boss introductions', () => {
  it('lowers only the infernal boss charge hitbox', () => {
    const setSize = vi.fn();
    const setOffset = vi.fn();
    const infernal = createInfernalBoss({
      body: { setSize, setOffset },
      sprite: {
        bodyWidth: 150,
        bodyHeight: 200,
        bodyOffsetX: 53,
        bodyOffsetY: 49,
      },
    }) as unknown as {
      setChargeHitbox: (active: boolean) => void;
    };

    infernal.setChargeHitbox(true);
    expect(setSize).toHaveBeenLastCalledWith(150, 110);
    expect(setOffset).toHaveBeenLastCalledWith(53, 139);

    infernal.setChargeHitbox(false);
    expect(setSize).toHaveBeenLastCalledWith(150, 200);
    expect(setOffset).toHaveBeenLastCalledWith(53, 49);
  });

  it('연옥 보스 장갑은 레일건 피해만 감소시킨다', () => {
    const config = BOSS_COMBAT_CONFIGS['infernal-executioner'];
    const infernal = createInfernalBoss({
      health: config.maxHealth,
      maxHealth: config.maxHealth,
      config,
    });

    infernal.takeProjectileDamage(
      SMG_WEAPON_CONFIG.damage,
      0,
      0,
      SMG_WEAPON_CONFIG.id,
    );
    infernal.takeProjectileDamage(
      RAIL_RIFLE_WEAPON_CONFIG.damage,
      0,
      0,
      RAIL_RIFLE_WEAPON_CONFIG.id,
    );

    expect(infernal.currentHealth).toBe(config.maxHealth - 11 - 37);
  });

  it('prevents burst damage from skipping phase two', () => {
    const infernal = createInfernalBoss();
    const architect = createArchitectBoss();

    expect(infernal.takeDamage(900)).toBe(false);
    expect(infernal.currentHealth).toBe(500);
    expect(infernal.takeProjectileDamage(100, 0, 0).applied).toBe(false);

    expect(architect.takeDamage(1_000)).toBe(false);
    expect(architect.currentHealth).toBe(600);
    expect(architect.takeProjectileDamage(100, 0, 0).applied).toBe(false);
  });

  it('최종 보스 장갑은 레일건 피해만 감소시킨다', () => {
    const smgTarget = createArchitectBoss();
    const railTarget = createArchitectBoss();

    smgTarget.takeProjectileDamage(
      SMG_WEAPON_CONFIG.damage,
      0,
      0,
      SMG_WEAPON_CONFIG.id,
    );
    railTarget.takeProjectileDamage(
      RAIL_RIFLE_WEAPON_CONFIG.damage,
      0,
      0,
      RAIL_RIFLE_WEAPON_CONFIG.id,
    );

    expect(smgTarget.currentHealth).toBe(
      smgTarget.maxHealth - SMG_WEAPON_CONFIG.damage,
    );
    expect(railTarget.currentHealth).toBeCloseTo(
      railTarget.maxHealth - RAIL_RIFLE_WEAPON_CONFIG.damage * (19 / 45),
    );
  });

  it('forces each phase-two pattern after the transition', () => {
    const target = {} as Phaser.Physics.Arcade.Sprite;
    const beginShards = vi.fn();
    const infernal = createInfernalBoss({
      stateEndsAt: 0,
      setVelocityX: vi.fn(),
      drawPhaseCracks: vi.fn(),
      phaseOverlay: { clear: vi.fn() },
      clearTint: vi.fn(),
      beginShards,
    }) as unknown as {
      updatePhaseTransition: (
        time: number,
        target: Phaser.Physics.Arcade.Sprite,
      ) => void;
    };

    infernal.updatePhaseTransition(1, target);
    expect(beginShards).toHaveBeenCalledWith(1, target);

    const beginHalo = vi.fn();
    const architect = createArchitectBoss({
      stateEndsAt: 0,
      setVelocity: vi.fn(),
      view: { drawPhaseTransition: vi.fn(), endPhaseTransition: vi.fn() },
      clearTint: vi.fn(),
      beginHalo,
    }) as unknown as {
      updatePhaseTransition: (
        time: number,
        target: Phaser.Physics.Arcade.Sprite,
      ) => void;
    };

    architect.updatePhaseTransition(1, target);
    expect(beginHalo).toHaveBeenCalledWith(1, target, true);
  });

  it('ends invulnerability when the introduced pattern finishes', () => {
    const infernalBlockedImpact = vi.fn();
    const infernal = createInfernalBoss({
      phaseTwo: true,
      attackState: 'shards',
      health: 500,
      showProjectileBlockedImpact: infernalBlockedImpact,
    });
    expect(infernal.takeProjectileDamage(100, 0, 0).applied).toBe(false);
    expect(infernalBlockedImpact).toHaveBeenCalledWith(0, 0, 'boss');
    Object.assign(infernal, { attackState: 'recover' });
    expect(infernal.takeProjectileDamage(100, 0, 0).applied).toBe(true);
    expect(infernal.currentHealth).toBe(400);

    const architectBlockedImpact = vi.fn();
    const architect = createArchitectBoss({
      phaseTwo: true,
      chorusActive: true,
      attackState: 'halo-warning',
      health: 600,
      showProjectileBlockedImpact: architectBlockedImpact,
    });
    expect(architect.takeProjectileDamage(100, 0, 0).applied).toBe(false);
    expect(architectBlockedImpact).toHaveBeenCalledWith(0, 0, 'boss');
    Object.assign(architect, { chorusActive: false, attackState: 'recover' });
    expect(architect.takeProjectileDamage(100, 0, 0).applied).toBe(true);
    expect(architect.currentHealth).toBe(500);
  });
});
