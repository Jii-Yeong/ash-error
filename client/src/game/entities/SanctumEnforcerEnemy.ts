import Phaser from 'phaser';
import { PLAYER_FLIGHT_BOUNDS } from '@/game/config/playerMovementConfig';
import {
  CELESTIAL_PROJECTILE_BOUNDS,
  SANCTUM_ENFORCER_CONFIG,
} from '@/game/config/stageFiveEnemyConfig';
import { CoordinatedAerialEnemy } from '@/game/entities/CoordinatedAerialEnemy';
import type { EnemyProjectileAttack } from '@/game/entities/Enemy';
import { CelestialProjectileField } from '@/game/systems/CelestialProjectileField';
import type { EnemyAttackCoordinator } from '@/game/systems/EnemyAttackCoordinator';

type EnforcerPattern = 'triple' | 'fan' | 'cross';
type EnforcerState = 'ready' | 'warning' | 'firing';
const POSE = SANCTUM_ENFORCER_CONFIG.animations;

export class SanctumEnforcerEnemy extends CoordinatedAerialEnemy {
  readonly aggroRadius = SANCTUM_ENFORCER_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0xffda7a;

  private readonly projectileField: CelestialProjectileField;
  private readonly warningLine: Phaser.GameObjects.Graphics;
  private enforcerState: EnforcerState = 'ready';
  private activePattern: EnforcerPattern = 'triple';
  private patternIndex = 0;
  private stateEndsAt = 0;
  private nextAttackAt = 0;
  private lockedX = 0;
  private lockedY = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    attackCoordinator: EnemyAttackCoordinator,
    damagePlayer: (damage: number) => void,
  ) {
    super(scene, x, y, SANCTUM_ENFORCER_CONFIG, attackCoordinator);
    this.setFlipX(true);
    this.warningLine = scene.add.graphics().setDepth(8);
    this.projectileField = new CelestialProjectileField(scene, {
      texture: SANCTUM_ENFORCER_CONFIG.spearTexture,
      damage: SANCTUM_ENFORCER_CONFIG.spearDamage,
      radius: 7,
      damagePlayer,
    });
  }

  protected currentSpritePose() {
    return this.enforcerState === 'ready'
      ? (this.body as Phaser.Physics.Arcade.Body).speed > 0
        ? POSE.fly
        : POSE.idle
      : this.patternPose(this.activePattern);
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

    if (this.enforcerState === 'warning' && time >= this.stateEndsAt) {
      this.beginFiring(time);
    } else if (this.enforcerState === 'firing' && time >= this.stateEndsAt) {
      this.finishPattern(time);
    } else if (this.enforcerState === 'ready') {
      if (targetInRange) {
        this.playPose(POSE.fly);
        this.hoverNearTarget(target);
      } else {
        this.playPose(POSE.idle);
        this.setVelocity(0);
      }
      if (
        targetInRange &&
        this.isInsideAttackEdge(90) &&
        time >= this.nextAttackAt &&
        this.tryBeginAttack()
      ) {
        this.beginNextPattern(time, target);
      }
    }
    return targetInRange;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.enforcerState = 'ready';
    this.clearWarning();
    this.projectileField.detach();
  }

  override destroy(fromScene?: boolean) {
    this.clearWarning();
    this.projectileField.destroy();
    super.destroy(fromScene);
  }

  private beginNextPattern(time: number, target: Phaser.Physics.Arcade.Sprite) {
    const patterns = ['triple', 'fan', 'cross'] as const;
    this.activePattern = patterns[this.patternIndex % patterns.length];
    this.patternIndex += 1;
    this.playPose(this.patternPose(this.activePattern));
    const view = this.scene.cameras.main.worldView;
    this.lockedX = Phaser.Math.Clamp(target.x, view.left + 96, this.x - 96);
    this.lockedY = Phaser.Math.Clamp(
      target.y,
      PLAYER_FLIGHT_BOUNDS.minY,
      PLAYER_FLIGHT_BOUNDS.maxY,
    );

    this.enforcerState = 'warning';
    this.stateEndsAt = time + SANCTUM_ENFORCER_CONFIG.warningDuration;
    this.drawWarning();
    this.setVelocity(0);
  }

  private beginFiring(time: number) {
    this.warningLine.clear();
    this.enforcerState = 'firing';
    if (this.activePattern === 'triple') {
      for (const offsetY of [-112, 0, 112]) {
        this.projectileField.spawn({
          x: this.x,
          y: this.lockedY + offsetY,
          angle: Math.PI,
          speed: SANCTUM_ENFORCER_CONFIG.spearSpeed,
        });
      }
      this.stateEndsAt = time + 1_050;
      return;
    }

    if (this.activePattern === 'fan') {
      const angles = [-35, -17.5, 0, 17.5, 35];
      for (let volley = 0; volley < 2; volley += 1) {
        const orderedAngles = volley === 0 ? angles : [...angles].reverse();
        orderedAngles.forEach((degrees, index) => {
          this.projectileField.spawn({
            x: this.x,
            y: this.y,
            angle: Math.PI + Phaser.Math.DegToRad(degrees),
            speed: SANCTUM_ENFORCER_CONFIG.spearSpeed * 0.82,
            delay: volley * 430 + index * 55,
          });
        });
      }
      this.stateEndsAt = time + 1_650;
      return;
    }

    for (const startY of this.crossShotStartYs()) {
      this.projectileField.spawn({
        x: this.x,
        y: startY,
        angle: Phaser.Math.Angle.Between(
          this.x,
          startY,
          this.lockedX,
          this.lockedY,
        ),
        speed: SANCTUM_ENFORCER_CONFIG.spearSpeed,
      });
    }
    this.stateEndsAt = time + 1_200;
  }

  private crossShotStartYs() {
    return [-1, 1].map((direction) =>
      Phaser.Math.Clamp(
        this.lockedY + direction * SANCTUM_ENFORCER_CONFIG.crossSpread,
        CELESTIAL_PROJECTILE_BOUNDS.top,
        CELESTIAL_PROJECTILE_BOUNDS.bottom,
      ),
    );
  }

  private drawWarning() {
    const view = this.scene.cameras.main.worldView;
    this.warningLine.clear();
    this.warningLine.lineStyle(3, 0xffe98b, 0.78);
    if (this.activePattern !== 'cross') {
      this.warningLine.lineBetween(
        view.left,
        this.lockedY,
        view.right,
        this.lockedY,
      );
      return;
    }

    for (const startY of this.crossShotStartYs()) {
      const angle = Phaser.Math.Angle.Between(
        this.x,
        startY,
        this.lockedX,
        this.lockedY,
      );
      const length = view.width + SANCTUM_ENFORCER_CONFIG.crossSpread;
      this.warningLine.lineBetween(
        this.x,
        startY,
        this.x + Math.cos(angle) * length,
        startY + Math.sin(angle) * length,
      );
    }
  }

  private finishPattern(time: number) {
    this.enforcerState = 'ready';
    this.playPose(POSE.idle);
    this.finishAttack();
    this.nextAttackAt = time + SANCTUM_ENFORCER_CONFIG.attackCooldown;
  }

  private hoverNearTarget(target: Phaser.Physics.Arcade.Sprite) {
    const desiredX = Math.min(
      this.scene.physics.world.bounds.right - 100,
      this.scene.cameras.main.worldView.right - 150,
    );
    const desiredY = Phaser.Math.Clamp(
      target.y,
      PLAYER_FLIGHT_BOUNDS.minY + 35,
      PLAYER_FLIGHT_BOUNDS.maxY - 35,
    );
    this.moveToward(desiredX, desiredY, SANCTUM_ENFORCER_CONFIG.moveSpeed);
  }

  private clearWarning() {
    if (this.warningLine.active) {
      this.warningLine.clear();
      this.warningLine.destroy();
    }
  }

  private patternPose(pattern: EnforcerPattern) {
    if (pattern === 'fan') {
      return POSE.fanShot;
    }
    return pattern === 'cross' ? POSE.crossShot : POSE.spearThrow;
  }
}
