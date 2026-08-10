import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import {
  defineBossRoom,
  defineRoom,
  type StageRooms,
} from '@/game/config/roomConfig';

const AERIAL_ROOM_PORTAL = {
  y: GAME_HEIGHT / 2,
  height: GAME_HEIGHT,
};

// 5스테이지는 지형 없이 오른쪽에서 왼쪽으로 오는 탄막만으로 이동 경로를 만듦.
// 편대 사이에는 최소 600px를 두어 서로 다른 경고가 한꺼번에 켜지지 않게 함.

export const RETURN_ROOM_ONE = defineRoom({
  id: 'return-01',
  label: 'ROOM 01',
  worldWidth: 4200,
  intensity: 1.6,
  portal: AERIAL_ROOM_PORTAL,
  enemySpawns: [
    // 첫 편대: 느린 유도탄과 세로 음표열로 비행 회피를 익힘.
    { type: 'choir-supporter', x: 1_360, y: 210 },
    { type: 'choir-supporter', x: 1_560, y: 520 },
    // 두 번째 편대: 수평 창 경고선과 유도탄을 함께 읽음.
    { type: 'sanctum-enforcer', x: 2_150, y: 350 },
    { type: 'choir-supporter', x: 2_380, y: 190 },
    // 세 번째 편대: 반원과 세로 장벽을 단독으로 학습함.
    { type: 'celestial-oracle', x: 3_350, y: 360 },
  ],
});

export const RETURN_ROOM_TWO = defineRoom({
  id: 'return-02',
  label: 'ROOM 02',
  worldWidth: 4200,
  intensity: 1.7,
  portal: AERIAL_ROOM_PORTAL,
  enemySpawns: [
    { type: 'sanctum-enforcer', x: 1_394, y: 250 },
    { type: 'choir-supporter', x: 1_620, y: 520 },
    { type: 'celestial-oracle', x: 2_300, y: 360 },
    // 보스 직전에는 조정기가 오라클과 서포터의 동시 패턴을 둘로 제한함.
    { type: 'celestial-oracle', x: 3_250, y: 360 },
    { type: 'choir-supporter', x: 3_480, y: 190 },
  ],
});

export const RETURN_BOSS_ROOM = defineBossRoom({
  id: 'return-boss',
  label: 'THE RETURNING ARCHITECT',
  variant: 'returning-architect',
  intensity: 1.7,
  bossY: GAME_HEIGHT / 2,
  portal: AERIAL_ROOM_PORTAL,
});

export const RETURN_ROOMS = [
  RETURN_ROOM_ONE,
  RETURN_ROOM_TWO,
  RETURN_BOSS_ROOM,
] as const satisfies StageRooms;
