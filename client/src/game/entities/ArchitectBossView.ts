import Phaser from 'phaser';
import {
  STAGE_FIVE_BOSS_EYE_LOCK_SIGIL,
  STAGE_FIVE_BOSS_WING_FAN_WARNING,
} from '@/game/config/bossAnimationConfig';
import type { ArchitectBossPatternConfig } from '@/game/config/bossConfigTypes';

const EFFECT_DEPTH = 7;
const UI_EFFECT_DEPTH = 24;
const WING_WARNING_WIDTH = 220;
const WING_WARNING_HEIGHT = 300;

/** Owns all temporary and persistent visuals for the stage-5 final boss. */
export class ArchitectBossView {
  private readonly telegraph: Phaser.GameObjects.Graphics;
  private readonly phaseOverlay: Phaser.GameObjects.Graphics;
  private readonly eyeLockSigil: Phaser.GameObjects.Image;
  private readonly leftWingWarning: Phaser.GameObjects.Image;
  private readonly rightWingWarning: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly pattern: ArchitectBossPatternConfig,
  ) {
    this.telegraph = scene.add.graphics().setDepth(EFFECT_DEPTH);
    this.eyeLockSigil = scene.add
      .image(0, 0, STAGE_FIVE_BOSS_EYE_LOCK_SIGIL.texture)
      .setDepth(EFFECT_DEPTH + 1)
      .setVisible(false);
    this.leftWingWarning = scene.add
      .image(0, 0, STAGE_FIVE_BOSS_WING_FAN_WARNING.texture)
      .setOrigin(0.75, 0.5)
      .setDepth(EFFECT_DEPTH)
      .setVisible(false);
    this.rightWingWarning = scene.add
      .image(0, 0, STAGE_FIVE_BOSS_WING_FAN_WARNING.texture)
      .setOrigin(0.25, 0.5)
      .setFlipX(true)
      .setDepth(EFFECT_DEPTH)
      .setVisible(false);
    this.phaseOverlay = scene.add
      .graphics()
      .setDepth(UI_EFFECT_DEPTH)
      .setScrollFactor(0);
  }

  clearTelegraph() {
    this.telegraph.clear();
    this.eyeLockSigil.setVisible(false);
    this.leftWingWarning.setVisible(false);
    this.rightWingWarning.setVisible(false);
  }

  drawPhaseTransition(time: number) {
    const pulse = 0.4 + Math.sin(time * 0.025) * 0.22;
    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;
    this.phaseOverlay
      .clear()
      .fillStyle(this.pattern.corruptionColor, 0.08)
      .fillRect(0, 0, width, height)
      .lineStyle(3, this.pattern.skyColor, pulse)
      .lineBetween(0, height * 0.28, width * 0.34, height * 0.48)
      .lineBetween(width * 0.34, height * 0.48, width * 0.22, height * 0.82)
      .lineBetween(width, height * 0.22, width * 0.66, height * 0.46)
      .lineBetween(width * 0.66, height * 0.46, width * 0.78, height * 0.86);
  }

  endPhaseTransition() {
    this.phaseOverlay.clear();
  }

  drawWingWarning(x: number, y: number, time: number, step: number) {
    const pulse = 0.55 + Math.sin(time * 0.025) * 0.18;
    if (step === 0 || step === 2) {
      this.leftWingWarning
        .setPosition(x - 40, y - 20)
        .setDisplaySize(WING_WARNING_WIDTH, WING_WARNING_HEIGHT)
        .setAlpha(pulse)
        .setVisible(true);
    }
    if (step === 1 || step === 2) {
      this.rightWingWarning
        .setPosition(x + 40, y - 20)
        .setDisplaySize(WING_WARNING_WIDTH, WING_WARNING_HEIGHT)
        .setAlpha(pulse)
        .setVisible(true);
    }
  }

  drawEyeTracking(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    time: number,
    progress: number,
  ) {
    const pulse = 0.55 + Math.sin(time * 0.03) * 0.2;
    const radius = 46 - progress * 18;
    this.eyeLockSigil
      .setPosition(targetX, targetY)
      .setDisplaySize(radius * 2, radius * 2)
      .setAlpha(pulse)
      .setVisible(true);
    this.telegraph
      .lineStyle(1, 0xffffff, 0.65)
      .lineBetween(sourceX, sourceY, targetX, targetY);
  }

  drawEyeLocked(targetX: number, targetY: number, time: number) {
    const pulse = 0.65 + Math.sin(time * 0.045) * 0.25;
    const radius = this.pattern.eye.orbRadius;
    this.eyeLockSigil
      .setPosition(targetX, targetY)
      .setDisplaySize(radius * 2, radius * 2)
      .setAlpha(pulse)
      .setVisible(true);
  }

  beginSalvation() {
    this.telegraph.clear();
  }

  drawSalvationTransition(
    progress: number,
    centerX: number,
    centerY: number,
  ) {
    this.phaseOverlay
      .clear()
      .fillStyle(this.pattern.goldColor, progress * 0.32)
      .fillRect(
        0,
        0,
        this.scene.cameras.main.width,
        this.scene.cameras.main.height,
      );
    const radius = 70 + progress * 170;
    this.telegraph
      .lineStyle(5, this.pattern.goldColor, 0.8)
      .lineBetween(centerX, centerY - radius, centerX + radius, centerY)
      .lineBetween(centerX + radius, centerY, centerX, centerY + radius)
      .lineBetween(centerX, centerY + radius, centerX - radius, centerY)
      .lineBetween(centerX - radius, centerY, centerX, centerY - radius);
  }

  clearOverlay() {
    this.phaseOverlay.clear();
  }

  drawExposedCore(x: number, y: number, time: number) {
    const pulse = 0.65 + Math.sin(time * 0.035) * 0.25;
    const outer = 52 + pulse * 12;
    const inner = 34 + pulse * 10;
    this.telegraph
      .lineStyle(5, this.pattern.skyColor, pulse)
      .strokeRect(x - inner, y - inner, inner * 2, inner * 2)
      .lineStyle(2, 0xffffff, pulse)
      .strokeRect(x - outer, y - outer, outer * 2, outer * 2);
  }

  defeat(x: number, y: number) {
    this.telegraph.clear();
    this.phaseOverlay.clear();

    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      const shard = this.scene.add
        .rectangle(
          x,
          y,
          8 + (index % 3) * 5,
          18 + (index % 4) * 6,
          index % 2 === 0 ? this.pattern.goldColor : this.pattern.skyColor,
          0.9,
        )
        .setRotation(angle)
        .setDepth(EFFECT_DEPTH + 2);
      this.scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * (160 + (index % 4) * 45),
        y: y + Math.sin(angle) * (120 + (index % 3) * 50),
        rotation: angle + Math.PI,
        alpha: 0,
        duration: 900,
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  destroy() {
    this.telegraph.destroy();
    this.eyeLockSigil.destroy();
    this.leftWingWarning.destroy();
    this.rightWingWarning.destroy();
    this.phaseOverlay.destroy();
  }
}
