import { GAME_HEIGHT, GAME_WIDTH } from '@/game/config/gameDimensions';
import {
  defineBossRoom,
  defineRoom,
  type StageRooms,
} from '@/game/config/roomConfig';

// 3스테이지는 피트 위 캣워크와 단단한 바닥 위 엄폐 캣워크를 구분함.
// 캣워크는 바닥에서 116px 높이라 최대 점프에 여유가 있으며, 짧은 엄폐
// 구간에서는 아래에서 탄환을 막고 가장자리에서 반격할 수 있음.
const CATWALK_Y = GAME_HEIGHT - 180;
const HIGH_LEDGE_Y = GAME_HEIGHT - 280;

// 지상 제어형 적은 캣워크·구덩이 지형(레벨 디자인)을 그대로 쓰되, 스테이지 3
// 고유 적(천장 정비병·포박형·방어형)으로 배치함. 이 적들은 추적 반경이 넓어
// 첫 적은 진입 여유(약 x=1000 이후)를 두고, 지상 적은 구덩이 위에 두지 않으며,
// 천장 정비병은 위쪽 파이프 구간 안에서만 생성함.
export const UNDERGROUND_ROOM_ONE = defineRoom({
  id: 'underground-01',
  label: 'ROOM 01',
  worldWidth: 5200,
  intensity: 1.25,
  enemySpawns: [
    { type: 'blocker', x: 1000, y: GAME_HEIGHT - 130 },
    { type: 'captor', x: 1500, y: GAME_HEIGHT - 120 },
    { type: 'ceiling-maintainer', pipeId: 'u1-west', x: 2150 },
    { type: 'captor', x: 2600, y: GAME_HEIGHT - 120 },
    { type: 'blocker', x: 3050, y: GAME_HEIGHT - 130 },
    { type: 'ceiling-maintainer', pipeId: 'u1-east', x: 3700 },
  ],
  ceilingPipes: [
    { id: 'u1-west', x: 1500, y: 80, width: 1200 },
    { id: 'u1-east', x: 3200, y: 96, width: 1100 },
  ],
  terrain: [
    { type: 'platform', x: 1050, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 1800, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 2650, y: CATWALK_Y, width: 220, height: 22 },
    { type: 'platform', x: 3300, y: CATWALK_Y, width: 260, height: 22 },
    { type: 'platform', x: 4150, y: CATWALK_Y, width: 250, height: 22 },
  ],
  pits: [
    { x: 1100, width: 150 },
    { x: 1850, width: 150 },
    { x: 3350, width: 160 },
    { x: 4200, width: 150 },
  ],
});

export const UNDERGROUND_ROOM_TWO = defineRoom({
  id: 'underground-02',
  label: 'ROOM 02',
  worldWidth: 5200,
  intensity: 1.35,
  enemySpawns: [
    { type: 'blocker', x: 1000, y: GAME_HEIGHT - 130 },
    { type: 'captor', x: 1500, y: GAME_HEIGHT - 120 },
    { type: 'ceiling-maintainer', pipeId: 'u2-west', x: 1750 },
    { type: 'captor', x: 2400, y: GAME_HEIGHT - 120 },
    { type: 'ceiling-maintainer', pipeId: 'u2-mid', x: 2750 },
    { type: 'blocker', x: 3000, y: GAME_HEIGHT - 130 },
    { type: 'ceiling-maintainer', pipeId: 'u2-east', x: 3700 },
  ],
  ceilingPipes: [
    { id: 'u2-west', x: 1400, y: 88, width: 900 },
    { id: 'u2-mid', x: 2450, y: 72, width: 900 },
    { id: 'u2-east', x: 3300, y: 100, width: 900 },
  ],
  terrain: [
    { type: 'platform', x: 1100, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 1950, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 2700, y: CATWALK_Y, width: 220, height: 22 },
    { type: 'platform', x: 3300, y: CATWALK_Y, width: 260, height: 22 },
    { type: 'platform', x: 4300, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 1980, y: HIGH_LEDGE_Y, width: 180, height: 22 },
    { type: 'platform', x: 3330, y: HIGH_LEDGE_Y, width: 200, height: 22 },
  ],
  pits: [
    { x: 1150, width: 150 },
    { x: 2000, width: 150 },
    { x: 3350, width: 160 },
    { x: 4350, width: 150 },
  ],
});

export const UNDERGROUND_BOSS_ROOM = defineBossRoom({
  id: 'underground-boss',
  label: '정화 집행기 // PURIFIER',
  variant: 'underground-guardian',
  intensity: 1.35,
  // The purifier is a large capture/crush boss: widen the arena so the grab
  // pull and the two floor shockwaves have room to be dodged.
  worldWidth: 2600,
});

export const UNDERGROUND_ROOMS = [
  UNDERGROUND_ROOM_ONE,
  UNDERGROUND_ROOM_TWO,
  UNDERGROUND_BOSS_ROOM,
] as const satisfies StageRooms;

/**
 * 보스 처치 후 포탈로 진입하는 연출용 빈 방. `Scale.EXPAND`가 넓힌 실제
 * 뷰포트 폭만큼 바닥을 만들고 구멍을 중앙에 둔다. 플레이어가 구멍에 떨어지면
 * 강하 컷신이 시작된다. 방 배열의 3방·보스 마지막 불변식을 지키기 위해
 * 런타임에서만 생성한다.
 */
export function createUndergroundDescentRoom(viewportWidth: number) {
  const worldWidth = Math.max(GAME_WIDTH, viewportWidth);
  const pitWidth = 400;
  return defineRoom({
    id: 'underground-descent',
    label: '지하 강하 // DESCENT',
    kind: 'descent',
    worldWidth,
    enemySpawns: [],
    pits: [{ x: (worldWidth - pitWidth) / 2, width: pitWidth }],
  });
}

/**
 * 구멍으로 사라진 플레이어가 떨어져 착지하는 지하 착지 방. 구멍 없는 단단한
 * 바닥에 플레이어가 방 중앙에 착지한다. 착지 후 두리번 연출과 적 등장 컷신이
 * 이어진다. 강하 방과 마찬가지로 런타임에서 주입한다.
 *
 * 화면 스케일이 EXPAND라 넓은 화면에서는 뷰포트가 한 화면(GAME_WIDTH)보다
 * 넓어진다. 바닥이 화면 가장자리까지 꽉 차도록 방 너비를 화면보다 넉넉하게 둔다.
 */
export const UNDERGROUND_LANDING_ROOM = defineRoom({
  id: 'underground-landing',
  label: '지하 심부 // SUBLEVEL',
  kind: 'descent',
  worldWidth: GAME_WIDTH * 4,
  enemySpawns: [],
  ceilingPipes: [
    {
      id: 'landing-overhead',
      x: GAME_WIDTH,
      y: 72,
      width: GAME_WIDTH * 2,
    },
  ],
});
