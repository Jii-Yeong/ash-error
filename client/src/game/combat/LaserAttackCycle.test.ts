import { describe, expect, it } from 'vitest';
import { LaserAttackCycle } from '@/game/combat/LaserAttackCycle';
import { BOSS_COMBAT_CONFIGS } from '@/game/config/bossConfig';

const pattern = BOSS_COMBAT_CONFIGS['city-warden'].pattern;

if (pattern.type !== 'laser-cannon') {
  throw new Error('City warden must use the laser cannon');
}

describe('LaserAttackCycle', () => {
  it('waits for the opening delay before charging', () => {
    const cycle = new LaserAttackCycle(pattern, 1000);

    expect(cycle.state).toBe('repositioning');
    expect(cycle.isComplete(1799)).toBe(false);
    expect(cycle.isComplete(1800)).toBe(true);
  });

  it('locks aim before firing and returns to recovery after one normal shot', () => {
    const cycle = new LaserAttackCycle(pattern, 0);

    cycle.beginVolley(800, false);
    expect(cycle.state).toBe('charging');
    expect(cycle.shouldTrackAim(1399)).toBe(true);
    expect(cycle.shouldTrackAim(1400)).toBe(false);
    expect(cycle.isComplete(1700)).toBe(true);

    cycle.beginFiring(1700);
    expect(cycle.state).toBe('firing');
    expect(cycle.finishFiring(1920, false)).toBe(false);
    expect(cycle.state).toBe('repositioning');
    expect(cycle.isComplete(3169)).toBe(false);
    expect(cycle.isComplete(3170)).toBe(true);
  });

  it('starts a shorter follow-up charge for the enraged second shot', () => {
    const cycle = new LaserAttackCycle(pattern, 0);

    cycle.beginVolley(800, true);
    cycle.beginFiring(1500);

    expect(cycle.finishFiring(1720, true)).toBe(true);
    expect(cycle.state).toBe('charging');
    expect(cycle.shouldTrackAim(2019)).toBe(true);
    expect(cycle.shouldTrackAim(2020)).toBe(false);
    expect(cycle.isComplete(2220)).toBe(true);
  });

  it('플레이어 접근으로 차징을 취소하면 회복 상태로 돌아간다', () => {
    const cycle = new LaserAttackCycle(pattern, 0);

    cycle.beginVolley(800, false);
    cycle.cancelCharge(1000, false);

    expect(cycle.state).toBe('repositioning');
    expect(cycle.isComplete(2249)).toBe(false);
    expect(cycle.isComplete(2250)).toBe(true);
  });
});
