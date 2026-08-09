import Phaser from 'phaser';
import type {
  BossSpriteConfig,
  LaserCannonPatternConfig,
  LaserBossCombatConfig,
} from '@/game/config/bossConfigTypes';
import {
  getLaserAim,
  getLaserMuzzlePosition,
  isPointInsideLaser,
} from '@/game/combat/laserGeometry';
import { LaserAttackCycle } from '@/game/combat/LaserAttackCycle';
import { getLaserPatternTuning } from '@/game/combat/laserPattern';
import { BossEnemy } from '@/game/entities/BossEnemy';
import type { EnemyProjectileAttack } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import { BeamEffects } from '@/game/systems/BeamEffects';

type PlayerDamageHandler = (damage: number) => void;

const DEATH_POSE_HOLD_MS = 2000;
const DEATH_FADE_MS = 650;

export class LaserBossEnemy extends BossEnemy<LaserCannonPatternConfig> {
  override readonly usesHitFlash: boolean = true;
  override readonly hitFlashAlpha: number = 0.72;

  private readonly effects: BeamEffects;
  private readonly attackCycle: LaserAttackCycle;
  private aimAngle = 0;
  private laserHit = false;
  private activeSpriteAnimation?: string;
  private recoilUntil = 0;
  private dying = false;
  private laserSoundCue: 'single' | 'double-first' | 'double-second' =
    'single';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: LaserBossCombatConfig,
    private readonly damagePlayer: PlayerDamageHandler,
    private readonly sprite?: BossSpriteConfig,
  ) {
    super(scene, x, y, texture, config);

    this.attackCycle = new LaserAttackCycle(config.pattern, scene.time.now);
    this.effects = new BeamEffects(scene, config.pattern);
    this.applyBossSprite();
  }

  /**
   * 실제 아틀라스 프레임에는 여백이 있어, 물리 바디를 캐릭터 크기에 맞춤.
   * 제공된 Aseprite 태그 이름이 포즈 애니메이션을 구동함.
   */
  private applyBossSprite() {
    if (!this.sprite) {
      return;
    }

    this.setScale(this.sprite.scale);
    (this.body as Phaser.Physics.Arcade.Body).setSize(
      this.sprite.bodyWidth,
      this.sprite.bodyHeight,
      true,
    );
    this.playSpriteAnimation(this.sprite.animations.idle);
  }

  private playSpriteAnimation(animation: string) {
    if (!this.sprite || this.activeSpriteAnimation === animation) {
      return;
    }

    this.activeSpriteAnimation = animation;
    this.play(animation, true);
  }

  updateCombat(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
    _fireProjectile: EnemyProjectileAttack,
  ) {
    if (!this.active || this.dying) {
      this.effects.hideAll();
      return false;
    }

    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    if (!targetInRange) {
      this.setVelocityX(0);
      this.effects.hideAll();
      this.playSpriteAnimation(this.sprite?.animations.idle ?? '');
      return false;
    }

    switch (this.attackCycle.state) {
      case 'repositioning':
        this.updateRepositioning(time, target);
        break;
      case 'charging':
        this.updateCharging(time, target);
        break;
      case 'firing':
        this.updateFiring(time, target);
        break;
    }

    return true;
  }

  protected override onDefeated() {
    super.onDefeated();
    this.effects.hideAll();
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
    this.playSpriteAnimation(this.sprite.animations.death);

    // 전투와 충돌을 즉시 중단하되, 페이드아웃 전에 마지막 지정 프레임을
    // 읽을 수 있을 만큼 충분히 보여줌. 두 프레임짜리 death 애니메이션이
    // 진행될 수 있도록 GameObject는 active로 유지함.
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
    this.effects.destroy();
    super.destroy(fromScene);
  }

  private updateRepositioning(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.effects.hideAll();
    this.moveToPreferredDistance(time, target);
    if (time >= this.recoilUntil) {
      // 선호 거리로 다가가거나 물러나는 동안 walk. 자리 잡으면 idle.
      const moving =
        Math.abs((this.body as Phaser.Physics.Arcade.Body).velocity.x) > 1;
      this.playSpriteAnimation(
        (moving ? this.sprite?.animations.walk : this.sprite?.animations.idle) ??
          '',
      );
    }

    if (this.attackCycle.isComplete(time)) {
      this.attackCycle.beginVolley(time, this.isEnraged);
      this.laserSoundCue = this.isEnraged ? 'double-first' : 'single';
      this.lockAimOn(target);
    }
  }

  private updateCharging(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.charge ?? '');

    if (this.attackCycle.shouldTrackAim(time)) {
      this.lockAimOn(target);
    }
    // Facing is not re-derived from the aim angle here. lockAimOn already set
    // it, and the muzzle it placed is what the angle was measured from — so
    // deriving one from the other flips the muzzle out from under a beam that
    // is already aimed. See getLaserAim.
    this.effects.drawTelegraph(
      this.getMuzzlePosition(),
      this.aimAngle,
      this.attackCycle.getChargeProgress(time),
    );

    if (this.attackCycle.isComplete(time)) {
      this.beginFiring(time);
    }
  }

  private updateFiring(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.fire ?? '');
    const muzzle = this.getMuzzlePosition();
    this.effects.updateBeam(muzzle, this.aimAngle);

    if (!this.laserHit && this.isTargetInsideBeam(target, muzzle)) {
      this.laserHit = true;
      this.damagePlayer(this.pattern.damage);
    }

    if (!this.attackCycle.isComplete(time)) {
      return;
    }

    this.effects.hideBeam();
    this.recoilUntil = time + 280;
    this.playSpriteAnimation(this.sprite?.animations.recoil ?? '');
    if (this.attackCycle.finishFiring(time, this.isEnraged)) {
      this.laserSoundCue = 'double-second';
      this.lockAimOn(target);
    }
  }

  private beginFiring(time: number) {
    this.attackCycle.beginFiring(time);
    this.laserHit = false;
    this.effects.showBeam(this.getMuzzlePosition(), this.aimAngle);
    gameEvents.emit('boss-laser-fired', this.laserSoundCue);
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

    if (
      horizontalDistance >
      this.pattern.preferredDistance + this.pattern.distanceTolerance
    ) {
      this.setVelocityX(directionToTarget * this.tuning.moveSpeed);
      return;
    }

    if (
      horizontalDistance <
      this.pattern.preferredDistance - this.pattern.distanceTolerance
    ) {
      this.setVelocityX(-directionToTarget * this.tuning.moveSpeed);
      return;
    }

    this.setVelocityX(0);
  }

  private lockAimOn(target: Phaser.Physics.Arcade.Sprite) {
    const aim = getLaserAim(
      this,
      target,
      this.pattern.muzzleOffset,
      this.pattern.muzzleOffsetY,
    );
    this.setFlipX(aim.facingLeft);
    this.aimAngle = aim.angle;
  }

  private getMuzzlePosition() {
    return getLaserMuzzlePosition(
      this,
      this.flipX,
      this.pattern.muzzleOffset,
      this.pattern.muzzleOffsetY,
    );
  }

  private isTargetInsideBeam(
    target: Phaser.Physics.Arcade.Sprite,
    muzzle: { x: number; y: number },
  ) {
    const body = target.body as Phaser.Physics.Arcade.Body | null;
    const point = body?.center ?? target;
    const targetRadius = body
      ? Math.max(body.width, body.height) * 0.35
      : 24;

    return isPointInsideLaser(
      muzzle,
      this.aimAngle,
      this.pattern.range,
      this.pattern.width,
      point,
      targetRadius,
    );
  }

  private get isEnraged() {
    return (
      this.currentHealth / this.maxHealth <= this.pattern.enrageHealthRatio
    );
  }

  private get tuning() {
    return getLaserPatternTuning(this.pattern, this.isEnraged);
  }

  private get pattern() {
    return this.config.pattern;
  }
}
