import { describe, expect, it } from 'vitest';
import { STAGES } from '@/game/config/stageConfig';

const EXPECTED_COMBAT_ROOM_COUNTS = [
  [6, 6],
  [8, 9],
  // 스테이지 3는 세 제어형 적을 단독 소개한 뒤 후반 조합으로 한 기를 추가함.
  [7, 7],
  // 스테이지 4는 개체 수보다 큰 공격 세 번과 최대 2기 동시 공격으로 압박함.
  [8, 8],
  // 스테이지 5는 탄막 편대 수를 줄이고 각 패턴의 빈틈을 읽게 함.
  [5, 5],
];

const EXPECTED_COMBAT_ROOM_WIDTHS = [3657, 4000, 5200, 6000, 4200];

describe('enemy spawn progression', () => {
  it('keeps encounter sizes tuned for each stage combat model', () => {
    expect(
      STAGES.map((stage) =>
        stage.rooms
          .filter(({ kind }) => kind === 'combat')
          .map(({ enemySpawns }) => enemySpawns.length),
      ),
    ).toEqual(EXPECTED_COMBAT_ROOM_COUNTS);
  });

  it('expands later combat stages without stretching the opening lesson', () => {
    expect(
      STAGES.map((stage) =>
        stage.rooms
          .filter(({ kind }) => kind === 'combat')
          .map(({ worldWidth }) => worldWidth),
      ),
    ).toEqual(EXPECTED_COMBAT_ROOM_WIDTHS.map((width) => [width, width]));
  });

  it('distributes every combat encounter across the full room', () => {
    for (const stage of STAGES) {
      for (const room of stage.rooms.filter(({ kind }) => kind === 'combat')) {
        const bandWidth = room.worldWidth / 3;

        for (let band = 0; band < 3; band += 1) {
          const start = band * bandWidth;
          const end = start + bandWidth;

          expect(
            room.enemySpawns.some(({ x }) => x >= start && x < end),
            `${room.id} has no enemy in band ${band + 1}`,
          ).toBe(true);
        }
      }
    }
  });

  it('keeps boss rooms dedicated to one boss', () => {
    for (const stage of STAGES) {
      const bossRoom = stage.rooms.at(-1);

      expect(bossRoom?.enemySpawns).toHaveLength(1);
      expect(bossRoom?.enemySpawns[0]?.type).toBe('boss');
    }
  });
});
