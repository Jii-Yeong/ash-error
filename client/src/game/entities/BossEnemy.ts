import Phaser from 'phaser';
import type {
  BossCombatConfig,
  BossPatternConfig,
} from '@/game/config/bossConfigTypes';
import { Enemy, type ProjectileDamageResult } from '@/game/entities/Enemy';

type SpriteDeathSequence = {
  hasSprite: boolean;
  playDeathAnimation: () => void;
  holdDuration: number;
  fadeDuration: number;
  beforePlay?: () => void;
};

export abstract class BossEnemy<
  Pattern extends BossPatternConfig = BossPatternConfig,
> extends Enemy {
  readonly aggroRadius: number;
  readonly aggroIndicatorColor: number;
  override readonly usesHitFlash: boolean = false;

  private contactDamageReadyAt = 0;
  protected dying = false;

  protected get isInvulnerable() {
    return false;
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    protected readonly config: BossCombatConfig<Pattern>,
  ) {
    super(scene, x, y, texture, config.maxHealth);

    this.aggroRadius = config.aggroRadius;
    this.aggroIndicatorColor = config.aggroIndicatorColor;
  }

  override tryContactAttack(time: number) {
    if (!this.active || time < this.contactDamageReadyAt) {
      return null;
    }

    this.contactDamageReadyAt = time + this.config.contactDamageCooldown;
    return this.config.contactDamage;
  }

  override takeDamage(amount: number) {
    return this.isInvulnerable ? false : super.takeDamage(amount);
  }

  override takeProjectileDamage(
    amount: number,
    hitX: number,
    hitY: number,
  ): ProjectileDamageResult {
    if (this.isInvulnerable) {
      this.showProjectileBlockedImpact(hitX, hitY, 'boss');
      return { applied: false, defeated: false };
    }
    return super.takeProjectileDamage(amount, hitX, hitY);
  }

  override applyKnockback(
    angle: number,
    force: number,
    time: number,
    durationMs = 160,
  ) {
    super.applyKnockback(angle, force * 0.18, time, durationMs * 0.5);
  }
  /**
   * 보스별 전용 효과 정리 뒤 공통 사망 포즈·페이드 순서를 적용한다.
   * 공격 패턴과 페이즈 전환은 각 하위 클래스가 계속 관리한다.
   */
  protected defeatWithSpriteAnimation({
    hasSprite,
    playDeathAnimation,
    holdDuration,
    fadeDuration,
    beforePlay,
  }: SpriteDeathSequence) {
    if (!this.active || this.dying) {
      return;
    }

    if (!hasSprite) {
      super.defeat();
      return;
    }

    this.dying = true;
    this.onDefeated();
    this.clearTint().setAlpha(1);
    beforePlay?.();
    playDeathAnimation();
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.time.delayedCall(holdDuration, () => {
      if (!this.scene || !this.visible) {
        return;
      }

      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: fadeDuration,
        ease: 'Sine.easeIn',
        onComplete: () => this.disableBody(true, true),
      });
    });
  }
}
