import { describe, expect, it } from 'vitest';
import {
  createUndergroundDescentRoom,
  UNDERGROUND_LANDING_ROOM,
  UNDERGROUND_ROOM_ONE,
  UNDERGROUND_ROOM_TWO,
} from '@/game/config/rooms/stageThreeRooms';

const combatRooms = [UNDERGROUND_ROOM_ONE, UNDERGROUND_ROOM_TWO];

describe('stage three combat rooms', () => {
  it('replaces reused standard roles with three underground-specific enemies', () => {
    for (const room of combatRooms) {
      const types = new Set(room.enemySpawns.map(({ type }) => type));
      expect(types).toEqual(
        new Set(['ceiling-maintainer', 'captor', 'blocker']),
      );
      expect(
        room.enemySpawns.some(({ type }) =>
          ['melee', 'ranged', 'flying'].includes(type),
        ),
      ).toBe(false);
    }
  });

  it('binds every ceiling maintainer to a visible upper pipe span', () => {
    for (const room of combatRooms) {
      expect(room.ceilingPipes?.length).toBeGreaterThan(0);
      for (const spawn of room.enemySpawns) {
        if (spawn.type !== 'ceiling-maintainer') {
          continue;
        }

        const pipe = room.ceilingPipes?.find(({ id }) => id === spawn.pipeId);
        expect(pipe).toBeDefined();
        expect(pipe?.y).toBeLessThan(140);
        expect(spawn.x).toBeGreaterThanOrEqual(pipe?.x ?? Infinity);
        expect(spawn.x).toBeLessThanOrEqual(
          (pipe?.x ?? 0) + (pipe?.width ?? 0),
        );
      }
    }
  });

  it('centres the descent pit and fills a wide viewport with floor', () => {
    const room = createUndergroundDescentRoom(1600);

    expect(room.worldWidth).toBe(1600);
    expect(room.pits).toEqual([{ x: 600, width: 400 }]);
  });

  it('covers the landing view with a stage three ceiling pipe', () => {
    expect(UNDERGROUND_LANDING_ROOM.ceilingPipes).toEqual([
      {
        id: 'landing-overhead',
        x: 1280,
        y: 72,
        width: 2560,
      },
    ]);
  });
});
