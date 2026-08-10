import { describe, expect, it } from 'vitest';
import {
  FLYING_ENEMY_COMBAT_CONFIG,
  MELEE_ENEMY_COMBAT_CONFIG,
  PLAYER_COMBAT_CONFIG,
  RANGED_ENEMY_COMBAT_CONFIG,
} from '@/game/config/combatConfig';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import type { EnemySpawnConfig } from '@/game/config/roomConfig';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';
import { CITY_ROOM_ONE, CITY_ROOM_TWO } from './stageOneRooms';

const CITY_COMBAT_ROOMS = [CITY_ROOM_ONE, CITY_ROOM_TWO];
const MAX_JUMP_HEIGHT =
  (PLAYER_COMBAT_CONFIG.jumpSpeed * PLAYER_COMBAT_CONFIG.jumpSpeed) / (2 * 1200);
const MAX_PLATFORM_WIDTH = 400;
const GROUND_SPAWN_CLEARANCE = 48;

function activationX(spawn: EnemySpawnConfig) {
  switch (spawn.type) {
    case 'melee':
      return spawn.x - MELEE_ENEMY_COMBAT_CONFIG.aggroRadius;
    case 'ranged':
      return spawn.x - RANGED_ENEMY_COMBAT_CONFIG.aggroRadius;
    case 'flying': {
      const verticalDistance = Math.abs(spawn.y - (GAME_HEIGHT - 120));
      return (
        spawn.x -
        Math.sqrt(
          FLYING_ENEMY_COMBAT_CONFIG.aggroRadius ** 2 -
            verticalDistance ** 2,
        )
      );
    }
    case 'captor':
    case 'blocker':
    case 'ceiling-maintainer':
    case 'infernal-hound':
    case 'executioner-doll':
    case 'judgment-eye':
    case 'choir-supporter':
    case 'sanctum-enforcer':
    case 'celestial-oracle':
    case 'boss':
      throw new Error('stage 1 combat room does not contain this enemy type');
  }
}

describe('stage 1 room layout', () => {
  it('uses the ground and two sparse, jump-reachable platform tiers', () => {
    for (const room of CITY_COMBAT_ROOMS) {
      const platforms =
        room.terrain?.filter(({ type }) => type === 'platform') ?? [];
      const platformLevels = [...new Set(platforms.map(({ y }) => y))].sort(
        (a, b) => b - a,
      );
      const platformsPerLevel = platformLevels.map(
        (level) => platforms.filter(({ y }) => y === level).length,
      );

      expect(platforms).toHaveLength(5);
      expect(platformsPerLevel).toEqual([3, 2]);
      expect(platformLevels[0]! - platformLevels[1]!).toBe(120);
    }
  });

  it('keeps the first stage free of walls and pits', () => {
    for (const room of CITY_COMBAT_ROOMS) {
      const walls = room.terrain?.filter(({ type }) => type === 'wall') ?? [];
      expect(walls).toEqual([]);
      expect(room.pits).toBeUndefined();
    }
  });

  it('uses short platform beats instead of continuous projectile roofs', () => {
    for (const room of CITY_COMBAT_ROOMS) {
      for (const platform of room.terrain ?? []) {
        expect(
          platform.width,
          `${room.id} platform ${platform.x}~${platform.x + platform.width} dominates the encounter`,
        ).toBeLessThanOrEqual(MAX_PLATFORM_WIDTH);
      }
    }
  });

  it('keeps every ground encounter out from under projectile cover', () => {
    for (const room of CITY_COMBAT_ROOMS) {
      const platforms = room.terrain ?? [];
      const groundSpawns = room.enemySpawns.filter(
        ({ type }) => type === 'melee' || type === 'ranged',
      );

      for (const spawn of groundSpawns) {
        expect(
          platforms.some(
            (platform) =>
              spawn.x >= platform.x - GROUND_SPAWN_CLEARANCE &&
              spawn.x <=
                platform.x + platform.width + GROUND_SPAWN_CLEARANCE,
          ),
          `${room.id} ${spawn.type} at x=${spawn.x} is hidden below a platform`,
        ).toBe(false);
      }
    }
  });

  it('keeps the opening melee beat clear of overhead terrain', () => {
    const firstEnemy = CITY_ROOM_ONE.enemySpawns[0]!;
    const firstPlatform = Math.min(
      ...(CITY_ROOM_ONE.terrain ?? []).map(({ x }) => x),
    );

    expect(firstPlatform).toBeGreaterThan(firstEnemy.x);
  });

  it('gives the first three room 01 beats room to activate one at a time', () => {
    const opening = CITY_ROOM_ONE.enemySpawns.slice(0, 3).map(activationX);

    expect(opening[1]! - opening[0]!).toBeGreaterThanOrEqual(500);
    expect(opening[2]! - opening[1]!).toBeGreaterThanOrEqual(500);
  });

  it('leaves a breather before room 02’s final combined encounter', () => {
    const quietSpawns = CITY_ROOM_TWO.enemySpawns.filter(
      ({ x }) => x > 1840 && x < 2700,
    );

    expect(quietSpawns).toEqual([]);
  });

  it('introduces projectile cover beneath a late flier', () => {
    const flier = CITY_ROOM_TWO.enemySpawns.find(
      ({ type }) => type === 'flying',
    )!;
    const cover = (CITY_ROOM_TWO.terrain ?? []).find(
      ({ type, x, y, width }) =>
        type === 'platform' &&
        y === FLOOR_SURFACE_Y - 116 &&
        width >= 180 &&
        width <= 240 &&
        x <= flier.x &&
        flier.x <= x + width,
    );

    expect(cover).toBeDefined();
  });

  it('builds room 02 toward the boss door rather than away from it', () => {
    const midpoint = CITY_ROOM_TWO.worldWidth / 2;
    const spawns = CITY_ROOM_TWO.enemySpawns;
    const meanX =
      spawns.reduce((total, spawn) => total + spawn.x, 0) / spawns.length;

    expect(meanX).toBeGreaterThan(midpoint);

    for (const flier of spawns.filter(({ type }) => type === 'flying')) {
      expect(flier.x, `flier at x=${flier.x} sits in the opening half`).toBeGreaterThan(
        midpoint,
      );
    }

    const lastSpawn = Math.max(...spawns.map(({ x }) => x));
    expect(CITY_ROOM_TWO.exitX - lastSpawn).toBeGreaterThanOrEqual(400);
  });

  it('offers a reachable height option alongside every late flier', () => {
    const unreachable: string[] = [];

    for (const room of CITY_COMBAT_ROOMS) {
      const surfaces = [
        { top: FLOOR_SURFACE_Y, left: 0, right: room.worldWidth },
        ...(room.terrain ?? []).map((piece) => ({
          top: piece.y,
          left: piece.x,
          right: piece.x + piece.width,
        })),
      ];

      for (const spawn of room.enemySpawns) {
        if (spawn.type !== 'flying') continue;

        const climbs = surfaces
          .filter(
            ({ top, left, right }) =>
              left <= spawn.x && spawn.x <= right && top > spawn.y,
          )
          .map(({ top }) => top - spawn.y);
        const climb = climbs.length > 0 ? Math.min(...climbs) : Infinity;

        if (climb > MAX_JUMP_HEIGHT) {
          unreachable.push(
            `${room.id} flier at (${spawn.x}, ${spawn.y}) is ${climb.toFixed(0)}px above anything standable`,
          );
        }
      }
    }

    expect(unreachable).toEqual([]);
  });
});
