import { describe, expect, it } from 'vitest';
import { AerialMovementMode } from '@/game/config/aerialMovementConfig';
import { BOSS_COMBAT_CONFIGS } from '@/game/config/bossConfig';
import { MovementMode } from '@/game/config/playerMovementConfig';
import {
  STARTING_STAGE_INDEX,
  STAGES,
  STAGE_FIVE_CONFIG,
  STAGE_FOUR_CONFIG,
  STAGE_ONE_CONFIG,
  STAGE_THREE_CONFIG,
  STAGE_TWO_CONFIG,
} from '@/game/config/stageConfig';

describe('stage configuration', () => {
  it('starts new runs at stage one', () => {
    expect(STARTING_STAGE_INDEX).toBe(0);
  });

  it('uses flight movement only in stage five', () => {
    expect(STAGES.slice(0, 4).map((stage) => stage.movementMode)).toEqual([
      MovementMode.GROUND,
      MovementMode.GROUND,
      MovementMode.GROUND,
      MovementMode.GROUND,
    ]);
    expect(STAGE_FIVE_CONFIG.movementMode).toBe(MovementMode.FLIGHT);
  });

  it('increases player health with stage difficulty', () => {
    expect(STAGES.map(({ playerMaxHealth }) => playerMaxHealth)).toEqual([
      100, 115, 130, 150, 175,
    ]);

    for (const stage of STAGES) {
      const bossSpawn = stage.rooms.at(-1)?.enemySpawns[0];
      if (!bossSpawn || bossSpawn.type !== 'boss') {
        throw new Error(`Missing boss for ${stage.id}`);
      }

      const boss = BOSS_COMBAT_CONFIGS[bossSpawn.variant];
      expect(stage.playerMaxHealth / boss.contactDamage).toBeGreaterThanOrEqual(
        5,
      );
    }
  });

  it('ends every stage with one dedicated boss room', () => {
    for (const stage of STAGES) {
      expect(stage.rooms).toHaveLength(3);

      const finalRoom = stage.rooms.at(-1);
      expect(finalRoom?.kind).toBe('boss');
      expect(finalRoom?.enemySpawns).toHaveLength(1);
      expect(finalRoom?.enemySpawns[0]?.type).toBe('boss');
    }
  });

  it('loads the supplied stage 2 background', () => {
    expect(STAGE_TWO_CONFIG.background).toEqual({
      key: 'stage-02-bg',
      path: '/assets/backgrounds/stage-02.webp',
    });
    expect(STAGE_TWO_CONFIG.portalTint).toBe(0xb6ffe4);
  });

  it('uses one player atlas with a death pose in stages one and two', () => {
    for (const stage of [STAGE_ONE_CONFIG, STAGE_TWO_CONFIG]) {
      expect(stage.playerSprite).toMatchObject({
        texture: 'stage-1-2-player',
        animations: {
          idle: 'stage-1-2-player-idle',
          run: 'stage-1-2-player-run',
          death: 'stage-1-2-player-death',
        },
      });
    }
  });

  it('skins the stage 2 upper platforms with the supplied 3-slice art', () => {
    expect(STAGE_TWO_CONFIG.terrainSkin).toMatchObject({
      left: {
        key: 'stage-2-stool-left',
        path: '/assets/terrain/stage-2-stool-left.png',
        width: 38,
      },
      middle: {
        key: 'stage-2-stool-middle',
        path: '/assets/terrain/stage-2-stool-middle.png',
        width: 100,
      },
      right: {
        key: 'stage-2-stool-right',
        path: '/assets/terrain/stage-2-stool-right.png',
        width: 38,
      },
      height: 35,
      surfaceInset: 3,
    });
  });

  it('uses the supplied stage 2 art for every standard enemy role', () => {
    expect(STAGE_TWO_CONFIG.meleeSprite).toMatchObject({
      texture: 'stage-2-neared',
      animations: {
        idle: 'stage-2-neared-idle',
        walk: 'stage-2-neared-walk',
        attack: 'stage-2-neared-attack',
        death: 'stage-2-neared-death',
      },
    });
    expect(STAGE_TWO_CONFIG.rangedSprite).toMatchObject({
      texture: 'stage-2-ranged',
      animations: {
        idle: 'stage-2-ranged-idle',
        walk: 'stage-2-ranged-walk',
        attack: 'stage-2-ranged-attack',
        death: 'stage-2-ranged-death',
      },
    });
    expect(STAGE_TWO_CONFIG.flyingSprite).toMatchObject({
      texture: 'stage-2-flying',
      animations: {
        idle: 'stage-2-flying-idle',
        hit: 'stage-2-flying-hit',
        deathFall: 'stage-2-flying-death-fall',
        deathLand: 'stage-2-flying-death-land',
      },
    });
  });

  it('loads the supplied stage 3 background with the same structure', () => {
    expect(STAGE_THREE_CONFIG.background).toEqual({
      key: 'stage-03-bg',
      path: '/assets/backgrounds/stage-03.webp',
    });
  });

  it('continues from the stage 3 siege into a three-room hell stage', () => {
    expect(STAGES).toHaveLength(5);
    expect(STAGE_THREE_CONFIG.endEvent).toBe('siege');
    expect(STAGE_FOUR_CONFIG).toMatchObject({
      id: 'stage-04',
      label: 'STAGE 4 // HELL',
      background: {
        key: 'stage-04-bg',
        path: '/assets/backgrounds/stage-04.webp',
      },
      playerSprite: {
        texture: 'stage-4-player',
        animations: {
          idle: 'stage-4-player-idle',
          run: 'stage-4-player-run',
          death: 'stage-4-player-death',
        },
      },
    });
    expect(STAGE_FOUR_CONFIG.rooms.at(-1)?.enemySpawns[0]).toMatchObject({
      type: 'boss',
      variant: 'infernal-executioner',
    });
    for (const room of STAGE_FOUR_CONFIG.rooms.slice(0, 2)) {
      expect(new Set(room.enemySpawns.map(({ type }) => type))).toEqual(
        new Set(['infernal-hound', 'executioner-doll', 'judgment-eye']),
      );
    }
  });

  it('ends with a three-room return stage and final boss', () => {
    expect(STAGE_FIVE_CONFIG).toMatchObject({
      id: 'stage-05',
      label: 'STAGE 5 // THE RETURN',
      background: {
        key: 'stage-05-bg',
        path: '/assets/backgrounds/stage-05.webp',
      },
      playerSprite: {
        texture: 'stage-5-player',
        animations: {
          idle: 'stage-5-player-idle',
          run: 'stage-5-player-run',
          flyIdle: 'stage-5-player-fly',
          flyMove: 'stage-5-player-fly',
          flyDash: 'stage-5-player-fly',
          death: 'stage-5-player-death',
        },
      },
    });
    expect(STAGE_FIVE_CONFIG.rooms.at(-1)?.enemySpawns[0]).toMatchObject({
      type: 'boss',
      variant: 'returning-architect',
    });
  });

  it('uses stage-specific bullet-pattern enemies throughout stage five', () => {
    const expectedTypes = new Set([
      'choir-supporter',
      'sanctum-enforcer',
      'celestial-oracle',
    ]);
    for (const room of STAGE_FIVE_CONFIG.rooms.slice(0, 2)) {
      expect(new Set(room.enemySpawns.map(({ type }) => type))).toEqual(
        expectedTypes,
      );
    }
  });

  it('gives every ground-stage flier a restrained patrol route', () => {
    for (const stage of STAGES.slice(0, 4)) {
      for (const room of stage.rooms.filter(({ kind }) => kind === 'combat')) {
        for (const spawn of room.enemySpawns) {
          if (spawn.type !== 'flying') continue;

          expect(spawn.movement?.mode).toBe(AerialMovementMode.PATROL);
          expect(spawn.movement?.rangeX).toBeLessThanOrEqual(120);
          expect(spawn.movement?.rangeY).toBeLessThanOrEqual(40);
        }
      }
    }
  });

  it('centres the stage five clear portal for aerial rooms', () => {
    expect(
      STAGE_FIVE_CONFIG.rooms.every(
        (room) => room.portal.height === 720 && room.portal.y === 360,
      ),
    ).toBe(true);
    expect(
      STAGES.slice(0, 4).every((stage) =>
        stage.rooms.every((room) => room.portal.height === 180),
      ),
    ).toBe(true);
  });
});
