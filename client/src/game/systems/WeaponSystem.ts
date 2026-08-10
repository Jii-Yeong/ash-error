import Phaser from 'phaser';
import {
  WEAPON_INVENTORY_SIZE,
  type WeaponConfig,
} from '@/game/config/weaponConfig';
import { Enemy } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import { ProjectilePool } from '@/game/systems/ProjectilePool';
import { WeaponFeedback } from '@/game/systems/WeaponFeedback';
import { WeaponInventory } from '@/game/systems/WeaponInventory';

type WeaponRuntime = {
  config: WeaponConfig;
  pool: ProjectilePool;
  nextFireAt: number;
};

type EnemyHitListener = (enemy: Enemy, defeated: boolean) => void;

export class WeaponSystem {
  private readonly weapons: WeaponRuntime[];
  private readonly weaponById: Map<string, WeaponRuntime>;
  private readonly inventory: WeaponInventory;
  private readonly feedback: WeaponFeedback;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Sprite,
    private readonly enemies: Enemy[],
    weaponConfigs: readonly WeaponConfig[],
    startingWeaponId: string,
    private readonly canFire: () => boolean,
    private readonly onEnemyHit: EnemyHitListener,
    private readonly canDamageEnemies: () => boolean = canFire,
  ) {
    this.weapons = weaponConfigs.map((config) => {
      const runtime: WeaponRuntime = {
        config,
        pool: new ProjectilePool(scene, {
          texture: config.texture,
          speed: config.projectileSpeed,
          lifetime: config.projectileLifetime,
          maxSize: config.maxPoolSize,
        }),
        nextFireAt: 0,
      };

      scene.physics.add.overlap(
        runtime.pool.group,
        enemies,
        this.createEnemyHitHandler(runtime),
      );
      return runtime;
    });
    this.weaponById = new Map(
      this.weapons.map((weapon) => [weapon.config.id, weapon]),
    );
    const startingWeapon =
      this.weaponById.get(startingWeaponId) ?? this.weapons[0];
    if (!startingWeapon) {
      throw new Error('Weapon system requires at least one weapon');
    }
    this.inventory = new WeaponInventory(
      startingWeapon.config.id,
      WEAPON_INVENTORY_SIZE,
    );
    this.feedback = new WeaponFeedback(
      scene,
      player,
      this.activeConfig,
      canFire,
    );
  }

  get activeConfig() {
    return this.activeWeapon.config;
  }

  get inventorySnapshot() {
    return this.inventory.snapshot;
  }

  get ownedWeaponIds() {
    return this.inventory.ownedWeaponIds;
  }

  update(delta: number, aimPoint: Phaser.Math.Vector2) {
    this.feedback.update(delta, aimPoint);
    for (const weapon of this.weapons) {
      weapon.pool.clearOutsideCamera(this.scene.cameras.main);
    }
  }

  blockProjectilesWith(
    terrain: Phaser.Physics.Arcade.StaticGroup,
    blocksProjectile: (blocker: Phaser.GameObjects.GameObject) => boolean,
  ) {
    for (const weapon of this.weapons) {
      weapon.pool.collideWith(terrain, blocksProjectile);
    }
  }

  tryFire(aimPoint: Phaser.Math.Vector2, time: number) {
    const weapon = this.activeWeapon;
    if (!this.canFire() || time < weapon.nextFireAt) {
      return;
    }

    const baseAngle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      aimPoint.x,
      aimPoint.y,
    );
    const { config } = weapon;
    const canDamage = this.canDamageEnemies();

    for (let burstIndex = 0; burstIndex < config.burstCount; burstIndex += 1) {
      const fireVolley = () => {
        if (!this.canFire() || this.activeWeapon !== weapon) {
          return;
        }
        this.fireVolley(weapon, baseAngle, canDamage);
      };

      if (burstIndex === 0) {
        fireVolley();
      } else {
        this.scene.time.delayedCall(
          config.burstInterval * burstIndex,
          fireVolley,
        );
      }
    }

    weapon.nextFireAt = time + config.fireInterval;
  }

  /** 새 무기를 첫 빈 슬롯에 넣고, 이미 소유했다면 기존 슬롯을 선택함. */
  collect(weaponId: string) {
    if (!this.weaponById.has(weaponId) || !this.inventory.collect(weaponId)) {
      return false;
    }
    this.feedback.setWeapon(this.activeConfig);
    return true;
  }

  /** 숫자키에 대응하는, 이미 채워진 슬롯만 선택함. */
  equipSlot(slotIndex: number) {
    if (!this.inventory.select(slotIndex)) {
      return false;
    }
    this.feedback.setWeapon(this.activeConfig);
    return true;
  }

  playEquipFeedback() {
    this.feedback.playEquip(this.activeConfig);
  }

  hide() {
    this.feedback.hide();
  }

  clearProjectiles() {
    for (const weapon of this.weapons) {
      weapon.pool.clear();
    }
  }

  cancelHitStop() {
    this.feedback.cancelHitStop();
  }

  private get activeWeapon() {
    const weapon = this.weaponById.get(this.inventory.activeWeaponId);
    if (!weapon) {
      throw new Error('Active inventory weapon is not configured');
    }
    return weapon;
  }

  private fireVolley(
    weapon: WeaponRuntime,
    baseAngle: number,
    canDamage: boolean,
  ) {
    const { config } = weapon;
    const angles = this.computePelletAngles(
      baseAngle,
      config.pelletCount,
      config.spreadDegrees,
    );

    const muzzle = this.feedback.getMuzzlePosition(
      baseAngle,
      config.muzzleOffset,
      config.muzzleRise,
      baseAngle,
    );

    const origin = this.spawnOrigin(muzzle);

    for (const angle of angles) {
      weapon.pool.fire(origin.x, origin.y, angle, {
        canDamage,
        pierce: config.pierce,
      });
    }

    this.feedback.playFire(config, baseAngle, angles);
    // A burst is three physical volleys, so emit its cue per volley instead of
    // once when the trigger only schedules the delayed rounds.
    gameEvents.emit('weapon-fired', config.id, muzzle.x, muzzle.y);
  }

  /**
   * 총 앞에 서 있는 대상을 고려해 탄환 생성 위치를 정한다.
   *
   * 기본 위치는 총구지만 총구는 손잡이에서 총열 방향으로 24~47px 떨어져 있고,
   * 그 사이에는 충돌 검사가 없었다. 적 몸체 너비는 44~48px이며 SMG를 제외한
   * 무기는 총구가 그 너머에 놓여, 플레이어와 겹친 적의 반대편에 탄환이 생성되고
   * 근접 사격이 빗나갔다.
   *
   * 이 구간에 대상이 있으면 손잡이에서 탄환을 생성한다. 이후 피해, 넉백, 관통,
   * 피드백은 기존 탄환-적 겹침 경로에서 동일하게 처리한다. 총구 화염은 총열 위치를
   * 유지하므로, 원래 총구가 적 안에 있던 거리 외에는 화면상 변화가 없다.
   */
  private spawnOrigin(muzzle: { x: number; y: number }) {
    // 실제 게임에서는 렌더링 리그를 사용하고, 간단한 장면·테스트 환경에서는
    // 플레이어를 대체값으로 사용해 충돌 보정을 동일하게 유지한다.
    const grip = this.feedback.display ?? this.player;
    const barrel = new Phaser.Geom.Line(grip.x, grip.y, muzzle.x, muzzle.y);

    for (const enemy of this.enemies) {
      const body = enemy.active
        ? (enemy.body as Phaser.Physics.Arcade.Body | null)
        : null;
      if (!body) {
        continue;
      }

      const bounds = new Phaser.Geom.Rectangle(
        body.x,
        body.y,
        body.width,
        body.height,
      );
      if (Phaser.Geom.Intersects.LineToRectangle(barrel, bounds)) {
        return { x: grip.x, y: grip.y };
      }
    }

    return muzzle;
  }

  private computePelletAngles(
    baseAngle: number,
    pelletCount: number,
    spreadDegrees: number,
  ) {
    if (pelletCount <= 1) {
      return [baseAngle];
    }

    const spreadRadians = Phaser.Math.DegToRad(spreadDegrees);
    return Array.from({ length: pelletCount }, (_, index) => {
      const offset = index / (pelletCount - 1) - 0.5;
      return baseAngle + offset * spreadRadians;
    });
  }

  private createEnemyHitHandler(
    weapon: WeaponRuntime,
  ): Phaser.Types.Physics.Arcade.ArcadePhysicsCallback {
    return (firstObject, secondObject) => {
      const enemy = this.findEnemy(firstObject, secondObject);
      const bullet =
        firstObject instanceof Enemy
          ? (secondObject as Phaser.Physics.Arcade.Image)
          : (firstObject as Phaser.Physics.Arcade.Image);

      if (!enemy || !bullet.active || !enemy.active) {
        return;
      }

      if (!this.isVisibleToPlayer(enemy)) {
        bullet.disableBody(true, true);
        return;
      }

      if (!bullet.getData('canDamage') || !this.canDamageEnemies()) {
        bullet.disableBody(true, true);
        return;
      }

      const { config } = weapon;
      const time = this.scene.time.now;

      const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;
      // Overlap fires as soon as the round's rectangle touches the outer body,
      // so its centre can still be just outside. Project it onto the body edge
      // to obtain the actual impact point used by precision hit regions.
      const impactX = Phaser.Math.Clamp(
        bullet.x,
        enemyBody.left,
        enemyBody.right,
      );
      const impactY = Phaser.Math.Clamp(
        bullet.y,
        enemyBody.top,
        enemyBody.bottom,
      );
      const result = enemy.takeProjectileDamage(
        config.damage,
        impactX,
        impactY,
        config.id,
      );
      if (result.applied) {
        this.feedback.playEnemyHit(enemy, config);
      }
      if (result.applied && config.knockback) {
        // A projectile flies straight, so its rotation is its heading.
        enemy.applyKnockback(bullet.rotation, config.knockback, time);
      }
      if (result.applied) {
        this.onEnemyHit(enemy, result.defeated);
      }
      weapon.pool.registerHit(bullet);
    };
  }

  private findEnemy(firstObject: unknown, secondObject: unknown) {
    if (firstObject instanceof Enemy) {
      return firstObject;
    }

    return secondObject instanceof Enemy ? secondObject : null;
  }

  private isVisibleToPlayer(enemy: Enemy) {
    return Phaser.Geom.Intersects.RectangleToRectangle(
      this.scene.cameras.main.worldView,
      enemy.getBounds(),
    );
  }
}
