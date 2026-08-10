import Phaser from 'phaser';
import { PLAYER_FLIGHT_BOUNDS } from '@/game/config/playerMovementConfig';
import { CELESTIAL_ORACLE_CONFIG } from '@/game/config/stageFiveEnemyConfig';
import { CoordinatedAerialEnemy } from '@/game/entities/CoordinatedAerialEnemy';
import type { EnemyProjectileAttack } from '@/game/entities/Enemy';
import { CelestialProjectileField } from '@/game/systems/CelestialProjectileField';
import type { EnemyAttackCoordinator } from '@/game/systems/EnemyAttackCoordinator';

type OraclePattern = 'semicircle' | 'walls' | 'spiral' | 'books';
const POSE = CELESTIAL_ORACLE_CONFIG.animations;

export class CelestialOracleEnemy extends CoordinatedAerialEnemy {
  readonly aggroRadius = CELESTIAL_ORACLE_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0xfff0a8;

  private readonly projectileField: CelestialProjectileField;
  private readonly bookMarkers: Phaser.GameObjects.Rectangle[] = [];
  private activePattern?: OraclePattern;
  private patternIndex = 0;
  private attackEndsAt = 0;
  private nextAttackAt = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    attackCoordinator: EnemyAttackCoordinator,
    damagePlayer: (damage: number) => void,
  ) {
    super(scene, x, y, CELESTIAL_ORACLE_CONFIG, attackCoordinator);
    this.setFlipX(true);
    this.projectileField = new CelestialProjectileField(scene, {
      texture: CELESTIAL_ORACLE_CONFIG.bulletTexture,
      damage: CELESTIAL_ORACLE_CONFIG.bulletDamage,
      radius: 7,
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

    if (this.activePattern) {
      this.setVelocity(0);
      if (time >= this.attackEndsAt) {
        this.endAttack(time);
      }
    } else if (targetInRange) {
      this.playPose(POSE.fly);
      this.hoverAtScreenEdge();
      if (
        this.isInsideAttackEdge(110) &&
        time >= this.nextAttackAt &&
        this.tryBeginAttack()
      ) {
        this.beginNextPattern(time);
      }
    } else {
      this.playPose(POSE.idle);
      this.setVelocity(0);
    }
    return targetInRange;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.activePattern = undefined;
    this.clearBookMarkers();
    this.projectileField.detach();
  }

  override destroy(fromScene?: boolean) {
    this.activePattern = undefined;
    this.clearBookMarkers();
    this.projectileField.destroy();
    super.destroy(fromScene);
  }

  private beginNextPattern(time: number) {
    const patterns = ['semicircle', 'walls', 'spiral', 'books'] as const;
    this.activePattern = patterns[this.patternIndex % patterns.length];
    this.patternIndex += 1;
    this.playPose(this.patternPose(this.activePattern));

    switch (this.activePattern) {
      case 'semicircle':
        this.fireSemicircles();
        this.attackEndsAt = time + 4_000;
        break;
      case 'walls':
        this.fireWalls();
        this.attackEndsAt = time + 5_800;
        break;
      case 'spiral':
        this.fireSpiral();
        this.attackEndsAt = time + 4_700;
        break;
      case 'books':
        this.fireBookBlockade();
        this.attackEndsAt = time + 3_800;
        break;
    }
  }

  private fireSemicircles() {
    const count = 15;
    for (let volley = 0; volley < 2; volley += 1) {
      const gapStart = volley === 0 ? 2 : 10;
      for (let index = 0; index < count; index += 1) {
        if (index >= gapStart && index < gapStart + 3) {
          continue;
        }
        const degrees = -70 + (140 * index) / (count - 1);
        this.projectileField.spawn({
          x: this.x,
          y: this.y,
          angle: Math.PI + Phaser.Math.DegToRad(degrees),
          speed: CELESTIAL_ORACLE_CONFIG.bulletSpeed,
          delay: CELESTIAL_ORACLE_CONFIG.warningDuration + volley * 720,
        });
      }
    }
  }

  private fireWalls() {
    const levels = [
      PLAYER_FLIGHT_BOUNDS.minY - 18,
      PLAYER_FLIGHT_BOUNDS.minY + 32,
      PLAYER_FLIGHT_BOUNDS.minY + 82,
      PLAYER_FLIGHT_BOUNDS.minY + 132,
      PLAYER_FLIGHT_BOUNDS.minY + 182,
      PLAYER_FLIGHT_BOUNDS.minY + 232,
      PLAYER_FLIGHT_BOUNDS.minY + 282,
      PLAYER_FLIGHT_BOUNDS.minY + 332,
      PLAYER_FLIGHT_BOUNDS.minY + 382,
      PLAYER_FLIGHT_BOUNDS.minY + 432,
    ];
    const gapStarts = [1, 4, 7];
    gapStarts.forEach((gapStart, wallIndex) => {
      levels.forEach((y, index) => {
        if (index >= gapStart && index < gapStart + 3) {
          return;
        }
        this.projectileField.spawn({
          x: this.x,
          y,
          angle: Math.PI,
          speed: CELESTIAL_ORACLE_CONFIG.wallSpeed,
          delay: CELESTIAL_ORACLE_CONFIG.warningDuration + wallIndex * 850,
          lifetime: 5_000,
        });
      });
    });
  }

  private fireSpiral() {
    for (let index = 0; index < 12; index += 1) {
      const phase = (index / 11) * Math.PI * 2;
      for (const side of [-1, 1]) {
        this.projectileField.spawn({
          x: this.x,
          y: this.y + Math.sin(phase) * 20,
          angle: Math.PI + side * Phaser.Math.DegToRad(28),
          speed: CELESTIAL_ORACLE_CONFIG.bulletSpeed * 0.85,
          delay: CELESTIAL_ORACLE_CONFIG.warningDuration + index * 100,
          angularVelocity: side * 0.38,
        });
      }
    }
  }

  private fireBookBlockade() {
    const topY = PLAYER_FLIGHT_BOUNDS.minY + 28;
    const bottomY = PLAYER_FLIGHT_BOUNDS.maxY - 28;
    const crossingX = this.scene.cameras.main.worldView.centerX + 150;
    this.bookMarkers.push(
      this.scene.add
        .rectangle(this.x, topY, 34, 22, 0xffe99a, 0.75)
        .setDepth(8),
      this.scene.add
        .rectangle(this.x, bottomY, 34, 22, 0xffe99a, 0.75)
        .setDepth(8),
    );
    const crossingY = (topY + bottomY) / 2;
    for (let index = 0; index < 6; index += 1) {
      const delay = CELESTIAL_ORACLE_CONFIG.warningDuration + index * 120;
      this.projectileField.spawn({
        x: this.x,
        y: topY,
        angle: Phaser.Math.Angle.Between(this.x, topY, crossingX, crossingY),
        speed: CELESTIAL_ORACLE_CONFIG.bulletSpeed,
        delay,
      });
      this.projectileField.spawn({
        x: this.x,
        y: bottomY,
        angle: Phaser.Math.Angle.Between(this.x, bottomY, crossingX, crossingY),
        speed: CELESTIAL_ORACLE_CONFIG.bulletSpeed,
        delay,
      });
    }
  }

  private hoverAtScreenEdge() {
    const desiredX = Math.min(
      this.scene.physics.world.bounds.right - 130,
      this.scene.cameras.main.worldView.right - 180,
    );
    const desiredY =
      (PLAYER_FLIGHT_BOUNDS.minY + PLAYER_FLIGHT_BOUNDS.maxY) / 2;
    this.moveToward(desiredX, desiredY, CELESTIAL_ORACLE_CONFIG.moveSpeed, 10);
  }

  private endAttack(time: number) {
    this.activePattern = undefined;
    this.playPose(POSE.idle);
    this.clearBookMarkers();
    this.finishAttack();
    this.nextAttackAt = time + CELESTIAL_ORACLE_CONFIG.attackCooldown;
  }

  private clearBookMarkers() {
    for (const marker of this.bookMarkers) {
      marker.destroy();
    }
    this.bookMarkers.length = 0;
  }

  private patternPose(pattern: OraclePattern) {
    if (pattern === 'walls') {
      return POSE.walls;
    }
    if (pattern === 'books') {
      return POSE.books;
    }
    return POSE.spiral;
  }
}
