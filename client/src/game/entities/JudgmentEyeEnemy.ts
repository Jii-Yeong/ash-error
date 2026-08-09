import Phaser from 'phaser';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import {
  JUDGMENT_EYE_CONFIG,
  JUDGMENT_EYE_ORB,
  JUDGMENT_EYE_RETICLE,
} from '@/game/config/stageFourEnemyConfig';
import {
  ENEMY_DEPTH,
  type EnemyProjectileAttack,
} from '@/game/entities/Enemy';
import { HallucinatedAndroidEnemy } from '@/game/entities/HallucinatedAndroidEnemy';
import type { EnemyAttackCoordinator } from '@/game/systems/EnemyAttackCoordinator';

type EyeState = 'ready' | 'tracking' | 'orb' | 'repositioning';
const POSE = JUDGMENT_EYE_CONFIG.animations;

type EyeBullet = {
  sprite: Phaser.Physics.Arcade.Image;
  expiresAt: number;
};

export class JudgmentEyeEnemy extends HallucinatedAndroidEnemy {
  readonly aggroRadius = JUDGMENT_EYE_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0xff4050;

  private eyeState: EyeState = 'ready';
  private stateEndsAt = 0;
  private nextAttackAt = 0;
  private lockedTarget = new Phaser.Math.Vector2();
  private repositionTarget = new Phaser.Math.Vector2();
  private orb?: Phaser.GameObjects.Image;
  private firedOrb = false;
  private radialVolleyIndex = 0;
  private readonly reticle: Phaser.GameObjects.Image;
  private readonly bullets: EyeBullet[] = [];
  /** 방사 탄막을 매번 새로 만들지 않고 재사용하는 탄환 풀(비활성 스프라이트). */
  private readonly bulletPool: Phaser.Physics.Arcade.Image[] = [];
  private bulletTarget?: Phaser.Physics.Arcade.Sprite;
  private bulletsDetached = false;
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
      JUDGMENT_EYE_CONFIG.texture,
      JUDGMENT_EYE_CONFIG.maxHealth,
      attackCoordinator,
    );
    this.setScale(JUDGMENT_EYE_CONFIG.scale);
    this.playPose(POSE.idle);
    (this.body as Phaser.Physics.Arcade.Body)
      .setAllowGravity(false)
      .setCircle(
        JUDGMENT_EYE_CONFIG.bodyWidth / 2,
        JUDGMENT_EYE_CONFIG.bodyOffsetX,
        JUDGMENT_EYE_CONFIG.bodyOffsetY,
      );
    this.setDepth(ENEMY_DEPTH);
    this.reticle = scene.add
      .image(0, 0, JUDGMENT_EYE_RETICLE.texture)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
  }

  override get playsOwnDeathAnimation() {
    return true;
  }

  override refreshAtlasSprite() {
    this.setScale(JUDGMENT_EYE_CONFIG.scale);
    this.playPose(
      this.eyeState === 'tracking' || this.eyeState === 'orb'
        ? POSE.attack
        : POSE.idle,
    );
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
    this.playFallingDeath(
      POSE.deathFall,
      POSE.deathLand,
      JUDGMENT_EYE_CONFIG.deathLandOffsetY,
    );
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    this.bulletTarget = target;
    if (!this.bulletsDetached) {
      this.updateBullets(time, target);
    }
    if (!this.active || this.dying) {
      return false;
    }

    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    this.setFlipX(target.x < this.x);

    if (this.eyeState === 'tracking') {
      this.lockedTarget.set(target.x, target.y);
      this.drawReticle(time);
      this.setVelocity(0);
      if (time >= this.stateEndsAt) {
        this.beginOrb(time);
      }
      return true;
    }

    if (this.eyeState === 'orb') {
      this.setVelocity(0);
      if (
        !this.firedOrb &&
        time >= this.stateEndsAt - JUDGMENT_EYE_CONFIG.orbLifetime +
          JUDGMENT_EYE_CONFIG.orbChargeDuration
      ) {
        this.fireRadialVolley(time);
        this.firedOrb = true;
      }
      if (time >= this.stateEndsAt) {
        this.orb?.destroy();
        this.orb = undefined;
        this.finishAttack();
        this.beginReposition(time, target.x);
      }
      return true;
    }

    if (this.eyeState === 'repositioning') {
      this.moveToward(this.repositionTarget.x, this.repositionTarget.y);
      if (
        time >= this.stateEndsAt ||
        Phaser.Math.Distance.Between(
          this.x,
          this.y,
          this.repositionTarget.x,
          this.repositionTarget.y,
        ) < 10
      ) {
        this.eyeState = 'ready';
        this.setVelocity(0);
        this.playPose(POSE.idle);
      }
      return targetInRange;
    }

    this.hoverNear(target);
    if (
      targetInRange &&
      time >= this.nextAttackAt &&
      this.tryBeginAttack()
    ) {
      this.eyeState = 'tracking';
      this.playPose(POSE.attack);
      this.stateEndsAt = time + JUDGMENT_EYE_CONFIG.trackingDuration;
      this.lockedTarget.set(target.x, target.y);
      this.setVelocity(0);
    }
    return targetInRange;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.clearAttackTelegraph();
    this.detachBullets();
  }

  override destroy(fromScene?: boolean) {
    this.clearAttackTelegraph();
    this.stopDetachedBulletUpdates();
    this.clearBullets();
    this.destroyBulletPool();
    super.destroy(fromScene);
  }

  private drawReticle(time: number) {
    const size = Math.floor(time / 90) % 2 ? 60 : 72;
    this.reticle
      .setPosition(this.lockedTarget.x, this.lockedTarget.y)
      .setDisplaySize(size, size)
      .setVisible(true);
  }

  private beginOrb(time: number) {
    this.eyeState = 'orb';
    this.stateEndsAt = time + JUDGMENT_EYE_CONFIG.orbLifetime;
    this.firedOrb = false;
    this.reticle.setVisible(false);
    this.orb = this.scene.add
      .image(
        this.lockedTarget.x,
        this.lockedTarget.y,
        JUDGMENT_EYE_ORB.texture,
      )
      .setDisplaySize(48, 48)
      .setDepth(9)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private fireRadialVolley(time: number) {
    const bulletCount = this.radialVolleyIndex % 2 === 0 ? 6 : 8;
    this.radialVolleyIndex += 1;
    for (let index = 0; index < bulletCount; index += 1) {
      const angle = (Math.PI * 2 * index) / bulletCount + Math.PI / bulletCount;
      const sprite = this.acquireBullet(
        this.lockedTarget.x,
        this.lockedTarget.y,
      );
      sprite.setVelocity(
        Math.cos(angle) * JUDGMENT_EYE_CONFIG.bulletSpeed,
        Math.sin(angle) * JUDGMENT_EYE_CONFIG.bulletSpeed,
      );
      this.bullets.push({
        sprite,
        expiresAt: time + JUDGMENT_EYE_CONFIG.bulletLifetime,
      });
    }
  }

  private updateBullets(
    time: number,
    target?: Phaser.Physics.Arcade.Sprite,
  ) {
    for (let index = this.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets[index];
      const outsideWorld =
        bullet.sprite.x < 0 ||
        bullet.sprite.x > this.scene.physics.world.bounds.width ||
        bullet.sprite.y < 0 ||
        bullet.sprite.y > GAME_HEIGHT;
      if (time >= bullet.expiresAt || outsideWorld) {
        this.releaseBullet(bullet.sprite);
        this.bullets.splice(index, 1);
        continue;
      }
      if (
        target?.active &&
        Phaser.Math.Distance.Between(
          bullet.sprite.x,
          bullet.sprite.y,
          target.x,
          target.y,
        ) <= 24
      ) {
        this.damagePlayer(JUDGMENT_EYE_CONFIG.bulletDamage);
        this.releaseBullet(bullet.sprite);
        this.bullets.splice(index, 1);
      }
    }
  }

  private beginReposition(time: number, targetX: number) {
    this.eyeState = 'repositioning';
    this.playPose(POSE.idle);
    this.stateEndsAt = time + JUDGMENT_EYE_CONFIG.repositionDuration;
    this.nextAttackAt = time + JUDGMENT_EYE_CONFIG.attackCooldown;
    const worldWidth = this.scene.physics.world.bounds.width;
    const side = this.x < targetX ? -1 : 1;
    this.repositionTarget.set(
      Phaser.Math.Clamp(targetX + side * 320, 120, worldWidth - 120),
      Phaser.Math.Clamp(this.y + (this.radialVolleyIndex % 2 ? -120 : 120), 120, 390),
    );
  }

  private hoverNear(target: Phaser.Physics.Arcade.Sprite) {
    const desiredX = target.x + (this.x < target.x ? -300 : 300);
    const desiredY = Phaser.Math.Clamp(target.y - 180, 120, 390);
    this.moveToward(desiredX, desiredY);
  }

  private moveToward(x: number, y: number) {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, x, y);
    this.scene.physics.velocityFromRotation(
      angle,
      JUDGMENT_EYE_CONFIG.moveSpeed,
      (this.body as Phaser.Physics.Arcade.Body).velocity,
    );
  }

  /** 풀에서 탄환을 꺼내 재사용하거나, 비면 새로 만든다. */
  private acquireBullet(x: number, y: number) {
    const pooled = this.bulletPool.pop();
    if (pooled) {
      pooled.enableBody(true, x, y, true, true);
      return pooled;
    }

    const sprite = this.scene.physics.add
      .image(x, y, JUDGMENT_EYE_CONFIG.bulletTexture)
      .setDepth(9);
    (sprite.body as Phaser.Physics.Arcade.Body)
      .setAllowGravity(false)
      .setCircle(5);
    return sprite;
  }

  /** 탄환을 파괴하지 않고 비활성화해 풀로 되돌린다. */
  private releaseBullet(sprite: Phaser.Physics.Arcade.Image) {
    sprite.disableBody(true, true);
    this.bulletPool.push(sprite);
  }

  /** 사망 뒤 활성 탄환만 씬 갱신으로 넘기고 경고 연출은 즉시 정리함. */
  private detachBullets() {
    if (this.bulletsDetached || this.bullets.length === 0) {
      return;
    }
    this.bulletsDetached = true;
    this.scene.events.on(
      Phaser.Scenes.Events.UPDATE,
      this.updateDetachedBullets,
      this,
    );
  }

  private updateDetachedBullets(time: number) {
    this.updateBullets(time, this.bulletTarget);
    if (this.bullets.length === 0) {
      this.stopDetachedBulletUpdates();
    }
  }

  private stopDetachedBulletUpdates() {
    if (!this.bulletsDetached) {
      return;
    }
    this.scene.events.off(
      Phaser.Scenes.Events.UPDATE,
      this.updateDetachedBullets,
      this,
    );
    this.bulletsDetached = false;
  }

  private clearAttackTelegraph() {
    if (this.reticle.active) {
      this.reticle.destroy();
    }
    this.orb?.destroy();
    this.orb = undefined;
  }

  private clearBullets() {
    for (const bullet of this.bullets) {
      this.releaseBullet(bullet.sprite);
    }
    this.bullets.length = 0;
  }

  private destroyBulletPool() {
    for (const sprite of this.bulletPool) {
      sprite.destroy();
    }
    this.bulletPool.length = 0;
  }

  private playPose(pose: string) {
    if (this.scene.anims.exists(pose)) {
      this.play(pose, true);
    }
  }
}
