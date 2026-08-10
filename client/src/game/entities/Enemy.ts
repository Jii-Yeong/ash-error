import Phaser from 'phaser';
import {
  gameEvents,
  type ProjectileBlockKind,
} from '@/game/events/gameEvents';

/** 격추된 공중 적이 떨어지는 속도(px/s). */
const AERIAL_DEATH_FALL_SPEED = 720;
/** 착지한 잔해가 사라지기 전에 머무는 시간. */
const AERIAL_DEATH_HOLD_MS = 400;
/** 잔해 페이드아웃 시간. */
const AERIAL_DEATH_FADE_MS = 350;

const aerialDeathFallDuration = (fallDistance: number) =>
  Phaser.Math.Clamp((fallDistance / AERIAL_DEATH_FALL_SPEED) * 1_000, 120, 900);

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

  /** 방 클리어를 알리기 전에 죽음 연출이 끝나길 기다리는 시간. */
  get deathAnimationDuration(): number {
    return 0;
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
   * 방 전환·재시작 등으로 적이 파괴될 때, 이 적을 대상으로 남아 있는 트윈을
   * 함께 정리한다. 죽음 연출 트윈이 파괴 뒤 완료돼 이미 사라진 body를 만지며
   * 터지는 것(예: `disableBody`)을 막는다.
   */
  destroy(fromScene?: boolean) {
    this.scene?.tweens.killTweensOf(this);
    super.destroy(fromScene);
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

  protected onDefeated() {
    this.setVelocity(0);
  }

  /** 현재 높이부터 착지·유지·페이드까지 필요한 전체 공중 사망 연출 시간. */
  protected getAerialDeathDuration(restY: number, landAnimation: string) {
    const fallDistance = Math.max(0, restY - this.y);
    const landDuration = this.scene.anims.get(landAnimation)?.duration ?? 0;
    return (
      aerialDeathFallDuration(fallDistance) +
      landDuration +
      AERIAL_DEATH_HOLD_MS +
      AERIAL_DEATH_FADE_MS
    );
  }

  /** 공중 적이 첫 자세로 추락한 뒤 착지 자세를 보이고 사라지는 공용 연출. */
  protected playAerialDeath(
    fallAnimation: string,
    landAnimation: string,
    restY: number,
  ) {
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.play(fallAnimation, true);
    const fallDistance = Math.max(0, restY - this.y);
    this.scene.tweens.add({
      targets: this,
      y: this.y + fallDistance,
      duration: aerialDeathFallDuration(fallDistance),
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.play(landAnimation, true);
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.time.delayedCall(AERIAL_DEATH_HOLD_MS, () => {
            if (!this.active) {
              return;
            }
            this.scene.tweens.add({
              targets: this,
              alpha: 0,
              duration: AERIAL_DEATH_FADE_MS,
              ease: 'Sine.easeIn',
              onComplete: () => this.disableBody(true, true),
            });
          });
        });
      },
    });
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

  /** 다음 체력 페이즈를 시작할 때 체력을 최대치로 복구함. */
  protected restoreHealth() {
    this.health = this.maxHealth;
  }

  /** 투사체 충돌 좌표를 쓰지 않는 적의 기본 피격 처리. */
  takeProjectileDamage(
    amount: number,
    _hitX: number,
    _hitY: number,
    _weaponId?: string,
  ): ProjectileDamageResult {
    return { applied: true, defeated: this.takeDamage(amount) };
  }

  /**
   * 방어된 투사체의 스파크와 소리를 함께 낸다.
   *
   * 둘을 나눠 두면 다음에 투사체를 막는 적이 스파크만 얻고 소리 없이 나가기
   * 쉽다 — 실제로 그렇게 한 번 빠졌다. `kind`를 받아 여기서 같이 내보내면
   * 잊을 자리가 없어진다.
   */
  protected showProjectileBlockedImpact(
    x: number,
    y: number,
    kind: ProjectileBlockKind,
  ) {
    const spark = this.scene.add
      .circle(x, y, 5, 0xb9d5d2, 0.9)
      .setStrokeStyle(2, 0xffffff)
      .setDepth(12);
    this.scene.tweens.add({
      targets: spark,
      scale: 2.4,
      alpha: 0,
      duration: 100,
      onComplete: () => spark.destroy(),
    });
    gameEvents.emit('enemy-projectile-blocked', kind);
  }

  get currentHealth() {
    return this.health;
  }
}
