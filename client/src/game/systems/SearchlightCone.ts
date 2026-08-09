import Phaser from 'phaser';
import { STAGE_TWO_BOSS_SEARCHLIGHT } from '@/game/config/bossAnimationConfig';

type Point = { x: number; y: number };

const SOURCE_WIDTH = 512;
const SOURCE_HEIGHT = 298;
const SOURCE_APEX_X = 30;
const SOURCE_APEX_Y = 176;
/** 바닥 스킨(-9) 뒤에 두어 지면 아래 불빛을 가림. */
const SEARCHLIGHT_DEPTH = -9.5;

/** 보스의 감시 불빛 스프라이트를 감지 부채꼴 크기와 각도에 맞춰 표시함. */
export class SearchlightCone {
  private readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.image = scene.add
      .image(0, 0, STAGE_TWO_BOSS_SEARCHLIGHT.texture)
      .setOrigin(SOURCE_APEX_X / SOURCE_WIDTH, SOURCE_APEX_Y / SOURCE_HEIGHT)
      .setDepth(SEARCHLIGHT_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
  }

  draw(
    apex: Point,
    centerAngle: number,
    halfAngle: number,
    range: number,
    intensity: number,
  ) {
    const displayWidth =
      (range * SOURCE_WIDTH) / (SOURCE_WIDTH - SOURCE_APEX_X);
    const displayHeight =
      (SOURCE_HEIGHT * range * Math.tan(halfAngle)) / SOURCE_APEX_Y;
    const flipY = Math.cos(centerAngle) < 0;
    const originY = flipY
      ? (SOURCE_HEIGHT - SOURCE_APEX_Y) / SOURCE_HEIGHT
      : SOURCE_APEX_Y / SOURCE_HEIGHT;

    this.image
      .setPosition(apex.x, apex.y)
      .setRotation(centerAngle)
      .setOrigin(SOURCE_APEX_X / SOURCE_WIDTH, originY)
      .setFlipY(flipY)
      .setDisplaySize(displayWidth, displayHeight)
      .setAlpha(0.12 + intensity * 0.34)
      .setVisible(true);
  }

  hide() {
    this.image.setVisible(false);
  }

  destroy() {
    this.image.destroy();
  }
}
