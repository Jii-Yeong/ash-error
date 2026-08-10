import { describe, expect, it } from 'vitest';
import {
  MELEE_ENEMY_COMBAT_CONFIG,
  PLAYER_COMBAT_CONFIG,
} from '@/game/config/combatConfig';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import {
  MovementMode,
  PLAYER_FLIGHT_BOUNDS,
} from '@/game/config/playerMovementConfig';
import type { RoomConfig, TerrainPiece } from '@/game/config/roomConfig';
import { STAGES } from '@/game/config/stageConfig';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';
import { patrolSpan } from '@/game/systems/patrolSpan';

/**
 * 레벨 지형은 육안이 아니라 플레이어가 실제로 할 수 있는 동작을 기준으로 검사한다.
 * 아래 수치는 모두 PLAYER_COMBAT_CONFIG와 월드 중력에서 계산하므로, 점프 설정을
 * 바꾸면 한계도 다시 계산되어 발판이 조용히 도달 불가능한 상태로 남지 않는다.
 */
const GRAVITY_Y = 1200;
const { jumpSpeed, moveSpeed, dash } = PLAYER_COMBAT_CONFIG;

/** 완전한 점프의 최고 높이: v^2 / 2g. */
const MAX_JUMP_HEIGHT = (jumpSpeed * jumpSpeed) / (2 * GRAVITY_Y);
/** 출발 높이로 착지하는 전체 점프 궤적의 수평 이동 거리. */
const MAX_JUMP_DISTANCE = moveSpeed * ((2 * jumpSpeed) / GRAVITY_Y);
/** 대시는 중력을 끄고 속도를 유지하므로 고정된 수평 거리를 더한다. */
const DASH_DISTANCE = dash.speed * (dash.duration / 1000);
/** 편안한 간격과 숙련도 확인용 간격. 필수 경로는 SAFE 이하로 유지한다. */
const SAFE_GAP = MAX_JUMP_DISTANCE * 0.7;
const HARD_GAP = MAX_JUMP_DISTANCE * 0.95;
const MINIMUM_USABLE_DROP_LANE = 96;

/**
 * `climb = v*t - g*t^2/2`에서 `climb` 높이까지 상승하는 시간(초).
 * 정점을 넘는 높이는 정의되지 않으며 호출부가 먼저 제외한다.
 */
function timeToRise(climb: number) {
  const discriminant = jumpSpeed * jumpSpeed - 2 * GRAVITY_Y * climb;
  return (jumpSpeed - Math.sqrt(Math.max(0, discriminant))) / GRAVITY_Y;
}

/**
 * `climb` 높이에 도달하면서 플레이어가 옆으로 이동할 수 있는 거리.
 * 대시는 중력을 끄고 속도를 유지하므로 점프 궤적의 이동 거리에 고정 거리를 더한다.
 */
function horizontalReachAt(climb: number) {
  return moveSpeed * timeToRise(climb) + DASH_DISTANCE;
}

type Surface = { label: string; top: number; left: number; right: number };

function surfacesOf(room: RoomConfig): Surface[] {
  const platforms = (room.terrain ?? []).map((piece, index) => ({
    label: `${piece.type}#${index}`,
    top: piece.y,
    left: piece.x,
    right: piece.x + piece.width,
  }));

  return [
    { label: 'floor', top: FLOOR_SURFACE_Y, left: 0, right: room.worldWidth },
    ...platforms,
  ];
}

/** `source`에서 한 번 점프해 `target`에 착지할 수 있으면 true. */
function canHop(source: Surface, target: Surface) {
  if (source === target || source.top <= target.top) {
    return false;
  }

  const climb = source.top - target.top;

  if (climb > MAX_JUMP_HEIGHT) {
    return false;
  }

  const overlap =
    Math.min(source.right, target.right) - Math.max(source.left, target.left);
  const gap =
    overlap >= 0
      ? 0
      : Math.min(
          Math.abs(target.left - source.right),
          Math.abs(source.left - target.right),
        );

  return gap <= horizontalReachAt(climb);
}

/**
 * 도달성은 점프 한 쌍씩 판단하지 않고 바닥에서부터 확장해 계산해야 한다.
 * 도달 불가능한 발판에서만 갈 수 있는 다른 발판도 도달 불가능하지만,
 * 발판 쌍만 검사하면 둘 모두 정상이라고 잘못 판단할 수 있다.
 */
function reachableFromFloor(surfaces: Surface[]) {
  const floor = surfaces.find((surface) => surface.label === 'floor')!;
  const reached = new Set<Surface>([floor]);
  let grew = true;

  while (grew) {
    grew = false;
    for (const target of surfaces) {
      if (reached.has(target)) continue;
      for (const source of reached) {
        if (canHop(source, target)) {
          reached.add(target);
          grew = true;
          break;
        }
      }
    }
  }

  return reached;
}

function platformSpansByTier(room: RoomConfig) {
  const byTier = new Map<number, Array<{ left: number; right: number }>>();

  for (const piece of room.terrain ?? []) {
    if (piece.type !== 'platform') continue;
    byTier.set(piece.y, [
      ...(byTier.get(piece.y) ?? []),
      { left: piece.x, right: piece.x + piece.width },
    ]);
  }

  return [...byTier.entries()].map(([top, spans]) => {
    const merged: Array<{ left: number; right: number }> = [];
    for (const span of [...spans].sort((a, b) => a.left - b.left)) {
      const previous = merged.at(-1);
      if (previous && span.left <= previous.right) {
        previous.right = Math.max(previous.right, span.right);
      } else {
        merged.push({ ...span });
      }
    }
    return { top, spans: merged };
  });
}

function combatRooms() {
  return STAGES.flatMap((stage) =>
    stage.rooms
      .filter((room) => room.kind === 'combat')
      .map((room) => ({ stage: stage.id, room })),
  );
}

describe('level geometry against player metrics', () => {
  it('reports the metrics every dimension is derived from', () => {
    expect(MAX_JUMP_HEIGHT).toBeGreaterThan(0);
    console.log(
      [
        `  최대 점프 높이  ${MAX_JUMP_HEIGHT.toFixed(1)} px`,
        `  최대 점프 거리  ${MAX_JUMP_DISTANCE.toFixed(1)} px`,
        `  대시 거리       ${DASH_DISTANCE.toFixed(1)} px`,
        `  안전 간격       ${SAFE_GAP.toFixed(1)} px (거리의 70%)`,
        `  한계 간격       ${HARD_GAP.toFixed(1)} px (거리의 95%)`,
        `  바닥 표면       y=${FLOOR_SURFACE_Y}`,
      ].join('\n'),
    );
  });

  it('leaves every platform reachable', () => {
    const stranded: string[] = [];

    for (const { stage, room } of combatRooms()) {
      const surfaces = surfacesOf(room);
      const reached = reachableFromFloor(surfaces);

      for (const surface of surfaces) {
        if (surface.label === 'floor') continue;
        const ok = reached.has(surface);
        console.log(
          `  ${stage}/${room.id} ${surface.label.padEnd(12)} top=${surface.top} x=${surface.left}~${surface.right}  바닥에서 ${(FLOOR_SURFACE_Y - surface.top).toFixed(0)}px  ${ok ? 'OK' : '닿지 않음'}`,
        );
        if (!ok) {
          stranded.push(`${stage}/${room.id} ${surface.label} top=${surface.top}`);
        }
      }
    }

    if (stranded.length > 0) {
      console.log(`  닿지 않는 지형\n    ${stranded.join('\n    ')}`);
    }

    expect(stranded).toEqual([]);
  });

  it('reaches every platform without standing on a wall', () => {
    // 벽은 계단이 아니라 넘어야 할 장애물이다. 위에 설 수 있을 만큼 낮으므로
    // 바닥에서 닿지 않는 발판이 자신도 모르게 벽에 의존할 수 있다. 실제로
    // alley-01의 두 번째 발판은 앞쪽 벽까지 350px 우회한 뒤 뒤로 점프해야만
    // 도달할 수 있는 상태였다.
    const wallDependent: string[] = [];

    for (const { stage, room } of combatRooms()) {
      const withoutWalls = surfacesOf(room).filter(
        (surface) => !surface.label.startsWith('wall'),
      );
      const reached = reachableFromFloor(withoutWalls);

      for (const surface of withoutWalls) {
        if (surface.label === 'floor' || reached.has(surface)) continue;
        wallDependent.push(`${stage}/${room.id} ${surface.label} top=${surface.top}`);
      }
    }

    if (wallDependent.length > 0) {
      console.log(`  벽을 밟아야만 닿는 지형\n    ${wallDependent.join('\n    ')}`);
    }

    expect(wallDependent).toEqual([]);
  });

  it('keeps every pit crossable', () => {
    const problems: string[] = [];

    for (const { stage, room } of combatRooms()) {
      for (const pit of room.pits ?? []) {
        if (pit.width > MAX_JUMP_DISTANCE + DASH_DISTANCE) {
          problems.push(`${stage}/${room.id} 구덩이 ${pit.width}px 건널 수 없음`);
        } else if (pit.width > HARD_GAP) {
          console.log(
            `  ${stage}/${room.id} 구덩이 ${pit.width}px — 한계 간격 ${HARD_GAP.toFixed(0)} 초과, 대시 필요`,
          );
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('keeps every wall passable', () => {
    const problems: string[] = [];

    for (const { stage, room } of combatRooms()) {
      for (const piece of room.terrain ?? []) {
        if (piece.type !== 'wall') continue;
        const climb = FLOOR_SURFACE_Y - piece.y;
        if (climb > MAX_JUMP_HEIGHT) {
          problems.push(
            `${stage}/${room.id} 벽 상단 y=${piece.y} — 바닥에서 ${climb.toFixed(0)}px, 점프 ${MAX_JUMP_HEIGHT.toFixed(0)}px로 못 넘음`,
          );
        }
      }
    }

    if (problems.length > 0) {
      console.log(`  넘을 수 없는 벽\n    ${problems.join('\n    ')}`);
    }

    expect(problems).toEqual([]);
  });

  it('leaves usable drop lanes between platforms on the same tier', () => {
    const narrowLanes: string[] = [];

    for (const { stage, room } of combatRooms()) {
      for (const { top, spans } of platformSpansByTier(room)) {
        for (let index = 1; index < spans.length; index += 1) {
          const previous = spans[index - 1]!;
          const current = spans[index]!;
          const gap = current.left - previous.right;
          if (gap < MINIMUM_USABLE_DROP_LANE) {
            narrowLanes.push(
              `${stage}/${room.id} y=${top} x=${previous.right}~${current.left} — ${gap}px`,
            );
          }
        }
      }
    }

    expect(narrowLanes).toEqual([]);
  });

  it('keeps every platform-covered ground enemy near a usable exit', () => {
    const trapped: string[] = [];

    for (const { stage, room } of combatRooms()) {
      const tiers = platformSpansByTier(room);
      for (const spawn of room.enemySpawns) {
        if (spawn.type !== 'melee' && spawn.type !== 'ranged') continue;

        for (const { top, spans } of tiers) {
          for (const span of spans) {
            if (spawn.x < span.left || spawn.x > span.right) continue;
            const edgeDistance = Math.min(
              spawn.x - span.left,
              span.right - spawn.x,
            );
            if (edgeDistance > MINIMUM_USABLE_DROP_LANE) {
              trapped.push(
                `${stage}/${room.id} ${spawn.type} x=${spawn.x} below y=${top} — nearest edge ${edgeDistance}px`,
              );
            }
          }
        }
      }
    }

    expect(trapped).toEqual([]);
  });

  it('keeps full ground patrols out of deep platform cover', () => {
    const buriedPatrols: string[] = [];

    for (const { stage, room } of combatRooms()) {
      const platforms = (room.terrain ?? []).filter(
        ({ type }) => type === 'platform',
      );
      const groundSpawns = room.enemySpawns.filter(
        ({ type }) => type === 'melee' || type === 'ranged',
      );

      for (const spawn of groundSpawns) {
        const patrol =
          patrolSpan({
            spawnX: spawn.x,
            range: MELEE_ENEMY_COMBAT_CONFIG.patrolRange,
            left: room.entranceX,
            right: room.exitX,
            pits: room.pits,
            edgeMargin: MELEE_ENEMY_COMBAT_CONFIG.patrolEdgeMargin,
            minimumSpan: MELEE_ENEMY_COMBAT_CONFIG.patrolMinimumSpan,
          }) ?? { left: spawn.x, right: spawn.x };

        for (const platform of platforms) {
          const unsafeLeft = platform.x + MINIMUM_USABLE_DROP_LANE;
          const unsafeRight =
            platform.x + platform.width - MINIMUM_USABLE_DROP_LANE;
          if (unsafeLeft >= unsafeRight) continue;

          if (patrol.right > unsafeLeft && patrol.left < unsafeRight) {
            buriedPatrols.push(
              `${stage}/${room.id} ${spawn.type} patrol ${patrol.left}~${patrol.right} enters cover ${unsafeLeft}~${unsafeRight}`,
            );
          }
        }
      }
    }

    expect(buriedPatrols).toEqual([]);
  });

  // 제거된 검사: 점프해야 하는 모든 요소 위에 빈 공간을 남긴다.
  //
  // 완전한 점프는 필요 여부와 관계없이 130.7px 상승하므로, 낮은 발판 아래에서
  // 평범하게 점프하면 밑면에 부딪혔다. 이 검사는 점프할 요소 위에 발판 밑면이
  // 없도록 강제했다. 이제 발판은 아래에서 통과해 위에 착지하는 일방통행이라
  // 해당 충돌은 발생하지 않는다. 다만 이 규칙이 강제한 배치는 남아 있어,
  // 스테이지 1의 열린 구간마다 위에 발판이 있다는 이유로 구덩이가 전혀 없다.

  it('introduces each enemy type on its own before combining them', () => {
    // 모든 위협은 플레이어를 죽일 수 있는 조합으로 만나기 전에 단독으로 파악할
    // 기회를 준다. 기존 첫 방은 500px 안에 세 유형이 모두 등장해 적이 있다는
    // 사실 외에는 아무것도 학습시키지 못했다.
    const firstRoom = STAGES[0].rooms.find((room) => room.kind === 'combat')!;
    const order = [...firstRoom.enemySpawns]
      .sort((first, second) => first.x - second.x)
      .map((spawn) => spawn.type);

    const introducedAt = new Map<string, number>();
    order.forEach((type, index) => {
      if (!introducedAt.has(type)) introducedAt.set(type, index);
    });

    // 이전 유형을 소개하는 동안 새 유형이 합류하지 않으며, 각 유형은 최소 한 번
    // 단독 교전을 갖는다.
    const introductions = [...introducedAt.values()].sort((a, b) => a - b);
    for (let index = 1; index < introductions.length; index += 1) {
      expect(
        introductions[index] - introductions[index - 1],
        `${order[introductions[index]]} arrives before the previous type has been met alone`,
      ).toBeGreaterThanOrEqual(2);
    }

    // 지상에서 대응할 수 없는 유형은 마지막에 소개한다.
    expect(order[order.length - 1]).toBe('flying');
  });

  it('leaves a reset stretch before every boss door', () => {
    // 마지막 교전은 보스 문보다 충분히 앞에서 끝나 재장전, 위치 재정비, 전장 전환을
    // 읽을 시간을 줘야 한다. 여기서는 화면 너비의 3분의 1을 최소값으로 사용하며,
    // 더 짧으면 마지막 적의 사격에서 곧바로 보스의 첫 공격으로 걸어 들어가는 느낌이 난다.
    const MINIMUM_BOSS_APPROACH = 400;

    for (const stage of STAGES) {
      const roomBeforeBoss = stage.rooms.at(-2)!;
      const lastSpawn = Math.max(
        ...roomBeforeBoss.enemySpawns.map(({ x }) => x),
      );

      expect(
        roomBeforeBoss.exitX - lastSpawn,
        `${stage.id}/${roomBeforeBoss.id} leaves too little room before its boss`,
      ).toBeGreaterThanOrEqual(MINIMUM_BOSS_APPROACH);
    }
  });

  it('keeps a flight stage inside the band the player can fly', () => {
    // 유일한 비행 스테이지에는 서 있을 바닥이나 측정할 점프가 없으므로,
    // 비행 컨트롤러가 플레이어를 제한하는 영역 자체가 지형이다. 이 영역 밖의 적이나
    // 순찰 중 밖으로 나가는 적은 플레이어를 쏠 수 있지만 반격할 수 없는 대상이 된다.
    const { minY, maxY } = PLAYER_FLIGHT_BOUNDS;
    const outOfReach: string[] = [];
    const bandUse: string[] = [];

    for (const stage of STAGES) {
      if (stage.movementMode !== MovementMode.FLIGHT) continue;

      for (const room of stage.rooms.filter(({ kind }) => kind === 'combat')) {
        const heights: number[] = [];

        for (const spawn of room.enemySpawns) {
          if (spawn.type === 'boss' || !('y' in spawn)) continue;
          heights.push(spawn.y);
          // 순찰 또는 궤도 이동은 시작점 양쪽으로 이만큼 움직인다.
          const swing =
            spawn.type === 'flying' ? (spawn.movement?.rangeY ?? 0) : 0;
          if (spawn.y - swing < minY || spawn.y + swing > maxY) {
            outOfReach.push(
              `${stage.id}/${room.id} y=${spawn.y}±${swing} — 비행 범위 ${minY}~${maxY} 밖`,
            );
          }
        }

        // 적이 중앙에 몰리면 천장과 바닥이 계속 머물 수 있는 안전 지대가 되어
        // 스테이지의 핵심 난도가 사라진다.
        const spread = Math.max(...heights) - Math.min(...heights);
        const share = spread / (maxY - minY);
        bandUse.push(
          `  ${stage.id}/${room.id} y ${Math.min(...heights)}~${Math.max(...heights)} — 비행 범위의 ${(share * 100).toFixed(0)}%`,
        );
        expect(
          share,
          `${room.id} uses only ${(share * 100).toFixed(0)}% of the flight band`,
        ).toBeGreaterThan(0.65);
      }
    }

    console.log(bandUse.join('\n'));

    if (outOfReach.length > 0) {
      console.log(`  사거리 밖 스폰\n    ${outOfReach.join('\n    ')}`);
    }

    expect(outOfReach).toEqual([]);
  });

  it('leaves a flight stage free of terrain', () => {
    // 단단한 지형에서 벗어나려면 점프가 필요하지만 비행 모드에는 점프가 없으므로,
    // 추적 적에게 구석으로 밀린 플레이어가 빠져나올 수 없게 된다.
    for (const stage of STAGES) {
      if (stage.movementMode !== MovementMode.FLIGHT) continue;

      for (const room of stage.rooms) {
        expect(room.terrain ?? [], `${room.id} has terrain`).toHaveLength(0);
        expect(room.pits ?? [], `${room.id} has pits`).toHaveLength(0);
      }
    }
  });

  it('does not spawn a ground enemy over a pit', () => {
    // 바닥이 없는 곳에 선 지상 적은 생성 즉시 방 밖으로 떨어진다. 육안 배치에서는
    // 만들기 쉽고 실제 플레이 전까지 드러나지 않는다. 적을 먼저 놓고 구덩이를 나중에
    // 추가해도 경고가 없어, 스테이지 3과 4 배치 중 세 곳에서 발생할 뻔했다.
    const floating: string[] = [];

    for (const { stage, room } of combatRooms()) {
      for (const spawn of room.enemySpawns) {
        if (spawn.type === 'flying' || spawn.type === 'boss') continue;
        for (const pit of room.pits ?? []) {
          if (spawn.x >= pit.x && spawn.x <= pit.x + pit.width) {
            floating.push(
              `${stage}/${room.id} ${spawn.type} x=${spawn.x} — 구덩이 ${pit.x}~${pit.x + pit.width}`,
            );
          }
        }
      }
    }

    if (floating.length > 0) {
      console.log(`  바닥 없는 곳의 스폰\n    ${floating.join('\n    ')}`);
    }

    expect(floating).toEqual([]);
  });

  it('does not bury a ground spawn inside terrain', () => {
    const buried: string[] = [];

    for (const { stage, room } of combatRooms()) {
      for (const spawn of room.enemySpawns) {
        // 천장 정비병처럼 파이프에서 y가 정해지는 적은 지상에 파묻힐 수 없다.
        if (spawn.type === 'boss' || !('y' in spawn)) continue;
        const inside = (room.terrain ?? []).some(
          (piece: TerrainPiece) =>
            spawn.x >= piece.x &&
            spawn.x <= piece.x + piece.width &&
            spawn.y >= piece.y &&
            spawn.y <= piece.y + piece.height,
        );
        if (inside) {
          buried.push(`${stage}/${room.id} ${spawn.type} (${spawn.x}, ${spawn.y})`);
        }
      }
    }

    if (buried.length > 0) {
      console.log(`  지형에 파묻힌 스폰\n    ${buried.join('\n    ')}`);
    }

    expect(buried).toEqual([]);
  });

  it('keeps every spawn inside its room', () => {
    const outside: string[] = [];

    for (const { stage, room } of combatRooms()) {
      for (const spawn of room.enemySpawns) {
        const y = 'y' in spawn ? spawn.y : 0;
        if (spawn.x < 0 || spawn.x > room.worldWidth || y > GAME_HEIGHT) {
          outside.push(`${stage}/${room.id} ${spawn.type} (${spawn.x}, ${y})`);
        }
      }
    }

    expect(outside).toEqual([]);
  });

  it('surveys how continuous each tier is', () => {
    for (const { stage, room } of combatRooms()) {
      const byTier = new Map<number, Surface[]>();
      for (const surface of surfacesOf(room)) {
        if (surface.label === 'floor') continue;
        byTier.set(surface.top, [...(byTier.get(surface.top) ?? []), surface]);
      }

      for (const [top, tier] of [...byTier].sort((a, b) => b[0] - a[0])) {
        const sorted = [...tier].sort((a, b) => a.left - b.left);
        const gaps = sorted
          .slice(1)
          .map((piece, index) => piece.left - sorted[index].right);
        const worst = gaps.length > 0 ? Math.max(...gaps) : 0;
        // 편안한 간격과 한계 간격 사이는 일반 점프로도 넘을 수 있다. 점프 궤적은
        // 280px이며 마지막 14px만 대시 없이는 닿지 않는다. 이 구간 전체를
        // '대시 필요'로 묶으면 일반 점프용으로 만든 스테이지 4의 230px 간격까지
        // 대시가 필요하다고 잘못 표시한다. 구덩이 검사와 같은 기준을 쓰도록
        // 대시 경계를 HARD_GAP으로 둔다.
        const verdict =
          worst === 0
            ? '연속'
            : worst <= SAFE_GAP
              ? '점프로 이어짐'
              : worst <= HARD_GAP
                ? '빠듯한 점프'
                : worst <= MAX_JUMP_DISTANCE + DASH_DISTANCE
                  ? '대시 필요'
                  : '끊김 (바닥으로 내려가야 함)';
        console.log(
          `  ${stage}/${room.id} y=${top}  조각 ${sorted.length}개  최대 간격 ${worst}px  → ${verdict}`,
        );
      }
    }

    expect(true).toBe(true);
  });
});
