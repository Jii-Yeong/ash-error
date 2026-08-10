import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import type { AerialMovementConfig } from '@/game/config/aerialMovementConfig';
import type { BossVariant } from '@/game/config/bossConfig';
import {
  BOSS_ROOM_WORLD_WIDTH,
  ROOM_WORLD_WIDTH,
} from '@/game/config/worldConfig';

export type EnemySpawnConfig =
  | {
      type: 'melee';
      x: number;
      y: number;
    }
  | {
      type: 'ranged';
      x: number;
      y: number;
    }
  | {
      type: 'flying';
      x: number;
      y: number;
      movement?: AerialMovementConfig;
    }
  | {
      type: 'ceiling-maintainer';
      pipeId: string;
      x: number;
    }
  | {
      type: 'captor';
      x: number;
      y: number;
    }
  | {
      type: 'blocker';
      x: number;
      y: number;
    }
  | {
      type: 'infernal-hound';
      x: number;
      y: number;
    }
  | {
      type: 'executioner-doll';
      x: number;
      y: number;
    }
  | {
      type: 'judgment-eye';
      x: number;
      y: number;
    }
  | {
      type: 'choir-supporter';
      x: number;
      y: number;
    }
  | {
      type: 'sanctum-enforcer';
      x: number;
      y: number;
    }
  | {
      type: 'celestial-oracle';
      x: number;
      y: number;
    }
  | {
      type: 'boss';
      variant: BossVariant;
      x: number;
      y: number;
    };

/**
 * 움직이지 않는 단단한 지형 조각. `x`/`y`는 왼쪽 위 모서리 좌표다.
 * `platform`은 높이를 바꾸는 일방통행 발판이고, `wall`은 점프나 대시로
 * 넘어야 하는 높은 장애물이다. 두 유형 모두 모든 방향에서 일반 탄환을 막는다.
 */
export type TerrainPiece = {
  type: 'platform' | 'wall';
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * A gap in the floor. `x` is the left edge (room-local). The floor is solid
 * everywhere except across this span; falling in costs the player health.
 */
export type PitSpan = {
  x: number;
  width: number;
};

/** 3스테이지 천장 정비형이 기어 다니는 상단 배관 레일. */
export type CeilingPipe = {
  id: string;
  x: number;
  y: number;
  width: number;
};

export type RoomConfig = {
  id: string;
  label: string;
  /** 'descent' = 적 없는 연출용 빈 방(3스테이지 종료 강하). */
  kind: 'combat' | 'boss' | 'descent';
  /** 이 방의 독립된 월드 너비. */
  worldWidth: number;
  entranceX: number;
  exitX: number;
  /** 출구 근처에 열리는 클리어 포탈의 세로 위치. */
  portal: {
    y: number;
    height: number;
  };
  enemySpawns: EnemySpawnConfig[];
  terrain?: TerrainPiece[];
  ceilingPipes?: CeilingPipe[];
  pits?: PitSpan[];
  /** Multiplies enemy move speed and divides fire interval. 1 = baseline pace. */
  intensity?: number;
};

export type StageRooms = readonly [RoomConfig, RoomConfig, RoomConfig];

const ROOM_PORTAL = {
  y: GAME_HEIGHT - 154,
  height: 180,
};

export type RoomDefinition = Omit<
  RoomConfig,
  'kind' | 'worldWidth' | 'entranceX' | 'exitX' | 'portal'
> & {
  kind?: RoomConfig['kind'];
  /** 방 너비. 전투 후 출구 포탈이 오른쪽 가장자리 근처에 생김. */
  worldWidth?: number;
  /** 스테이지별 포탈 위치. 예: 공중 방은 화면 중앙에 배치. */
  portal?: Partial<RoomConfig['portal']>;
};

export const defineRoom = ({
  worldWidth = ROOM_WORLD_WIDTH,
  portal,
  ...definition
}: RoomDefinition): RoomConfig => ({
  kind: 'combat',
  worldWidth,
  entranceX: 64,
  exitX: worldWidth - 64,
  portal: { ...ROOM_PORTAL, ...portal },
  ...definition,
});

export type BossRoomDefinition = Pick<
  RoomDefinition,
  'id' | 'label' | 'intensity' | 'portal'
> & {
  variant: BossVariant;
  /** Override the boss-room width (e.g. a bigger boss needs more arena). */
  worldWidth?: number;
  /** Override the boss centre height for an aerial encounter. */
  bossY?: number;
};

export const defineBossRoom = ({
  variant,
  worldWidth = BOSS_ROOM_WORLD_WIDTH,
  bossY = GAME_HEIGHT - 180,
  ...definition
}: BossRoomDefinition): RoomConfig =>
  defineRoom({
    ...definition,
    kind: 'boss',
    // Shorter than a combat room so the boss appears after a brief walk in.
    worldWidth,
    enemySpawns: [
      {
        type: 'boss',
        variant,
        x: worldWidth - 760,
        y: bossY,
      },
    ],
  });
