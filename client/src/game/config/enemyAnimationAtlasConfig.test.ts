import { describe, expect, it } from 'vitest';
import { FLYING_ENEMY_ANIMATION_ATLASES } from '@/game/config/flyingEnemyAnimationConfig';
import {
  MELEE_ENEMY_ANIMATION_ATLASES,
  STAGE_ONE_MELEE_SPRITE,
  STAGE_TWO_MELEE_SPRITE,
} from '@/game/config/meleeEnemyAnimationConfig';
import {
  RANGED_ENEMY_ANIMATION_ATLASES,
  STAGE_ONE_RANGED_SPRITE,
  STAGE_TWO_RANGED_SPRITE,
} from '@/game/config/rangedEnemyAnimationConfig';

const atlases = [
  ...FLYING_ENEMY_ANIMATION_ATLASES,
  ...RANGED_ENEMY_ANIMATION_ATLASES,
  ...MELEE_ENEMY_ANIMATION_ATLASES,
];

describe('enemy animation atlases', () => {
  it('derives stage-specific texture and animation keys from each slug', () => {
    expect(atlases.map(({ texture }) => texture)).toEqual([
      'stage-1-flying',
      'stage-2-flying',
      'stage-1-ranged',
      'stage-2-ranged',
      'stage-1-neared',
      'stage-2-neared',
    ]);

    for (const atlas of atlases) {
      for (const [tag, animation] of Object.entries(atlas.animations)) {
        const suffix = tag.replace(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`,
        );
        expect(animation).toBe(`${atlas.texture}-${suffix}`);
      }
    }
  });

  it('shares frame and looping specs between stages of the same enemy type', () => {
    for (const [stageOne, stageTwo] of [
      FLYING_ENEMY_ANIMATION_ATLASES,
      RANGED_ENEMY_ANIMATION_ATLASES,
      MELEE_ENEMY_ANIMATION_ATLASES,
    ]) {
      expect(stageTwo.tagFrames).toBe(stageOne.tagFrames);
      expect(stageTwo.loopingTags).toBe(stageOne.loopingTags);
    }
  });

  it('uses unique texture and animation keys', () => {
    const textureKeys = atlases.map(({ texture }) => texture);
    const animationKeys = atlases.flatMap(({ animations }) =>
      Object.values(animations),
    );

    expect(new Set(textureKeys).size).toBe(textureKeys.length);
    expect(new Set(animationKeys).size).toBe(animationKeys.length);
  });

  it('sizes stage one and two melee enemies three pixels above ranged enemies', () => {
    for (const [melee, ranged] of [
      [STAGE_ONE_MELEE_SPRITE, STAGE_ONE_RANGED_SPRITE],
      [STAGE_TWO_MELEE_SPRITE, STAGE_TWO_RANGED_SPRITE],
    ]) {
      expect(melee.scale * 122 - ranged.scale * 101).toBeCloseTo(3);
    }
  });

  for (const atlas of atlases) {
    it(`pairs asset paths and tagged frames for ${atlas.texture}`, () => {
      expect(atlas.png).toBe(`/assets/enemies/${atlas.texture}.png`);
      expect(atlas.json).toBe(`/assets/enemies/${atlas.texture}.json`);

      const frames = Object.values(atlas.tagFrames).flat();
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every(({ frame }) => /^\d+$/.test(frame))).toBe(true);
      expect(frames.every(({ duration }) => duration > 0)).toBe(true);
    });
  }
});
