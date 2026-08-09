import Phaser from 'phaser';
import type {
  PurifierBossPatternConfig,
  PurifierBossCombatConfig,
  PurifierBossSpriteConfig,
} from '@/game/config/bossConfigTypes';
import { STAGE_THREE_BOSS_SHOCKWAVE } from '@/game/config/bossAnimationConfig';
import { getSlamLeapVelocity } from '@/game/combat/slamLeap';
import { BossEnemy } from '@/game/entities/BossEnemy';
import type { EnemyProjectileAttack } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import { destroyCollider } from '@/game/systems/arcadePhysicsCleanup';
import { CleanupRegistry } from '@/game/systems/CleanupRegistry';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';

type PurifierState =
  | 'recover'
  | 'slam-warn'
  | 'slam-leap'
  | 'slam-strike'
  | 'vacuum-warn'
  | 'vacuum-active';

type PlayerDamageHandler = (damage: number) => void;
type PlayerPullHandler = (bossX: number, pullSpeed: number) => void;

const TELEGRAPH_DEPTH = 7;
const SHOCKWAVE_DEPTH = 6;
const MARKER_HEIGHT = 74;
const LANDING_GRACE_DURATION = 400;
/** 죽음 포즈를 보여주는 시간과, 그 뒤 페이드아웃에 걸리는 시간. */
const DEATH_POSE_HOLD_MS = 1600;
const DEATH_FADE_MS = 600;

/**
 * Stage-3 boss (the purification enforcer). Two-pattern kit:
 *
 * - Waste compaction: marks the player's position, leaps toward it, then sends
 *   two green pressure waves along the floor on landing; move off the marker
 *   and jump the waves.
 * - Contaminant intake: pulls the player from anywhere in the arena. Keep
 *   running away from the boss to resist the flow.
 */
export class PurifierBossEnemy extends BossEnemy<PurifierBossPatternConfig> {
  private readonly telegraph: Phaser.GameObjects.Graphics;
  private readonly waveCleanups = new CleanupRegistry();
  private attackState: PurifierState = 'recover';
  private stateStartedAt = 0;
  private stateEndsAt: number;
  private slamTargetX = 0;
  private slamHasLeftGround = false;
  private slamLandingAt = 0;
  // Alternate the two patterns, opening with the clearly marked leap.
  private attackIndex = 1;
  private playerTarget?: Phaser.Physics.Arcade.Sprite;
  private activeSpriteAnimation?: string;
  private dying = false;
  private vacuumAudioActive = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: PurifierBossCombatConfig,
    private readonly damagePlayer: PlayerDamageHandler,
    private readonly pullPlayer: PlayerPullHandler,
    private readonly sprite?: PurifierBossSpriteConfig,
  ) {
    super(scene, x, y, texture, config);

    this.stateEndsAt = scene.time.now + config.pattern.firstAttackDelay;
    this.telegraph = scene.add.graphics().setDepth(TELEGRAPH_DEPTH);
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

  /** 애니메이션을 중복 재생하지 않도록 dedup. */
  private playSpriteAnimation(animation: string) {
    if (!this.sprite || this.activeSpriteAnimation === animation) {
      return;
    }

    this.activeSpriteAnimation = animation;
    this.play(animation, true);
  }

  /** 이동 중이면 walk, 멈춰 있으면 idle. */
  private updateLocomotionAnimation() {
    if (!this.sprite) {
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
    this.playerTarget = target;

    // Both exits below leave the pattern mid-flight, so the intake bed has to
    // be closed here too: it is a loop, and the only other thing that ends it
    // is a state transition this update will no longer reach.
    if (!this.active || this.dying) {
      this.telegraph.clear();
      this.endVacuumAudio();
      return false;
    }

    const inRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    if (!inRange) {
      this.setVelocityX(0);
      this.telegraph.clear();
      this.endVacuumAudio();
      return false;
    }

    switch (this.attackState) {
      case 'recover':
        this.updateRecover(time, target);
        break;
      case 'slam-warn':
        this.updateSlamWarn(time, target);
        break;
      case 'slam-leap':
        this.updateSlamLeap(time, target);
        break;
      case 'slam-strike':
        this.updateSlamStrike(time);
        break;
      case 'vacuum-warn':
        this.updateVacuumWarn(time);
        break;
      case 'vacuum-active':
        this.updateVacuumActive(time);
        break;
    }

    return true;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.endVacuumAudio();
    this.telegraph.clear();
    this.clearTint();
    this.waveCleanups.clear();
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
    this.setVelocity(0);
    this.playSpriteAnimation(this.sprite.animations.death);

    // 전투/충돌을 즉시 멈추되, 페이드아웃 전에 마지막 death 프레임(무너진
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
    this.telegraph.destroy();
    this.waveCleanups.clear();
    super.destroy(fromScene);
  }

  private updateRecover(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.telegraph.clear();
    this.clearTint();
    this.moveToPreferredDistance(time, target);
    this.updateLocomotionAnimation();

    if (time >= this.stateEndsAt) {
      // Alternate the two patterns so the same one never runs back to back.
      if (this.attackIndex % 2 === 1) {
        this.beginSlamWarn(time, target);
      } else {
        this.beginVacuumWarn(time);
      }
      this.attackIndex += 1;
    }
  }

  private beginSlamWarn(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.attackState = 'slam-warn';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.slam.warnDuration;
    this.slamTargetX = target.x;
    this.playSpriteAnimation(this.sprite?.animations.slamWindup ?? '');
    gameEvents.emit('boss-purifier-cue', 'slam-warn');
  }

  private updateSlamWarn(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocityX(0);
    // Track the player during the warning, then lock this spot at takeoff.
    this.slamTargetX = target.x;
    this.drawGroundMarker(
      this.slamTargetX,
      this.pattern.slam.landingRadius * 2,
      this.stateProgress(time),
    );

    if (time >= this.stateEndsAt) {
      this.beginSlamLeap(time);
    }
  }

  private beginSlamLeap(time: number) {
    const leap = getSlamLeapVelocity({
      originX: this.x,
      targetX: this.slamTargetX,
      launchSpeedY: this.pattern.slam.launchSpeedY,
      gravityY: this.scene.physics.world.gravity.y,
      maxTravelSpeedX: this.pattern.slam.maxTravelSpeedX,
    });

    this.attackState = 'slam-leap';
    this.stateStartedAt = time;
    this.slamLandingAt = time + leap.flightDurationMs;
    this.stateEndsAt = this.slamLandingAt + LANDING_GRACE_DURATION;
    this.slamHasLeftGround = false;
    this.setFlipX(leap.velocityX < 0);
    this.setVelocity(leap.velocityX, leap.velocityY);
    this.playSpriteAnimation(this.sprite?.animations.slamAir ?? '');
    gameEvents.emit('boss-purifier-cue', 'slam-leap');
  }

  private updateSlamLeap(time: number, target: Phaser.Physics.Arcade.Sprite) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.drawGroundMarker(
      this.slamTargetX,
      this.pattern.slam.landingRadius * 2,
      1,
    );

    // Home onto the player while they stay inside the warned box, so standing
    // in it gets punished; once they dash out, commit to the marked spot.
    const insideBox =
      Math.abs(target.x - this.slamTargetX) <= this.pattern.slam.landingRadius;
    const landingX = insideBox ? target.x : this.slamTargetX;
    const remainingSeconds = Math.max(0.06, (this.slamLandingAt - time) / 1000);
    this.setVelocityX(
      Phaser.Math.Clamp(
        (landingX - this.x) / remainingSeconds,
        -this.pattern.slam.maxTravelSpeedX,
        this.pattern.slam.maxTravelSpeedX,
      ),
    );

    if (!body.blocked.down) {
      this.slamHasLeftGround = true;
    }

    if (this.slamHasLeftGround && body.blocked.down) {
      this.beginSlamStrike(time);
      return;
    }

    // A collision or knockback should not leave the boss drifting forever.
    if (time >= this.stateEndsAt) {
      this.setVelocityX(0);
      this.setVelocityY(
        Math.max(body.velocity.y, this.pattern.slam.launchSpeedY),
      );
    }
  }

  private beginSlamStrike(time: number) {
    this.attackState = 'slam-strike';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.slam.strikeDuration;
    this.setVelocity(0);
    this.telegraph.clear();
    this.playSpriteAnimation(this.sprite?.animations.slamStrike ?? '');
    this.scene.cameras.main.shake(180, 0.012);
    // One cue for the pair: the two waves are symmetrical and simultaneous, so
    // playing it twice only doubles the level.
    gameEvents.emit('boss-purifier-cue', 'slam-impact');
    gameEvents.emit('boss-purifier-cue', 'shockwave');
    this.spawnShockwave(-1);
    this.spawnShockwave(1);
  }

  private updateSlamStrike(time: number) {
    this.setVelocityX(0);
    if (time >= this.stateEndsAt) {
      this.beginRecover(time);
    }
  }

  private beginVacuumWarn(time: number) {
    this.attackState = 'vacuum-warn';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.vacuum.warnDuration;
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.suction ?? '');
    this.vacuumAudioActive = true;
    gameEvents.emit('boss-purifier-cue', 'vacuum-start');
  }

  /** 흡입음은 루프이므로, 패턴을 빠져나가는 모든 경로에서 반드시 닫아야 한다. */
  private endVacuumAudio() {
    if (!this.vacuumAudioActive) {
      return;
    }

    this.vacuumAudioActive = false;
    gameEvents.emit('boss-purifier-cue', 'vacuum-end');
  }

  private updateVacuumWarn(time: number) {
    this.setVelocityX(0);

    if (time >= this.stateEndsAt) {
      this.attackState = 'vacuum-active';
      this.stateStartedAt = time;
      this.stateEndsAt = time + this.pattern.vacuum.duration;
    }
  }

  private updateVacuumActive(time: number) {
    this.setVelocityX(0);
    this.pullPlayer(
      this.x,
      this.isEnraged
        ? this.pattern.vacuum.enragedPullSpeed
        : this.pattern.vacuum.pullSpeed,
    );

    if (time >= this.stateEndsAt) {
      this.beginRecover(time);
    }
  }

  private beginRecover(time: number) {
    this.endVacuumAudio();
    this.attackState = 'recover';
    this.stateEndsAt =
      time +
      (this.isEnraged
        ? this.pattern.enragedRecoveryDuration
        : this.pattern.recoveryDuration);
    this.telegraph.clear();
    this.clearTint();
  }

  private spawnShockwave(direction: number) {
    const slam = this.pattern.slam;
    const waveWidth = slam.shockwaveWidth * 4.4;
    const waveHeight = slam.shockwaveHeight * 2.5;
    const wave = this.scene.add
      .image(
        this.x + direction * 70,
        FLOOR_SURFACE_Y - waveHeight / 2 + 20,
        STAGE_THREE_BOSS_SHOCKWAVE.texture,
      )
      .setFlipX(direction < 0)
      .setDisplaySize(waveWidth, waveHeight)
      .setDepth(SHOCKWAVE_DEPTH);
    this.scene.physics.add.existing(wave);
    const body = wave.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(
      slam.shockwaveWidth / wave.scaleX,
      slam.shockwaveHeight / wave.scaleY,
    );
    body.setOffset(
      (wave.width - body.sourceWidth) / 2,
      wave.height - body.sourceHeight - 20 / wave.scaleY,
    );
    body.setVelocityX(direction * slam.shockwaveSpeed);

    let hit = false;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      destroyCollider(overlap);
      timer.remove(false);
      this.waveCleanups.delete(cleanup);
      wave.destroy();
    };
    const overlap = this.scene.physics.add.overlap(
      wave,
      this.playerTarget as Phaser.Physics.Arcade.Sprite,
      () => {
        const targetBody = this.playerTarget?.body as
          | Phaser.Physics.Arcade.Body
          | undefined;
        // Only a grounded player is caught; jumping clears the low wave.
        if (!hit && targetBody?.blocked.down) {
          hit = true;
          this.damagePlayer(slam.shockwaveDamage);
        }
      },
    );
    const timer = this.scene.time.delayedCall(
      (slam.shockwaveRange / slam.shockwaveSpeed) * 1000,
      cleanup,
    );
    this.waveCleanups.add(cleanup);
  }

  private drawGroundMarker(x: number, width: number, intensity: number) {
    const top = FLOOR_SURFACE_Y - MARKER_HEIGHT;
    this.telegraph
      .clear()
      .fillStyle(0xff3b30, 0.22 + intensity * 0.35)
      .fillRect(x - width / 2, top, width, MARKER_HEIGHT);
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
    this.setFlipX(directionToTarget < 0);

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
