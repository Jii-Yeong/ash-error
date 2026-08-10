import { describe, expect, it } from 'vitest';
import { getRailArmoredDamage } from '@/game/combat/bossDamage';
import {
  getInfernalBossDamage,
  INFERNAL_PHASE_ONE_SEQUENCE,
  INFERNAL_PHASE_TWO_SEQUENCE,
  type InfernalAttack,
} from '@/game/combat/infernalPattern';
import { BOSS_COMBAT_CONFIGS } from '@/game/config/bossConfig';
import type { InfernalBossPatternConfig } from '@/game/config/bossConfigTypes';
import {
  RAIL_RIFLE_WEAPON_CONFIG,
  SMG_WEAPON_CONFIG,
  type WeaponConfig,
} from '@/game/config/weaponConfig';

type DamageWindow = {
  duration: number;
  startsPattern?: boolean;
  vulnerable: boolean;
  coreExposed?: boolean;
};

const attackWindows = (
  attack: InfernalAttack,
  pattern: InfernalBossPatternConfig,
): DamageWindow[] => {
  switch (attack) {
    case 'rupture':
      return [
        {
          duration:
            pattern.rupture.warnDuration +
            pattern.rupture.markerInterval * (pattern.rupture.count - 1) +
            pattern.rupture.activeDuration,
          startsPattern: true,
          vulnerable: true,
        },
      ];
    case 'charge':
      return [
        {
          duration: pattern.charge.warnDuration + pattern.charge.duration,
          startsPattern: true,
          vulnerable: true,
        },
        {
          duration: pattern.charge.staggerDuration,
          vulnerable: true,
          coreExposed: true,
        },
      ];
    case 'shards':
      return [
        {
          duration:
            pattern.shards.warnDuration + pattern.shards.followUpDelay,
          startsPattern: true,
          vulnerable: false,
        },
      ];
  }
};

/** 실제 상태 머신과 같은 공격·회복 창을 순서대로 생성함. */
function* damageWindows(
  phase: 1 | 2,
  pattern: InfernalBossPatternConfig,
): Generator<DamageWindow> {
  if (phase === 1) {
    yield { duration: pattern.firstAttackDelay, vulnerable: true };
  } else {
    yield { duration: pattern.phaseTransitionDuration, vulnerable: false };
  }

  const sequence =
    phase === 1
      ? INFERNAL_PHASE_ONE_SEQUENCE
      : INFERNAL_PHASE_TWO_SEQUENCE;
  const recoveryDuration =
    phase === 1
      ? pattern.recoveryDuration
      : pattern.enragedRecoveryDuration;

  while (true) {
    for (const attack of sequence) {
      yield* attackWindows(attack, pattern);
      yield { duration: recoveryDuration, vulnerable: true };
    }
  }
}

/** 방어력 적용 후 지속 사격했을 때 처치 전 시작한 공격 패턴 수를 계산함. */
const countPatternsUntilPhaseEnd = (
  phase: 1 | 2,
  weapon: WeaponConfig,
) => {
  const boss = BOSS_COMBAT_CONFIGS['infernal-executioner'];
  const pattern = boss.pattern;
  if (pattern.type !== 'infernal') {
    throw new Error('Infernal executioner must use the infernal pattern');
  }

  let remainingHealth =
    boss.maxHealth *
    (phase === 1
      ? 1 - pattern.enrageHealthRatio
      : pattern.enrageHealthRatio);
  let elapsed = 0;
  let nextShotAt = 0;
  let patternCount = 0;

  for (const window of damageWindows(phase, pattern)) {
    if (window.startsPattern) {
      patternCount += 1;
    }
    const windowEndsAt = elapsed + window.duration;

    while (nextShotAt < windowEndsAt) {
      if (window.vulnerable) {
        const damagePerHit = getInfernalBossDamage(
          getRailArmoredDamage(
            weapon.damage,
            pattern.railRifleDamageMultiplier,
            weapon.id,
          ),
          pattern.charge.coreDamageMultiplier,
          Boolean(window.coreExposed),
        );
        remainingHealth -= damagePerHit * (weapon.pierce + 1);
        if (remainingHealth <= 0) {
          return patternCount;
        }
      }
      nextShotAt += weapon.fireInterval;
    }

    elapsed = windowEndsAt;
  }

  throw new Error('Infernal boss pacing simulation did not finish');
};

describe('infernal boss phase pacing', () => {
  it('1페이즈에서 기본 총 6회, 레일건 4회의 패턴을 노출한다', () => {
    expect(countPatternsUntilPhaseEnd(1, SMG_WEAPON_CONFIG)).toBe(6);
    expect(countPatternsUntilPhaseEnd(1, RAIL_RIFLE_WEAPON_CONFIG)).toBe(4);
  });

  it('2페이즈에서 기본 총 9회, 레일건 6회의 패턴을 노출한다', () => {
    expect(countPatternsUntilPhaseEnd(2, SMG_WEAPON_CONFIG)).toBe(9);
    expect(countPatternsUntilPhaseEnd(2, RAIL_RIFLE_WEAPON_CONFIG)).toBe(6);
  });
});
