import { describe, expect, it } from 'vitest';
import {
  RETURN_ROOM_ONE,
  RETURN_ROOM_TWO,
} from '@/game/config/rooms/stageFiveRooms';
import {
  CELESTIAL_ORACLE_ANIMATION_ATLASES,
  CHOIR_SUPPORTER_ANIMATION_ATLASES,
  CELESTIAL_ORACLE_CONFIG,
  CHOIR_SUPPORTER_CONFIG,
  SANCTUM_ENFORCER_ANIMATION_ATLASES,
  SANCTUM_ENFORCER_CONFIG,
} from '@/game/config/stageFiveEnemyConfig';

describe('stage five bullet formations', () => {
  it('maps the supporter atlas tags to its combat poses', () => {
    expect(CHOIR_SUPPORTER_CONFIG).toMatchObject({
      texture: 'stage-5-supporter',
      animations: {
        idle: 'stage-5-supporter-idle',
        fly: 'stage-5-supporter-fly',
        crossShot: 'stage-5-supporter-cross-shot',
        homingPair: 'stage-5-supporter-homing-pair',
        noteWave: 'stage-5-supporter-note-wave',
        deathFall: 'stage-5-supporter-death-fall',
        deathLand: 'stage-5-supporter-death-land',
      },
    });
    expect(CHOIR_SUPPORTER_CONFIG.scale * 78).toBe(72);
    expect(CHOIR_SUPPORTER_ANIMATION_ATLASES[0]?.tagFrames).toMatchObject({
      crossShot: [{ frame: '4' }],
      homingPair: [{ frame: '5' }],
      noteWave: [{ frame: '6' }],
    });
  });

  it('maps the enforcer and oracle atlas tags to their combat poses', () => {
    expect(SANCTUM_ENFORCER_CONFIG).toMatchObject({
      texture: 'stage-5-executor',
      animations: {
        fanShot: 'stage-5-executor-fan-shot',
        crossShot: 'stage-5-executor-cross-shot',
        spearThrow: 'stage-5-executor-spear-throw',
      },
    });
    expect(SANCTUM_ENFORCER_CONFIG.scale * 115).toBe(100);
    expect(SANCTUM_ENFORCER_ANIMATION_ATLASES[0]?.tagFrames).toMatchObject({
      fanShot: [{ frame: '4' }],
      crossShot: [{ frame: '5' }],
      spearThrow: [{ frame: '6' }],
    });

    expect(CELESTIAL_ORACLE_CONFIG).toMatchObject({
      texture: 'stage-5-oracle',
      animations: {
        spiral: 'stage-5-oracle-spiral',
        walls: 'stage-5-oracle-walls',
        books: 'stage-5-oracle-books',
      },
    });
    expect(CELESTIAL_ORACLE_CONFIG.scale * 195).toBe(120);
    expect(CELESTIAL_ORACLE_ANIMATION_ATLASES[0]?.tagFrames).toMatchObject({
      spiral: [{ frame: '4' }],
      walls: [{ frame: '5' }],
      books: [{ frame: '6' }],
    });
  });

  it('builds the authored learning waves and boss approach', () => {
    expect(RETURN_ROOM_ONE.enemySpawns.map(({ type }) => type)).toEqual([
      'choir-supporter',
      'choir-supporter',
      'sanctum-enforcer',
      'choir-supporter',
      'celestial-oracle',
    ]);
    expect(
      RETURN_ROOM_TWO.enemySpawns.slice(-2).map(({ type }) => type),
    ).toEqual(['celestial-oracle', 'choir-supporter']);
  });

  it('keeps warnings readable and supporter health lowest', () => {
    expect(CHOIR_SUPPORTER_CONFIG.warningDuration).toBe(500);
    expect(SANCTUM_ENFORCER_CONFIG.warningDuration).toBe(450);
    expect(CELESTIAL_ORACLE_CONFIG.warningDuration).toBeGreaterThanOrEqual(500);
    expect(CHOIR_SUPPORTER_CONFIG.maxHealth).toBeLessThan(
      SANCTUM_ENFORCER_CONFIG.maxHealth,
    );
    expect(SANCTUM_ENFORCER_CONFIG.maxHealth).toBeLessThan(
      CELESTIAL_ORACLE_CONFIG.maxHealth,
    );
    expect(CHOIR_SUPPORTER_CONFIG.deathLandOffsetY).toBeCloseTo(16.62, 2);
    expect(SANCTUM_ENFORCER_CONFIG.deathLandOffsetY).toBeCloseTo(1.74, 2);
    expect(CELESTIAL_ORACLE_CONFIG.deathLandOffsetY).toBe(8);
  });
});
