import Phaser from 'phaser';
import { EXECUTIONER_DOLL_CONFIG } from '@/game/config/stageFourEnemyConfig';
import {
  ENEMY_DEPTH,
  type EnemyProjectileAttack,
} from '@/game/entities/Enemy';
import { HallucinatedAndroidEnemy } from '@/game/entities/HallucinatedAndroidEnemy';
import type { EnemyAttackCoordinator } from '@/game/systems/EnemyAttackCoordinator';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';

type ExecutionerState = 'hover' | 'warning' | 'slamming' | 'landed' | 'rising';

const POSE = EXECUTIONER_DOLL_CONFIG.animations;
const IDLE_Y_TOLERANCE = 32;
const POSE_BY_STATE: Record<ExecutionerState, string> = {
  hover: POSE.fly,
  warning: POSE.takeDown,
  slamming: POSE.slam,
  landed: POSE.land,
  rising: POSE.fly,
};

export class ExecutionerDollEnemy extends HallucinatedAndroidEnemy {
  readonly aggroRadius = EXECUTIONER_DOLL_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0xff6651;

  private executionerState: ExecutionerState = 'hover';
  private stateEndsAt = 0;
  private nextAttackAt = 0;
  private lockedX = 0;
  private impactY = FLOOR_SURFACE_Y;
  private dying = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    attackCoordinator: EnemyAttackCoordinator,
    private readonly damagePlayer: (damage: number) => void,
  ) {
    super(
      scene,
      x,
      y,
      EXECUTIONER_DOLL_CONFIG.texture,
      EXECUTIONER_DOLL_CONFIG.maxHealth,
      attackCoordinator,
    );
    this.setScale(EXECUTIONER_DOLL_CONFIG.scale);
    if (this.scene.anims.exists(POSE.fly)) {
      this.play(POSE.fly);
    }
    (this.body as Phaser.Physics.Arcade.Body)
      .setAllowGravity(false)
      .setSize(
        EXECUTIONER_DOLL_CONFIG.bodyWidth,
        EXECUTIONER_DOLL_CONFIG.bodyHeight,
      )
      .setOffset(
        EXECUTIONER_DOLL_CONFIG.bodyOffsetX,
        EXECUTIONER_DOLL_CONFIG.bodyOffsetY,
      );
    this.setDepth(ENEMY_DEPTH);
  }

  override get playsOwnDeathAnimation() {
    return true;
  }

  override refreshAtlasSprite() {
    this.setScale(EXECUTIONER_DOLL_CONFIG.scale);
    this.play(POSE_BY_STATE[this.executionerState], true);
  }

  override defeat() {
    if (!this.active || this.dying) {
      return;
    }
    if (
      !this.scene.anims.exists(POSE.deathFall) ||
      !this.scene.anims.exists(POSE.deathLand)
    ) {
      super.defeat();
      return;
    }

    this.dying = true;
    this.onDefeated();
    this.playFallingDeath(POSE.deathFall, POSE.deathLand);
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    if (!this.active || this.dying) {
      return false;
    }

    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    this.setFlipX(target.x > this.x);

    if (this.executionerState === 'warning') {
      this.moveToward(this.lockedX, this.impactY - EXECUTIONER_DOLL_CONFIG.hoverOffset);
      if (time >= this.stateEndsAt) {
        this.executionerState = 'slamming';
        this.play(POSE.slam, true);
        this.setVelocity(0, EXECUTIONER_DOLL_CONFIG.slamSpeed);
      }
      return true;
    }

    if (this.executionerState === 'slamming') {
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (body.bottom >= this.impactY) {
        this.setY(this.y - (body.bottom - this.impactY));
        body.updateFromGameObject();
        this.land(time, target);
      }
      return true;
    }

    if (this.executionerState === 'landed') {
      this.setVelocity(0);
      if (time >= this.stateEndsAt) {
        this.executionerState = 'rising';
        this.play(POSE.fly, true);
        this.finishAttack();
        this.nextAttackAt = time + EXECUTIONER_DOLL_CONFIG.attackCooldown;
      }
      return targetInRange;
    }

    const hoverY = Math.max(100, target.y - EXECUTIONER_DOLL_CONFIG.hoverOffset);
    this.moveToward(target.x, hoverY);
    if (this.executionerState === 'rising' && Math.abs(this.y - hoverY) < 12) {
      this.executionerState = 'hover';
    }
    if (this.executionerState === 'hover') {
      const pose =
        Math.abs(target.y - this.y) <= IDLE_Y_TOLERANCE
          ? POSE.idle
          : POSE.fly;
      if (this.scene.anims.exists(pose)) {
        this.play(pose, true);
      }
    }

    if (
      this.executionerState === 'hover' &&
      targetInRange &&
      Math.abs(target.x - this.x) <= 90 &&
      time >= this.nextAttackAt &&
      this.tryBeginAttack()
    ) {
      this.beginWarning(time, target);
    }
    return targetInRange;
  }

  private beginWarning(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    const targetBody = target.body as Phaser.Physics.Arcade.Body;
    this.executionerState = 'warning';
    this.play(POSE.takeDown, true);
    this.stateEndsAt = time + EXECUTIONER_DOLL_CONFIG.warningDuration;
    this.lockedX = target.x;
    this.impactY = targetBody.blocked.down
      ? Math.min(targetBody.bottom, FLOOR_SURFACE_Y)
      : FLOOR_SURFACE_Y;
  }

  private land(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.executionerState = 'landed';
    this.play(POSE.land, true);
    this.stateEndsAt = time + EXECUTIONER_DOLL_CONFIG.recoveryDuration;
    this.setVelocity(0);
    const body = target.body as Phaser.Physics.Arcade.Body;
    const onImpactLevel = Math.abs(body.bottom - this.impactY) <= 28;
    if (
      onImpactLevel &&
      Math.abs(target.x - this.x) <= EXECUTIONER_DOLL_CONFIG.shockwaveRange
    ) {
      this.damagePlayer(EXECUTIONER_DOLL_CONFIG.shockwaveDamage);
    }
  }

  private moveToward(x: number, y: number) {
    const distance = Phaser.Math.Distance.Between(this.x, this.y, x, y);
    if (distance < 8) {
      this.setVelocity(0);
      return;
    }
    const angle = Phaser.Math.Angle.Between(this.x, this.y, x, y);
    this.scene.physics.velocityFromRotation(
      angle,
      EXECUTIONER_DOLL_CONFIG.hoverSpeed,
      (this.body as Phaser.Physics.Arcade.Body).velocity,
    );
  }
}
