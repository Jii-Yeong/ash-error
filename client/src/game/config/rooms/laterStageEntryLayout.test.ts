import { describe, expect, it } from 'vitest';
import {
  FLYING_ENEMY_COMBAT_CONFIG,
  MELEE_ENEMY_COMBAT_CONFIG,
  RANGED_ENEMY_COMBAT_CONFIG,
} from '@/game/config/combatConfig';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import type { EnemySpawnConfig } from '@/game/config/roomConfig';
import {
  BLOCKER_CONFIG,
  CAPTOR_CONFIG,
  CEILING_MAINTAINER_CONFIG,
} from '@/game/config/stageThreeEnemyConfig';
import {
  EXECUTIONER_DOLL_CONFIG,
  INFERNAL_HOUND_CONFIG,
  JUDGMENT_EYE_CONFIG,
} from '@/game/config/stageFourEnemyConfig';
import {
  CELESTIAL_ORACLE_CONFIG,
  CHOIR_SUPPORTER_CONFIG,
  SANCTUM_ENFORCER_CONFIG,
} from '@/game/config/stageFiveEnemyConfig';
import { INFERNO_ROOM_ONE, INFERNO_ROOM_TWO } from './stageFourRooms';
import { RETURN_ROOM_ONE, RETURN_ROOM_TWO } from './stageFiveRooms';
import {
  UNDERGROUND_ROOM_ONE,
  UNDERGROUND_ROOM_TWO,
} from './stageThreeRooms';

const PLAYER_ENTRY_X = 64 + 90;
const MINIMUM_ENTRY_BREATHER = 300;
const GROUND_PLAYER_Y = GAME_HEIGHT - 120;
const FLIGHT_PLAYER_Y = GAME_HEIGHT / 2;

function activationX(spawn: EnemySpawnConfig, playerY: number) {
  switch (spawn.type) {
    case 'melee':
      return spawn.x - MELEE_ENEMY_COMBAT_CONFIG.aggroRadius;
    case 'ranged':
      return spawn.x - RANGED_ENEMY_COMBAT_CONFIG.aggroRadius;
    case 'flying': {
      const verticalDistance = Math.abs(spawn.y - playerY);
      return (
        spawn.x -
        Math.sqrt(
          FLYING_ENEMY_COMBAT_CONFIG.aggroRadius ** 2 -
            verticalDistance ** 2,
        )
      );
    }
    // 스테이지 3 제어형 적은 넓은 추적 반경을 수평 거리로 근사한다.
    case 'captor':
      return spawn.x - CAPTOR_CONFIG.aggroRadius;
    case 'blocker':
      return spawn.x - BLOCKER_CONFIG.aggroRadius;
    case 'ceiling-maintainer':
      return spawn.x - CEILING_MAINTAINER_CONFIG.aggroRadius;
    case 'infernal-hound':
      return spawn.x - INFERNAL_HOUND_CONFIG.aggroRadius;
    case 'executioner-doll':
      return spawn.x - EXECUTIONER_DOLL_CONFIG.aggroRadius;
    case 'judgment-eye':
      return spawn.x - JUDGMENT_EYE_CONFIG.aggroRadius;
    case 'choir-supporter':
      return spawn.x - CHOIR_SUPPORTER_CONFIG.aggroRadius;
    case 'sanctum-enforcer':
      return spawn.x - SANCTUM_ENFORCER_CONFIG.aggroRadius;
    case 'celestial-oracle':
      return spawn.x - CELESTIAL_ORACLE_CONFIG.aggroRadius;
    case 'boss':
      throw new Error('combat room does not contain a boss');
  }
}

describe('later-stage room entries', () => {
  it('gives ground stages a readable approach before the first enemy wakes', () => {
    for (const room of [
      UNDERGROUND_ROOM_ONE,
      UNDERGROUND_ROOM_TWO,
      INFERNO_ROOM_ONE,
      INFERNO_ROOM_TWO,
    ]) {
      const firstActivation = Math.min(
        ...room.enemySpawns.map((spawn) => activationX(spawn, GROUND_PLAYER_Y)),
      );

      expect(
        firstActivation - PLAYER_ENTRY_X,
        `${room.id} attacks too soon after entry`,
      ).toBeGreaterThanOrEqual(MINIMUM_ENTRY_BREATHER);
    }
  });

  it('gives the flight stage open air before the first formation wakes', () => {
    for (const room of [RETURN_ROOM_ONE, RETURN_ROOM_TWO]) {
      const firstActivation = Math.min(
        ...room.enemySpawns.map((spawn) => activationX(spawn, FLIGHT_PLAYER_Y)),
      );

      expect(
        firstActivation - PLAYER_ENTRY_X,
        `${room.id} attacks too soon after entry`,
      ).toBeGreaterThanOrEqual(MINIMUM_ENTRY_BREATHER);
    }
  });
});
