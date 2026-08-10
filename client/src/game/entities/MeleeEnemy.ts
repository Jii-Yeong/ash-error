import Phaser from 'phaser';
import type { MeleeSwingConfig } from '@/game/config/combatConfig';
import {
  MELEE_SWING_EFFECT,
  type MeleeSpriteConfig,
} from '@/game/config/meleeEnemyAnimationConfig';
import {
  Enemy,
  ENEMY_DEPTH,
  type EnemyProjectileAttack,
} from '@/game/entities/Enemy';
import { GroundedEnemySprite } from '@/game/systems/GroundedEnemySprite';

export type MeleeEnemyConfig = {
  health: number;
  aggroRadius: number;
  moveSpeed: number;
  contactDamage: number;
  contactDamageCooldown: number;
  /** 플레이어를 감지하기 전에 순찰할 구간. 없으면 순찰할 공간이 없다는 뜻이다. */
  patrol?: { left: number; right: number; speed: number };
  /** 설정 시 적이 접촉 데미지 대신 휘두르기로 공격함. */
  swing?: MeleeSwingConfig;
  /** 실제 아틀라스 아트. 휘두르기는 attack 애니메이션 + 슬래시 VFX로 표현됨. */
  sprite?: MeleeSpriteConfig;
};

type MeleeState = 'chase' | 'windup' | 'swing' | 'recover';

type PlayerDamageHandler = (damage: number) => void;

/** 적 중심(앞손)에서 봉 회전축까지의 오프셋(px). */
const HAND_OFFSET_X = 12;
const HAND_OFFSET_Y = -6;
/** 오른쪽을 보는 적 기준 봉 각도(라디안, 0 = 수평 전방). */
const ROD_REST_ANGLE = 0.38;
const ROD_RAISED_ANGLE = -2.05;
const ROD_FORWARD_ANGLE = 0.85;

const SLASH_DEPTH = 9;
const SLASH_SIZE = 128;

export class MeleeEnemy extends Enemy {
  readonly aggroRadius: number;
  readonly aggroIndicatorColor = 0xf08b52;

  private readonly moveSpeed: number;
  private readonly contactDamage: number;
  private readonly contactDamageCooldown: number;
  private readonly patrol?: MeleeEnemyConfig['patrol'];
  private patrolHeading: -1 | 1;
  private contactDamageReadyAt = 0;

  private readonly swing?: MeleeSwingConfig;
  private readonly sprite?: MeleeSpriteConfig;
  private readonly damagePlayer?: PlayerDamageHandler;
  private readonly rod?: Phaser.GameObjects.Rectangle;
  private readonly slash?: Phaser.GameObjects.Image;
  private readonly rig?: GroundedEnemySprite;
  private attackState: MeleeState = 'chase';
  private stateStartedAt = 0;
  private stateEndsAt = 0;
  private swingConnected = false;
  private dying = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: MeleeEnemyConfig,
    damagePlayer?: PlayerDamageHandler,
  ) {
    super(scene, x, y, texture, config.health);

    this.aggroRadius = config.aggroRadius;
    this.moveSpeed = config.moveSpeed;
    this.contactDamage = config.contactDamage;
    this.contactDamageCooldown = config.contactDamageCooldown;
    this.patrol = config.patrol;
    // 구덩이 때문에 한쪽이 짧아진 순찰 구간에서 시작부터 방향을 바꾸지 않도록
    // 더 긴 쪽을 향해 출발한다.
    this.patrolHeading =
      this.patrol && x - this.patrol.left > this.patrol.right - x ? -1 : 1;
    this.swing = config.swing;
    this.sprite = config.sprite;
    this.damagePlayer = damagePlayer;
    // 지형 발판 앞에 렌더링(봉/슬래시는 this.depth를 따름).
    this.setDepth(ENEMY_DEPTH);

    if (this.sprite) {
      this.slash = scene.add
        .image(x, y, MELEE_SWING_EFFECT.texture)
        .setDepth(SLASH_DEPTH)
        .setVisible(false);
      this.rig = new GroundedEnemySprite(this, this.sprite);
      this.rig.apply();
    } else if (this.swing) {
      this.rod = scene.add
        .rectangle(
          x,
          y,
          this.swing.rodLength,
          this.swing.rodThickness,
          this.swing.rodColor,
        )
        .setOrigin(0.12, 0.5)
        .setDepth(this.depth);
      this.positionRod(ROD_REST_ANGLE);
    }
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    if (!this.active || this.dying) {
      return false;
    }

    const distance = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      target.x,
      target.y,
    );
    const targetInRange = distance <= this.aggroRadius;

    if (this.swing) {
      return this.updateSwingCombat(time, target, targetInRange);
    }

    // 경직 중에는 즉시 추적을 재개하지 않고 밀려나는 힘을 그대로 적용한다.
    if (this.isStaggered(time)) {
      return targetInRange;
    }

    if (!targetInRange) {
      this.patrolStep();
      return false;
    }

    const direction = Math.sign(target.x - this.x);
    this.setFlipX(direction < 0);
    this.setVelocityX(direction * this.moveSpeed);

    return true;
  }

  /**
   * 감지 범위에 대상이 없을 때 순찰 구간을 걷는다. 시간 대신 끝점 도달 시
   * 방향을 바꾸므로, 밀려나거나 추적 중 구간 밖으로 나간 적도 현재 위치에서
   * 새로 순찰하지 않고 원래 구간으로 돌아온다.
   */
  private patrolStep() {
    if (!this.patrol) {
      this.setVelocityX(0);
      return;
    }

    if (this.x <= this.patrol.left) {
      this.patrolHeading = 1;
    } else if (this.x >= this.patrol.right) {
      this.patrolHeading = -1;
    }

    this.setFlipX(this.patrolHeading < 0);
    this.setVelocityX(this.patrolHeading * this.patrol.speed);
  }

  private updateSwingCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    targetInRange: boolean,
  ) {
    // 경직이 들어올리기 동작을 끊어, 타이밍 좋은 강한 넉백 사격이
    // 휘두르기를 취소함. 비주얼은 rest 자세로 스냅됨.
    if (this.isStaggered(time)) {
      if (this.attackState !== 'chase') {
        this.attackState = 'chase';
      }
      this.restVisual();
      return targetInRange;
    }

    switch (this.attackState) {
      case 'chase':
        this.updateChase(time, target, targetInRange);
        break;
      case 'windup':
        this.updateWindup(time);
        break;
      case 'swing':
        this.updateSwing(time, target);
        break;
      case 'recover':
        this.updateRecover(time);
        break;
    }

    return targetInRange;
  }

  private updateChase(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    targetInRange: boolean,
  ) {
    if (!targetInRange) {
      this.patrolStep();
      this.restVisual();
      return;
    }

    const swing = this.swing!;
    const direction = Math.sign(target.x - this.x) || 1;
    this.setFlipX(direction < 0);

    const horizontalDistance = Math.abs(target.x - this.x);
    const withinHeight = Math.abs(target.y - this.y) <= swing.verticalTolerance;

    if (horizontalDistance <= swing.attackRange && withinHeight) {
      this.beginState('windup', time, swing.windupDuration);
      this.setVelocityX(0);
      this.beginAttackVisual();
      return;
    }

    this.setVelocityX(direction * this.moveSpeed);
    // 다가가는 동안 walk(스프라이트), 또는 봉을 rest 자세로 듦.
    if (this.sprite) {
      this.rig?.play(this.sprite.animations.walk);
    } else {
      this.positionRod(ROD_REST_ANGLE);
    }
  }

  private updateWindup(time: number) {
    this.setVelocityX(0);
    if (this.rod) {
      // 들어올리는 동안 봉을 올려, 다가올 휘두르기를 예고함.
      this.positionRod(
        Phaser.Math.Linear(
          ROD_REST_ANGLE,
          ROD_RAISED_ANGLE,
          this.stateProgress(time),
        ),
      );
    }

    if (time >= this.stateEndsAt) {
      this.beginState('swing', time, this.swing!.swingDuration);
      this.swingConnected = false;
    }
  }

  private updateSwing(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.setVelocityX(0);
    const progress = this.stateProgress(time);
    // ease-out으로 궤적이 아래로 탁 꺾이게 함.
    const swingCurve = 1 - (1 - progress) * (1 - progress);

    if (this.slash) {
      this.drawSlash(swingCurve, 1 - progress);
    } else if (this.rod) {
      this.positionRod(
        Phaser.Math.Linear(ROD_RAISED_ANGLE, ROD_FORWARD_ANGLE, swingCurve),
      );
    }

    if (!this.swingConnected && this.swingHits(target)) {
      this.swingConnected = true;
      this.damagePlayer?.(this.swing!.damage);
    }

    if (time >= this.stateEndsAt) {
      this.slash?.setVisible(false);
      this.beginState('recover', time, this.swing!.recoverDuration);
    }
  }

  private updateRecover(time: number) {
    this.setVelocityX(0);
    if (this.sprite) {
      this.rig?.play(this.sprite.animations.idle);
    } else if (this.rod) {
      this.positionRod(
        Phaser.Math.Linear(
          ROD_FORWARD_ANGLE,
          ROD_REST_ANGLE,
          this.stateProgress(time),
        ),
      );
    }

    if (time >= this.stateEndsAt) {
      this.attackState = 'chase';
    }
  }

  private swingHits(target: Phaser.Physics.Arcade.Sprite) {
    const swing = this.swing!;
    const facing = this.flipX ? -1 : 1;
    const dx = target.x - this.x;
    const onFacingSide = Math.sign(dx) === facing || Math.abs(dx) < 10;

    return (
      onFacingSide &&
      Math.abs(dx) <= swing.reach &&
      Math.abs(target.y - this.y) <= swing.verticalTolerance
    );
  }

  /** rest 자세: 봉을 낮게 듦. 실제 스프라이트는 walk/idle. */
  private restVisual() {
    if (this.sprite) {
      const moving = Math.abs(this.body?.velocity.x ?? 0) > 1;
      this.rig?.play(
        moving ? this.sprite.animations.walk : this.sprite.animations.idle,
      );
    } else {
      this.positionRod(ROD_REST_ANGLE);
    }
    this.slash?.setVisible(false);
  }

  private beginAttackVisual() {
    if (this.sprite) {
      this.rig?.play(this.sprite.animations.attack);
    }
  }

  private drawSlash(sweep: number, fade: number) {
    if (!this.slash) {
      return;
    }

    const facing = this.flipX ? -1 : 1;
    const size = SLASH_SIZE * (0.86 + sweep * 0.14);
    this.slash
      .setPosition(
        this.x + facing * HAND_OFFSET_X,
        this.y + HAND_OFFSET_Y,
      )
      .setFlipX(facing < 0)
      .setDisplaySize(size, size)
      .setAlpha(0.25 + fade * 0.75)
      .setVisible(true);
  }

  private positionRod(angleForRight: number) {
    if (!this.rod) {
      return;
    }

    const facing = this.flipX ? -1 : 1;
    this.rod.setPosition(
      this.x + facing * HAND_OFFSET_X,
      this.y + HAND_OFFSET_Y,
    );
    // 왼쪽을 볼 때 각도를 반전해, 봉이 앞쪽에 유지되게 함.
    this.rod.setRotation(
      facing === 1 ? angleForRight : Math.PI - angleForRight,
    );
    this.rod.setDepth(this.depth);
  }

  private beginState(state: MeleeState, time: number, duration: number) {
    this.attackState = state;
    this.stateStartedAt = time;
    this.stateEndsAt = time + duration;
  }

  private stateProgress(time: number) {
    if (this.stateEndsAt <= this.stateStartedAt) {
      return 1;
    }

    return Phaser.Math.Clamp(
      (time - this.stateStartedAt) / (this.stateEndsAt - this.stateStartedAt),
      0,
      1,
    );
  }

  override get playsOwnDeathAnimation() {
    return Boolean(this.sprite);
  }

  override refreshAtlasSprite() {
    this.rig?.refresh();
  }

  override defeat() {
    if (!this.active || !this.rig) {
      super.defeat();
      return;
    }

    this.dying = true;
    this.onDefeated();
    this.rig.playDeath(() => this.disableBody(true, true));
  }

  protected override onDefeated() {
    super.onDefeated();
    this.rod?.destroy();
    this.slash?.destroy();
  }

  override destroy(fromScene?: boolean) {
    this.rod?.destroy();
    this.slash?.destroy();
    super.destroy(fromScene);
  }

  override tryContactAttack(time: number) {
    // 봉 휘두르기 적은 접촉이 아니라 휘두르기로만 데미지를 줌.
    if (this.swing || !this.active || time < this.contactDamageReadyAt) {
      return null;
    }

    this.contactDamageReadyAt = time + this.contactDamageCooldown;
    return this.contactDamage;
  }
}
