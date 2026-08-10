import Phaser from 'phaser';
import type { PlayerSpriteConfig } from '@/game/config/playerAnimationConfig';
import type { PlayerController } from '@/game/controllers/PlayerController';
import { gameEvents } from '@/game/events/gameEvents';
import type { GamePhase } from '@/game/state/gamePhase';
import type { PlayerHealthState } from '@/game/state/playerHealthState';
import type { CombatUi } from '@/game/systems/CombatUi';
import type { EnemyCombatDirector } from '@/game/systems/EnemyCombatDirector';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';
import type { WeaponDropDirector } from '@/game/systems/WeaponDropDirector';
import type { WeaponSystem } from '@/game/systems/WeaponSystem';

const PLAYER_DAMAGE_FLASH_DURATION = 80;
const PLAYER_DEATH_PROMPT_DELAY = 1000;
const PLAYER_DEATH_FALL_SPEED = 720;

type PlayerLifeCycleOptions = {
  scene: Phaser.Scene;
  player: Phaser.Physics.Arcade.Sprite;
  health: PlayerHealthState;
  playerController: PlayerController;
  weaponSystem: WeaponSystem;
  enemyCombatDirector: EnemyCombatDirector;
  weaponDropDirector: WeaponDropDirector;
  combatUi: CombatUi;
  canReceiveDamage: () => boolean;
  setPhase: (phase: GamePhase) => void;
  isDead: () => boolean;
  playerSprite: () => PlayerSpriteConfig;
  enableRestart: () => void;
};

/** 플레이어 피해, 사망 연출, 재시작 안내를 한 흐름으로 관리한다. */
export class PlayerLifeCycle {
  private damageFlashTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly options: PlayerLifeCycleOptions) {}

  applyDamage(damage: number) {
    if (!this.options.canReceiveDamage()) {
      return false;
    }

    const defeated = this.options.health.takeDamage(damage);
    const { player, scene } = this.options;
    gameEvents.emit('player-damaged', player.x, player.y);
    this.flashDamage();
    scene.cameras.main.shake(90, 0.004);

    if (defeated) {
      this.beginDeath();
    }

    return defeated;
  }

  reset() {
    this.cancelDamageFlash();
  }

  private flashDamage() {
    const { player, scene } = this.options;
    this.damageFlashTimer?.remove(false);
    player.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.damageFlashTimer = scene.time.delayedCall(
      PLAYER_DAMAGE_FLASH_DURATION,
      () => {
        this.damageFlashTimer = undefined;
        if (!this.options.isDead()) {
          player.clearTint();
        }
      },
    );
  }

  private cancelDamageFlash() {
    this.damageFlashTimer?.remove(false);
    this.damageFlashTimer = undefined;
  }

  private beginDeath() {
    const {
      player,
      scene,
      playerController,
      weaponSystem,
      enemyCombatDirector,
      weaponDropDirector,
      combatUi,
    } = this.options;
    this.cancelDamageFlash();
    weaponSystem.cancelHitStop();
    playerController.stop();
    enemyCombatDirector.stopEnemies();
    this.options.setPhase('dead');
    player.setVelocity(0).clearTint().setAlpha(1);
    this.playDeathAnimation();
    weaponSystem.hide();
    weaponDropDirector.clear();
    (player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    weaponSystem.clearProjectiles();
    enemyCombatDirector.clearProjectiles();
    combatUi.clearGuides();
    scene.time.delayedCall(PLAYER_DEATH_PROMPT_DELAY, () => {
      if (!this.options.isDead()) {
        return;
      }
      this.options.enableRestart();
      combatUi.showDeath();
    });
    scene.cameras.main.shake(180, 0.008);
  }

  private playDeathAnimation() {
    const { player, scene } = this.options;
    const body = player.body as Phaser.Physics.Arcade.Body;
    const [fallFrame, landFrame] = this.options.playerSprite().deathFrames ?? [];
    const fallDistance = Math.max(0, FLOOR_SURFACE_Y - body.bottom);

    if (!body.blocked.down && fallDistance > 1 && fallFrame && landFrame) {
      body.enable = false;
      player.anims.stop();
      player.setFrame(fallFrame);
      scene.tweens.add({
        targets: player,
        y: player.y + fallDistance,
        duration: Phaser.Math.Clamp(
          (fallDistance / PLAYER_DEATH_FALL_SPEED) * 1_000,
          120,
          900,
        ),
        ease: 'Quad.easeIn',
        onComplete: () => player.setFrame(landFrame),
      });
      return;
    }

    const deathAnimation = this.options.playerSprite().animations.death;
    if (scene.anims.exists(deathAnimation)) {
      player.play(deathAnimation, true);
      return;
    }
    player.anims.stop();
  }
}
