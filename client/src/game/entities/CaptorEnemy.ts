import Phaser from 'phaser';
import { getCapturePullSpeed } from '@/game/combat/stageThreeEnemyCombat';
import { STAGE_THREE_CAPTOR_TETHER } from '@/game/config/captorAnimationConfig';
import { CAPTOR_CONFIG } from '@/game/config/stageThreeEnemyConfig';
import {
  Enemy,
  ENEMY_DEPTH,
  type EnemyProjectileAttack,
} from '@/game/entities/Enemy';
import { GroundedEnemySprite } from '@/game/systems/GroundedEnemySprite';

const POSE = CAPTOR_CONFIG.animations;
/** 플레이어가 이 수평 거리 이내면 바라보는 방향을 유지(좌우 진동 방지). */
const FACING_DEADZONE = 26;

type CaptorState = 'ready' | 'warning' | 'tethered' | 'shocking' | 'recover';

export class CaptorEnemy extends Enemy {
  readonly aggroRadius = CAPTOR_CONFIG.aggroRadius;
  readonly aggroIndicatorColor = 0x74df91;

  private captorState: CaptorState = 'ready';
  private stateEndsAt = 0;
  private nextAttackAt = 0;
  private shockNextTickAt = 0;
  private lockedTarget = new Phaser.Math.Vector2();
  private tetherDamage = 0;
  private dying = false;
  private readonly cable: Phaser.GameObjects.Graphics;
  private readonly tetherLine: Phaser.GameObjects.Image;
  private readonly tetherClaw: Phaser.GameObjects.Image;
  private readonly rig: GroundedEnemySprite;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly damagePlayer: (damage: number) => void,
    private readonly applyTether: (
      sourceX: number,
      slowFactor: number,
      pullSpeed: number,
    ) => void,
    private readonly isPlayerDashing: () => boolean,
  ) {
    super(scene, x, y, CAPTOR_CONFIG.texture, CAPTOR_CONFIG.maxHealth);
    this.setDepth(ENEMY_DEPTH);
    this.rig = new GroundedEnemySprite(this, CAPTOR_CONFIG);
    this.rig.apply();
    this.cable = scene.add.graphics().setDepth(8);
    this.tetherLine = scene.add
      .image(this.x, this.y, STAGE_THREE_CAPTOR_TETHER.line.texture)
      .setOrigin(0, 0.5)
      .setDepth(ENEMY_DEPTH + 1)
      .setVisible(false);
    this.tetherClaw = scene.add
      .image(this.x, this.y, STAGE_THREE_CAPTOR_TETHER.claw.texture)
      .setDepth(ENEMY_DEPTH + 2)
      .setVisible(false);
  }

  override get playsOwnDeathAnimation() {
    return true;
  }

  override refreshAtlasSprite() {
    this.rig.refresh();
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    if (!this.active || this.dying) {
      this.cable.clear();
      this.hideTether();
      return false;
    }

    const distance = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      target.x,
      target.y,
    );
    const targetInRange = distance <= this.aggroRadius;
    // 스프라이트 기본 방향이 반대라 flip을 뒤집어 플레이어를 바라보게 함.
    // 플레이어가 거의 바로 위/옆(데드존 이내)이면 flip을 유지해, sign 부호가
    // 매 프레임 뒤집혀 좌우로 진동하는 것을 방지함.
    if (Math.abs(target.x - this.x) > FACING_DEADZONE) {
      this.setFlipX(target.x > this.x);
    }

    if (this.captorState === 'shocking') {
      if (this.isPlayerDashing() || time >= this.stateEndsAt) {
        this.releaseCable(time);
        return targetInRange;
      }

      // 포박 중 포획기는 제자리에 고정.
      this.setVelocityX(0);
      this.rig.play(POSE.attack);
      this.drawShock(target.x, target.y);
      // 포박: 포획기 근처에 붙잡아둠.
      this.applyTether(this.x, 0, CAPTOR_CONFIG.shockHoldPullSpeed);
      if (time >= this.shockNextTickAt) {
        this.damagePlayer(CAPTOR_CONFIG.shockDamage);
        this.shockNextTickAt = time + CAPTOR_CONFIG.shockTickInterval;
      }
      return true;
    }

    if (this.captorState === 'tethered') {
      if (this.isPlayerDashing() || time >= this.stateEndsAt) {
        this.releaseCable(time);
        return targetInRange;
      }

      // 케이블을 감는 동안 포획기는 제자리에 고정.
      this.setVelocityX(0);
      this.rig.play(POSE.pull);
      this.drawCable(target.x, target.y);
      const captureSpeed = getCapturePullSpeed(
        target.x - this.x,
        this.stateEndsAt - time,
        CAPTOR_CONFIG.minimumPullSpeed,
      );
      this.applyTether(
        this.x,
        CAPTOR_CONFIG.slowFactor,
        captureSpeed,
      );
      if (Math.abs(target.x - this.x) <= CAPTOR_CONFIG.shockRange) {
        // 근접까지 끌려오면 2초 포박하며 전기 충격.
        this.captorState = 'shocking';
        this.stateEndsAt = time + CAPTOR_CONFIG.captureDuration;
        this.shockNextTickAt = time;
      }
      return true;
    }

    if (this.captorState === 'warning') {
      this.setVelocityX(0);
      this.rig.play(POSE.pull);
      this.drawCable(this.lockedTarget.x, this.lockedTarget.y);
      if (time >= this.stateEndsAt) {
        const evaded = Phaser.Math.Distance.Between(
          target.x,
          target.y,
          this.lockedTarget.x,
          this.lockedTarget.y,
        ) > 70;
        if (evaded) {
          this.releaseCable(time);
        } else {
          this.captorState = 'tethered';
          this.stateEndsAt = time + CAPTOR_CONFIG.tetherDuration;
          this.tetherDamage = 0;
        }
      }
      return true;
    }

    if (this.captorState === 'recover' && time < this.stateEndsAt) {
      this.setVelocityX(0);
      this.rig.play(POSE.idle);
      return targetInRange;
    }
    if (this.captorState === 'recover') {
      this.captorState = 'ready';
    }

    if (!targetInRange) {
      this.setVelocityX(0);
      this.rig.play(POSE.idle);
      return false;
    }

    const direction = Math.sign(target.x - this.x) || 1;
    const chasing = distance > CAPTOR_CONFIG.chaseTriggerDistance;
    this.setVelocityX(chasing ? direction * CAPTOR_CONFIG.chaseSpeed : 0);
    this.rig.play(chasing ? POSE.walk : POSE.idle);
    if (time >= this.nextAttackAt) {
      this.captorState = 'warning';
      this.stateEndsAt = time + CAPTOR_CONFIG.warningDuration;
      this.lockedTarget.set(target.x, target.y);
      this.setVelocityX(0);
    }
    return true;
  }

  override takeDamage(amount: number) {
    const defeated = super.takeDamage(amount);
    if (this.captorState === 'tethered' || this.captorState === 'shocking') {
      this.tetherDamage += amount;
      if (this.tetherDamage >= CAPTOR_CONFIG.tetherBreakDamage) {
        this.releaseCable(this.scene.time.now);
      }
    }
    return defeated;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.destroyTetherObjects();
  }

  override defeat() {
    if (!this.active || this.dying) {
      return;
    }

    this.dying = true;
    this.onDefeated();
    this.rig.playDeath(() => this.disableBody(true, true));
  }

  override destroy(fromScene?: boolean) {
    this.destroyTetherObjects();
    super.destroy(fromScene);
  }

  private showTether(targetX: number, targetY: number) {
    const sourceX = this.x + (this.flipX ? 14 : -14) + 3;
    const sourceY = this.y + 3;
    const angle = Phaser.Math.Angle.Between(sourceX, sourceY, targetX, targetY);
    const distance = Phaser.Math.Distance.Between(
      sourceX,
      sourceY,
      targetX,
      targetY,
    );
    this.tetherLine
      .setPosition(sourceX, sourceY)
      .setRotation(angle)
      .setDisplaySize(distance, STAGE_THREE_CAPTOR_TETHER.line.height)
      .setAlpha(1)
      .setVisible(true);
    this.tetherClaw
      .setPosition(targetX, targetY)
      .setRotation(angle - Math.PI)
      .setAlpha(1)
      .setVisible(true);
  }

  private hideTether() {
    if (this.tetherLine.active) {
      this.tetherLine.setVisible(false);
    }
    if (this.tetherClaw.active) {
      this.tetherClaw.setVisible(false);
    }
  }

  private destroyTetherObjects() {
    if (this.cable.active) {
      this.cable.destroy();
    }
    if (this.tetherLine.active) {
      this.tetherLine.destroy();
    }
    if (this.tetherClaw.active) {
      this.tetherClaw.destroy();
    }
  }

  private drawCable(targetX: number, targetY: number) {
    this.cable.clear();
    this.showTether(targetX, targetY);
  }

  /** 포박 중 케이블을 따라 흐르는 지그재그 전기 아크. */
  private drawShock(targetX: number, targetY: number) {
    const sourceX = this.x + (this.flipX ? 14 : -14) + 3;
    const sourceY = this.y + 3;
    this.showTether(targetX, targetY);
    this.cable.clear();

    const segments = 6;
    this.cable.lineStyle(2, 0xaee9ff, 0.95);
    this.cable.beginPath();
    this.cable.moveTo(sourceX, sourceY);
    for (let index = 1; index < segments; index += 1) {
      const t = index / segments;
      const jitter = (Math.random() - 0.5) * 18;
      this.cable.lineTo(
        Phaser.Math.Linear(sourceX, targetX, t),
        Phaser.Math.Linear(sourceY, targetY, t) + jitter,
      );
    }
    this.cable.lineTo(targetX, targetY);
    this.cable.strokePath();
  }

  private releaseCable(time: number) {
    this.cable.clear();
    this.hideTether();
    this.tetherDamage = 0;
    this.captorState = 'recover';
    this.stateEndsAt = time + 480;
    this.nextAttackAt = time + CAPTOR_CONFIG.attackCooldown;
  }
}
