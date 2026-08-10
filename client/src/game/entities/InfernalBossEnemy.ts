import Phaser from 'phaser';
import { damageBeforeThreshold } from '@/game/combat/architectPattern';
import { getRailArmoredDamage } from '@/game/combat/bossDamage';
import {
  getInfernalBossDamage,
  getShardPatternLayout,
  INFERNAL_PHASE_ONE_SEQUENCE,
  INFERNAL_PHASE_TWO_SEQUENCE,
  type InfernalAttack,
} from '@/game/combat/infernalPattern';
import type {
  InfernalBossCombatConfig,
  InfernalBossPatternConfig,
  InfernalBossSpriteConfig,
} from '@/game/config/bossConfigTypes';
import type { BossArenaBounds } from '@/game/config/bossArena';
import {
  STAGE_FOUR_MAGMA_RUPTURE_FIRE_PILLAR,
  STAGE_FOUR_MAGMA_RUPTURE_WARNING,
  STAGE_FOUR_MAGMA_SHARD,
  STAGE_FOUR_MAGMA_SHARD_IMPACT,
} from '@/game/config/bossAnimationConfig';
import { BossEnemy } from '@/game/entities/BossEnemy';
import type {
  EnemyProjectileAttack,
  ProjectileDamageResult,
} from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import type { BossPhase } from '@/game/state/bossPhase';
import { destroyCollider } from '@/game/systems/arcadePhysicsCleanup';
import { CleanupRegistry } from '@/game/systems/CleanupRegistry';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';

type InfernalState =
  | 'recover'
  | 'phase-transition'
  | 'rupture'
  | 'charge-warn'
  | 'charging'
  | 'charge-stagger'
  | 'shards';

type PlayerDamageHandler = (damage: number) => void;
type PhaseChangeHandler = (phase: BossPhase) => void;

const EFFECT_DEPTH = 6;
const DEATH_POSE_HOLD_MS = 1600;
const DEATH_FADE_MS = 600;
/** 돌진 중 점프로 넘을 수 있는 낮은 타격 높이. */
const CHARGE_BODY_HEIGHT = 110;

/**
 * Stage-4 boss: sequential ground eruptions and a locked horizontal charge
 * teach two clean responses, then phase two adds shard-made magma zones that
 * reduce space without ever removing every safe lane.
 */
export class InfernalBossEnemy extends BossEnemy<InfernalBossPatternConfig> {
  override readonly usesHitFlash = true;

  private readonly phaseOverlay: Phaser.GameObjects.Graphics;
  private readonly effectCleanups = new CleanupRegistry();
  private attackState: InfernalState = 'recover';
  private stateEndsAt: number;
  private phaseTwo = false;
  private phaseOneAttackIndex = 0;
  private phaseTwoAttackIndex = 0;
  private ruptureCount = 0;
  private nextRuptureAt = 0;
  private chargeDirection = 1;
  private chargeHit = false;
  private playerTarget?: Phaser.Physics.Arcade.Sprite;
  private activeSpriteAnimation?: string;
  private dying = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: InfernalBossCombatConfig,
    private readonly damagePlayer: PlayerDamageHandler,
    private readonly arena: BossArenaBounds,
    private readonly onPhaseChanged: PhaseChangeHandler,
    private readonly sprite?: InfernalBossSpriteConfig,
  ) {
    super(scene, x, y, texture, config);

    this.stateEndsAt = scene.time.now + config.pattern.firstAttackDelay;
    this.phaseOverlay = scene.add
      .graphics()
      .setDepth(20)
      .setScrollFactor(0);
    this.onPhaseChanged(1);
    this.applyBossSprite();
  }

  override get playsOwnDeathAnimation(): boolean {
    return Boolean(this.sprite);
  }

  override get deathAnimationDuration(): number {
    return this.sprite ? DEATH_POSE_HOLD_MS + DEATH_FADE_MS : 0;
  }

  /** 실제 아틀라스 크기와 바닥 정렬용 물리 바디를 적용함. */
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

  /** 돌진 중에만 바닥 기준을 유지하며 타격 높이를 낮춤. */
  private setChargeHitbox(active: boolean) {
    if (!this.sprite) {
      return;
    }

    const height = active ? CHARGE_BODY_HEIGHT : this.sprite.bodyHeight;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.sprite.bodyWidth, height);
    if (
      this.sprite.bodyOffsetX !== undefined &&
      this.sprite.bodyOffsetY !== undefined
    ) {
      body.setOffset(
        this.sprite.bodyOffsetX,
        this.sprite.bodyOffsetY + this.sprite.bodyHeight - height,
      );
    }
  }

  private playSpriteAnimation(animation: string) {
    if (!this.sprite || this.activeSpriteAnimation === animation) {
      return;
    }

    this.activeSpriteAnimation = animation;
    this.play(animation, true);
  }

  /** 기본 좌향 아트 보정을 포함해 대상을 바라봄. */
  private faceToward(faceRight: boolean) {
    this.setFlipX(this.sprite?.facesLeft ? faceRight : !faceRight);
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    this.playerTarget = target;
    if (!this.active || this.dying) {
      return false;
    }

    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    if (!targetInRange) {
      this.setVelocityX(0);
      this.playSpriteAnimation(this.sprite?.animations.idle ?? '');
      return false;
    }

    if (!this.phaseTwo && this.isEnraged && this.attackState === 'recover') {
      this.beginPhaseTransition(time);
    }

    switch (this.attackState) {
      case 'recover':
        this.updateRecover(time, target);
        break;
      case 'phase-transition':
        this.updatePhaseTransition(time, target);
        break;
      case 'rupture':
        this.updateRupture(time, target);
        break;
      case 'charge-warn':
        this.updateChargeWarn(time, target);
        break;
      case 'charging':
        this.updateCharge(time);
        break;
      case 'charge-stagger':
        this.updateChargeStagger(time);
        break;
      case 'shards':
        this.updateShards(time);
        break;
    }

    return true;
  }

  override takeDamage(amount: number) {
    const damage = getInfernalBossDamage(
      amount,
      this.pattern.charge.coreDamageMultiplier,
      this.attackState === 'charge-stagger',
    );
    const allowedDamage = this.phaseTwo
      ? damage
      : damageBeforeThreshold(
          this.currentHealth,
          this.maxHealth,
          this.pattern.enrageHealthRatio,
          damage,
        );
    return allowedDamage > 0 ? super.takeDamage(allowedDamage) : false;
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

  protected override get isInvulnerable() {
    return (
      (!this.phaseTwo && this.isEnraged) ||
      this.attackState === 'phase-transition' ||
      this.attackState === 'shards'
    );
  }

  override tryContactAttack(time: number) {
    if (this.attackState === 'charging') {
      if (this.chargeHit) {
        return null;
      }
      this.chargeHit = true;
      return this.pattern.charge.damage;
    }

    if (
      this.attackState === 'charge-stagger' ||
      this.attackState === 'phase-transition'
    ) {
      return null;
    }

    return super.tryContactAttack(time);
  }

  override applyKnockback(
    angle: number,
    force: number,
    time: number,
    durationMs = 160,
  ) {
    if (this.attackState !== 'recover') {
      return;
    }
    super.applyKnockback(angle, force, time, durationMs);
  }

  protected override onDefeated() {
    super.onDefeated();
    this.clearTint();
    this.phaseOverlay.clear();
    this.effectCleanups.clear();
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
    this.phaseOverlay.destroy();
    this.effectCleanups.clear();
    super.destroy(fromScene);
  }

  private updateRecover(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.setVelocityX(0);
    this.faceToward(target.x > this.x);
    this.playSpriteAnimation(this.sprite?.animations.idle ?? '');

    if (time < this.stateEndsAt) {
      return;
    }

    if (this.phaseTwo) {
      const attack =
        INFERNAL_PHASE_TWO_SEQUENCE[
          this.phaseTwoAttackIndex % INFERNAL_PHASE_TWO_SEQUENCE.length
        ];
      this.phaseTwoAttackIndex += 1;
      this.beginAttack(attack, time, target);
      return;
    }

    const attack =
      INFERNAL_PHASE_ONE_SEQUENCE[
        this.phaseOneAttackIndex % INFERNAL_PHASE_ONE_SEQUENCE.length
      ];
    this.phaseOneAttackIndex += 1;
    this.beginAttack(attack, time, target);
  }

  private beginAttack(
    attack: InfernalAttack,
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    switch (attack) {
      case 'rupture':
        this.beginRupture(time);
        break;
      case 'charge':
        this.beginChargeWarn(time, target);
        break;
      case 'shards':
        this.beginShards(time, target);
        break;
    }
  }

  private beginPhaseTransition(time: number) {
    this.phaseTwo = true;
    this.onPhaseChanged(2);
    // 전환에서 파편 패턴을 먼저 보여주므로 다음 순서는 지면 분출로 넘김.
    this.phaseTwoAttackIndex = 1;
    this.attackState = 'phase-transition';
    this.stateEndsAt = time + this.pattern.phaseTransitionDuration;
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.gush ?? '');
    this.scene.cameras.main.flash(220, 255, 92, 35);
    this.scene.cameras.main.shake(360, 0.012);
    gameEvents.emit('boss-infernal-cue', 'phase-shift');
  }

  private updatePhaseTransition(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocityX(0);
    this.drawPhaseCracks(time);

    if (time >= this.stateEndsAt) {
      this.phaseOverlay.clear();
      this.beginShards(time, target);
    }
  }

  private beginRupture(time: number) {
    const rupture = this.pattern.rupture;
    this.attackState = 'rupture';
    this.stateEndsAt =
      time +
      rupture.warnDuration +
      rupture.markerInterval * (rupture.count - 1) +
      rupture.activeDuration;
    this.ruptureCount = 0;
    this.nextRuptureAt = time;
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.gush ?? '');
    gameEvents.emit('boss-infernal-cue', 'rupture-warn');
  }

  private updateRupture(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocityX(0);

    if (
      this.ruptureCount < this.pattern.rupture.count &&
      time >= this.nextRuptureAt
    ) {
      this.spawnRupture(target.x);
      this.ruptureCount += 1;
      this.nextRuptureAt += this.pattern.rupture.markerInterval;
    }

    if (time >= this.stateEndsAt) {
      this.beginRecover(time);
    }
  }

  private spawnRupture(targetX: number) {
    const rupture = this.pattern.rupture;
    const x = Phaser.Math.Clamp(
      targetX,
      this.arena.left + rupture.width / 2,
      this.arena.right - rupture.width / 2,
    );
    let warning: Phaser.GameObjects.Image | undefined =
      this.createRuptureMarker(x);
    let eruption: Phaser.GameObjects.Rectangle | undefined;
    let eruptionEffect: Phaser.GameObjects.Image | undefined;
    let overlap: Phaser.Physics.Arcade.Collider | undefined;
    let activeTimer: Phaser.Time.TimerEvent | undefined;
    let warningTimer: Phaser.Time.TimerEvent;
    let cleaned = false;
    let hit = false;

    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      warningTimer.remove(false);
      activeTimer?.remove(false);
      destroyCollider(overlap);
      if (eruptionEffect) {
        this.scene.tweens.killTweensOf(eruptionEffect);
      }
      warning?.destroy();
      eruption?.destroy();
      eruptionEffect?.destroy();
      warning = undefined;
      eruption = undefined;
      eruptionEffect = undefined;
      this.effectCleanups.delete(cleanup);
    };

    warningTimer = this.scene.time.delayedCall(rupture.warnDuration, () => {
      warning?.destroy();
      warning = undefined;
      const pillarScale =
        rupture.height / STAGE_FOUR_MAGMA_RUPTURE_FIRE_PILLAR.height;
      eruptionEffect = this.scene.add
        .image(
          x,
          FLOOR_SURFACE_Y + 2,
          STAGE_FOUR_MAGMA_RUPTURE_FIRE_PILLAR.texture,
        )
        .setOrigin(
          0.5,
          STAGE_FOUR_MAGMA_RUPTURE_FIRE_PILLAR.groundAnchorY,
        )
        .setScale(pillarScale, pillarScale * 0.72)
        .setDepth(EFFECT_DEPTH + 1);
      this.scene.tweens.add({
        targets: eruptionEffect,
        scaleY: pillarScale,
        duration: 90,
        ease: 'Quad.easeOut',
      });
      eruption = this.scene.add
        .rectangle(
          x,
          FLOOR_SURFACE_Y - rupture.height / 2,
          rupture.width,
          rupture.height,
          this.pattern.magmaColor,
          0.82,
        )
        .setDepth(EFFECT_DEPTH)
        .setVisible(false);
      this.scene.physics.add.existing(eruption);
      const body = eruption.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      overlap = this.scene.physics.add.overlap(
        eruption,
        this.playerTarget as Phaser.Physics.Arcade.Sprite,
        () => {
          if (!hit) {
            hit = true;
            this.damagePlayer(rupture.damage);
          }
        },
      );
      this.scene.cameras.main.shake(100, 0.006);
      gameEvents.emit('boss-infernal-cue', 'rupture-erupt');
      activeTimer = this.scene.time.delayedCall(
        rupture.activeDuration,
        cleanup,
      );
    });

    this.effectCleanups.add(cleanup);
  }

  private createRuptureMarker(x: number) {
    const rupture = this.pattern.rupture;
    const warningScale =
      (rupture.width * 1.5) / STAGE_FOUR_MAGMA_RUPTURE_WARNING.width;
    return this.scene.add
      .image(
        x,
        FLOOR_SURFACE_Y + 2,
        STAGE_FOUR_MAGMA_RUPTURE_WARNING.texture,
      )
      .setOrigin(0.5, STAGE_FOUR_MAGMA_RUPTURE_WARNING.groundAnchorY)
      .setScale(warningScale)
      .setDepth(EFFECT_DEPTH);
  }

  private beginChargeWarn(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.attackState = 'charge-warn';
    this.stateEndsAt = time + this.pattern.charge.warnDuration;
    this.chargeDirection = Math.sign(target.x - this.x) || 1;
    this.setVelocityX(0);
    this.faceToward(this.chargeDirection > 0);
    this.playSpriteAnimation(this.sprite?.animations.walk ?? '');
    gameEvents.emit('boss-infernal-cue', 'charge-warn');
  }

  private updateChargeWarn(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocityX(0);
    this.chargeDirection =
      Math.sign(target.x - this.x) || this.chargeDirection;
    this.faceToward(this.chargeDirection > 0);

    if (time >= this.stateEndsAt) {
      this.beginCharge(time);
    }
  }

  private beginCharge(time: number) {
    this.attackState = 'charging';
    this.stateEndsAt = time + this.pattern.charge.duration;
    this.chargeHit = false;
    this.phaseOverlay.clear();
    this.playSpriteAnimation(this.sprite?.animations.rush ?? '');
    this.setChargeHitbox(true);
    this.setVelocityX(this.chargeDirection * this.chargeSpeed);
    gameEvents.emit('boss-infernal-cue', 'charge-rush');
  }

  private updateCharge(time: number) {
    this.setVelocityX(this.chargeDirection * this.chargeSpeed);
    const leftImpact =
      this.chargeDirection < 0 &&
      this.x <= this.arena.left + this.pattern.charge.wallPadding;
    const rightImpact =
      this.chargeDirection > 0 &&
      this.x >= this.arena.right - this.pattern.charge.wallPadding;

    if (leftImpact || rightImpact || time >= this.stateEndsAt) {
      this.setX(
        Phaser.Math.Clamp(
          this.x,
          this.arena.left + this.pattern.charge.wallPadding,
          this.arena.right - this.pattern.charge.wallPadding,
        ),
      );
      this.beginChargeStagger(time);
    }
  }

  private beginChargeStagger(time: number) {
    this.attackState = 'charge-stagger';
    this.stateEndsAt = time + this.pattern.charge.staggerDuration;
    this.setVelocityX(0);
    this.setChargeHitbox(false);
    this.playSpriteAnimation(this.sprite?.animations.getDown ?? '');
    this.scene.cameras.main.shake(220, 0.014);
    gameEvents.emit('boss-infernal-cue', 'charge-impact');
  }

  private updateChargeStagger(time: number) {
    this.setVelocityX(0);

    if (time >= this.stateEndsAt) {
      this.beginRecover(time);
    }
  }

  private beginShards(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    const shards = this.pattern.shards;
    this.attackState = 'shards';
    this.stateEndsAt =
      time + shards.warnDuration + shards.followUpDelay;
    this.setVelocityX(0);
    this.setChargeHitbox(false);
    this.faceToward(target.x > this.x);
    this.playSpriteAnimation(this.sprite?.animations.getDown ?? '');

    const layout = getShardPatternLayout({
      arenaLeft: this.arena.left,
      arenaRight: this.arena.right,
      playerX: target.x,
      laneCount: shards.laneCount,
    });
    // Once for the volley, not once per lane: four descents are one sound.
    gameEvents.emit('boss-infernal-cue', 'shard-fall');
    for (const x of layout.hazardXPositions) {
      this.spawnShard(x);
    }
  }

  private updateShards(time: number) {
    this.setVelocityX(0);

    if (time >= this.stateEndsAt) {
      this.beginRecover(time);
    }
  }

  private spawnShard(x: number) {
    const shards = this.pattern.shards;
    let warning: Phaser.GameObjects.Rectangle | undefined = this.scene.add
      .rectangle(
        x,
        FLOOR_SURFACE_Y / 2,
        4,
        FLOOR_SURFACE_Y,
        this.pattern.telegraphColor,
        0.42,
      )
      .setDepth(EFFECT_DEPTH);
    let shard: Phaser.GameObjects.Sprite | undefined = this.scene.add
      .sprite(x, 70, STAGE_FOUR_MAGMA_SHARD.texture)
      .setDepth(EFFECT_DEPTH);
    this.scene.tweens.add({
      targets: shard,
      y: FLOOR_SURFACE_Y - STAGE_FOUR_MAGMA_SHARD.height / 2,
      duration: shards.warnDuration,
      ease: 'Quad.easeIn',
    });

    let zone: Phaser.GameObjects.Rectangle | undefined;
    let impact: Phaser.GameObjects.Image | undefined;
    let overlap: Phaser.Physics.Arcade.Collider | undefined;
    let zoneTimer: Phaser.Time.TimerEvent | undefined;
    let warningTimer: Phaser.Time.TimerEvent;
    let nextMagmaDamageAt = 0;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      warningTimer.remove(false);
      zoneTimer?.remove(false);
      destroyCollider(overlap);
      if (shard) {
        this.scene.tweens.killTweensOf(shard);
      }
      if (impact) {
        this.scene.tweens.killTweensOf(impact);
      }
      warning?.destroy();
      shard?.destroy();
      impact?.destroy();
      zone?.destroy();
      warning = undefined;
      shard = undefined;
      impact = undefined;
      zone = undefined;
      this.effectCleanups.delete(cleanup);
    };

    warningTimer = this.scene.time.delayedCall(shards.warnDuration, () => {
      warning?.destroy();
      shard?.destroy();
      warning = undefined;
      shard = undefined;

      const impactScale = shards.zoneWidth / STAGE_FOUR_MAGMA_SHARD_IMPACT.width;
      impact = this.scene.add
        .image(x, FLOOR_SURFACE_Y + 4, STAGE_FOUR_MAGMA_SHARD_IMPACT.texture)
        .setOrigin(0.5, STAGE_FOUR_MAGMA_SHARD_IMPACT.groundAnchorY)
        .setScale(impactScale)
        .setDepth(EFFECT_DEPTH + 1);
      this.scene.tweens.add({
        targets: impact,
        scaleX: impactScale * 1.08,
        scaleY: impactScale * 0.86,
        duration: 220,
        ease: 'Quad.easeOut',
      });
      this.scene.tweens.add({
        targets: impact,
        alpha: 0,
        delay: 150,
        duration: 700,
        ease: 'Sine.easeIn',
        onComplete: () => {
          impact?.destroy();
          impact = undefined;
        },
      });

      if (
        this.playerTarget &&
        Math.abs(this.playerTarget.x - x) <= shards.zoneWidth / 2
      ) {
        this.damagePlayer(shards.impactDamage);
      }

      zone = this.scene.add
        .rectangle(
          x,
          FLOOR_SURFACE_Y - shards.zoneHeight / 2,
          shards.zoneWidth,
          shards.zoneHeight,
          this.pattern.magmaColor,
          0.72,
        )
        .setDepth(EFFECT_DEPTH)
        .setVisible(false);
      this.scene.physics.add.existing(zone);
      const body = zone.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      overlap = this.scene.physics.add.overlap(
        zone,
        this.playerTarget as Phaser.Physics.Arcade.Sprite,
        () => {
          const now = this.scene.time.now;
          if (now >= nextMagmaDamageAt) {
            nextMagmaDamageAt = now + shards.magmaTickInterval;
            this.damagePlayer(shards.magmaDamage);
          }
        },
      );
      this.scene.cameras.main.shake(90, 0.005);
      // All four lanes land in the same frame; the cue's minInterval collapses
      // them back into the single impact the player actually sees.
      gameEvents.emit('boss-infernal-cue', 'shard-impact');
      zoneTimer = this.scene.time.delayedCall(shards.magmaDuration, cleanup);
    });

    this.effectCleanups.add(cleanup);
  }

  private beginRecover(time: number) {
    this.attackState = 'recover';
    this.stateEndsAt =
      time +
      (this.phaseTwo
        ? this.pattern.enragedRecoveryDuration
        : this.pattern.recoveryDuration);
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.idle ?? '');
  }

  private drawPhaseCracks(time: number) {
    const pulse = 0.55 + Math.sin(time * 0.025) * 0.25;
    const centerX = this.scene.cameras.main.width / 2;
    const centerY = this.scene.cameras.main.height / 2;
    this.phaseOverlay
      .clear()
      .lineStyle(4, this.pattern.magmaColor, pulse)
      .lineBetween(0, centerY - 180, centerX - 170, centerY - 35)
      .lineBetween(
        centerX - 170,
        centerY - 35,
        centerX - 280,
        centerY + 130,
      )
      .lineBetween(
        this.scene.cameras.main.width,
        centerY - 210,
        centerX + 150,
        centerY - 20,
      )
      .lineBetween(
        centerX + 150,
        centerY - 20,
        centerX + 270,
        centerY + 150,
      );
  }

  private get chargeSpeed() {
    return (
      this.pattern.charge.speed *
      (this.phaseTwo ? this.pattern.charge.enragedSpeedMultiplier : 1)
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
