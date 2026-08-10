import Phaser from 'phaser';
import { PLAYER_FLIGHT_BOUNDS } from '@/game/config/playerMovementConfig';
import { CHOIR_SUPPORTER_CONFIG } from '@/game/config/stageFiveEnemyConfig';
import { CoordinatedAerialEnemy } from '@/game/entities/CoordinatedAerialEnemy';
import type { EnemyProjectileAttack } from '@/game/entities/Enemy';
import { CelestialProjectileField } from '@/game/systems/CelestialProjectileField';
import type { EnemyAttackCoordinator } from '@/game/systems/EnemyAttackCoordinator';

type SupporterPattern = 'cross' | 'notes' | 'homing';
const POSE = CHOIR_SUPPORTER_CONFIG.animations;

export class ChoirSupporterEnemy extends CoordinatedAerialEnemy {
  readonly aggroRadius = CHOIR_SUPPORTER_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0xffef9d;

  private readonly projectileField: CelestialProjectileField;
  private readonly homeAbove: boolean;
  private patternIndex = 0;
  private activePattern?: SupporterPattern;
  private attackEndsAt = 0;
  private nextAttackAt = 0;
  private nextNoteAt = 0;
  private noteEndsAt = 0;
  private noteDirection = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    attackCoordinator: EnemyAttackCoordinator,
    damagePlayer: (damage: number) => void,
  ) {
    super(scene, x, y, CHOIR_SUPPORTER_CONFIG, attackCoordinator);
    this.homeAbove =
      y < (PLAYER_FLIGHT_BOUNDS.minY + PLAYER_FLIGHT_BOUNDS.maxY) / 2;
    this.projectileField = new CelestialProjectileField(scene, {
      texture: CHOIR_SUPPORTER_CONFIG.bulletTexture,
      damage: CHOIR_SUPPORTER_CONFIG.bulletDamage,
      radius: 6,
      damagePlayer,
    });
  }

  protected currentSpritePose() {
    return this.activePattern
      ? this.patternPose(this.activePattern)
      : (this.body as Phaser.Physics.Arcade.Body).speed > 0
        ? POSE.fly
        : POSE.idle;
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    if (!this.active || this.dying) {
      return false;
    }

    this.projectileField.update(time, target);
    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    this.setFlipX(false);

    if (this.activePattern === 'notes') {
      this.playPose(POSE.noteWave);
      this.updateNotePattern(time);
    } else if (this.activePattern) {
      this.setVelocity(0);
    } else if (targetInRange) {
      this.playPose(POSE.fly);
      this.hoverAtScreenEdge();
    } else {
      this.playPose(POSE.idle);
      this.setVelocity(0);
    }

    if (this.activePattern && time >= this.attackEndsAt) {
      this.endAttack(time);
    } else if (
      !this.activePattern &&
      targetInRange &&
      this.isInsideAttackEdge(80) &&
      time >= this.nextAttackAt &&
      this.tryBeginAttack()
    ) {
      this.beginNextPattern(time);
    }
    return targetInRange;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.activePattern = undefined;
    this.projectileField.detach();
  }

  override destroy(fromScene?: boolean) {
    this.activePattern = undefined;
    this.projectileField.destroy();
    super.destroy(fromScene);
  }

  private beginNextPattern(time: number) {
    const patterns = ['cross', 'notes', 'homing'] as const;
    this.activePattern = patterns[this.patternIndex % patterns.length];
    this.patternIndex += 1;
    this.playPose(this.patternPose(this.activePattern));

    if (this.activePattern === 'cross') {
      this.fireCross();
      this.attackEndsAt = time + 3_200;
      return;
    }
    if (this.activePattern === 'notes') {
      this.noteDirection = this.homeAbove ? 1 : -1;
      this.nextNoteAt = time;
      this.noteEndsAt = time + 1_350;
      this.attackEndsAt = time + 3_700;
      return;
    }

    this.fireHomingPair();
    this.attackEndsAt = time + 3_200;
  }

  private fireCross() {
    const delay = CHOIR_SUPPORTER_CONFIG.warningDuration;
    for (const offsetX of [0, 28, 56]) {
      this.projectileField.spawn({
        x: this.x + offsetX,
        y: this.y,
        angle: Math.PI,
        speed: CHOIR_SUPPORTER_CONFIG.bulletSpeed,
        delay,
      });
    }
    for (const angle of [-Math.PI / 2, Math.PI / 2]) {
      this.projectileField.spawn({
        x: this.x,
        y: this.y,
        angle,
        speed: CHOIR_SUPPORTER_CONFIG.bulletSpeed * 0.75,
        delay,
      });
    }
  }

  private fireHomingPair() {
    for (const offsetY of [-24, 24]) {
      this.projectileField.spawn({
        x: this.x,
        y: this.y + offsetY,
        angle: Math.PI,
        speed: CHOIR_SUPPORTER_CONFIG.bulletSpeed,
        delay: CHOIR_SUPPORTER_CONFIG.warningDuration,
        homingDuration: CHOIR_SUPPORTER_CONFIG.homingDuration,
        turnRate: CHOIR_SUPPORTER_CONFIG.homingTurnRate,
      });
    }
  }

  private updateNotePattern(time: number) {
    if (time >= this.noteEndsAt) {
      this.setVelocity(0);
      return;
    }
    const minY = PLAYER_FLIGHT_BOUNDS.minY + 30;
    const maxY = PLAYER_FLIGHT_BOUNDS.maxY - 30;
    if (
      (this.noteDirection < 0 && this.y <= minY) ||
      (this.noteDirection > 0 && this.y >= maxY)
    ) {
      this.noteDirection *= -1;
    }
    this.setVelocityY(this.noteDirection * CHOIR_SUPPORTER_CONFIG.moveSpeed);
    if (time < this.nextNoteAt) {
      return;
    }
    this.projectileField.spawn({
      x: this.x,
      y: this.y,
      angle: Math.PI,
      speed: CHOIR_SUPPORTER_CONFIG.bulletSpeed,
      delay: 380,
    });
    this.nextNoteAt = time + 170;
  }

  private hoverAtScreenEdge() {
    const camera = this.scene.cameras.main.worldView;
    const desiredX = Math.min(
      this.scene.physics.world.bounds.right - 80,
      camera.right - 140,
    );
    const desiredY = this.homeAbove
      ? PLAYER_FLIGHT_BOUNDS.minY + 70
      : PLAYER_FLIGHT_BOUNDS.maxY - 70;
    this.moveToward(desiredX, desiredY, CHOIR_SUPPORTER_CONFIG.moveSpeed);
  }

  private endAttack(time: number) {
    this.activePattern = undefined;
    this.setVelocity(0);
    this.playPose(POSE.idle);
    this.finishAttack();
    this.nextAttackAt = time + CHOIR_SUPPORTER_CONFIG.attackCooldown;
  }

  private patternPose(pattern: SupporterPattern) {
    if (pattern === 'cross') {
      return POSE.crossShot;
    }
    return pattern === 'notes' ? POSE.noteWave : POSE.homingPair;
  }
}
