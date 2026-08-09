import Phaser from 'phaser';
import { CELESTIAL_PROJECTILE_BOUNDS } from '@/game/config/stageFiveEnemyConfig';

type CelestialProjectile = {
  sprite: Phaser.Physics.Arcade.Image;
  angle: number;
  speed: number;
  launchAt: number;
  expiresAt: number;
  homingUntil: number;
  turnRate: number;
  angularVelocity: number;
};

type CelestialProjectileSpawn = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  delay?: number;
  lifetime?: number;
  homingDuration?: number;
  turnRate?: number;
  angularVelocity?: number;
};

type CelestialProjectileFieldConfig = {
  texture: string;
  damage: number;
  radius: number;
  damagePlayer: (damage: number) => void;
};

/** 5스테이지 잡몹이 공유하는 지연·유도·곡선 탄환 풀. */
export class CelestialProjectileField {
  private readonly active: CelestialProjectile[] = [];
  private readonly pooled: Phaser.Physics.Arcade.Image[] = [];
  private readonly sprites = new Set<Phaser.Physics.Arcade.Image>();
  private lastUpdateAt = 0;
  private target?: Phaser.Physics.Arcade.Sprite;
  private detached = false;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: CelestialProjectileFieldConfig,
  ) {}

  spawn({
    x,
    y,
    angle,
    speed,
    delay = 0,
    lifetime = 4_500,
    homingDuration = 0,
    turnRate = 0,
    angularVelocity = 0,
  }: CelestialProjectileSpawn) {
    const sprite = this.acquire(x, y);
    const launchAt = this.scene.time.now + delay;
    sprite.setRotation(angle).setVelocity(0);
    this.active.push({
      sprite,
      angle,
      speed,
      launchAt,
      expiresAt: launchAt + lifetime,
      homingUntil: launchAt + homingDuration,
      turnRate,
      angularVelocity,
    });
  }

  update(time: number, target: Phaser.Physics.Arcade.Sprite) {
    this.target = target;
    this.updateProjectiles(time, target);
  }

  /** 적 사망 뒤 남은 탄환을 씬 갱신에 넘겨 수명 종료까지 이동시킴. */
  detach() {
    if (this.detached || this.destroyed || this.active.length === 0) {
      return;
    }
    this.detached = true;
    this.scene.events.on(
      Phaser.Scenes.Events.UPDATE,
      this.updateDetached,
      this,
    );
  }

  private updateProjectiles(
    time: number,
    target?: Phaser.Physics.Arcade.Sprite,
  ) {
    const deltaSeconds = Math.min(
      Math.max(0, time - this.lastUpdateAt) / 1_000,
      0.05,
    );
    this.lastUpdateAt = time;
    const camera = this.scene.cameras.main.worldView;

    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const projectile = this.active[index]!;
      const { sprite } = projectile;
      const outside =
        sprite.x < camera.left - CELESTIAL_PROJECTILE_BOUNDS.padding ||
        sprite.x > camera.right + CELESTIAL_PROJECTILE_BOUNDS.padding ||
        sprite.y < CELESTIAL_PROJECTILE_BOUNDS.top ||
        sprite.y > CELESTIAL_PROJECTILE_BOUNDS.bottom;
      if (time >= projectile.expiresAt || outside) {
        this.release(index);
        continue;
      }
      if (time < projectile.launchAt) {
        continue;
      }

      if (time <= projectile.homingUntil && target?.active) {
        projectile.angle = Phaser.Math.Angle.RotateTo(
          projectile.angle,
          Phaser.Math.Angle.Between(sprite.x, sprite.y, target.x, target.y),
          projectile.turnRate * deltaSeconds,
        );
      }
      projectile.angle += projectile.angularVelocity * deltaSeconds;
      sprite.setRotation(projectile.angle);
      this.scene.physics.velocityFromRotation(
        projectile.angle,
        projectile.speed,
        (sprite.body as Phaser.Physics.Arcade.Body).velocity,
      );

      if (
        target?.active &&
        Phaser.Math.Distance.Between(sprite.x, sprite.y, target.x, target.y) <=
          this.config.radius + 16
      ) {
        this.config.damagePlayer(this.config.damage);
        this.release(index);
      }
    }
  }

  clear() {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      this.release(index);
    }
    this.stopDetachedUpdates();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.stopDetachedUpdates();
    for (const sprite of this.sprites) {
      sprite.destroy();
    }
    this.active.length = 0;
    this.pooled.length = 0;
    this.sprites.clear();
  }

  private updateDetached(time: number) {
    this.updateProjectiles(time, this.target);
    if (this.active.length === 0) {
      this.stopDetachedUpdates();
    }
  }

  private stopDetachedUpdates() {
    if (!this.detached) {
      return;
    }
    this.scene.events.off(
      Phaser.Scenes.Events.UPDATE,
      this.updateDetached,
      this,
    );
    this.detached = false;
  }

  private acquire(x: number, y: number) {
    const sprite = this.pooled.pop() ?? this.createSprite(x, y);
    sprite.enableBody(true, x, y, true, true);
    return sprite;
  }

  private createSprite(x: number, y: number) {
    const sprite = this.scene.physics.add
      .image(x, y, this.config.texture)
      .setDepth(9);
    (sprite.body as Phaser.Physics.Arcade.Body)
      .setAllowGravity(false)
      .setCircle(this.config.radius);
    this.sprites.add(sprite);
    return sprite;
  }

  private release(index: number) {
    const [projectile] = this.active.splice(index, 1);
    if (!projectile) {
      return;
    }
    projectile.sprite.disableBody(true, true);
    this.pooled.push(projectile.sprite);
  }
}
