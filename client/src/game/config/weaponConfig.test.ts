import { describe, expect, it } from 'vitest';
import {
  SFX_CONFIG,
  WEAPON_FIRE_SFX,
  type SfxKey,
} from '@/game/config/audioConfig';
import {
  BOSS_COMBAT_CONFIGS,
  type BossVariant,
} from '@/game/config/bossConfig';
import {
  getWeaponSustainedDamagePerSecond,
  WEAPON_CONFIGS,
} from '@/game/config/weaponConfig';

describe('weapon progression', () => {
  it('offers exactly four distinct firearms', () => {
    expect(WEAPON_CONFIGS).toHaveLength(4);
    expect(new Set(WEAPON_CONFIGS.map(({ id }) => id)).size).toBe(4);
  });

  it('keeps every weapon within the same viable sustained-damage band', () => {
    for (const weapon of WEAPON_CONFIGS) {
      expect(
        getWeaponSustainedDamagePerSecond(weapon),
      ).toBeGreaterThanOrEqual(95);
      expect(
        getWeaponSustainedDamagePerSecond(weapon),
      ).toBeLessThanOrEqual(105);
    }
  });

  it('gives every weapon a round of its own', () => {
    // Four weapons shared three textures before this, with the SMG and the
    // burst rifle firing identical amber slugs — the player had no way to read
    // which weapon was putting rounds downrange.
    expect(new Set(WEAPON_CONFIGS.map(({ texture }) => texture)).size).toBe(4);
    expect(
      new Set(WEAPON_CONFIGS.map(({ projectile }) => projectile.color)).size,
    ).toBe(4);
  });

  it('fires from the barrel rather than from the grip', () => {
    for (const weapon of WEAPON_CONFIGS) {
      // The sprite's origin is the grip, so a weapon with no rise spawns its
      // rounds inside the shooter's fist.
      expect(weapon.muzzleRise).toBeGreaterThan(0);
      // Nothing reaches past the longest sprite, which is 60px of art on a
      // 72px canvas placed 18px behind the origin.
      expect(weapon.muzzleOffset).toBeLessThanOrEqual(54);
    }
  });

  it('lets climb stack no further than the weapon allows', () => {
    for (const { feedback } of WEAPON_CONFIGS) {
      // A ceiling under the per-shot kick would clamp the first round and make
      // the weapon feel weaker the harder it hits.
      expect(feedback.recoilClimbMax).toBeGreaterThanOrEqual(
        feedback.recoilClimb,
      );
      // A quarter turn. Past that the barrel is no longer pointing downrange.
      expect(feedback.recoilClimbMax).toBeLessThan(Math.PI / 2);
    }
  });

  it('gives every weapon a fire sound', () => {
    // The burst and rail rifles shipped silent: they were wired to sprites and
    // rounds but never added to the sfx table, and nothing failed to say so.
    for (const weapon of WEAPON_CONFIGS) {
      const cue = WEAPON_FIRE_SFX[weapon.id];
      expect(cue, `${weapon.id} has no fire cue`).toBeDefined();
      expect(SFX_CONFIG[cue as SfxKey]).toBeDefined();
    }
  });

  it('keeps each stage boss within its target ideal clear time', () => {
    const slowestWeaponDamage = Math.min(
      ...WEAPON_CONFIGS.map(getWeaponSustainedDamagePerSecond),
    );
    const targetClearSeconds = {
      'city-warden': 13,
      'alley-hunter': 30,
      'underground-guardian': 88,
      'infernal-executioner': 37,
      'returning-architect': 164,
    } satisfies Record<BossVariant, number>;

    Object.entries(BOSS_COMBAT_CONFIGS).forEach(([variant, boss]) => {
      expect(boss.maxHealth / slowestWeaponDamage).toBeLessThanOrEqual(
        targetClearSeconds[variant as BossVariant],
      );
    });
  });
});
