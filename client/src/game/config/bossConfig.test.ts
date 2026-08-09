import { describe, expect, it } from 'vitest';
import {
  ARCHITECT_BOSS_SPRITES,
  BOSS_COMBAT_CONFIGS,
  INFERNAL_BOSS_SPRITES,
} from '@/game/config/bossConfig';
import {
  STAGE_FIVE_BOSS_TAG_FRAMES,
  STAGE_FOUR_BOSS_TAG_FRAMES,
} from '@/game/config/bossAnimationConfig';
import { PLAYER_COMBAT_CONFIG } from '@/game/config/combatConfig';

describe('boss combat configuration', () => {
  it('gives the city warden a readable laser-cannon pattern', () => {
    const { pattern } = BOSS_COMBAT_CONFIGS['city-warden'];

    expect(pattern.type).toBe('laser-cannon');
    if (pattern.type !== 'laser-cannon') {
      throw new Error('City warden must use the laser cannon');
    }

    expect(pattern.chargeDuration).toBeGreaterThan(pattern.aimLockDuration);
    expect(pattern.range).toBeGreaterThanOrEqual(1280);
    expect(pattern.damage).toBe(20);
  });

  it('gives the alley hunter a searchlight hound pattern', () => {
    const { pattern } = BOSS_COMBAT_CONFIGS['alley-hunter'];

    expect(pattern.type).toBe('hound');
    if (pattern.type !== 'hound') {
      throw new Error('Alley hunter must use the hound pattern');
    }

    // A wide detection fan that reaches at least to the player's stand-off
    // distance, then a dodgeable orb that fires quicker once enraged.
    expect(pattern.cone.halfAngleDegrees).toBe(20);
    expect(pattern.cone.range).toBeGreaterThanOrEqual(pattern.preferredDistance);
    expect(pattern.orb.enragedLockDuration).toBeLessThan(
      pattern.orb.lockDuration,
    );
    expect(pattern.orb.damage).toBeGreaterThan(0);
  });

  it('gives the underground purifier a capture + crush kit', () => {
    const { pattern } = BOSS_COMBAT_CONFIGS['underground-guardian'];

    expect(pattern.type).toBe('purifier');
    if (pattern.type !== 'purifier') {
      throw new Error('Underground boss must use the purifier pattern');
    }

    // A targeted leap and a full-arena vacuum that can be resisted.
    expect(pattern.slam.launchSpeedY).toBeGreaterThan(0);
    expect(pattern.slam.maxTravelSpeedX).toBeGreaterThan(
      pattern.enragedMoveSpeed,
    );
    expect(pattern.slam.landingRadius).toBeGreaterThan(0);
    expect(pattern.slam.shockwaveSpeed).toBeGreaterThan(0);
    expect(pattern.slam.shockwaveDamage).toBeGreaterThan(0);
    expect(pattern.vacuum.duration).toBeGreaterThan(
      pattern.vacuum.warnDuration,
    );
    expect(pattern.vacuum.pullSpeed).toBeLessThan(
      PLAYER_COMBAT_CONFIG.moveSpeed,
    );
    expect(pattern.vacuum.enragedPullSpeed).toBeGreaterThan(
      pattern.vacuum.pullSpeed,
    );
  });

  it('gives the infernal executioner three distinct magma patterns', () => {
    const { pattern } = BOSS_COMBAT_CONFIGS['infernal-executioner'];

    expect(pattern.type).toBe('infernal');
    if (pattern.type !== 'infernal') {
      throw new Error('Infernal executioner must use the infernal pattern');
    }

    expect(pattern.enrageHealthRatio).toBe(0.5);
    expect(pattern.firstAttackDelay).toBeGreaterThanOrEqual(1800);
    expect(pattern.rupture.count).toBe(3);
    expect(pattern.rupture.warnDuration).toBe(700);
    expect(pattern.charge.staggerDuration).toBeGreaterThan(
      pattern.charge.duration,
    );
    expect(pattern.charge.coreDamageMultiplier).toBeGreaterThan(1);
    expect(pattern.charge.enragedSpeedMultiplier).toBeCloseTo(1.15);
    expect(pattern.shards.laneCount).toBe(4);
    expect(pattern.shards.magmaDuration).toBeGreaterThan(
      pattern.shards.warnDuration,
    );
    expect(BOSS_COMBAT_CONFIGS['infernal-executioner'].texture).toBe(
      'stage-4-boss',
    );
    expect(INFERNAL_BOSS_SPRITES['infernal-executioner']).toMatchObject({
      scale: 0.86,
      facesLeft: true,
      animations: {
        idle: 'stage-4-boss-idle',
        gush: 'stage-4-boss-gush',
        rush: 'stage-4-boss-rush',
        getDown: 'stage-4-boss-get-down',
        death: 'stage-4-boss-death',
      },
    });
    expect(STAGE_FOUR_BOSS_TAG_FRAMES).toMatchObject({
      gush: [
        { frame: '4', duration: 500 },
        { frame: '5', duration: 700 },
      ],
      getDown: [{ frame: '8', duration: 100 }],
      death: [
        { frame: '9', duration: 450 },
        { frame: '10', duration: 900 },
      ],
    });
  });

  it('gives the returning architect a three-pattern final phase', () => {
    const { pattern } = BOSS_COMBAT_CONFIGS['returning-architect'];

    expect(pattern.type).toBe('architect');
    if (pattern.type !== 'architect') {
      throw new Error('Returning architect must use the architect pattern');
    }

    expect(pattern.enrageHealthRatio).toBe(0.5);
    expect(pattern.salvationHealthRatio).toBe(0.1);
    expect(pattern.halo.bulletCount).toBeGreaterThanOrEqual(16);
    expect(pattern.wings.bulletCount).toBeGreaterThanOrEqual(7);
    expect(pattern.eye.splitBulletCount).toBe(8);
    expect(pattern.salvation.coreDamageMultiplier).toBeGreaterThan(1);
    expect(BOSS_COMBAT_CONFIGS['returning-architect'].texture).toBe(
      'stage-5-boss',
    );
    expect(ARCHITECT_BOSS_SPRITES['returning-architect']).toMatchObject({
      animations: {
        idle: 'stage-5-boss-idle',
        eyeTrack: 'stage-5-boss-eye-track',
        eyeFire: 'stage-5-boss-eye-fire',
        haloCharge: 'stage-5-boss-halo-charge',
        wingsBoth: 'stage-5-boss-wings-both',
        falseSalvation: 'stage-5-boss-false-salvation',
        phaseTransition: 'stage-5-boss-phase-transition',
        coreExposed: 'stage-5-boss-core-exposed',
        death: 'stage-5-boss-death',
      },
    });
    expect(
      ARCHITECT_BOSS_SPRITES['returning-architect']!.scale * 267,
    ).toBe(220);
    expect(STAGE_FIVE_BOSS_TAG_FRAMES).toMatchObject({
      eyeTrack: [{ frame: '2' }],
      eyeFire: [{ frame: '8' }],
      falseSalvation: [{ frame: '7' }],
      coreExposed: [{ frame: '10' }],
      death: [{ frame: '13' }],
    });
  });
});
