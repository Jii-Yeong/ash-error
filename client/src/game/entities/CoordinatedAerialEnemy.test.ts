// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CELESTIAL_ORACLE_CONFIG,
  CHOIR_SUPPORTER_CONFIG,
  SANCTUM_ENFORCER_CONFIG,
} from '@/game/config/stageFiveEnemyConfig';
import { CelestialOracleEnemy } from '@/game/entities/CelestialOracleEnemy';
import { ChoirSupporterEnemy } from '@/game/entities/ChoirSupporterEnemy';
import type { Enemy } from '@/game/entities/Enemy';
import { SanctumEnforcerEnemy } from '@/game/entities/SanctumEnforcerEnemy';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

const AERIAL_ENEMIES = [
  ['choir supporter', ChoirSupporterEnemy.prototype, CHOIR_SUPPORTER_CONFIG],
  ['sanctum enforcer', SanctumEnforcerEnemy.prototype, SANCTUM_ENFORCER_CONFIG],
  ['celestial oracle', CelestialOracleEnemy.prototype, CELESTIAL_ORACLE_CONFIG],
] as const;

describe('CoordinatedAerialEnemy death', () => {
  it.each(AERIAL_ENEMIES)(
    '%s waits for its full death animation',
    (_name, prototype, spriteConfig) => {
      const enemy = Object.create(prototype) as Enemy;
      Object.defineProperties(enemy, {
        y: { value: 240 },
        displayHeight: { value: 100 },
        spriteConfig: { value: spriteConfig },
        scene: {
          value: {
            anims: {
              exists: () => true,
              get: () => ({ duration: 180 }),
            },
          },
        },
      });

      expect(enemy.deathAnimationDuration).toBeGreaterThan(1_000);
    },
  );
});
