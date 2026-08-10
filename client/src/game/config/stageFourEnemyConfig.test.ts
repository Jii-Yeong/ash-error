import { describe, expect, it } from 'vitest';
import {
  EXECUTIONER_DOLL_ANIMATION_ATLASES,
  EXECUTIONER_DOLL_CONFIG,
  INFERNAL_HOUND_CONFIG,
  JUDGMENT_EYE_CONFIG,
  STAGE_FOUR_ENEMY_ANIMATION_ATLASES,
} from '@/game/config/stageFourEnemyConfig';

describe('stage four enemy timing', () => {
  it('maps the executioner doll atlas to its combat poses', () => {
    expect(EXECUTIONER_DOLL_CONFIG).toMatchObject({
      texture: 'stage-4-takedown',
      animations: {
        idle: 'stage-4-takedown-idle',
        fly: 'stage-4-takedown-fly',
        takeDown: 'stage-4-takedown-take-down',
        slam: 'stage-4-takedown-slam',
        land: 'stage-4-takedown-land',
        deathFall: 'stage-4-takedown-death-fall',
        deathLand: 'stage-4-takedown-death-land',
      },
    });
    expect(EXECUTIONER_DOLL_ANIMATION_ATLASES[0]?.tagFrames).toMatchObject({
      takeDown: [{ frame: '4', duration: 1_000 }],
      slam: [{ frame: '5', duration: 1_000 }],
      land: [{ frame: '6', duration: 1_000 }],
      deathFall: [{ frame: '7', duration: 500 }],
      deathLand: [{ frame: '8', duration: 180 }],
    });
  });

  it('maps the hound and judgment eye atlases to their combat poses', () => {
    expect(INFERNAL_HOUND_CONFIG).toMatchObject({
      texture: 'stage-4-dog',
      animations: {
        idle: 'stage-4-dog-idle',
        attack: 'stage-4-dog-attack',
        walk: 'stage-4-dog-walk',
        death: 'stage-4-dog-death',
      },
    });
    expect(JUDGMENT_EYE_CONFIG).toMatchObject({
      texture: 'stage-4-floating',
      deathLandOffsetY: 11,
      animations: {
        idle: 'stage-4-floating-idle',
        attack: 'stage-4-floating-attack',
        deathFall: 'stage-4-floating-death-fall',
        deathLand: 'stage-4-floating-death-land',
      },
    });
    expect(
      STAGE_FOUR_ENEMY_ANIMATION_ATLASES.find(
        ({ texture }) => texture === 'stage-4-floating',
      )?.tagFrames,
    ).toMatchObject({
      deathFall: [{ frame: '4', duration: 500 }],
      deathLand: [{ frame: '5', duration: 180 }],
    });
    expect(
      STAGE_FOUR_ENEMY_ANIMATION_ATLASES.map(({ texture }) => texture),
    ).toEqual(['stage-4-dog', 'stage-4-takedown', 'stage-4-floating']);
  });

  it('keeps the authored warnings and recovery windows readable', () => {
    expect(INFERNAL_HOUND_CONFIG).toMatchObject({
      warningDuration: 650,
      stunDuration: 700,
      trailLifetime: 1_000,
    });
    expect(EXECUTIONER_DOLL_CONFIG).toMatchObject({
      warningDuration: 700,
      recoveryDuration: 700,
    });
    expect(JUDGMENT_EYE_CONFIG).toMatchObject({
      trackingDuration: 600,
      orbLifetime: 1_000,
    });
  });

  it('makes stage four attacks faster than their ordinary approach', () => {
    expect(INFERNAL_HOUND_CONFIG.chargeSpeed).toBeGreaterThan(
      INFERNAL_HOUND_CONFIG.prowlSpeed * 4,
    );
    expect(EXECUTIONER_DOLL_CONFIG.slamSpeed).toBeGreaterThan(
      EXECUTIONER_DOLL_CONFIG.hoverSpeed * 4,
    );
    expect(JUDGMENT_EYE_CONFIG.bulletSpeed).toBeGreaterThan(
      JUDGMENT_EYE_CONFIG.moveSpeed,
    );
  });
});
