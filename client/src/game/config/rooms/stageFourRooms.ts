import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import {
  defineBossRoom,
  defineRoom,
  type StageRooms,
} from '@/game/config/roomConfig';

// 4스테이지는 캣워크 반복 대신 방마다 다른 붕괴 형태를 사용함. 01방은
// 전투 비트마다 하나씩 쓰는 반응 섬, 02방은 세 높이가 중앙에 겹치는 수직 균열로
// 구성함. 낮은 발판은 116px 높이라 압박 중에도 안정적으로 진입 가능함.
const LOW_LEDGE_Y = GAME_HEIGHT - 180;
const MID_LEDGE_Y = GAME_HEIGHT - 280;
const HIGH_LEDGE_Y = GAME_HEIGHT - 380;

export const INFERNO_ROOM_ONE = defineRoom({
  id: 'inferno-01',
  label: 'ROOM 01',
  worldWidth: 6000,
  intensity: 1.55,
  enemySpawns: [
    // 돌진견은 긴 바닥선과 예고선을 단독으로 읽을 수 있게 가장 먼저 둔다.
    { type: 'infernal-hound', x: 1_150, y: GAME_HEIGHT - 120 },
    // 낙하 인형은 다음 섬에서 표식과 충격파의 높이 차이를 보여 준다.
    { type: 'executioner-doll', x: 1_850, y: GAME_HEIGHT - 330 },
    // 중반부터 돌진 경로를 피하면서 표식에 반응하는 복합 압박을 만든다.
    { type: 'infernal-hound', x: 2_150, y: GAME_HEIGHT - 120 },
    { type: 'infernal-hound', x: 2_450, y: GAME_HEIGHT - 120 },
    // 심판의 눈은 넓은 바닥에서 조준점과 방사탄을 처음 시험한다.
    { type: 'judgment-eye', x: 2_750, y: GAME_HEIGHT - 330 },
    // 후반은 세 패턴을 한 번에 시험하되 각 위협의 경고는 화면 안에서 분리한다.
    { type: 'executioner-doll', x: 3_900, y: GAME_HEIGHT - 340 },
    { type: 'judgment-eye', x: 4_550, y: GAME_HEIGHT - 320 },
    { type: 'infernal-hound', x: 4_800, y: GAME_HEIGHT - 120 },
  ],
  terrain: [
    // 돌진견 뒤 첫 붕괴 틈을 넘으며 낙하 인형의 표식을 읽는 좁은 다리.
    { type: 'platform', x: 1550, y: LOW_LEDGE_Y, width: 220, height: 22 },
    // 두 돌진견과 심판의 눈을 넘긴 뒤 선택하는 중앙 붕괴 다리.
    { type: 'platform', x: 3050, y: LOW_LEDGE_Y, width: 220, height: 22 },
    // 낙하 인형과 심판의 눈 사이에서 서 있을 높이를 바꾸는 마지막 다리.
    { type: 'platform', x: 4100, y: LOW_LEDGE_Y, width: 220, height: 22 },
  ],
  pits: [
    { x: 1600, width: 180 },
    { x: 3150, width: 200 },
    { x: 4150, width: 160 },
    { x: 5050, width: 180 },
  ],
});

export const INFERNO_ROOM_TWO = defineRoom({
  id: 'inferno-02',
  label: 'ROOM 02',
  worldWidth: 6000,
  intensity: 1.7,
  enemySpawns: [
    // 첫 두 비트는 돌진선과 낙하 표식을 짧게 재확인한다.
    { type: 'infernal-hound', x: 1_150, y: GAME_HEIGHT - 120 },
    { type: 'executioner-doll', x: 1_850, y: GAME_HEIGHT - 340 },
    // 중앙 수직 균열에서는 두 돌진선 사이에서 눈의 표식을 회피하게 한다.
    { type: 'infernal-hound', x: 2_600, y: GAME_HEIGHT - 120 },
    { type: 'infernal-hound', x: 2_900, y: GAME_HEIGHT - 120 },
    { type: 'judgment-eye', x: 3_300, y: GAME_HEIGHT - 350 },
    // 마지막은 세 적을 다시 섞되 포탈 앞 400px 이상은 안전하게 남긴다.
    { type: 'executioner-doll', x: 4_000, y: GAME_HEIGHT - 350 },
    { type: 'judgment-eye', x: 4_700, y: GAME_HEIGHT - 330 },
    { type: 'infernal-hound', x: 5_400, y: GAME_HEIGHT - 120 },
  ],
  terrain: [
    { type: 'platform', x: 1500, y: LOW_LEDGE_Y, width: 220, height: 22 },
    { type: 'platform', x: 2900, y: LOW_LEDGE_Y, width: 200, height: 22 },
    { type: 'platform', x: 4000, y: LOW_LEDGE_Y, width: 220, height: 22 },
    { type: 'platform', x: 5050, y: LOW_LEDGE_Y, width: 220, height: 22 },
    { type: 'platform', x: 1560, y: MID_LEDGE_Y, width: 180, height: 22 },
    { type: 'platform', x: 2960, y: MID_LEDGE_Y, width: 180, height: 22 },
    { type: 'platform', x: 4080, y: MID_LEDGE_Y, width: 190, height: 22 },
    { type: 'platform', x: 5130, y: MID_LEDGE_Y, width: 190, height: 22 },
    { type: 'platform', x: 3020, y: HIGH_LEDGE_Y, width: 160, height: 22 },
  ],
  pits: [
    { x: 1600, width: 160 },
    { x: 3000, width: 190 },
    { x: 4100, width: 180 },
    { x: 5150, width: 180 },
  ],
});

export const INFERNO_BOSS_ROOM = defineBossRoom({
  id: 'inferno-boss',
  label: '연옥의 집행체 // INFERNAL EXECUTIONER',
  variant: 'infernal-executioner',
  intensity: 1.55,
  worldWidth: 2200,
});

export const INFERNO_ROOMS = [
  INFERNO_ROOM_ONE,
  INFERNO_ROOM_TWO,
  INFERNO_BOSS_ROOM,
] as const satisfies StageRooms;
