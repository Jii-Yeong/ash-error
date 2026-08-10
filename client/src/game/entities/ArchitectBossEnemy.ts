import Phaser from 'phaser';
import {
  clampPatternTarget,
  damageBeforeThreshold,
  getFanAngles,
  getRingAngles,
} from '@/game/combat/architectPattern';
import {
  STAGE_FIVE_BOSS_FLOATING_JUDGMENT_SIGIL,
} from '@/game/config/bossAnimationConfig';
import type {
  ArchitectBossSpriteConfig,
  ArchitectBossCombatConfig,
  ArchitectBossPatternConfig,
} from '@/game/config/bossConfigTypes';
import type { BossArenaBounds } from '@/game/config/bossArena';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import { ArchitectBossView } from '@/game/entities/ArchitectBossView';
import { getRailArmoredDamage } from '@/game/combat/bossDamage';
import { BossEnemy } from '@/game/entities/BossEnemy';
import type {
  EnemyProjectileAttack,
  ProjectileDamageResult,
} from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import type { BossPhase } from '@/game/state/bossPhase';
import { BossProjectileField } from '@/game/systems/BossProjectileField';
import { CleanupRegistry } from '@/game/systems/CleanupRegistry';

type ArchitectState =
  | 'recover'
  | 'phase-transition'
  | 'halo-warning'
  | 'halo-firing'
  | 'wings'
  | 'eye-tracking'
  | 'eye-locked'
  | 'eye-wait'
  | 'eye-active'
  | 'salvation-transition'
  | 'salvation-rings'
  | 'core-exposed';

type ArchitectAttack = 'halo' | 'wings' | 'eye' | 'chorus';

const PHASE_ONE_SEQUENCE: readonly ArchitectAttack[] = ['halo', 'wings', 'eye'];
const PHASE_TWO_SEQUENCE: readonly ArchitectAttack[] = [
  'eye',
  'halo',
  'wings',
  'chorus',
];
const BULLET_TEXTURE = 'architect-bullet-placeholder';
const BULLET_DEPTH = 9;
const JUDGMENT_ORB_DEPTH = 7;
const PLAYER_HURTBOX_SIZE = 16;
const DEATH_POSE_HOLD_MS = 1_600;
const DEATH_FADE_MS = 600;

/**
 * Stage-5 final boss. Every pattern is built for unrestricted flight:
 * readable ring gaps, alternating wing fans, and baitable judgment orbs.
 * At 10% health damage is clamped until False Salvation exposes the eye.
 */
export class ArchitectBossEnemy extends BossEnemy<ArchitectBossPatternConfig> {
  override readonly usesHitFlash = true;

  override get deathAnimationDuration() {
    return DEATH_POSE_HOLD_MS + DEATH_FADE_MS;
  }

  private readonly projectiles: BossProjectileField;
  private readonly view: ArchitectBossView;
  private readonly effectCleanups = new CleanupRegistry();

  private attackState: ArchitectState = 'recover';
  private stateStartedAt = 0;
  private stateEndsAt: number;
  private phaseTwo = false;
  private phaseOneAttackIndex = 0;
  private phaseTwoAttackIndex = 0;
  private chorusActive = false;

  private haloRingsToFire = 0;
  private haloRingsFired = 0;
  private nextHaloRingAt = 0;
  private haloGapAngle = 0;
  private haloFollowUpWings = false;

  private wingStep = 0;
  private wingFinalStep = 2;
  private nextWingStepAt = 0;

  private eyeShotsRemaining = 0;
  private lockedTargetX = 0;
  private lockedTargetY = 0;

  private salvationPending = false;
  private salvationStarted = false;
  private salvationCenterX = 0;
  private salvationCenterY = 0;
  private salvationGapAngle = 0;
  private activeSpriteAnimation?: string;
  private dying = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: ArchitectBossCombatConfig,
    private readonly damagePlayer: (damage: number) => void,
    private readonly arena: BossArenaBounds,
    private readonly onPhaseChanged: (phase: BossPhase) => void,
    private readonly sprite?: ArchitectBossSpriteConfig,
  ) {
    super(scene, x, y, texture, config);

    this.stateEndsAt = scene.time.now + config.pattern.firstAttackDelay;
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.setDepth(6);
    this.applyBossSprite();

    this.projectiles = new BossProjectileField(scene, {
      texture: BULLET_TEXTURE,
      maxSize: 180,
      radius: config.pattern.projectile.radius,
      lifetime: config.pattern.projectile.lifetime,
      depth: BULLET_DEPTH,
      hurtboxSize: PLAYER_HURTBOX_SIZE,
      markerColor: config.pattern.skyColor,
      bounds: {
        left: arena.left - 120,
        right: arena.right + 120,
        top: -120,
        bottom: GAME_HEIGHT + 120,
      },
      damageTarget: damagePlayer,
    });
    this.view = new ArchitectBossView(scene, config.pattern);

    this.onPhaseChanged(1);
  }

  override get playsOwnDeathAnimation() {
    return Boolean(this.sprite);
  }

  override takeProjectileDamage(
    amount: number,
    hitX: number,
    hitY: number,
    weaponId?: string,
  ): ProjectileDamageResult {
    return super.takeProjectileDamage(
      getRailArmoredDamage(
        amount,
        this.pattern.railRifleDamageMultiplier,
        weaponId,
      ),
      hitX,
      hitY,
    );
  }

  override refreshAtlasSprite() {
    const animation =
      this.activeSpriteAnimation ?? this.sprite?.animations.idle ?? '';
    this.activeSpriteAnimation = undefined;
    this.applyBossSprite(animation);
  }

  private applyBossSprite(animation = this.sprite?.animations.idle ?? '') {
    if (!this.sprite) {
      return;
    }

    this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.setScale(this.sprite.scale);
    this.playSpriteAnimation(animation);
    (this.body as Phaser.Physics.Arcade.Body).setSize(
      this.sprite.bodyWidth,
      this.sprite.bodyHeight,
      true,
    );
  }

  private playSpriteAnimation(animation: string) {
    if (!this.sprite || this.activeSpriteAnimation === animation) {
      return;
    }

    this.activeSpriteAnimation = animation;
    if (this.scene.anims.exists(animation)) {
      this.play(animation, true);
    }
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    this.projectiles.syncTarget(target);
    this.projectiles.update(time);
    this.view.clearTelegraph();

    if (!this.active || this.dying) {
      return false;
    }

    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    if (!targetInRange) {
      this.setVelocity(0, 0);
      return false;
    }

    if (this.salvationPending && !this.salvationStarted) {
      this.beginFalseSalvation(time, target);
    } else if (
      !this.phaseTwo &&
      this.isEnraged &&
      this.attackState === 'recover'
    ) {
      this.beginPhaseTransition(time);
    }

    switch (this.attackState) {
      case 'recover':
        this.updateRecover(time, target);
        break;
      case 'phase-transition':
        this.updatePhaseTransition(time, target);
        break;
      case 'halo-warning':
        this.updateHaloWarning(time);
        break;
      case 'halo-firing':
        this.updateHaloFiring(time, target);
        break;
      case 'wings':
        this.updateWings(time, target);
        break;
      case 'eye-tracking':
        this.updateEyeTracking(time, target);
        break;
      case 'eye-locked':
        this.updateEyeLocked(time, target);
        break;
      case 'eye-wait':
        this.updateEyeWait(time, target);
        break;
      case 'eye-active':
        if (time >= this.stateEndsAt) {
          this.beginRecover(time);
        }
        break;
      case 'salvation-transition':
        this.updateSalvationTransition(time);
        break;
      case 'salvation-rings':
        if (time >= this.stateEndsAt) {
          this.exposeCore();
        }
        break;
      case 'core-exposed':
        this.drawExposedCore(time);
        this.setVelocity(0, 0);
        break;
    }

    this.clampBossPosition();
    return true;
  }

  override takeDamage(amount: number) {
    if (!this.phaseTwo) {
      const allowedDamage = damageBeforeThreshold(
        this.currentHealth,
        this.maxHealth,
        this.pattern.enrageHealthRatio,
        amount,
      );
      return allowedDamage > 0 ? super.takeDamage(allowedDamage) : false;
    }

    if (this.salvationStarted && this.attackState !== 'core-exposed') {
      return false;
    }

    if (!this.salvationStarted) {
      const allowedDamage = damageBeforeThreshold(
        this.currentHealth,
        this.maxHealth,
        this.pattern.salvationHealthRatio,
        amount,
      );
      const defeated =
        allowedDamage > 0 ? super.takeDamage(allowedDamage) : false;
      if (
        this.currentHealth / this.maxHealth <=
        this.pattern.salvationHealthRatio
      ) {
        this.salvationPending = true;
      }
      return defeated;
    }

    return super.takeDamage(
      amount * this.pattern.salvation.coreDamageMultiplier,
    );
  }

  protected override get isInvulnerable() {
    return (
      (!this.phaseTwo && this.isEnraged) ||
      this.attackState === 'phase-transition' ||
      this.chorusActive ||
      (this.salvationStarted && this.attackState !== 'core-exposed')
    );
  }

  override tryContactAttack(time: number) {
    if (
      this.attackState === 'phase-transition' ||
      this.attackState === 'salvation-transition' ||
      this.attackState === 'salvation-rings' ||
      this.attackState === 'core-exposed'
    ) {
      return null;
    }
    return super.tryContactAttack(time);
  }

  protected override onDefeated() {
    super.onDefeated();
    gameEvents.emit('ending-ascension-cue', 'silence');
    this.projectiles.clear();
    this.effectCleanups.clear();
    this.projectiles.setMarkerVisible(false);
    this.view.defeat(this.x, this.y);
    this.scene.cameras.main.flash(750, 255, 250, 235);
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
    this.setVelocity(0, 0);
    this.playSpriteAnimation(this.sprite.animations.death);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
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
    this.effectCleanups.clear();
    this.projectiles.destroy();
    this.view.destroy();
    super.destroy(fromScene);
  }

  private updateRecover(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.moveTowardArenaCenter();
    this.playSpriteAnimation(this.sprite?.animations.idle ?? '');

    if (time < this.stateEndsAt) {
      return;
    }

    const sequence = this.phaseTwo ? PHASE_TWO_SEQUENCE : PHASE_ONE_SEQUENCE;
    const index = this.phaseTwo
      ? this.phaseTwoAttackIndex++
      : this.phaseOneAttackIndex++;
    this.beginAttack(sequence[index % sequence.length], time, target);
  }

  private beginAttack(
    attack: ArchitectAttack,
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    switch (attack) {
      case 'halo':
        this.beginHalo(time, target, false);
        break;
      case 'wings':
        this.beginWings(time);
        break;
      case 'eye':
        this.beginEye(time, target, true);
        break;
      case 'chorus':
        this.beginHalo(time, target, true);
        break;
    }
  }

  private beginPhaseTransition(time: number) {
    this.phaseTwo = true;
    this.onPhaseChanged(2);
    this.attackState = 'phase-transition';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.phaseTransitionDuration;
    this.setVelocity(0, 0);
    this.playSpriteAnimation(this.sprite?.animations.phaseTransition ?? '');
    this.scene.cameras.main.flash(260, 210, 224, 255);
    this.scene.cameras.main.shake(420, 0.009);
    gameEvents.emit('boss-architect-cue', 'phase-shift');
  }

  private updatePhaseTransition(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocity(0, 0);
    this.view.drawPhaseTransition(time);

    if (time >= this.stateEndsAt) {
      this.view.endPhaseTransition();
      this.beginHalo(time, target, true);
    }
  }

  private beginHalo(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    followWithWings: boolean,
  ) {
    this.attackState = 'halo-warning';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.halo.warnDuration;
    this.haloRingsToFire = followWithWings
      ? 1
      : this.phaseTwo
        ? this.pattern.halo.phaseTwoRings
        : this.pattern.halo.phaseOneRings;
    this.haloRingsFired = 0;
    this.haloFollowUpWings = followWithWings;
    this.chorusActive = followWithWings;
    this.haloGapAngle = Phaser.Math.Angle.Between(
      this.x,
      this.y - 64,
      target.x,
      target.y,
    );
    this.setVelocity(0, 0);
    this.playSpriteAnimation(
      followWithWings
        ? (this.sprite?.animations.chorus ?? '')
        : (this.sprite?.animations.haloCharge ?? ''),
    );
    gameEvents.emit('boss-architect-cue', 'halo-warn');
  }

  private updateHaloWarning(time: number) {
    this.setVelocity(0, 0);

    if (time >= this.stateEndsAt) {
      this.attackState = 'halo-firing';
      this.nextHaloRingAt = time;
      this.playSpriteAnimation(
        this.haloFollowUpWings
          ? (this.sprite?.animations.chorus ?? '')
          : (this.sprite?.animations.haloFire ?? ''),
      );
    }
  }

  private updateHaloFiring(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.setVelocity(0, 0);

    if (
      this.haloRingsFired < this.haloRingsToFire &&
      time >= this.nextHaloRingAt
    ) {
      this.fireHaloRing();
      this.haloRingsFired += 1;
      this.nextHaloRingAt = time + this.pattern.halo.ringInterval;
    }

    if (
      this.haloRingsFired >= this.haloRingsToFire &&
      time >= this.nextHaloRingAt
    ) {
      if (this.haloFollowUpWings) {
        this.beginWings(time, 2, 2);
      } else {
        this.beginRecover(time);
      }
      this.haloGapAngle = Phaser.Math.Angle.RotateTo(
        this.haloGapAngle,
        Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y),
        this.pattern.halo.gapStep,
      );
    }
  }

  private fireHaloRing() {
    const originY = this.y - 64;
    const angles = getRingAngles(
      this.pattern.halo.bulletCount,
      this.haloGapAngle,
      this.pattern.halo.gapWidth,
    );
    for (let index = 0; index < angles.length; index += 1) {
      this.spawnBullet(
        this.x,
        originY,
        angles[index],
        this.pattern.projectile.speed,
        this.pattern.halo.damage,
        this.phaseTwo && index % 5 === 0
          ? this.pattern.corruptionColor
          : this.pattern.goldColor,
      );
    }

    this.haloGapAngle += this.pattern.halo.gapStep;
    this.scene.cameras.main.shake(70, 0.003);
    gameEvents.emit('boss-architect-cue', 'halo-ring');
  }

  private beginWings(time: number, firstStep = 0, finalStep = 2) {
    this.attackState = 'wings';
    this.stateStartedAt = time;
    this.wingStep = firstStep;
    this.wingFinalStep = finalStep;
    this.nextWingStepAt = time + this.pattern.wings.warnDuration;
    this.setVelocity(0, 0);
    this.playSpriteAnimation(this.wingAnimation(firstStep));
    gameEvents.emit('boss-architect-cue', 'wings-warn');
  }

  private updateWings(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.setVelocity(0, 0);

    if (this.wingStep <= this.wingFinalStep) {
      this.view.drawWingWarning(this.x, this.y, time, this.wingStep);
    }

    if (time < this.nextWingStepAt) {
      return;
    }

    if (this.wingStep > this.wingFinalStep) {
      this.beginRecover(time);
      return;
    }

    this.fireWingVolley(this.wingStep, target);
    this.wingStep += 1;
    if (this.wingStep <= this.wingFinalStep) {
      this.playSpriteAnimation(this.wingAnimation(this.wingStep));
    }
    this.nextWingStepAt =
      time +
      (this.wingStep > this.wingFinalStep
        ? this.pattern.wings.recoveryDuration
        : this.pattern.wings.stepInterval);
  }

  private fireWingVolley(step: number, target: Phaser.Physics.Arcade.Sprite) {
    const targetAngle = Phaser.Math.Angle.Between(
      this.x,
      this.y,
      target.x,
      target.y,
    );

    if (step < 2) {
      const side = step === 0 ? -1 : 1;
      this.fireFan(
        this.x + side * 72,
        this.y,
        targetAngle,
        this.pattern.wings.bulletCount,
      );
    } else {
      this.fireFan(
        this.x - 72,
        this.y,
        targetAngle - this.pattern.wings.simultaneousSeparation,
        this.pattern.wings.simultaneousBulletCount,
      );
      this.fireFan(
        this.x + 72,
        this.y,
        targetAngle + this.pattern.wings.simultaneousSeparation,
        this.pattern.wings.simultaneousBulletCount,
      );
    }

    this.scene.cameras.main.shake(80, 0.0035);
    // Step 2 fires two fans at once; they are one volley and get one cue.
    gameEvents.emit('boss-architect-cue', 'wings-fan');
  }

  private fireFan(
    x: number,
    y: number,
    centerAngle: number,
    bulletCount: number,
  ) {
    const angles = getFanAngles(
      centerAngle,
      bulletCount,
      this.pattern.wings.spread,
    );
    for (let index = 0; index < angles.length; index += 1) {
      const isOuter = index === 0 || index === angles.length - 1;
      this.spawnBullet(
        x,
        y,
        angles[index],
        this.pattern.wings.speed,
        this.pattern.wings.damage,
        this.phaseTwo && index % 4 === 0
          ? this.pattern.corruptionColor
          : isOuter
            ? this.pattern.skyColor
            : this.pattern.goldColor,
      );
    }
  }

  private beginEye(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    resetShots: boolean,
  ) {
    if (resetShots) {
      this.eyeShotsRemaining = this.phaseTwo ? 2 : 1;
    }
    this.attackState = 'eye-tracking';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.eye.trackingDuration;
    this.updateLockedTarget(target);
    this.setVelocity(0, 0);
    this.playSpriteAnimation(this.sprite?.animations.eyeTrack ?? '');
    gameEvents.emit('boss-architect-cue', 'eye-track');
  }

  private updateEyeTracking(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocity(0, 0);
    this.updateLockedTarget(target);
    this.view.drawEyeTracking(
      this.x,
      this.y,
      this.lockedTargetX,
      this.lockedTargetY,
      time,
      this.stateProgress(time),
    );

    if (time >= this.stateEndsAt) {
      this.attackState = 'eye-locked';
      this.stateStartedAt = time;
      this.stateEndsAt = time + this.pattern.eye.lockedWarningDuration;
      this.playSpriteAnimation(this.sprite?.animations.eyeFire ?? '');
      this.scene.cameras.main.flash(90, 120, 220, 255);
      gameEvents.emit('boss-architect-cue', 'eye-lock');
    }
  }

  private updateEyeLocked(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.setVelocity(0, 0);
    this.view.drawEyeLocked(this.lockedTargetX, this.lockedTargetY, time);

    if (time >= this.stateEndsAt) {
      this.fireEyeOrb(target);
      this.eyeShotsRemaining -= 1;
      this.stateStartedAt = time;
      if (this.eyeShotsRemaining > 0) {
        this.attackState = 'eye-wait';
        this.stateEndsAt = time + this.pattern.eye.phaseTwoFollowUpDelay;
      } else {
        this.attackState = 'eye-active';
        this.stateEndsAt = time + this.pattern.eye.orbDuration;
      }
    }
  }

  private updateEyeWait(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.setVelocity(0, 0);
    if (time >= this.stateEndsAt) {
      this.beginEye(time, target, false);
    }
  }

  private updateLockedTarget(target: Phaser.Physics.Arcade.Sprite) {
    const targetPosition = clampPatternTarget(target.x, target.y, {
      minX: this.arena.left + 60,
      maxX: this.arena.right - 60,
      minY: this.pattern.aerial.minY,
      maxY: this.pattern.aerial.maxY,
    });
    this.lockedTargetX = targetPosition.x;
    this.lockedTargetY = targetPosition.y;
  }

  private fireEyeOrb(target: Phaser.Physics.Arcade.Sprite) {
    if (
      Phaser.Math.Distance.Between(
        target.x,
        target.y,
        this.lockedTargetX,
        this.lockedTargetY,
      ) <= this.pattern.eye.orbRadius
    ) {
      this.damagePlayer(this.pattern.eye.directDamage);
    }

    this.spawnJudgmentOrb(this.lockedTargetX, this.lockedTargetY);
    for (let index = 0; index < this.pattern.eye.splitBulletCount; index += 1) {
      const angle = (index / this.pattern.eye.splitBulletCount) * Math.PI * 2;
      this.spawnBullet(
        this.lockedTargetX,
        this.lockedTargetY,
        angle,
        this.pattern.projectile.speed * 0.9,
        this.pattern.eye.splitDamage,
        this.phaseTwo && index % 3 === 0
          ? this.pattern.corruptionColor
          : this.pattern.skyColor,
      );
    }
    this.scene.cameras.main.shake(120, 0.005);
    gameEvents.emit('boss-architect-cue', 'eye-orb');
  }

  private spawnJudgmentOrb(x: number, y: number) {
    const size = this.pattern.eye.orbRadius * 2;
    let orb: Phaser.GameObjects.Image | undefined = this.scene.add
      .image(x, y, STAGE_FIVE_BOSS_FLOATING_JUDGMENT_SIGIL.texture)
      .setDisplaySize(size, size)
      .setDepth(JUDGMENT_ORB_DEPTH);
    let cleaned = false;
    const timer = this.scene.time.delayedCall(
      this.pattern.eye.orbDuration,
      () => cleanup(),
    );
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      timer.remove(false);
      orb?.destroy();
      orb = undefined;
      this.effectCleanups.delete(cleanup);
    };
    this.effectCleanups.add(cleanup);
  }

  private beginFalseSalvation(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.salvationStarted = true;
    this.salvationPending = false;
    this.projectiles.clear();
    this.effectCleanups.clear();
    this.view.beginSalvation();
    this.attackState = 'salvation-transition';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.salvation.transitionDuration;
    const center = clampPatternTarget(target.x, target.y, {
      minX: this.arena.left + 220,
      maxX: this.arena.right - 220,
      minY: this.pattern.aerial.minY + 70,
      maxY: this.pattern.aerial.maxY - 70,
    });
    this.salvationCenterX = center.x;
    this.salvationCenterY = center.y;
    this.salvationGapAngle =
      center.x < (this.arena.left + this.arena.right) / 2 ? Math.PI : 0;
    this.playSpriteAnimation(this.sprite?.animations.falseSalvation ?? '');
    this.scene.cameras.main.flash(600, 255, 224, 135);
    this.scene.cameras.main.shake(500, 0.01);
    gameEvents.emit('boss-architect-cue', 'salvation');
  }

  private updateSalvationTransition(time: number) {
    this.moveToward(
      (this.arena.left + this.arena.right) / 2,
      (this.pattern.aerial.minY + this.pattern.aerial.maxY) / 2,
      this.pattern.aerial.moveSpeed * 1.6,
    );
    const progress = this.stateProgress(time);
    this.view.drawSalvationTransition(
      progress,
      this.salvationCenterX,
      this.salvationCenterY,
    );

    if (time >= this.stateEndsAt) {
      this.setPosition(
        (this.arena.left + this.arena.right) / 2,
        (this.pattern.aerial.minY + this.pattern.aerial.maxY) / 2,
      );
      this.setVelocity(0, 0);
      this.beginSalvationRings(time);
    }
  }

  private beginSalvationRings(time: number) {
    this.attackState = 'salvation-rings';
    this.stateStartedAt = time;
    this.stateEndsAt = time + this.pattern.salvation.ringDuration;
    this.view.clearOverlay();

    for (
      let ringIndex = 0;
      ringIndex < this.pattern.salvation.ringCount;
      ringIndex += 1
    ) {
      const radius =
        this.pattern.salvation.innerRadius +
        ringIndex * this.pattern.salvation.radiusStep;
      const angles = getRingAngles(
        this.pattern.salvation.bulletCount,
        this.salvationGapAngle,
        this.pattern.salvation.gapWidth,
      );
      for (const angle of angles) {
        this.spawnBullet(
          this.salvationCenterX + Math.cos(angle) * radius,
          this.salvationCenterY + Math.sin(angle) * radius,
          angle,
          this.pattern.salvation.bulletSpeed,
          this.pattern.salvation.damage,
          ringIndex % 2 === 0 ? this.pattern.goldColor : this.pattern.skyColor,
        );
      }
    }
  }

  private exposeCore() {
    this.attackState = 'core-exposed';
    this.projectiles.clear();
    this.playSpriteAnimation(this.sprite?.animations.coreExposed ?? '');
    this.scene.cameras.main.flash(260, 255, 255, 255);
    gameEvents.emit('boss-architect-cue', 'core-exposed');
  }

  private drawExposedCore(time: number) {
    this.view.drawExposedCore(this.x, this.y, time);
  }

  private beginRecover(time: number) {
    this.attackState = 'recover';
    this.chorusActive = false;
    this.stateStartedAt = time;
    this.stateEndsAt =
      time +
      (this.phaseTwo
        ? this.pattern.enragedRecoveryDuration
        : this.pattern.recoveryDuration);
    this.setVelocity(0, 0);
    this.view.clearTelegraph();
    this.playSpriteAnimation(this.sprite?.animations.idle ?? '');
  }

  private wingAnimation(step: number) {
    if (!this.sprite) {
      return '';
    }
    if (this.chorusActive) {
      return this.sprite.animations.chorus;
    }
    if (step === 0) {
      return this.sprite.animations.wingsLeft;
    }
    return step === 1
      ? this.sprite.animations.wingsRight
      : this.sprite.animations.wingsBoth;
  }

  private spawnBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color: number,
  ) {
    this.projectiles.spawn({
      x,
      y,
      angle,
      speed,
      damage,
      color,
    });
  }

  private moveTowardArenaCenter() {
    this.moveToward(
      (this.arena.left + this.arena.right) / 2,
      (this.pattern.aerial.minY + this.pattern.aerial.maxY) / 2,
      this.pattern.aerial.moveSpeed,
    );
  }

  private moveToward(targetX: number, targetY: number, speed: number) {
    const deltaX = targetX - this.x;
    const deltaY = targetY - this.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 8) {
      this.setVelocity(0, 0);
      return;
    }
    this.setVelocity(
      (deltaX / distance) * Math.min(speed, distance * 3),
      (deltaY / distance) * Math.min(speed, distance * 3),
    );
  }

  private clampBossPosition() {
    this.setPosition(
      Phaser.Math.Clamp(this.x, this.arena.left + 70, this.arena.right - 70),
      Phaser.Math.Clamp(
        this.y,
        this.pattern.aerial.minY,
        this.pattern.aerial.maxY,
      ),
    );
  }

  private stateProgress(time: number) {
    return Phaser.Math.Clamp(
      (time - this.stateStartedAt) /
        Math.max(1, this.stateEndsAt - this.stateStartedAt),
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
