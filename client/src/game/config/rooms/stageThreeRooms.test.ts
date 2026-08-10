import { describe, expect, it } from 'vitest';
import {
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

  it('keeps every catwalk off the pit it follows', () => {
    for (const room of combatRooms) {
      for (const platform of room.terrain ?? []) {
        expect(
          (room.pits ?? []).some(
            (pit) =>
              platform.x < pit.x + pit.width && platform.x + platform.width > pit.x,
          ),
          `${room.id} platform x=${platform.x} bridges a pit`,
        ).toBe(false);
      }
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
});
