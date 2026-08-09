import Phaser from 'phaser';
import type {
  HoundBossPatternConfig,
  HoundBossCombatConfig,
  HoundBossSpriteConfig,
} from '@/game/config/bossConfigTypes';
import { isPointInsideCone } from '@/game/combat/coneGeometry';
import { BossEnemy } from '@/game/entities/BossEnemy';
import type { EnemyProjectileAttack } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import { destroyCollider } from '@/game/systems/arcadePhysicsCleanup';
import { CleanupRegistry } from '@/game/systems/CleanupRegistry';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';
import { SearchlightCone } from '@/game/systems/SearchlightCone';

type HoundState = 'recover' | 'scanning' | 'locking';

type PlayerDamageHandler = (damage: number) => void;

type Point = { x: number; y: number };

const ORB_LIFETIME = 2600;
const ORB_DEPTH = 10;
/** 사격 후 이동 포즈로 돌아가기 전 attack 포즈를 유지하는 시간. */
const ATTACK_POSE_HOLD_MS = 320;
/** 죽음 포즈를 보여주는 시간과, 그 뒤 페이드아웃에 걸리는 시간. */
const DEATH_POSE_HOLD_MS = 1600;
const DEATH_FADE_MS = 600;

/**
 * Stage-2 boss (the searchlight hound). It sweeps a wide red detection fan
 * toward the player and down across the ground; the instant the player is
 * caught inside it the hound locks on (the fan flares) and lobs a round energy
 * orb along the line of sight. No hitscan beam — deliberately unlike the city
 * warden's laser cannon.
 */
export class HoundBossEnemy extends BossEnemy<HoundBossPatternConfig> {
  override readonly usesHitFlash: boolean = true;
  override readonly hitFlashAlpha: number = 0.72;

  private readonly cone: SearchlightCone;
  private attackState: HoundState = 'recover';
  private stateStartedAt = 0;
  private stateEndsAt: number;
  private centerAngle = 0;
  private readonly orbCleanups = new CleanupRegistry();
  private activeSpriteAnimation?: string;
  private attackPoseUntil = 0;
  private dying = false;
  private scanAudioActive = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: HoundBossCombatConfig,
    private readonly damagePlayer: PlayerDamageHandler,
    private readonly sprite?: HoundBossSpriteConfig,
  ) {
    super(scene, x, y, texture, config);

    this.stateEndsAt = scene.time.now + config.pattern.firstAttackDelay;
    this.cone = new SearchlightCone(scene, config.pattern.cone.color);
    this.applyBossSprite();
  }

  override get playsOwnDeathAnimation(): boolean {
    return Boolean(this.sprite);
  }

  /**
   * 실제 아틀라스 프레임에는 여백이 있어, 물리 바디를 메카 크기에 맞추고
   * 발이 바닥에 닿도록 하단 정렬함. 제공된 Aseprite 태그가 포즈를 구동함.
   */
  private applyBossSprite() {
    if (!this.sprite) {
      return;
    }

    this.setScale(this.sprite.scale);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.sprite.bodyWidth, this.sprite.bodyHeight);
    if (
      this.sprite.bodyOffsetX !== undefined &&
      this.sprite.bodyOffsetY !== undefined
    ) {
      body.setOffset(this.sprite.bodyOffsetX, this.sprite.bodyOffsetY);
    }
    this.playSpriteAnimation(this.sprite.animations.idle);
  }

  private playSpriteAnimation(animation: string) {
    if (!this.sprite || this.activeSpriteAnimation === animation) {
      return;
    }

    this.activeSpriteAnimation = animation;
    this.play(animation, true);
  }

  /** 스프라이트가 대상을 바라보도록 flipX 설정(기본 좌향 아트 보정 포함). */
  private faceToward(faceRight: boolean) {
    // 기본 우향 아트는 오른쪽을 볼 때 flip 없음. facesLeft면 반전.
    this.setFlipX(this.sprite?.facesLeft ? faceRight : !faceRight);
  }

  /** 이동 중이면 walk, 멈춰 있으면 idle. 사격 직후 짧은 attack 포즈는 존중함. */
  private updateLocomotionAnimation(time: number) {
    if (!this.sprite || time < this.attackPoseUntil) {
      return;
    }

    const moving =
      Math.abs((this.body as Phaser.Physics.Arcade.Body).velocity.x) > 1;
    this.playSpriteAnimation(
      moving ? this.sprite.animations.walk : this.sprite.animations.idle,
    );
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    // 두 경로 모두 스캔을 중단하고 콘을 지운다. 스캔음은 루프라 여기서 함께
    // 닫지 않으면, 보스가 살아 있고 플레이어만 멀어진 상황에서 화면에는
    // 아무것도 없는데 스캔 험만 계속 돈다. AudioDirector의 일괄 정지는
    // 사망·일시정지·스테이지 전환만 덮으므로 이 경로는 걸리지 않는다.
    if (!this.active || this.dying) {
      this.endScanAudio();
      this.cone.hide();
      return false;
    }

    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    if (!targetInRange) {
      this.endScanAudio();
      this.setVelocityX(0);
      this.cone.hide();
      this.playSpriteAnimation(this.sprite?.animations.idle ?? '');
      return false;
    }

    switch (this.attackState) {
      case 'recover':
        this.updateRecover(time, target);
        break;
      case 'scanning':
        this.updateScanning(time, target);
        break;
      case 'locking':
        this.updateLocking(time, target);
        break;
    }

    return true;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.endScanAudio();
    this.cone.hide();
    this.orbCleanups.clear();
  }

  override defeat() {
    if (!this.active || this.dying) {
      return;
    }

    if (!this.sprite) {
      super.defeat();
      return;
    }

    this.dying = true;
    this.onDefeated();
    this.clearTint().setAlpha(1);
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite.animations.death);

    // 전투/충돌을 즉시 멈추되, 페이드아웃 전에 마지막 death 프레임(쓰러진
    // 모습)을 읽을 수 있을 만큼 보여줌. death 애니메이션이 진행되도록
    // GameObject는 active로 유지함.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.scene.time.delayedCall(DEATH_POSE_HOLD_MS, () => {
      if (!this.scene || !this.visible) {
        return;
      }

      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: DEATH_FADE_MS,
        ease: 'Sine.easeIn',
        onComplete: () => this.disableBody(true, true),
      });
    });
  }

  override destroy(fromScene?: boolean) {
    this.cone.destroy();
    this.orbCleanups.clear();
    super.destroy(fromScene);
  }

  private updateRecover(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.cone.hide();
    this.moveToPreferredDistance(time, target);
    this.updateLocomotionAnimation(time);

    if (time >= this.stateEndsAt) {
      this.attackState = 'scanning';
    }
  }

  private updateScanning(time: number, target: Phaser.Physics.Arcade.Sprite) {
    // 전이 시점이 아니라 상태를 따라간다. 어그로 밖으로 나가면 스캔음을 닫는데,
    // 전이에서만 켰다면 돌아왔을 때 콘은 도는데 소리는 없는 사이클이 생긴다.
    this.beginScanAudio();
    this.moveToPreferredDistance(time, target);
    this.updateLocomotionAnimation(time);
    this.aimConeAt(target);
    this.cone.draw(
      this.coneApex(),
      this.centerAngle,
      this.coneHalfAngle(),
      this.pattern.cone.range,
      0.15,
      FLOOR_SURFACE_Y,
    );

    if (this.playerInCone(target)) {
      this.attackState = 'locking';
      this.stateStartedAt = time;
      this.stateEndsAt = time + this.lockDuration;
      gameEvents.emit('boss-scan-cue', 'target-lock');
    }
  }

  private updateLocking(time: number, target: Phaser.Physics.Arcade.Sprite) {
    // Commit: stop moving and keep the fan trained on the player as it flares.
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.quest ?? '');
    this.aimConeAt(target);
    this.cone.draw(
      this.coneApex(),
      this.centerAngle,
      this.coneHalfAngle(),
      this.pattern.cone.range,
      0.15 + 0.85 * this.stateProgress(time),
      FLOOR_SURFACE_Y,
    );

    if (time >= this.stateEndsAt) {
      this.fireOrb(target);
      this.beginRecover(time);
    }
  }

  private beginRecover(time: number) {
    this.endScanAudio();
    this.attackState = 'recover';
    this.stateEndsAt =
      time +
      (this.isEnraged
        ? this.pattern.enragedRecoveryDuration
        : this.pattern.recoveryDuration);
    this.cone.hide();
  }

  private beginScanAudio() {
    if (this.scanAudioActive) {
      return;
    }

    this.scanAudioActive = true;
    gameEvents.emit('boss-scan-cue', 'start');
  }

  private endScanAudio() {
    if (!this.scanAudioActive) {
      return;
    }

    this.scanAudioActive = false;
    gameEvents.emit('boss-scan-cue', 'end');
  }

  private fireOrb(target: Phaser.Physics.Arcade.Sprite) {
    gameEvents.emit('boss-orb-fired');
    this.attackPoseUntil = this.scene.time.now + ATTACK_POSE_HOLD_MS;
    this.playSpriteAnimation(this.sprite?.animations.attack ?? '');

    const apex = this.coneApex();
    const angle = Phaser.Math.Angle.Between(apex.x, apex.y, target.x, target.y);
    const { radius, color, speed, damage } = this.pattern.orb;

    const orb = this.scene.add
      .circle(apex.x, apex.y, radius, color, 0.95)
      .setStrokeStyle(3, 0xffe4de, 0.9)
      .setDepth(ORB_DEPTH);
    this.scene.physics.add.existing(orb);
    const body = orb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      destroyCollider(overlap);
      timer.remove(false);
      this.orbCleanups.delete(cleanup);
      orb.destroy();
    };
    const overlap = this.scene.physics.add.overlap(orb, target, () => {
      this.damagePlayer(damage);
      cleanup();
    });
    const timer = this.scene.time.delayedCall(ORB_LIFETIME, cleanup);
    this.orbCleanups.add(cleanup);
  }

  private moveToPreferredDistance(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    if (this.isStaggered(time)) {
      return;
    }

    const horizontalDistance = Math.abs(target.x - this.x);
    const directionToTarget = Math.sign(target.x - this.x) || 1;
    this.faceToward(directionToTarget > 0);

    const speed = this.isEnraged
      ? this.pattern.enragedMoveSpeed
      : this.pattern.moveSpeed;

    if (
      horizontalDistance >
      this.pattern.preferredDistance + this.pattern.distanceTolerance
    ) {
      this.setVelocityX(directionToTarget * speed);
      return;
    }

    if (
      horizontalDistance <
      this.pattern.preferredDistance - this.pattern.distanceTolerance
    ) {
      this.setVelocityX(-directionToTarget * speed);
      return;
    }

    this.setVelocityX(0);
  }

  private aimConeAt(target: Phaser.Physics.Arcade.Sprite) {
    const apex = this.coneApex();
    const base = Phaser.Math.Angle.Between(apex.x, apex.y, target.x, target.y);
    const tilt = Phaser.Math.DegToRad(this.pattern.cone.tiltDegrees);
    // Lean the fan downward whichever way it faces, so it always rakes the floor.
    const facingRight = Math.cos(base) >= 0;
    this.centerAngle = base + (facingRight ? tilt : -tilt);
    this.faceToward(facingRight);
  }

  private playerInCone(target: Phaser.Physics.Arcade.Sprite) {
    const body = target.body as Phaser.Physics.Arcade.Body | null;
    const point = body?.center ?? target;
    const targetRadius = body ? Math.max(body.width, body.height) * 0.35 : 24;

    return isPointInsideCone(
      this.coneApex(),
      this.centerAngle,
      this.coneHalfAngle(),
      this.pattern.cone.range,
      point,
      targetRadius,
    );
  }

  private coneApex(): Point {
    const forward = (this.pattern.cone.apexOffsetX ?? 0) * this.facingSign();
    return {
      x: this.x + forward,
      y: this.y + this.pattern.cone.apexOffsetY,
    };
  }

  /** +1이면 오른쪽, -1이면 왼쪽을 바라봄(스프라이트 기본 방향 보정 포함). */
  private facingSign(): number {
    return this.flipX === Boolean(this.sprite?.facesLeft) ? 1 : -1;
  }

  private coneHalfAngle() {
    return Phaser.Math.DegToRad(this.pattern.cone.halfAngleDegrees);
  }

  private get lockDuration() {
    return this.isEnraged
      ? this.pattern.orb.enragedLockDuration
      : this.pattern.orb.lockDuration;
  }

  private stateProgress(time: number) {
    return Phaser.Math.Clamp(
      (time - this.stateStartedAt) / (this.stateEndsAt - this.stateStartedAt),
      0,
      1,
    );
  }

  private get isEnraged() {
    return (
      this.currentHealth / this.maxHealth <= this.pattern.enrageHealthRatio
    );
  }

  private get pattern() {
    return this.config.pattern;
  }
}
