import Phaser from 'phaser';

export type EnemyProjectileAttack = (
  enemy: Enemy,
  target: Phaser.Physics.Arcade.Sprite,
) => void;

export type EnemyProjectileKind = 'ranged' | 'flying';

/**
 * 잡몹은 지형 발판(depth 5) 앞에 렌더링되어 2·3층 발판 뒤에 가려지지
 * 않으면서, 플레이어(8)보다는 아래에 유지됨.
 */
export const ENEMY_DEPTH = 6;

export type EnemyProjectileProfile = {
  kind: EnemyProjectileKind;
  muzzleOffset: number;
};

export type ProjectileDamageResult = {
  applied: boolean;
  defeated: boolean;
};

export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  abstract readonly aggroRadius: number;
  abstract readonly aggroIndicatorColor: number;
  /** 이 적이 공용 흰색 피격 플래시를 사용하는지 여부. */
  readonly usesHitFlash: boolean = true;
  /** 흰색 채움 틴트가 보이는 동안의 불투명도. */
  readonly hitFlashAlpha: number = 1;
  /**
   * 이 적이 자신의 `defeat()`에서 죽음 애니메이션을 재생하는지 여부.
   * true면 씬은 공용 확장-잔상 죽음 연출을 건너뜀.
   */
  get playsOwnDeathAnimation(): boolean {
    return false;
  }

  /**
   * 스테이지 아트가 스폰보다 늦게 로드된(콜드) 경우, 로드 완료 후 스프라이트를
   * 다시 적용하도록 GameScene이 호출한다. 실제 아틀라스를 쓰는 적만 재정의한다.
   */
  refreshAtlasSprite(): void {}
  readonly maxHealth: number;
  /** Set by ranged-style subclasses so GameScene can route fire without an instanceof check. */
  readonly projectile: EnemyProjectileProfile | null = null;

  private health: number;
  private nextFireAt = 0;
  private staggeredUntil = 0;

  protected constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    health: number,
  ) {
    super(scene, x, y, texture);

    this.health = health;
    this.maxHealth = health;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    // Lets a knockback impulse decay to rest instead of sliding forever;
    // enemies that drive their own velocity each frame overwrite it anyway.
    this.setDragX(520);
  }

  /**
   * Shoves the enemy along `angle` and briefly stuns it so its own movement
   * doesn't immediately cancel the push. A grounded enemy also pops upward a
   * little so the hit reads.
   */
  applyKnockback(angle: number, force: number, time: number, durationMs = 160) {
    if (!this.active || force <= 0) {
      return;
    }

    this.setVelocity(Math.cos(angle) * force, -Math.abs(force) * 0.18);
    this.staggeredUntil = time + durationMs;
  }

  isStaggered(time: number) {
    return time < this.staggeredUntil;
  }

  abstract updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    fireProjectile: EnemyProjectileAttack,
  ): boolean;

  tryContactAttack(_time: number): number | null {
    return null;
  }

  defeat() {
    if (!this.active) {
      return;
    }

    this.onDefeated();
    this.disableBody(true, true);
  }

  /** 구덩이 아래로 사라질 때 죽음 애니메이션 없이 즉시 정리함. */
  despawnAfterPitFall() {
    if (!this.active) {
      return;
    }

    this.onDefeated();
    this.disableBody(true, true);
  }

  protected onDefeated() {
    this.setVelocity(0);
  }

  /**
   * Shared 'face the target, fire on cooldown when in range' behavior for
   * ranged-style enemies. Returns whether the target is within aggro range.
   */
  protected updateRangedAttack(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    fireProjectile: EnemyProjectileAttack,
    fireInterval: number,
  ): boolean {
    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;

    this.setFlipX(target.x < this.x);

    if (targetInRange && !this.isStaggered(time) && time >= this.nextFireAt) {
      fireProjectile(this, target);
      this.nextFireAt = time + fireInterval;
      this.onRangedFire(time);
    }

    return targetInRange;
  }

  /** 서브클래스가 피격에 반응하는 훅(예: attack 애니메이션 재생). */
  protected onRangedFire(_time: number) {}

  takeDamage(amount: number) {
    if (!this.active) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    return this.health === 0;
  }

  /** 투사체 충돌 좌표를 쓰지 않는 적의 기본 피격 처리. */
  takeProjectileDamage(
    amount: number,
    _hitX: number,
    _hitY: number,
  ): ProjectileDamageResult {
    return { applied: true, defeated: this.takeDamage(amount) };
  }

  get currentHealth() {
    return this.health;
  }
}
