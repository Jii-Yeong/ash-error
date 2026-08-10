// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { BOSS_COMBAT_CONFIGS } from '@/game/config/bossConfig';
import {
  RAIL_RIFLE_WEAPON_CONFIG,
  SMG_WEAPON_CONFIG,
} from '@/game/config/weaponConfig';
import { PurifierBossEnemy } from '@/game/entities/PurifierBossEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

function createPurifierBoss() {
  const config = BOSS_COMBAT_CONFIGS['underground-guardian'];
  return Object.assign(Object.create(PurifierBossEnemy.prototype), {
    active: true,
    health: config.maxHealth,
    maxHealth: config.maxHealth,
    config,
  }) as PurifierBossEnemy;
}

describe('PurifierBossEnemy', () => {
  it('레일건의 관통 다단 적중에만 장갑 피해 감소를 적용한다', () => {
    const smgTarget = createPurifierBoss();
    const railTarget = createPurifierBoss();
    const { pattern } = BOSS_COMBAT_CONFIGS['underground-guardian'];

    smgTarget.takeProjectileDamage(
      SMG_WEAPON_CONFIG.damage,
      0,
      0,
      SMG_WEAPON_CONFIG.id,
    );
    railTarget.takeProjectileDamage(
      RAIL_RIFLE_WEAPON_CONFIG.damage,
      0,
      0,
      RAIL_RIFLE_WEAPON_CONFIG.id,
    );

    expect(smgTarget.currentHealth).toBe(
      smgTarget.maxHealth - SMG_WEAPON_CONFIG.damage,
    );
    expect(railTarget.currentHealth).toBe(
      railTarget.maxHealth -
        RAIL_RIFLE_WEAPON_CONFIG.damage * pattern.railRifleDamageMultiplier,
    );
  });
});
