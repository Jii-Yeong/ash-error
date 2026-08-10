import { describe, expect, it } from 'vitest';
import { getRailArmoredDamage } from '@/game/combat/bossDamage';

describe('getRailArmoredDamage', () => {
  it('기본 총 피해는 유지하고 레일건에만 장갑 배율을 적용한다', () => {
    expect(getRailArmoredDamage(11, 0.49, 'smg')).toBe(11);
    expect(getRailArmoredDamage(75, 0.49, 'rail-rifle')).toBe(36.75);
  });

  it('무기 정보가 없는 피해는 그대로 유지한다', () => {
    expect(getRailArmoredDamage(75, 0.49)).toBe(75);
  });
});
