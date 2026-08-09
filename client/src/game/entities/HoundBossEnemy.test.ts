// @vitest-environment jsdom

import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoundBossEnemy } from '@/game/entities/HoundBossEnemy';
import { gameEvents } from '@/game/events/gameEvents';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

/**
 * 스캔음 수명만 보는 테스트라 전투에 필요한 최소 필드만 채운다.
 * `sprite`를 비워 두면 애니메이션 경로가 그대로 통과한다.
 */
function createHoundBoss(overrides: Record<string, unknown> = {}) {
  return Object.assign(Object.create(HoundBossEnemy.prototype), {
    active: true,
    dying: false,
    x: 0,
    y: 0,
    flipX: false,
    aggroRadius: 500,
    attackState: 'scanning',
    scanAudioActive: true,
    sprite: undefined,
    health: 800,
    maxHealth: 800,
    cone: { hide: vi.fn(), draw: vi.fn() },
    setVelocityX: vi.fn(),
    setFlipX: vi.fn(),
    isStaggered: () => false,
    config: {
      pattern: {
        enrageHealthRatio: 0.5,
        moveSpeed: 90,
        enragedMoveSpeed: 120,
        preferredDistance: 360,
        distanceTolerance: 90,
        cone: {
          color: 0xff0000,
          range: 900,
          halfAngleDegrees: 20,
          tiltDegrees: 10,
          apexOffsetY: -20,
        },
        // 콘은 항상 대상을 향하므로 사거리 안이면 곧바로 locking으로 넘어간다.
        orb: { lockDuration: 900, enragedLockDuration: 700 },
      },
    },
    ...overrides,
  }) as HoundBossEnemy;
}

const target = (x: number) =>
  ({ x, y: 0 }) as unknown as Phaser.Physics.Arcade.Sprite;

const fireProjectile = vi.fn();

describe('HoundBossEnemy scan audio', () => {
  const cues: string[] = [];
  const record = (cue: string) => cues.push(cue);

  gameEvents.on('boss-scan-cue', record);

  afterEach(() => {
    cues.length = 0;
  });

  /**
   * 스캔음은 루프다. 어그로 밖으로 나가면 콘은 사라지는데 소리를 닫지 않으면
   * 화면에는 아무것도 없이 스캔 험만 계속 돈다. 보스가 살아 있는 상태라
   * AudioDirector의 일괄 정지(사망·일시정지·스테이지 전환)로는 걸리지 않는다.
   */
  it('ends the scan when the player leaves aggro range', () => {
    const boss = createHoundBoss();

    boss.updateCombat(0, target(9_000), fireProjectile);

    expect(cues).toEqual(['end']);
  });

  it('ends the scan when the boss stops being active', () => {
    const boss = createHoundBoss({ active: false });

    boss.updateCombat(0, target(0), fireProjectile);

    expect(cues).toEqual(['end']);
  });

  it('does not re-emit the end cue on every frame out of range', () => {
    const boss = createHoundBoss();

    boss.updateCombat(0, target(9_000), fireProjectile);
    boss.updateCombat(16, target(9_000), fireProjectile);
    boss.updateCombat(32, target(9_000), fireProjectile);

    expect(cues).toEqual(['end']);
  });

  /**
   * 스캔음이 전이 시점에만 켜졌다면, 나갔다 돌아왔을 때 콘은 도는데 소리는
   * 없는 사이클이 하나 생긴다. 상태를 따라가므로 복귀 즉시 다시 켜진다.
   */
  it('restarts the scan when the player comes back into range', () => {
    const boss = createHoundBoss();

    boss.updateCombat(0, target(9_000), fireProjectile);
    boss.updateCombat(16, target(10), fireProjectile);

    // 콘은 대상을 향해 조준되므로 사거리 안이면 같은 프레임에 락온까지 간다.
    // 여기서 보는 것은 스캔음이 다시 켜졌다는 것이다.
    expect(cues.slice(0, 2)).toEqual(['end', 'start']);
  });
});
