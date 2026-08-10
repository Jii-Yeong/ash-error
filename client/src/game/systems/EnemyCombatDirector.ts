import Phaser from 'phaser';
import {
  FLYING_ENEMY_COMBAT_CONFIG,
  RANGED_ENEMY_COMBAT_CONFIG,
} from '@/game/config/combatConfig';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import { BossEnemy } from '@/game/entities/BossEnemy';
import { Enemy, type EnemyProjectileKind } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';
import { ProjectilePool } from '@/game/systems/ProjectilePool';
import {
  isFlyingProjectileBlocker,
  isProjectileBlocker,
} from '@/game/systems/TerrainBuilder';

type EnemyCombatDirectorOptions = {
  scene: Phaser.Scene;
  player: Phaser.Physics.Arcade.Sprite;
  enemies: Enemy[];
  projectileBlockers: Phaser.Physics.Arcade.StaticGroup;
  projectileFloor: Phaser.Physics.Arcade.StaticGroup;
  canDamageEnemy: () => boolean;
  isPlayerInvulnerable: () => boolean;
  damagePlayer: (damage: number) => void;
  isOverPit: (x: number) => boolean;
  notifyEnemyDefeated: (enemy: Enemy) => void;
  dropBossReward: (enemy: BossEnemy) => void;
  clearEnemyRanges: () => void;
  drawEnemyRange: (enemy: Enemy, targetInRange: boolean) => void;
};

export class EnemyCombatDirector {
  private readonly projectilePools: Record<EnemyProjectileKind, ProjectilePool>;
  private readonly fallingEnemies = new Set<Enemy>();

  constructor(private readonly options: EnemyCombatDirectorOptions) {
    const ranged = new ProjectilePool(
      options.scene,
      RANGED_ENEMY_COMBAT_CONFIG.projectile,
    );
    const flying = new ProjectilePool(
      options.scene,
      FLYING_ENEMY_COMBAT_CONFIG.projectile,
    );
    this.projectilePools = { ranged, flying };

    ranged.collideWith(options.projectileBlockers, isProjectileBlocker);
    flying.collideWith(options.projectileBlockers, isFlyingProjectileBlocker);
    flying.collideWith(options.projectileFloor);
    options.scene.physics.add.overlap(
      ranged.group,
      options.player,
      this.createPlayerHitHandler(
        RANGED_ENEMY_COMBAT_CONFIG.projectile.damage,
      ),
    );
    options.scene.physics.add.overlap(
      flying.group,
      options.player,
      this.createPlayerHitHandler(
        FLYING_ENEMY_COMBAT_CONFIG.projectile.damage,
      ),
    );
    options.scene.physics.add.overlap(
      options.player,
      options.enemies,
      this.handleEnemyContact,
    );
  }

  update(time: number) {
    this.options.clearEnemyRanges();

    for (const enemy of this.options.enemies) {
      // 레벨 밖으로 추락 중인 적은 더 이상 사격하지 않는다.
      if (!enemy.active || this.fallingEnemies.has(enemy)) {
        continue;
      }

      const targetInRange = enemy.updateCombat(
        time,
        this.options.player,
        this.fireProjectile,
      );
      this.options.drawEnemyRange(enemy, targetInRange);
    }
  }

  replaceEnemies(spawned: Enemy[]) {
    this.fallingEnemies.clear();
    this.options.enemies.splice(0, this.options.enemies.length, ...spawned);
  }

  destroyEnemies() {
    for (const enemy of this.options.enemies) {
      enemy.destroy();
    }
    this.replaceEnemies([]);
  }

  stopEnemies() {
    for (const enemy of this.options.enemies) {
      enemy.setVelocity(0);
    }
  }

  clearProjectiles() {
    for (const pool of Object.values(this.projectilePools)) {
      pool.clear();
    }
  }

  handleEnemyHit(enemy: Enemy, defeated: boolean) {
    if (!this.options.canDamageEnemy()) {
      return;
    }

    this.emitEnemyHealth();
    gameEvents.emit('enemy-damaged', enemy.x, enemy.y);
    if (defeated) {
      this.defeatEnemy(enemy);
    }
  }

  /** 적이 구덩이에 들어서면 충돌을 끊고, 화면 아래로 이탈하면 제거한다. */
  handlePitFalls() {
    for (const enemy of this.options.enemies) {
      if (!enemy.active || enemy instanceof BossEnemy) {
        continue;
      }

      const body = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (!body) {
        continue;
      }

      if (this.fallingEnemies.has(enemy)) {
        if (body.top > GAME_HEIGHT) {
          this.fallingEnemies.delete(enemy);
          enemy.defeat();
        }
        continue;
      }

      const enteredPit =
        body.bottom >= FLOOR_SURFACE_Y && this.options.isOverPit(body.center.x);
      if (!enteredPit && body.top <= FLOOR_SURFACE_Y) {
        continue;
      }

      this.fallingEnemies.add(enemy);
      body.setCollideWorldBounds(false);
      body.checkCollision.none = true;
      this.clearProjectilesFrom(enemy);
      this.options.notifyEnemyDefeated(enemy);
    }
  }

  emitEnemyHealth() {
    const current = this.options.enemies.reduce(
      (total, enemy) => total + enemy.currentHealth,
      0,
    );
    const max = this.options.enemies.reduce(
      (total, enemy) => total + enemy.maxHealth,
      0,
    );
    const isBoss = this.options.enemies.some(
      (enemy) => enemy instanceof BossEnemy,
    );
    gameEvents.emit('enemy-health-changed', current, max, isBoss);
  }

  private fireProjectile = (
    enemy: Enemy,
    target: Phaser.Physics.Arcade.Sprite,
  ) => {
    if (!enemy.projectile) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(
      enemy.x,
      enemy.y,
      target.x,
      target.y,
    );
    const { muzzleOffset, kind } = enemy.projectile;
    this.projectilePools[kind].fire(
      enemy.x + Math.cos(angle) * muzzleOffset,
      enemy.y + Math.sin(angle) * muzzleOffset,
      angle,
      { owner: enemy },
    );
  };

  private defeatEnemy(enemy: Enemy) {
    gameEvents.emit('enemy-defeated', enemy.x, enemy.y);
    if (enemy instanceof BossEnemy) {
      this.options.dropBossReward(enemy);
    } else {
      if (!enemy.playsOwnDeathAnimation) {
        this.spawnDeathPop(enemy);
      }
      this.clearProjectilesFrom(enemy);
    }
    enemy.defeat();
    if (enemy instanceof BossEnemy && enemy.deathAnimationDuration > 0) {
      this.options.scene.time.delayedCall(enemy.deathAnimationDuration, () =>
        this.options.notifyEnemyDefeated(enemy),
      );
      return;
    }
    this.options.notifyEnemyDefeated(enemy);
  }

  private clearProjectilesFrom(enemy: Enemy) {
    if (enemy.projectile) {
      this.projectilePools[enemy.projectile.kind].clearFrom(enemy);
    }
  }

  /** 처치 순간을 강조하는 흰색 확대 잔상을 표시한다. */
  private spawnDeathPop(enemy: Enemy) {
    const pop = this.options.scene.add
      .image(enemy.x, enemy.y, enemy.texture.key, enemy.frame.name)
      .setFlipX(enemy.flipX)
      .setScale(enemy.scaleX, enemy.scaleY)
      .setDepth(enemy.depth)
      .setTint(0xffffff)
      .setTintMode(Phaser.TintModes.FILL);
    this.options.scene.tweens.add({
      targets: pop,
      scaleX: enemy.scaleX * 1.6,
      scaleY: enemy.scaleY * 1.6,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => pop.destroy(),
    });
  }

  private handleEnemyContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (firstObject, secondObject) => {
      const enemy = this.findEnemy(firstObject, secondObject);
      if (
        !enemy ||
        !this.options.canDamageEnemy() ||
        this.options.isPlayerInvulnerable()
      ) {
        return;
      }

      const damage = enemy.tryContactAttack(this.options.scene.time.now);
      if (damage !== null) {
        this.options.damagePlayer(damage);
      }
    };

  private findEnemy(firstObject: unknown, secondObject: unknown) {
    if (firstObject instanceof Enemy) {
      return firstObject;
    }
    return secondObject instanceof Enemy ? secondObject : null;
  }

  private createPlayerHitHandler(
    damage: number,
  ): Phaser.Types.Physics.Arcade.ArcadePhysicsCallback {
    return (firstObject, secondObject) => {
      const bullet =
        firstObject === this.options.player
          ? (secondObject as Phaser.Physics.Arcade.Image)
          : (firstObject as Phaser.Physics.Arcade.Image);
      if (!bullet.active) {
        return;
      }

      bullet.disableBody(true, true);
      this.options.damagePlayer(damage);
    };
  }
}
