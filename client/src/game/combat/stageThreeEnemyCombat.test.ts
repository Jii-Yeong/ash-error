import { describe, expect, it } from 'vitest';
import {
  canDamageCeilingMaintainer,
  getCapturePullSpeed,
  getExposedFaceBounds,
  getTetheredVelocityX,
  isBlockerShieldSideHit,
  isExposedFaceHit,
} from '@/game/combat/stageThreeEnemyCombat';
import { BLOCKER_CONFIG } from '@/game/config/stageThreeEnemyConfig';
import { CEILING_MAINTAINER_ANIMATION_ATLASES } from '@/game/config/ceilingMaintainerAnimationConfig';

describe('stage three enemy combat geometry', () => {
  it('keeps the dash pose out of the falling animation', () => {
    const [atlas] = CEILING_MAINTAINER_ANIMATION_ATLASES;

    expect(atlas.tagFrames.falling.map(({ frame }) => frame)).toEqual(['6']);
    expect(atlas.tagFrames.groundDash.map(({ frame }) => frame)).toEqual([
      '10',
    ]);
    expect(atlas.tagFrames.floorIdle.map(({ frame }) => frame)).toEqual([
      '7',
      '8',
      '9',
    ]);
  });

  it('exposes exactly fifteen percent of the blocker body as its face', () => {
    const bounds = getExposedFaceBounds({
      enemyX: 500,
      bodyTop: 548,
      bodyWidth: BLOCKER_CONFIG.bodyWidth,
      bodyHeight: BLOCKER_CONFIG.bodyHeight,
      widthRatio: BLOCKER_CONFIG.faceWidthRatio,
      heightRatio: BLOCKER_CONFIG.faceHeightRatio,
    });
    const faceArea =
      (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
    const bodyArea = BLOCKER_CONFIG.bodyWidth * BLOCKER_CONFIG.bodyHeight;

    expect(faceArea / bodyArea).toBeCloseTo(0.15);
    expect(isExposedFaceHit(bounds, 500, 548)).toBe(true);
    expect(isExposedFaceHit(bounds, 500, 600)).toBe(false);
    expect(isExposedFaceHit(bounds, 549, 548)).toBe(false);
    expect(isExposedFaceHit(bounds, 549, 548, 8)).toBe(true);
  });

  it('blocks body shots only on the side facing the shield', () => {
    expect(isBlockerShieldSideHit(500, true, 540)).toBe(true);
    expect(isBlockerShieldSideHit(500, true, 460)).toBe(false);
    expect(isBlockerShieldSideHit(500, false, 460)).toBe(true);
    expect(isBlockerShieldSideHit(500, false, 540)).toBe(false);
  });

  it('ignores projectile damage only while the maintainer is falling', () => {
    expect(canDamageCeilingMaintainer('falling')).toBe(false);
    expect(canDamageCeilingMaintainer('crawl')).toBe(true);
    expect(canDamageCeilingMaintainer('ground-dash')).toBe(true);
    expect(canDamageCeilingMaintainer('floor-idle')).toBe(true);
  });

  it('pulls the player to the captor within one second', () => {
    expect(getCapturePullSpeed(430, 1000, 240)).toBe(430);
    expect(getCapturePullSpeed(100, 1000, 240)).toBe(240);
    expect(getCapturePullSpeed(215, 500, 240)).toBe(430);
  });

  it('slows movement while adding a steady pull toward the captor', () => {
    expect(getTetheredVelocityX(300, 500, -300, 0.42, 95)).toBe(-31);
    expect(getTetheredVelocityX(700, 500, 300, 0.42, 95)).toBe(31);
  });
});
