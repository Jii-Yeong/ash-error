import Phaser from 'phaser';
import { ENEMY_DEPTH, Enemy } from '@/game/entities/Enemy';
import type { EnemyAttackCoordinator } from '@/game/systems/EnemyAttackCoordinator';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';

type CoordinatedAerialSpriteConfig = {
  readonly texture: string;
  readonly maxHealth: number;
  readonly scale: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly bodyOffset?: number;
  readonly deathLandOffsetY: number;
  readonly animations: {
    readonly idle: string;
    readonly deathFall: string;
    readonly deathLand: string;
  };
};

/** 동시에 활성화되는 위험 패턴 수를 제한하는 5스테이지 공중 적 기반 클래스. */
export abstract class CoordinatedAerialEnemy extends Enemy {
  protected dying = false;

  private ownsAttackSlot = false;

  protected constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly spriteConfig: CoordinatedAerialSpriteConfig,
    private readonly attackCoordinator: EnemyAttackCoordinator,
  ) {
    super(scene, x, y, spriteConfig.texture, spriteConfig.maxHealth);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.setData('stage-five-attacking', false);
    this.applySprite(spriteConfig.animations.idle);
    this.setDepth(ENEMY_DEPTH);
  }

  override get playsOwnDeathAnimation() {
    return true;
  }

  override get deathAnimationDuration() {
    if (!this.hasDeathAnimations()) {
      return 0;
    }
    return this.getAerialDeathDuration(
      this.deathRestY,
      this.spriteConfig.animations.deathLand,
    );
  }

  override refreshAtlasSprite() {
    this.applySprite(this.currentSpritePose());
  }

  override defeat() {
    if (!this.active || this.dying) {
      return;
    }
    if (!this.hasDeathAnimations()) {
      super.defeat();
      return;
    }

    this.dying = true;
    this.onDefeated();
    this.playAerialDeath(
      this.spriteConfig.animations.deathFall,
      this.spriteConfig.animations.deathLand,
      this.deathRestY,
    );
  }

  protected abstract currentSpritePose(): string;

  protected playPose(pose: string) {
    if (this.scene.anims.exists(pose)) {
      this.play(pose, true);
    }
  }

  protected tryBeginAttack() {
    if (!this.attackCoordinator.tryAcquire(this)) {
      return false;
    }
    this.ownsAttackSlot = true;
    this.setData('stage-five-attacking', true);
    return true;
  }

  protected finishAttack() {
    if (!this.ownsAttackSlot) {
      return;
    }
    this.attackCoordinator.release(this);
    this.ownsAttackSlot = false;
    this.setData('stage-five-attacking', false);
  }

  /** 지정 위치까지 일정 속도로 이동하고 도착 오차 안에서는 멈춤. */
  protected moveToward(x: number, y: number, speed: number, stopDistance = 8) {
    if (Phaser.Math.Distance.Between(this.x, this.y, x, y) < stopDistance) {
      this.setVelocity(0);
      return;
    }
    this.scene.physics.velocityFromRotation(
      Phaser.Math.Angle.Between(this.x, this.y, x, y),
      speed,
      (this.body as Phaser.Physics.Arcade.Body).velocity,
    );
  }

  /** 화면 안쪽 공격 위치에 도달했는지 확인함. */
  protected isInsideAttackEdge(rightMargin: number) {
    const view = this.scene.cameras.main.worldView;
    return this.x >= view.left && this.x <= view.right - rightMargin;
  }

  private get deathRestY() {
    return (
      FLOOR_SURFACE_Y -
      this.displayHeight / 2 +
      this.spriteConfig.deathLandOffsetY
    );
  }

  private hasDeathAnimations() {
    return (
      this.scene.anims.exists(this.spriteConfig.animations.deathFall) &&
      this.scene.anims.exists(this.spriteConfig.animations.deathLand)
    );
  }

  private applySprite(pose: string) {
    this.setScale(this.spriteConfig.scale);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.spriteConfig.bodyOffset === undefined) {
      body.setSize(
        this.spriteConfig.bodyWidth,
        this.spriteConfig.bodyHeight,
        true,
      );
    } else {
      body.setCircle(
        this.spriteConfig.bodyWidth / 2,
        this.spriteConfig.bodyOffset,
        this.spriteConfig.bodyOffset,
      );
    }
    this.playPose(pose);
  }

  protected override onDefeated() {
    super.onDefeated();
    this.finishAttack();
  }

  override destroy(fromScene?: boolean) {
    this.finishAttack();
    super.destroy(fromScene);
  }
}
