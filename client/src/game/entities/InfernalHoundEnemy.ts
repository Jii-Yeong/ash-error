import Phaser from 'phaser';
import { INFERNAL_HOUND_CONFIG } from '@/game/config/stageFourEnemyConfig';
import {
  ENEMY_DEPTH,
  type EnemyProjectileAttack,
} from '@/game/entities/Enemy';
import { HallucinatedAndroidEnemy } from '@/game/entities/HallucinatedAndroidEnemy';
import type { EnemyAttackCoordinator } from '@/game/systems/EnemyAttackCoordinator';

type HoundState = 'ready' | 'warning' | 'charging' | 'stunned';
const POSE = INFERNAL_HOUND_CONFIG.animations;

export class InfernalHoundEnemy extends HallucinatedAndroidEnemy {
  readonly aggroRadius = INFERNAL_HOUND_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0xff493d;

  private houndState: HoundState = 'ready';
  private stateEndsAt = 0;
  private nextAttackAt = 0;
  private chargeDirection = 1;
  private chargeDamageReady = false;
  private dying = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    attackCoordinator: EnemyAttackCoordinator,
    _damagePlayer: (damage: number) => void,
  ) {
    super(
      scene,
      x,
      y,
      INFERNAL_HOUND_CONFIG.texture,
      INFERNAL_HOUND_CONFIG.maxHealth,
      attackCoordinator,
    );
    this.setScale(INFERNAL_HOUND_CONFIG.scale);
    this.playPose(POSE.idle);
    (this.body as Phaser.Physics.Arcade.Body)
      .setSize(
        INFERNAL_HOUND_CONFIG.bodyWidth,
        INFERNAL_HOUND_CONFIG.bodyHeight,
      )
      .setOffset(
        INFERNAL_HOUND_CONFIG.bodyOffsetX,
        INFERNAL_HOUND_CONFIG.bodyOffsetY,
      );
    this.setDepth(ENEMY_DEPTH);
  }

  override get playsOwnDeathAnimation() {
    return true;
  }

  override refreshAtlasSprite() {
    this.setScale(INFERNAL_HOUND_CONFIG.scale);
    if (this.houndState === 'warning') {
      this.showAttackWarningFrame();
      return;
    }
    this.playPose(this.houndState === 'charging' ? POSE.attack : POSE.idle);
  }

  override defeat() {
    if (!this.active || this.dying) {
      return;
    }
    if (!this.scene.anims.exists(POSE.death)) {
      super.defeat();
      return;
    }

    this.dying = true;
    this.onDefeated();
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.play(POSE.death, true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
      this.disableBody(true, true),
    );
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

    if (this.houndState === 'warning') {
      this.setVelocityX(0);
      if (time >= this.stateEndsAt) {
        this.beginCharge(time);
      }
      return true;
    }

    if (this.houndState === 'charging') {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const hitEdge =
        this.chargeDirection < 0 ? body.blocked.left : body.blocked.right;
      if (hitEdge || time >= this.stateEndsAt) {
        this.beginStun(time);
      } else {
        this.setVelocityX(
          this.chargeDirection * INFERNAL_HOUND_CONFIG.chargeSpeed,
        );
      }
      return true;
    }

    if (this.houndState === 'stunned') {
      this.setVelocityX(0);
      if (time >= this.stateEndsAt) {
        this.houndState = 'ready';
        this.playPose(POSE.idle);
        this.finishAttack();
        this.nextAttackAt = time + INFERNAL_HOUND_CONFIG.attackCooldown;
      }
      return targetInRange;
    }

    if (!targetInRange || this.isStaggered(time)) {
      this.setVelocityX(0);
      this.playPose(POSE.idle);
      return targetInRange;
    }

    this.setFlipX(target.x > this.x);
    if (time >= this.nextAttackAt && this.tryBeginAttack()) {
      this.beginWarning(time, target.x);
      return true;
    }

    const direction = Math.sign(target.x - this.x) || 1;
    this.setVelocityX(direction * INFERNAL_HOUND_CONFIG.prowlSpeed);
    this.playPose(POSE.walk);
    return true;
  }

  override tryContactAttack(_time: number) {
    if (this.houndState !== 'charging' || !this.chargeDamageReady) {
      return null;
    }
    this.chargeDamageReady = false;
    return INFERNAL_HOUND_CONFIG.chargeDamage;
  }

  private beginWarning(time: number, targetX: number) {
    this.houndState = 'warning';
    this.chargeDirection = Math.sign(targetX - this.x) || 1;
    this.setFlipX(this.chargeDirection > 0);
    this.showAttackWarningFrame();
    this.stateEndsAt = time + INFERNAL_HOUND_CONFIG.warningDuration;
  }

  private beginCharge(time: number) {
    this.houndState = 'charging';
    this.stateEndsAt = time + INFERNAL_HOUND_CONFIG.maxChargeDuration;
    this.chargeDamageReady = true;
    this.playPose(POSE.attack);
  }

  private beginStun(time: number) {
    this.houndState = 'stunned';
    this.playPose(POSE.idle);
    this.stateEndsAt = time + INFERNAL_HOUND_CONFIG.stunDuration;
    this.setVelocityX(0);
    this.setAngle(this.chargeDirection * 7);
    this.scene.time.delayedCall(INFERNAL_HOUND_CONFIG.stunDuration, () => {
      if (this.active) {
        this.setAngle(0);
      }
    });
  }

  /** 돌진 예고 시간 동안 `attack`의 첫 프레임을 고정함. */
  private showAttackWarningFrame() {
    if (!this.scene.anims.exists(POSE.attack)) {
      return;
    }
    const firstFrame = this.scene.anims.get(POSE.attack)?.frames[0];
    if (!firstFrame) {
      return;
    }
    this.anims.stop();
    this.setFrame(firstFrame.textureFrame);
  }

  private playPose(pose: string) {
    if (this.scene.anims.exists(pose)) {
      this.play(pose, true);
    }
  }
}
