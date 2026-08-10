import { GAME_HEIGHT, GAME_WIDTH } from '@/game/config/gameDimensions';
import {
  defineBossRoom,
  defineRoom,
  type StageRooms,
} from '@/game/config/roomConfig';

// 3스테이지의 구덩이는 직접 건너는 이동 과제이며, 캣워크는 구덩이 뒤 단단한
// 바닥에서 천장 위협과 포획선을 피할 사선 전환 선택지로만 사용함.
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
    // 방패병의 전면 방어를 다른 위협 없이 먼저 읽는다.
    { type: 'blocker', x: 1000, y: GAME_HEIGHT - 130 },
    // 포획선은 다음 전투 칸에서 단독으로 만나 끊기·사거리 이탈을 익힌다.
    { type: 'captor', x: 1750, y: GAME_HEIGHT - 120 },
    // 배관 바로 아래의 빈 바닥에서 낙하 예고를 관찰하게 한다.
    { type: 'ceiling-maintainer', pipeId: 'u1-west', x: 2500 },
    // 후반부터는 전면을 막는 방패병과 위에서 떨어지는 정비병을 함께 대응한다.
    { type: 'blocker', x: 3100, y: GAME_HEIGHT - 130 },
    { type: 'ceiling-maintainer', pipeId: 'u1-east', x: 3250 },
    // 마지막 포획기는 천장 압박과 겹치되 출구 전 정비 구간은 남긴다.
    { type: 'captor', x: 3900, y: GAME_HEIGHT - 120 },
    { type: 'ceiling-maintainer', pipeId: 'u1-east', x: 4000 },
  ],
  ceilingPipes: [
    { id: 'u1-west', x: 1500, y: 80, width: 1200 },
    { id: 'u1-east', x: 3200, y: 96, width: 1100 },
  ],
  terrain: [
    { type: 'platform', x: 1400, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 2200, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 3650, y: CATWALK_Y, width: 220, height: 22 },
    { type: 'platform', x: 4500, y: CATWALK_Y, width: 260, height: 22 },
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
    // 첫 방에서 익힌 대응을 즉시 한 쌍으로 짧게 복습한다.
    { type: 'blocker', x: 1000, y: GAME_HEIGHT - 130 },
    { type: 'ceiling-maintainer', pipeId: 'u2-west', x: 1750 },
    // 포획선이 플레이어를 위협 구역으로 끌어들이는 첫 조합이다.
    { type: 'captor', x: 2400, y: GAME_HEIGHT - 120 },
    { type: 'ceiling-maintainer', pipeId: 'u2-mid', x: 2750 },
    { type: 'blocker', x: 3000, y: GAME_HEIGHT - 130 },
    // 끝 조합은 상단·정면·포획의 세 방향을 모두 쓰되 출구에는 닿지 않는다.
    { type: 'captor', x: 3600, y: GAME_HEIGHT - 120 },
    { type: 'ceiling-maintainer', pipeId: 'u2-east', x: 3700 },
  ],
  ceilingPipes: [
    { id: 'u2-west', x: 1400, y: 88, width: 900 },
    { id: 'u2-mid', x: 2450, y: 72, width: 900 },
    { id: 'u2-east', x: 3300, y: 100, width: 900 },
  ],
  terrain: [
    { type: 'platform', x: 1450, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 2300, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 3650, y: CATWALK_Y, width: 220, height: 22 },
    { type: 'platform', x: 4650, y: CATWALK_Y, width: 250, height: 22 },
    { type: 'platform', x: 2380, y: HIGH_LEDGE_Y, width: 180, height: 22 },
    { type: 'platform', x: 3680, y: HIGH_LEDGE_Y, width: 200, height: 22 },
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
