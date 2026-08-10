import { describe, expect, it } from 'vitest';
import {
  FLYING_ENEMY_COMBAT_CONFIG,
  MELEE_ENEMY_COMBAT_CONFIG,
  RANGED_ENEMY_COMBAT_CONFIG,
} from '@/game/config/combatConfig';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import type { EnemySpawnConfig } from '@/game/config/roomConfig';
import { ALLEY_ROOM_ONE, ALLEY_ROOM_TWO } from './stageTwoRooms';

const PLAYER_ENTRY_X = 64 + 90;
const MINIMUM_ENTRY_BREATHER = 300;
const FIRST_PIT_END_TO_AGGRO_BREATHER = 100;

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
      throw new Error('stage 2 combat room does not contain this enemy type');
  }
}

describe('stage 2 room entry layout', () => {
  it('uses only skinned platforms for authored terrain', () => {
    for (const room of [ALLEY_ROOM_ONE, ALLEY_ROOM_TWO]) {
      expect(room.terrain?.some(({ type }) => type === 'wall')).toBe(false);
    }
  });

  it('introduces the first pit before any enemy can pressure the jump', () => {
    const firstPit = ALLEY_ROOM_ONE.pits![0]!;
    const firstEnemyActivation = Math.min(
      ...ALLEY_ROOM_ONE.enemySpawns.map(activationX),
    );

    expect(firstPit.width).toBeLessThanOrEqual(196);
    expect(firstPit.x).toBeGreaterThan(PLAYER_ENTRY_X);
    expect(firstEnemyActivation - (firstPit.x + firstPit.width)).toBeGreaterThanOrEqual(
      FIRST_PIT_END_TO_AGGRO_BREATHER,
    );
  });

  it('keeps both room entrances out of every enemy activation radius', () => {
    for (const room of [ALLEY_ROOM_ONE, ALLEY_ROOM_TWO]) {
      const earliestActivation = Math.min(
        ...room.enemySpawns.map(activationX),
      );

      expect(
        earliestActivation - PLAYER_ENTRY_X,
        `${room.id} attacks too soon after entry`,
      ).toBeGreaterThanOrEqual(MINIMUM_ENTRY_BREATHER);
    }
  });

  it.each([
    ['alley-01', ALLEY_ROOM_ONE],
    ['alley-02', ALLEY_ROOM_TWO],
  ] as const)('ramps the %s opening instead of activating together', (_, room) => {
    const opening = room.enemySpawns.slice(0, 3).map(activationX);

    expect(opening[1]! - opening[0]!).toBeGreaterThanOrEqual(300);
    expect(opening[2]! - opening[1]!).toBeGreaterThanOrEqual(180);
  });
});
