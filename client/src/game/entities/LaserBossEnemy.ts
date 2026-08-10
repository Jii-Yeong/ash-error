import Phaser from 'phaser';
import type {
  BossSpriteConfig,
  LaserCannonPatternConfig,
  LaserBossCombatConfig,
} from '@/game/config/bossConfigTypes';
import { STAGE_ONE_BOSS_WEAPON_ASSETS } from '@/game/config/bossAnimationConfig';
import {
  getLaserAim,
  getLaserMuzzlePosition,
  getRotatedLaserMuzzlePosition,
  isPointInsideLaser,
} from '@/game/combat/laserGeometry';
import { LaserAttackCycle } from '@/game/combat/LaserAttackCycle';
import { getLaserPatternTuning } from '@/game/combat/laserPattern';
import { BossEnemy } from '@/game/entities/BossEnemy';
import type { EnemyProjectileAttack } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import { BeamEffects } from '@/game/systems/BeamEffects';

type PlayerDamageHandler = (damage: number) => void;
type StageOneBossWeaponAsset =
  (typeof STAGE_ONE_BOSS_WEAPON_ASSETS)[keyof typeof STAGE_ONE_BOSS_WEAPON_ASSETS];

const DEATH_POSE_HOLD_MS = 2000;
const DEATH_FADE_MS = 650;

export class LaserBossEnemy extends BossEnemy<LaserCannonPatternConfig> {
  override readonly usesHitFlash: boolean = true;
  override readonly hitFlashAlpha: number = 0.72;

  private readonly effects: BeamEffects;
  private readonly attackCycle: LaserAttackCycle;
  private readonly weapon?: Phaser.GameObjects.Image;
  private activeWeaponAsset: StageOneBossWeaponAsset =
    STAGE_ONE_BOSS_WEAPON_ASSETS.charge;
  private aimAngle = 0;
  private aimDistance = Number.POSITIVE_INFINITY;
  private laserHit = false;
  private activeSpriteAnimation?: string;
  private recoilUntil = 0;
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
    this.weapon = sprite
      ? scene.add
          .image(x, y, STAGE_ONE_BOSS_WEAPON_ASSETS.charge.key)
          .setOrigin(
            STAGE_ONE_BOSS_WEAPON_ASSETS.charge.originX,
            STAGE_ONE_BOSS_WEAPON_ASSETS.charge.originY,
          )
          .setScale(sprite.scale)
          .setVisible(false)
      : undefined;
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
      this.weapon?.setVisible(false);
      return false;
    }

    const targetInRange =
      Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <=
      this.aggroRadius;
    if (!targetInRange) {
      this.setVelocityX(0);
      this.effects.hideAll();
      this.weapon?.setVisible(false);
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
    this.weapon?.setVisible(false);
  }

  override defeat() {
    this.defeatWithSpriteAnimation({
      hasSprite: Boolean(this.sprite),
      playDeathAnimation: () =>
        this.playSpriteAnimation(this.sprite?.animations.death ?? ''),
      holdDuration: DEATH_POSE_HOLD_MS,
      fadeDuration: DEATH_FADE_MS,
    });
  }


  override destroy(fromScene?: boolean) {
    this.effects.destroy();
    this.weapon?.destroy();
    super.destroy(fromScene);
  }

  private updateRepositioning(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    this.effects.hideAll();
    this.weapon?.setVisible(false);
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
      this.activeWeaponAsset = STAGE_ONE_BOSS_WEAPON_ASSETS.charge;
      this.lockAimOn(target);
    }
  }

  private updateCharging(
    time: number,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    if (
      Math.abs(target.x - this.x) <
      this.pattern.preferredDistance - this.pattern.distanceTolerance
    ) {
      this.attackCycle.cancelCharge(time, this.isEnraged);
      this.updateRepositioning(time, target);
      return;
    }

    this.setVelocityX(0);
    this.playSpriteAnimation(this.sprite?.animations.charge ?? '');
    this.activeWeaponAsset = STAGE_ONE_BOSS_WEAPON_ASSETS.charge;

    if (this.attackCycle.shouldTrackAim(time)) {
      this.lockAimOn(target);
    }
    this.syncWeapon(STAGE_ONE_BOSS_WEAPON_ASSETS.charge);
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
    this.syncWeapon(STAGE_ONE_BOSS_WEAPON_ASSETS.fire);
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
    this.weapon?.setVisible(false);
    this.recoilUntil = time + 280;
    this.playSpriteAnimation(this.sprite?.animations.recoil ?? '');
    if (this.attackCycle.finishFiring(time, this.isEnraged)) {
      this.laserSoundCue = 'double-second';
      this.activeWeaponAsset = STAGE_ONE_BOSS_WEAPON_ASSETS.charge;
      this.lockAimOn(target);
    }
  }

  private beginFiring(time: number) {
    this.syncWeapon(STAGE_ONE_BOSS_WEAPON_ASSETS.fire);
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
    if (this.weapon) {
      this.setFlipX(target.x < this.x);
      const grip = this.getWeaponGripPosition(this.activeWeaponAsset);
      this.aimAngle = Phaser.Math.Angle.Between(
        grip.x,
        grip.y,
        target.x,
        target.y,
      );
      this.aimDistance = Phaser.Math.Distance.Between(
        grip.x,
        grip.y,
        target.x,
        target.y,
      );
      return;
    }

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
    if (this.weapon) {
      const barrelLength = this.flipX
        ? this.activeWeaponAsset.flippedBarrelLength
        : this.activeWeaponAsset.barrelLength;
      const muzzle = getRotatedLaserMuzzlePosition(
        this.getWeaponGripPosition(this.activeWeaponAsset),
        this.aimAngle,
        Math.min(barrelLength, this.aimDistance),
      );
      muzzle.y += this.flipX
        ? this.activeWeaponAsset.flippedMuzzleOffsetY
        : this.activeWeaponAsset.muzzleOffsetY;
      return muzzle;
    }

    return getLaserMuzzlePosition(
      this,
      this.flipX,
      this.pattern.muzzleOffset,
      this.pattern.muzzleOffsetY,
    );
  }

  private getWeaponGripPosition(asset: StageOneBossWeaponAsset) {
    return getLaserMuzzlePosition(
      this,
      this.flipX,
      asset.gripOffsetX,
      this.flipX ? asset.flippedGripOffsetY : asset.gripOffsetY,
    );
  }

  private syncWeapon(asset: StageOneBossWeaponAsset) {
    if (!this.weapon) {
      return;
    }

    this.activeWeaponAsset = asset;
    const grip = this.getWeaponGripPosition(asset);
    const barrelAngle = this.flipX
      ? asset.flippedBarrelAngle
      : asset.barrelAngle;
    this.weapon
      .setTexture(asset.key)
      .setOrigin(
        asset.originX,
        this.flipX ? 1 - asset.originY : asset.originY,
      )
      .setPosition(grip.x, grip.y)
      .setRotation(this.aimAngle - barrelAngle)
      .setFlipY(this.flipX)
      .setDepth(this.depth + 0.01)
      .setVisible(true);
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
