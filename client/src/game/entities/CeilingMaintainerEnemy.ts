import Phaser from 'phaser';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import {
  canDamageCeilingMaintainer,
  type CeilingMaintainerState,
} from '@/game/combat/stageThreeEnemyCombat';
import type { CeilingPipe } from '@/game/config/roomConfig';
import {
  STAGE_THREE_CEILING_MAINTAINER_BOMB,
  STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT,
} from '@/game/config/ceilingMaintainerAnimationConfig';
import { CEILING_MAINTAINER_CONFIG } from '@/game/config/stageThreeEnemyConfig';
import {
  Enemy,
  ENEMY_DEPTH,
  type EnemyProjectileAttack,
  type ProjectileDamageResult,
} from '@/game/entities/Enemy';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';

const PIPE_BODY_OFFSET_Y = 50;
const DROP_BLAST_RADIUS = 54;
const GROUND_DASH_TARGET_TOLERANCE = 8;
const GROUND_DASH_TIMEOUT_PADDING = 350;
const GROUND_MARK_DURATION = 1000;
const FLOOR_IDLE_DURATION = 1000;
const CONTACT_COOLDOWN = 700;

export class CeilingMaintainerEnemy extends Enemy {
  readonly aggroRadius = CEILING_MAINTAINER_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0x83dc7a;

  private maintainerState: CeilingMaintainerState = 'crawl';
  private stateEndsAt = 0;
  private nextAttackAt = 0;
  private relocateX: number;
  private lockedDropX = 0;
  private warningMarker?: Phaser.GameObjects.Ellipse;
  private groundMarker?: Phaser.GameObjects.Ellipse;
  private activeFragment?: Phaser.GameObjects.Image;
  private dropTween?: Phaser.Tweens.Tween;
  private contactReadyAt = 0;
  private lockedGroundTargetX = 0;
  private groundDashDirection = 1;
  private groundDashStarted = false;
  private floorSpriteAligned = false;
  private healthPhase: 1 | 2 = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    pipe: CeilingPipe,
    private readonly damagePlayer: (damage: number) => void,
  ) {
    super(
      scene,
      Phaser.Math.Clamp(x, pipe.x + 50, pipe.x + pipe.width - 50),
      pipe.y + PIPE_BODY_OFFSET_Y,
      CEILING_MAINTAINER_CONFIG.texture,
      CEILING_MAINTAINER_CONFIG.maxHealth,
    );
    this.relocateX = this.x;
    (this.body as Phaser.Physics.Arcade.Body)
      .setAllowGravity(false)
      .setSize(
        CEILING_MAINTAINER_CONFIG.bodyWidth,
        CEILING_MAINTAINER_CONFIG.bodyHeight,
        true,
      );
    this.setScale(CEILING_MAINTAINER_CONFIG.scale);
    this.play(CEILING_MAINTAINER_CONFIG.animations.pipeIdle);
    this.setDepth(ENEMY_DEPTH);
    this.pipe = pipe;
  }

  private readonly pipe: CeilingPipe;

  get phase() {
    return this.healthPhase;
  }

  override refreshAtlasSprite() {
    this.setScale(CEILING_MAINTAINER_CONFIG.scale);
    const anims = CEILING_MAINTAINER_CONFIG.animations;
    const keyByState: Record<CeilingMaintainerState, string> = {
      crawl: anims.pipeIdle,
      warning: anims.warning,
      relocate: anims.pipeMove,
      falling: anims.falling,
      'ground-mark': anims.floorIdle,
      'ground-dash': anims.groundDash,
      'floor-idle': anims.floorIdle,
    };
    this.play(keyByState[this.maintainerState], true);
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;

    if (
      this.healthPhase === 2 &&
      this.maintainerState !== 'falling' &&
      this.maintainerState !== 'ground-mark' &&
      this.maintainerState !== 'ground-dash' &&
      this.maintainerState !== 'floor-idle'
    ) {
      this.dropFromPipe();
    }

    if (
      this.maintainerState === 'falling' ||
      this.maintainerState === 'ground-mark' ||
      this.maintainerState === 'ground-dash' ||
      this.maintainerState === 'floor-idle'
    ) {
      this.updateGroundRush(time, target);
      return targetInRange;
    }

    this.setFlipX(target.x < this.x);
    // 한 번 시작한 경고와 파이프 재배치는 플레이어가 감지 범위를 벗어나도
    // 끝까지 진행해야 함. 거리 검사를 먼저 하면 이 상태와 애니메이션이
    // 영구 정지해 pipe-move에서 idle로 돌아오지 못함.
    if (this.maintainerState === 'warning') {
      this.setVelocityX(0);
      if (time >= this.stateEndsAt) {
        this.launchDrop(target);
      }
      return true;
    }

    if (this.maintainerState === 'relocate') {
      const direction = Math.sign(this.relocateX - this.x);
      this.setVelocityX(direction * CEILING_MAINTAINER_CONFIG.crawlSpeed);
      if (Math.abs(this.relocateX - this.x) < 8) {
        this.setPosition(this.relocateX, this.pipe.y + PIPE_BODY_OFFSET_Y);
        this.setVelocityX(0);
        this.maintainerState = 'crawl';
        this.play(CEILING_MAINTAINER_CONFIG.animations.pipeIdle, true);
        this.nextAttackAt = time + CEILING_MAINTAINER_CONFIG.attackCooldown;
      }
      return true;
    }

    if (!targetInRange) {
      this.setVelocityX(0);
      return false;
    }

    this.setVelocityX(0);
    if (time >= this.nextAttackAt) {
      this.beginWarning(time, target.x);
    }
    return true;
  }

  override tryContactAttack(time: number) {
    if (
      this.maintainerState !== 'ground-dash' ||
      time < this.contactReadyAt
    ) {
      return null;
    }

    this.contactReadyAt = time + CONTACT_COOLDOWN;
    return CEILING_MAINTAINER_CONFIG.groundDashDamage;
  }

  override takeDamage(amount: number) {
    const defeated = super.takeDamage(amount);
    if (!defeated || this.healthPhase === 2) {
      return defeated;
    }

    this.healthPhase = 2;
    this.restoreHealth();
    this.dropFromPipe();
    return false;
  }

  override applyKnockback(
    angle: number,
    force: number,
    time: number,
    durationMs?: number,
  ) {
    if (this.maintainerState !== 'falling') {
      super.applyKnockback(angle, force, time, durationMs);
      this.setVelocityY(0);
    }
  }

  override takeProjectileDamage(
    amount: number,
    hitX: number,
    hitY: number,
  ): ProjectileDamageResult {
    if (
      !canDamageCeilingMaintainer(this.maintainerState) ||
      (this.healthPhase === 2 && !this.groundDashStarted)
    ) {
      return { applied: false, defeated: false };
    }
    return super.takeProjectileDamage(amount, hitX, hitY);
  }

  protected override onDefeated() {
    super.onDefeated();
    this.clearAttackObjects();
    this.clearTint();
  }

  override destroy(fromScene?: boolean) {
    this.clearAttackObjects();
    super.destroy(fromScene);
  }

  private beginWarning(time: number, targetX: number) {
    this.maintainerState = 'warning';
    this.play(CEILING_MAINTAINER_CONFIG.animations.warning, true);
    this.stateEndsAt = time + CEILING_MAINTAINER_CONFIG.warningDuration;
    this.lockedDropX = targetX;
    this.warningMarker = this.scene.add
      .ellipse(
        targetX,
        FLOOR_SURFACE_Y + 3,
        DROP_BLAST_RADIUS * 2,
        18,
        0xff3b30,
        0.5,
      )
      .setDepth(7);
  }

  private launchDrop(target: Phaser.Physics.Arcade.Sprite) {
    this.clearTint();
    const fragment = this.scene.add
      .image(
        this.x,
        this.y + 18,
        STAGE_THREE_CEILING_MAINTAINER_BOMB.texture,
      )
      .setDisplaySize(
        STAGE_THREE_CEILING_MAINTAINER_BOMB.width,
        STAGE_THREE_CEILING_MAINTAINER_BOMB.height,
      )
      .setDepth(9);
    this.activeFragment = fragment;
    this.dropTween = this.scene.tweens.add({
      targets: fragment,
      x: this.lockedDropX,
      y:
        FLOOR_SURFACE_Y -
        STAGE_THREE_CEILING_MAINTAINER_BOMB.height / 2,
      rotation: Math.PI * 2,
      duration: 420,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.dropTween = undefined;
        this.activeFragment = undefined;
        fragment.destroy();
        this.warningMarker?.destroy();
        this.warningMarker = undefined;
        this.flashDropImpact(this.lockedDropX);
        if (
          target.active &&
          Math.abs(target.x - this.lockedDropX) <= DROP_BLAST_RADIUS &&
          target.y > GAME_HEIGHT - 230
        ) {
          this.damagePlayer(CEILING_MAINTAINER_CONFIG.dropDamage);
        }
      },
    });
    this.maintainerState = 'relocate';
    this.play(CEILING_MAINTAINER_CONFIG.animations.pipeMove, true);
    const left = this.pipe.x + 70;
    const right = this.pipe.x + this.pipe.width - 70;
    this.relocateX = this.x < (left + right) / 2 ? right : left;
  }

  private flashDropImpact(x: number) {
    const pulse = this.scene.add
      .image(
        x,
        FLOOR_SURFACE_Y + 10,
        STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT.texture,
      )
      .setOrigin(0.5, STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT.originY)
      .setDisplaySize(
        STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT.width,
        STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT.height,
      )
      .setDepth(9);
    const targetScaleX = pulse.scaleX;
    const targetScaleY = pulse.scaleY;
    pulse.setScale(targetScaleX * 0.72, targetScaleY * 0.72);
    this.scene.tweens.add({
      targets: pulse,
      scaleX: targetScaleX,
      scaleY: targetScaleY,
      alpha: 0,
      duration: 220,
      onComplete: () => pulse.destroy(),
    });
  }

  private dropFromPipe() {
    this.clearAttackObjects();
    this.maintainerState = 'falling';
    this.play(CEILING_MAINTAINER_CONFIG.animations.falling, true);
    this.setVelocity(0, 80);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
  }

  private updateGroundRush(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    const body = this.body as Phaser.Physics.Arcade.Body;

    // 지상 상태에서 발밑이 비면(구덩이 위) 그대로 추락에 돌입한다. 반대편
    // 구덩이 ledge 타일 벽에 걸려 멈추거나 위로 튕기지 않도록 바닥 재충돌을
    // 끊고 낙하시켜, handleEnemyPitFalls가 화면 밖에서 처치하게 한다.
    if (this.maintainerState !== 'falling' && !body.blocked.down) {
      this.commitPitFall();
      return;
    }

    if (this.maintainerState === 'falling') {
      if (!body.blocked.down) {
        return;
      }
      this.beginGroundMark(time, target.x);
      return;
    }

    if (this.maintainerState === 'floor-idle') {
      this.setVelocityX(0);
      if (time >= this.stateEndsAt) {
        this.beginGroundMark(time, target.x);
      }
      return;
    }

    if (this.maintainerState === 'ground-mark') {
      this.setVelocityX(0);
      if (time < this.stateEndsAt) {
        return;
      }
      this.beginGroundDash(time);
    }

    const reachedTarget =
      this.groundDashDirection < 0
        ? this.x <=
          this.lockedGroundTargetX + GROUND_DASH_TARGET_TOLERANCE
        : this.x >=
          this.lockedGroundTargetX - GROUND_DASH_TARGET_TOLERANCE;
    const blockedInDashDirection =
      this.groundDashDirection < 0 ? body.blocked.left : body.blocked.right;
    if (reachedTarget || blockedInDashDirection || time >= this.stateEndsAt) {
      this.beginFloorIdle(time);
      return;
    }
    this.setVelocityX(
      this.groundDashDirection * CEILING_MAINTAINER_CONFIG.groundDashSpeed,
    );
  }

  private commitPitFall() {
    this.maintainerState = 'falling';
    this.play(CEILING_MAINTAINER_CONFIG.animations.falling, true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    // 바닥/ledge 타일·월드 경계와 더는 충돌하지 않게 해 구덩이로 완전히 추락시킨다.
    body.checkCollision.none = true;
    body.setCollideWorldBounds(false);
    this.setVelocityX(0);
    if (body.velocity.y < 80) {
      this.setVelocityY(80);
    }
    this.groundMarker?.destroy();
    this.groundMarker = undefined;
  }

  private beginGroundMark(time: number, targetX: number) {
    this.maintainerState = 'ground-mark';
    this.stateEndsAt = time + GROUND_MARK_DURATION;
    this.lockedGroundTargetX = targetX;
    this.alignFloorSprite();
    // 착지 뒤에도 중력을 유지해야 바닥 높이에 붙어 움직인다. 중력을 끄면
    // 구덩이에 진입했을 때 바닥 아래에서 공중에 멈춰 버린다.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    this.setVelocityX(0);
    this.play(CEILING_MAINTAINER_CONFIG.animations.floorIdle, true);
    this.groundMarker?.destroy();
    this.groundMarker = this.scene.add
      .ellipse(targetX, FLOOR_SURFACE_Y - 5, 92, 20, 0xff9b62, 0.14)
      .setStrokeStyle(2, 0xffb27b, 0.95)
      .setDepth(7);
  }

  private alignFloorSprite() {
    if (this.floorSpriteAligned) {
      return;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    const lift = CEILING_MAINTAINER_CONFIG.floorBodyOffsetY - body.offset.y;
    // 바디 하단을 유지한 채 오프셋만 바꿔 불투명 픽셀 하단과 맞춤.
    this.setY(this.y - lift);
    body.setOffset(body.offset.x, CEILING_MAINTAINER_CONFIG.floorBodyOffsetY);
    body.updateFromGameObject();
    this.floorSpriteAligned = true;
  }

  private beginGroundDash(time: number) {
    this.maintainerState = 'ground-dash';
    this.groundDashStarted = true;
    const distance = Math.abs(this.lockedGroundTargetX - this.x);
    this.stateEndsAt =
      time +
      (distance / CEILING_MAINTAINER_CONFIG.groundDashSpeed) * 1000 +
      GROUND_DASH_TIMEOUT_PADDING;
    this.groundDashDirection =
      Math.sign(this.lockedGroundTargetX - this.x) ||
      (this.flipX ? -1 : 1);
    this.setFlipX(this.groundDashDirection < 0);
    this.groundMarker?.destroy();
    this.groundMarker = undefined;
    this.play(CEILING_MAINTAINER_CONFIG.animations.groundDash, true);
  }

  private beginFloorIdle(time: number) {
    this.maintainerState = 'floor-idle';
    this.stateEndsAt = time + FLOOR_IDLE_DURATION;
    this.setVelocityX(0);
    this.play(CEILING_MAINTAINER_CONFIG.animations.floorIdle, true);
  }

  private clearAttackObjects() {
    this.dropTween?.stop();
    this.dropTween = undefined;
    this.activeFragment?.destroy();
    this.activeFragment = undefined;
    this.warningMarker?.destroy();
    this.warningMarker = undefined;
    this.groundMarker?.destroy();
    this.groundMarker = undefined;
  }
}
