import { describe, expect, it } from 'vitest';
import {
  getInfernalBossDamage,
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
