import Phaser from 'phaser';
import {
  selectBossWeaponDrop,
  type RandomSource,
  WEAPON_PICKUP_RADIUS,
} from '@/game/config/weaponDropConfig';
import type { WeaponConfig } from '@/game/config/weaponConfig';
import { WeaponPickup } from '@/game/entities/WeaponPickup';

export class WeaponDropDirector {
  private readonly pickups = new Set<WeaponPickup>();
  private highlightedPickup: WeaponPickup | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly floor: Phaser.Physics.Arcade.StaticGroup,
    private readonly weapons: readonly WeaponConfig[],
    private readonly onNearbyWeaponChanged: (
      weapon: WeaponConfig | null,
    ) => void,
    private readonly random: RandomSource = Math.random,
  ) {}

  dropBossReward(
    x: number,
    y: number,
    ownedWeaponIds: readonly string[],
  ): WeaponPickup | null {
    const weapon = selectBossWeaponDrop(
      this.weapons,
      ownedWeaponIds,
      this.random,
    );
    if (!weapon) {
      return null;
    }

    return this.spawnPickup(weapon, x, y);
  }

  update(player: Phaser.Physics.Arcade.Sprite, activeWeapon: WeaponConfig) {
    const nearest = this.findNearestPickup(player.x, player.y);

    if (this.highlightedPickup !== nearest) {
      this.highlightedPickup?.setHighlighted(false);
      nearest?.setHighlighted(true, activeWeapon);
      this.highlightedPickup = nearest;
      this.onNearbyWeaponChanged(nearest?.weapon ?? null);
      return;
    }

    nearest?.setHighlighted(true, activeWeapon);
  }

  /** 인벤토리가 수락한 경우에만 바닥의 무기를 소비함. */
  takeNearest(
    player: Phaser.Physics.Arcade.Sprite,
    tryCollect: (weapon: WeaponConfig) => boolean,
  ): WeaponConfig | null {
    const pickup = this.findNearestPickup(player.x, player.y);
    if (!pickup || !tryCollect(pickup.weapon)) {
      return null;
    }

    const { weapon } = pickup;
    this.removePickup(pickup);
    return weapon;
  }

  /** 바닥에 아직 남아 있는 드랍이 있는지. */
  get hasPickups() {
    return this.pickups.size > 0;
  }

  clear() {
    for (const pickup of this.pickups) {
      pickup.destroy();
    }
    this.pickups.clear();
    this.highlightedPickup = null;
    this.onNearbyWeaponChanged(null);
  }

  private spawnPickup(weapon: WeaponConfig, x: number, y: number) {
    const pickup = new WeaponPickup(this.scene, x, y, weapon);
    pickup.setTint(weapon.pickupColor);
    this.scene.physics.add.collider(pickup, this.floor);
    this.pickups.add(pickup);
    return pickup;
  }

  private removePickup(pickup: WeaponPickup) {
    if (this.highlightedPickup === pickup) {
      this.highlightedPickup = null;
      this.onNearbyWeaponChanged(null);
    }
    this.pickups.delete(pickup);
    pickup.destroy();
  }

  private findNearestPickup(x: number, y: number) {
    let nearest: WeaponPickup | null = null;
    let nearestDistance: number = WEAPON_PICKUP_RADIUS;

    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, pickup.x, pickup.y);
      if (distance <= nearestDistance) {
        nearest = pickup;
        nearestDistance = distance;
      }
    }

    return nearest;
  }
}
