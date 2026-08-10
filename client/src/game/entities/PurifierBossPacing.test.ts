import { describe, expect, it } from 'vitest';
import { getSlamLeapVelocity } from '@/game/combat/slamLeap';
import { BOSS_COMBAT_CONFIGS } from '@/game/config/bossConfig';
import {
  getWeaponSustainedDamagePerSecond,
  RAIL_RIFLE_WEAPON_CONFIG,
  SMG_WEAPON_CONFIG,
  type WeaponConfig,
} from '@/game/config/weaponConfig';

function countIdealSlams(weapon: WeaponConfig, damageMultiplier = 1) {
  const boss = BOSS_COMBAT_CONFIGS['underground-guardian'];
  const { pattern } = boss;
  const defeatAt =
    (boss.maxHealth /
      (getWeaponSustainedDamagePerSecond(weapon) *
        (weapon.pierce + 1) *
        damageMultiplier)) *
    1000;
  const flightDuration = getSlamLeapVelocity({
    originX: 0,
    targetX: 0,
    launchSpeedY: pattern.slam.launchSpeedY,
    gravityY: 1200,
    maxTravelSpeedX: pattern.slam.maxTravelSpeedX,
  }).flightDurationMs;
  let time = pattern.firstAttackDelay;
  let slamCount = 0;
  let nextPattern: 'slam' | 'vacuum' = 'slam';

  while (time < defeatAt) {
    if (nextPattern === 'slam') {
      time += pattern.slam.warnDuration + flightDuration;
      if (time >= defeatAt) {
        break;
      }
      slamCount += 1;
      time += pattern.slam.strikeDuration;
      nextPattern = 'vacuum';
    } else {
      time += pattern.vacuum.warnDuration + pattern.vacuum.duration;
      nextPattern = 'slam';
    }

    const enraged = time >= defeatAt * (1 - pattern.enrageHealthRatio);
    time += enraged
      ? pattern.enragedRecoveryDuration
      : pattern.recoveryDuration;
  }

  return slamCount;
}

describe('PurifierBossEnemy pacing', () => {
  it('기본 총과 레일건에서 내려찍기를 각각 12번과 10번 노출한다', () => {
    const { pattern } = BOSS_COMBAT_CONFIGS['underground-guardian'];

    expect(countIdealSlams(SMG_WEAPON_CONFIG)).toBe(12);
    expect(
      countIdealSlams(
        RAIL_RIFLE_WEAPON_CONFIG,
        pattern.railRifleDamageMultiplier,
      ),
    ).toBe(10);
  });
});
