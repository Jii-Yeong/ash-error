import Phaser from 'phaser';
import {
  getExposedFaceBounds,
  isExposedFaceHit,
} from '@/game/combat/stageThreeEnemyCombat';
import { BLOCKER_CONFIG } from '@/game/config/stageThreeEnemyConfig';
import {
  Enemy,
  ENEMY_DEPTH,
  type EnemyProjectileAttack,
  type ProjectileDamageResult,
} from '@/game/entities/Enemy';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';
import { GroundedEnemySprite } from '@/game/systems/GroundedEnemySprite';

const POSE = BLOCKER_CONFIG.animations;

type BlockerState = 'patrol' | 'charge' | 'windup' | 'recover';

export class BlockerEnemy extends Enemy {
  readonly aggroRadius = BLOCKER_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0x9acb83;

  private blockerState: BlockerState = 'patrol';
  private stateEndsAt = 0;
  private nextSlamAt = 0;
  private chargeStartedAt = 0;
  private patrolDirection = 1;
  private readonly patrolCenterX: number;
  private dying = false;
  private readonly rig: GroundedEnemySprite;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly damagePlayer: (damage: number) => void,
  ) {
    super(scene, x, y, BLOCKER_CONFIG.texture, BLOCKER_CONFIG.maxHealth);
    this.rig = new GroundedEnemySprite(this, BLOCKER_CONFIG);
    this.rig.apply();
    this.setDepth(ENEMY_DEPTH);
    this.patrolCenterX = x;
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    if (!this.active || this.dying) {
      return false;
    }

    const distance = Math.abs(target.x - this.x);
    const targetInRange = distance <= this.aggroRadius;
    this.setFlipX(target.x > this.x);

    if (this.blockerState === 'windup') {
      this.setVelocityX(0);
      this.rig.play(POSE.slam);
      if (time >= this.stateEndsAt) {
        this.slam(target);
        this.blockerState = 'recover';
        this.stateEndsAt = time + BLOCKER_CONFIG.slamRecoveryDuration;
        this.nextSlamAt = time + BLOCKER_CONFIG.slamCooldown;
      }
      return true;
    }

    if (this.blockerState === 'recover') {
      this.setVelocityX(0);
      this.rig.play(POSE.idle);
      if (time >= this.stateEndsAt) {
        this.blockerState = 'patrol';
      }
      return targetInRange;
    }

    if (!targetInRange) {
      this.blockerState = 'patrol';
      this.patrol();
      return false;
    }

    if (this.blockerState !== 'charge') {
      this.blockerState = 'charge';
      this.chargeStartedAt = time;
    }

    if (
      distance <= BLOCKER_CONFIG.slamRange &&
      time >= this.nextSlamAt &&
      time - this.chargeStartedAt >= BLOCKER_CONFIG.minimumChargeDuration
    ) {
      this.blockerState = 'windup';
      this.stateEndsAt = time + BLOCKER_CONFIG.slamWarningDuration;
      this.setVelocityX(0);
      this.rig.play(POSE.slam);
      return true;
    }

    const direction = Math.sign(target.x - this.x) || 1;
    this.setVelocityX(direction * BLOCKER_CONFIG.chargeSpeed);
    this.rig.play(POSE.walk);
    return true;
  }

  override takeProjectileDamage(
    amount: number,
    hitX: number,
    hitY: number,
  ): ProjectileDamageResult {
    if (
      !isExposedFaceHit(
        this.faceBounds,
        hitX,
        hitY,
        BLOCKER_CONFIG.projectileHitTolerance,
      )
    ) {
      this.showProjectileBlockedImpact(hitX, hitY, 'shield');
      return { applied: false, defeated: false };
    }
    return super.takeProjectileDamage(amount, hitX, hitY);
  }

  override get playsOwnDeathAnimation() {
    return true;
  }

  override refreshAtlasSprite() {
    this.rig.refresh();
  }

  override defeat() {
    if (!this.active || this.dying) {
      return;
    }

    this.dying = true;
    this.onDefeated();
    this.rig.playDeath(() => this.disableBody(true, true));
  }

  private get faceBounds() {
    // 발 기준으로 배치된 아틀라스 바디는 스프라이트 중심과 대칭이 아니므로,
    // 노출 바이저(바디 상단)를 실제 물리 바디 top에서 계산한다.
    return getExposedFaceBounds({
      enemyX: this.x,
      bodyTop: (this.body as Phaser.Physics.Arcade.Body).top,
      bodyWidth: BLOCKER_CONFIG.bodyWidth,
      bodyHeight: BLOCKER_CONFIG.bodyHeight,
      widthRatio: BLOCKER_CONFIG.faceWidthRatio,
      heightRatio: BLOCKER_CONFIG.faceHeightRatio,
    });
  }

  private slam(target: Phaser.Physics.Arcade.Sprite) {
    const wave = this.scene.add
      .rectangle(this.x, FLOOR_SURFACE_Y - 7, 50, 12, 0x8cff9d, 0.7)
      .setDepth(9);
    this.scene.tweens.add({
      targets: wave,
      displayWidth: BLOCKER_CONFIG.shockwaveRange * 2,
      alpha: 0,
      duration: 260,
      onComplete: () => wave.destroy(),
    });
    const body = target.body as Phaser.Physics.Arcade.Body;
    const nearFloor = body.blocked.down || body.bottom >= FLOOR_SURFACE_Y - 18;
    if (
      nearFloor &&
      Math.abs(target.x - this.x) <= BLOCKER_CONFIG.shockwaveRange
    ) {
      this.damagePlayer(BLOCKER_CONFIG.shockwaveDamage);
    }
  }

  private patrol() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (
      this.x <= this.patrolCenterX - BLOCKER_CONFIG.patrolDistance ||
      body.blocked.left
    ) {
      this.patrolDirection = 1;
    } else if (
      this.x >= this.patrolCenterX + BLOCKER_CONFIG.patrolDistance ||
      body.blocked.right
    ) {
      this.patrolDirection = -1;
    }

    this.setFlipX(this.patrolDirection > 0);
    this.setVelocityX(this.patrolDirection * BLOCKER_CONFIG.moveSpeed);
    this.rig.play(POSE.walk);
  }
}
