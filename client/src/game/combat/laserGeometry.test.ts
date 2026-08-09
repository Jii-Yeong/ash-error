import { describe, expect, it } from 'vitest';
import {
  getLaserAim,
  getLaserMuzzlePosition,
  isPointInsideLaser,
} from '@/game/combat/laserGeometry';

const start = { x: 100, y: 200 };

/** Matches `city-warden` in bossConfig. */
const MUZZLE_OFFSET = 64;
const MUZZLE_OFFSET_Y = 10;
const BEAM_RANGE = 1700;
const BEAM_WIDTH = 30;

describe('isPointInsideLaser', () => {
  it('hits a target along the active beam', () => {
    expect(
      isPointInsideLaser(start, 0, 600, 30, { x: 500, y: 210 }, 8),
    ).toBe(true);
  });

  it('leaves room to dodge outside the beam width', () => {
    expect(
      isPointInsideLaser(start, 0, 600, 30, { x: 500, y: 240 }, 8),
    ).toBe(false);
  });

  it('does not hit beyond the configured range', () => {
    expect(
      isPointInsideLaser(start, 0, 600, 30, { x: 750, y: 200 }, 8),
    ).toBe(false);
  });
});

describe('getLaserMuzzlePosition', () => {
  it('keeps the muzzle height fixed when the boss changes direction', () => {
    expect(getLaserMuzzlePosition(start, false, 64, 10)).toEqual({
      x: 164,
      y: 210,
    });
    expect(getLaserMuzzlePosition(start, true, 64, 10)).toEqual({
      x: 36,
      y: 210,
    });
  });
});

describe('getLaserAim', () => {
  /**
   * The distances that matter are the ones inside the muzzle offset: there the
   * target sits between the body centre and the muzzle, which is what used to
   * put the muzzle and the aim on opposite sides of the boss and fire the beam
   * away from the player.
   */
  const distances = [4, 12, 20, 40, 63, 64, 65, 90, 200, 800, 1600];

  it('points the beam at the target from either side, at any distance', () => {
    for (const distance of distances) {
      for (const side of [-1, 1]) {
        for (const dy of [-120, 0, 90]) {
          const target = { x: start.x + side * distance, y: start.y + dy };
          const aim = getLaserAim(
            start,
            target,
            MUZZLE_OFFSET,
            MUZZLE_OFFSET_Y,
          );

          expect(
            isPointInsideLaser(
              aim.muzzle,
              aim.angle,
              BEAM_RANGE,
              BEAM_WIDTH,
              target,
              8,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it('faces the side the target is on, not the side the angle points', () => {
    // Point blank on the left: the muzzle lands past the target, so the angle
    // measured from it points right. Facing must still follow the target.
    const aim = getLaserAim(
      start,
      { x: start.x - 20, y: start.y },
      MUZZLE_OFFSET,
      MUZZLE_OFFSET_Y,
    );

    expect(aim.facingLeft).toBe(true);
    expect(Math.cos(aim.angle)).toBeGreaterThan(0);
    expect(aim.muzzle.x).toBe(start.x - MUZZLE_OFFSET);
  });

  it('agrees with the muzzle the boss renders from', () => {
    const target = { x: start.x - 500, y: start.y };
    const aim = getLaserAim(start, target, MUZZLE_OFFSET, MUZZLE_OFFSET_Y);

    expect(aim.muzzle).toEqual(
      getLaserMuzzlePosition(
        start,
        aim.facingLeft,
        MUZZLE_OFFSET,
        MUZZLE_OFFSET_Y,
      ),
    );
  });
});
