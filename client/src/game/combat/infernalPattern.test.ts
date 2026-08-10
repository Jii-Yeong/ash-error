import { describe, expect, it } from 'vitest';
import {
  getInfernalBossDamage,
  getInfernalProjectileDamage,
  getShardPatternLayout,
} from '@/game/combat/infernalPattern';

describe('getShardPatternLayout', () => {
  it('leaves exactly one of four lanes safe', () => {
    const layout = getShardPatternLayout({
      arenaLeft: 100,
      arenaRight: 2100,
      playerX: 300,
    });

    expect(layout.safeLaneIndex).toBe(1);
    expect(layout.hazardXPositions).toEqual([350, 1350, 1850]);
  });

  it('keeps the safe lane adjacent to a player on the right', () => {
    const layout = getShardPatternLayout({
      arenaLeft: 100,
      arenaRight: 2100,
      playerX: 1900,
    });

    expect(layout.safeLaneIndex).toBe(2);
    expect(layout.hazardXPositions).not.toContain(1350);
  });

  it('clamps a player outside the arena before selecting safety', () => {
    const layout = getShardPatternLayout({
      arenaLeft: 100,
      arenaRight: 2100,
      playerX: -500,
    });

    expect(layout.safeLaneIndex).toBe(1);
    expect(layout.hazardXPositions).toHaveLength(3);
  });
});

describe('getInfernalBossDamage', () => {
  it('amplifies damage while the staggered core is exposed', () => {
    expect(getInfernalBossDamage(75, 1.5, true)).toBe(113);
  });

  it('keeps normal damage outside the punish window', () => {
    expect(getInfernalBossDamage(75, 1.5, false)).toBe(75);
  });
});

describe('getInfernalProjectileDamage', () => {
  it('기본 총 피해는 유지하고 레일건에만 장갑 배율을 적용한다', () => {
    expect(getInfernalProjectileDamage(11, 0.49, 'smg')).toBe(11);
    expect(getInfernalProjectileDamage(75, 0.49, 'rail-rifle')).toBe(36.75);
  });

  it('무기 정보가 없는 피해는 그대로 유지한다', () => {
    expect(getInfernalProjectileDamage(75, 0.49)).toBe(75);
  });
});
