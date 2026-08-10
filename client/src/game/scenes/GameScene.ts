import Phaser from 'phaser';
import {
  MELEE_ENEMY_COMBAT_CONFIG,
  PLAYER_COMBAT_CONFIG,
} from '@/game/config/combatConfig';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import {
  PLAYER_INITIAL_FRAME,
  PLAYER_SPRITE_CONFIG,
  STAGE_ENDING_DRONE,
  STAGE_FIVE_PLAYER_HALO,
  STAGE_FIVE_PLAYER_SPRITE,
  STAGE_THREE_PLAYER_SPRITE,
} from '@/game/config/playerAnimationConfig';
import {
  MovementMode,
  PLAYER_FLIGHT_BOUNDS,
} from '@/game/config/playerMovementConfig';
import type { RoomConfig } from '@/game/config/roomConfig';
import { UNDERGROUND_LANDING_ROOM } from '@/game/config/rooms/stageThreeRooms';
import {
  STAGE_THREE_CONFIG,
  STARTING_STAGE_INDEX,
  STAGES,
  type StageConfig,
} from '@/game/config/stageConfig';
import { formatStageLabel } from '@/game/config/stageLabel';
import { getStageExitPlan } from '@/game/config/stageProgression';
import { PLAYER_STACK_DEPTH } from '@/game/config/renderDepth';
import { ROOM_CAMERA_FOLLOW_LERP_X } from '@/game/config/worldConfig';
import {
  STARTING_WEAPON_ID,
  WEAPON_CONFIGS,
  WEAPON_INVENTORY_SIZE,
  type WeaponConfig,
} from '@/game/config/weaponConfig';
import { PlayerController } from '@/game/controllers/PlayerController';
import { Enemy } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import {
  canPlayerFireInPhase,
  canPlayerFireInRoom,
  type GamePhase,
} from '@/game/state/gamePhase';
import { PlayerHealthState } from '@/game/state/playerHealthState';
import type { RoomState } from '@/game/state/roomState';
import { AdminStageNavigator } from '@/game/systems/AdminStageNavigator';
import { BackdropDirector } from '@/game/systems/BackdropDirector';
import { CombatUi } from '@/game/systems/CombatUi';
import { EnemyCombatDirector } from '@/game/systems/EnemyCombatDirector';
import { EnemyFactory } from '@/game/systems/EnemyFactory';
import {
  FLOOR_SURFACE_Y,
  FLOOR_TILE,
  FloorBuilder,
} from '@/game/systems/FloorBuilder';
import { patrolSpan } from '@/game/systems/patrolSpan';
import { bindGameInput } from '@/game/systems/GameInputBindings';
import { RoomDirector } from '@/game/systems/RoomDirector';
import { StageAssetPreloader } from '@/game/systems/StageAssetPreloader';
import { StageEndEventDirector } from '@/game/systems/StageEndEventDirector';
import { StageTransitionDirector } from '@/game/systems/StageTransitionDirector';
import {
  isProjectileBlocker,
  TerrainBuilder,
} from '@/game/systems/TerrainBuilder';
import { WeaponDropDirector } from '@/game/systems/WeaponDropDirector';
import { PlayerLifeCycle } from '@/game/systems/PlayerLifeCycle';
import { WeaponSystem } from '@/game/systems/WeaponSystem';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';

/** 4스테이지 보스가 사라진 뒤 화면 파괴까지 장면을 유지하는 시간. */
const SHATTER_POST_BOSS_DELAY_MS = 1000;
/**
 * 구덩이 추락 판정 깊이. 발이 바닥선 아래로 이만큼 내려가야 추락으로 친다.
 * 구덩이 바닥까지 떨어지는 연출을 충분히 보여 준 뒤 부활시키기 위해 바닥 근처까지 크게 잡는다.
 */
const PIT_FALL_TRIGGER_DEPTH = 56;
const PIT_FALL_DAMAGE = 12;
/** Height above the floor the player is placed at after climbing out of a pit. */
const PIT_RESPAWN_LIFT = 60;
const PLAYER_START_Y = GAME_HEIGHT - 120;
const ROOM_ENTRY_OFFSET_X = 116;
/** 지상 스테이지에서 플레이어가 포탈에서 나오듯 이 높이에서 떨어져 진입함. */
const PORTAL_DROP_HEIGHT = 170;
const UNDERGROUND_LANDING_BACKDROP = {
  ...STAGE_THREE_CONFIG,
  id: 'stage-03-underground-landing',
  background: {
    key: 'stage-03-underground-landing-bg',
    path: '/assets/backgrounds/stage-03-underground-landing.webp',
  },
};
const STAGE_THREE_ENDING_FRAME =
  STAGE_THREE_PLAYER_SPRITE.deathFrames?.at(-1) ?? PLAYER_INITIAL_FRAME;
const ASCENSION_ALIVE_DELAY_MS = 1000;
const ASCENSION_DRONE_FLIGHT_MS = 3200;
const ASCENSION_DRONE_OFFSET_X = 120;
const ASCENSION_DRONE_OFFSET_Y = -100;

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerHalo!: Phaser.GameObjects.Sprite;
  private roomWorldWidth = 0;
  private enemies: Enemy[] = [];
  private floorBuilder!: FloorBuilder;
  private terrainBuilder!: TerrainBuilder;
  private currentStageIndex = STARTING_STAGE_INDEX;
  private startCurrentRoomImmediately = false;
  private startFlightEntryLift = false;
  private currentRoomIndex = 0;
  private activeRoomConfig!: RoomConfig;
  private roomDirector!: RoomDirector;
  private adminStageNavigator!: AdminStageNavigator;
  private playerController!: PlayerController;
  private weaponDropDirector!: WeaponDropDirector;
  private weaponSystem!: WeaponSystem;
  private stageTransitionDirector!: StageTransitionDirector;
  private eventDirector!: StageEndEventDirector;
  private stageAssetPreloader!: StageAssetPreloader;
  private enemyCombatDirector!: EnemyCombatDirector;
  private backdropDirector!: BackdropDirector;
  private combatUi!: CombatUi;
  private playerLifeCycle!: PlayerLifeCycle;
  private readonly playerHealth = new PlayerHealthState(
    (currentHealth, maxHealth) =>
      gameEvents.emit('health-changed', currentHealth, maxHealth),
  );
  private phase: GamePhase = 'boot';
  private roomState: RoomState = 'idle';
  private paused = false;
  private roomExitRequested = false;
  private restartEnabled = false;

  constructor() {
    super('game');
  }

  private get stage() {
    return STAGES[this.currentStageIndex];
  }

  private get currentRoomConfig() {
    return (
      this.stageTransitionDirector?.roomOverride ??
      this.stage.rooms[this.currentRoomIndex]
    );
  }

  private get playerSprite() {
    return this.stage.playerSprite ?? PLAYER_SPRITE_CONFIG;
  }

  create() {
    this.adminStageNavigator ??= new AdminStageNavigator(this, () =>
      this.setPaused(false),
    );
    this.resetRunState();
    gameEvents.emit('scene-changed', 'game');
    gameEvents.emit('stage-changed', this.stage.id);
    this.setPhase('playing');

    this.configureRoomWorld();
    this.stageAssetPreloader = new StageAssetPreloader(this);
    this.preloadStageAssets();
    this.backdropDirector = new BackdropDirector(this);
    this.showStageBackdrop();
    this.floorBuilder = new FloorBuilder(this);
    this.rebuildFloorForRoom();
    this.createPlayer();
    this.terrainBuilder = new TerrainBuilder(this);
    this.physics.add.collider(this.player, this.terrainBuilder.group);
    this.configureCamera();
    this.createCombatSystems();
    this.combatUi = new CombatUi(this);
    this.playerLifeCycle = new PlayerLifeCycle({
      scene: this,
      player: this.player,
      health: this.playerHealth,
      playerController: this.playerController,
      weaponSystem: this.weaponSystem,
      enemyCombatDirector: this.enemyCombatDirector,
      weaponDropDirector: this.weaponDropDirector,
      combatUi: this.combatUi,
      canReceiveDamage: () =>
        this.phase === 'playing' &&
        !this.playerController.isInvulnerable &&
        !useGameSettingsStore.getState().invincible,
      setPhase: (phase) => this.setPhase(phase),
      isDead: () => this.phase === 'dead',
      playerSprite: () => this.playerSprite,
      enableRestart: () => {
        this.restartEnabled = true;
      },
    });
    // 씬도 참조를 든다. 늦게 도착한 3스테이지 아틀라스를 이미 세워 둔 포위
    // 대형에 입히려면 전환 연출 밖에서도 이 디렉터에 닿아야 한다.
    this.eventDirector = new StageEndEventDirector(this);
    this.stageTransitionDirector = new StageTransitionDirector({
      scene: this,
      player: this.player,
      eventDirector: this.eventDirector,
      prepare: () => this.prepareStageTransition(),
      enterCurrentRoom: () => this.enterCurrentRoom(),
      enterLandingRoom: (mode) => this.enterTransitionLandingRoom(mode),
      setAscensionPose: () => this.showAscensionPlayerPose(),
      playAscensionAlive: (onComplete) =>
        this.playAscensionAlive(onComplete),
      completeStageExit: (nextStageIndex) =>
        this.completeStageExit(nextStageIndex),
      finish: (outcome) => {
        if (outcome === 'victory') {
          this.handleRunCleared();
          return;
        }
        this.setPhase('ending');
        this.combatUi.showStageEnd();
      },
      idleAnimation: () => this.playerSprite.animations.idle,
      aimWeapon: (aimPoint) => this.weaponSystem.update(16, aimPoint),
    });
    this.createRoom();
    if (this.startFlightEntryLift) {
      this.startFlightEntryLift = false;
      this.beginFlightEntryLift(this.previousStagePortalY());
    }
    this.emitStageLocation();
    this.syncWeaponUi();
    bindGameInput(this, {
      context: this,
      equip: this.tryEquipNearbyWeapon,
      pointerDown: this.handlePointerDown,
      restart: this.handleRestartInput,
      enterPortal: this.handlePortalEnter,
      selectWeaponSlot: this.handleWeaponSlotInput,
      requestStage: this.adminStageNavigator.requestStage,
      requestStageBoss: this.adminStageNavigator.requestStageBoss,
      requestWeapon: this.handleAdminWeaponRequested,
      togglePause: this.handlePauseToggleRequested,
      postUpdate: this.updateAiming,
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.combatUi.destroy();
      // 일시정지 상태로 종료된 Scene의 오버레이를 다음 Scene에 남기지 않는다.
      this.setPaused(false);
    });

    if (this.startCurrentRoomImmediately) {
      this.startCurrentRoomImmediately = false;
      this.startRoomEncounter();
    }
  }

  update(time: number) {
    if (
      this.phase === 'dead' ||
      this.phase === 'ending' ||
      this.phase === 'transitioning'
    ) {
      return;
    }

    this.handlePitFall();
    this.enemyCombatDirector.handlePitFalls();
    this.roomDirector.update();

    if (this.phase === 'room-cleared' && this.roomExitRequested) {
      this.roomExitRequested = false;
      this.advanceToNextRoom();
      return;
    }

    this.playerController.update(time);
    this.weaponDropDirector.update(this.player, this.weaponSystem.activeConfig);
  }

  /**
   * Everything that has to be placed where the player actually is this frame:
   * the weapon, both arms, the aim guide, and the shot that leaves the muzzle.
   *
   * Deliberately not in `update`. Arcade physics steps the bodies on the
   * scene's UPDATE event and only writes the result back to the sprites on
   * POST_UPDATE, which is after `update` has run — so anything reading
   * `player.x` there gets last frame's position while the body renders at this
   * frame's. The gap is one frame of travel: a few pixels while running, and
   * 9.3px vertically off a 560px/s jump, reversing sign at the apex. The arms
   * sagged to the waist on the way up and rode over the face on the way down,
   * which is the 'the arm moves at a different speed than the body' this fixes.
   *
   * No anchor could have corrected it. The rig was placing the arm correctly
   * against a position the body had already left.
   */
  private updateAiming(time: number, delta: number) {
    const pointer = this.input.activePointer;
    const aimPoint = pointer.positionToCamera(
      this.cameras.main,
    ) as Phaser.Math.Vector2;
    this.syncPlayerHalo(aimPoint.x);
    if (this.phase === 'transitioning') {
      this.stageTransitionDirector.syncDescentWeaponPose();
      return;
    }
    if (
      this.phase === 'dead' ||
      this.phase === 'ending'
    ) {
      return;
    }

    this.weaponSystem.update(delta, aimPoint);
    this.combatUi.drawAimGuide(aimPoint);

    if (canPlayerFireInPhase(this.phase) && pointer.leftButtonDown()) {
      this.weaponSystem.tryFire(aimPoint, time);
    }
    if (this.phase === 'playing' && this.roomState === 'locked') {
      this.enemyCombatDirector.update(time);
    }
  }

  private rebuildFloorForRoom() {
    this.floorBuilder.build(
      this.currentRoomConfig,
      Boolean(this.stage.background),
      this.stage.showFloor,
      this.stage.floorSkin,
    );
  }

  /**
   * `rebuildFloorForRoom`의 지형 짝.
   *
   * 방과 스테이지를 받는 이유는 엔딩이 5스테이지에 있으면서 3스테이지 지형을
   * 그리기 때문이다. 네 곳에 흩어져 있던 같은 호출을 여기로 모았다 —
   * `TerrainBuilder.build`에 인자가 하나 늘면 이제 고칠 곳도 하나다.
   */
  private rebuildTerrainForRoom(roomConfig: RoomConfig, stage: StageConfig) {
    this.terrainBuilder.build(
      roomConfig.terrain,
      stage.terrainSkin,
      roomConfig.ceilingPipes,
      stage.pipeSkin,
    );
  }

  private createPlayer() {
    this.player = this.physics.add.sprite(
      this.getStartingPlayerX(),
      this.getStartingPlayerY(),
      this.playerSprite.texture,
      PLAYER_INITIAL_FRAME,
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(36, 76, true);
    this.player.play(this.playerSprite.animations.idle);
    this.player.setCollideWorldBounds(true);
    // Enemies default to the same depth (0) and are added to the display
    // list after the player, so without this they render on top of the
    // player whenever a melee enemy closes to contact range.
    this.player.setDepth(PLAYER_STACK_DEPTH.body);
    this.playerHalo = this.add
      .sprite(
        this.player.x,
        this.player.y + STAGE_FIVE_PLAYER_HALO.offsetY,
        STAGE_FIVE_PLAYER_HALO.texture,
      )
      .setDepth(PLAYER_STACK_DEPTH.halo)
      .setVisible(false)
      .play(STAGE_FIVE_PLAYER_HALO.animation);
    this.physics.add.collider(this.player, this.floorBuilder.group);
  }

  private syncPlayerHalo(pointerX: number) {
    this.playerHalo.setPosition(
      this.player.x +
        (pointerX < this.player.x
          ? STAGE_FIVE_PLAYER_HALO.offsetX
          : -STAGE_FIVE_PLAYER_HALO.offsetX),
      this.player.y + STAGE_FIVE_PLAYER_HALO.offsetY,
    );
  }

  private configureRoomWorld() {
    this.roomWorldWidth = this.currentRoomConfig.worldWidth;
    this.physics.world.setBounds(0, 0, this.roomWorldWidth, GAME_HEIGHT);
    this.cameras.main
      .setBounds(0, 0, this.roomWorldWidth, GAME_HEIGHT)
      .setRoundPixels(true);
  }

  private configureCamera() {
    this.cameras.main.startFollow(
      this.player,
      true,
      ROOM_CAMERA_FOLLOW_LERP_X,
      1,
    );
  }

  private resetCameraToRoomEntrance() {
    // 컷신(강하·화면 파괴 연출)이 카메라에 남긴 스크롤 트윈·흔들림·플래시가
    // 다음 방까지 이어져 화면을 밀거나 흔들지 않도록 모두 정리한다.
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.shakeEffect.reset();
    this.cameras.main.resetFX();
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0).setZoom(1);
    this.configureCamera();
  }

  private createRoom() {
    this.buildRoom(this.currentRoomConfig);
  }

  private buildRoom(roomConfig: RoomConfig) {
    this.weaponDropDirector?.clear();
    this.weaponSystem?.clearProjectiles();
    this.roomDirector?.destroy();
    gameEvents.emit('boss-phase-changed', null);
    this.roomExitRequested = false;
    this.activeRoomConfig = roomConfig;
    this.roomDirector = new RoomDirector({
      scene: this,
      player: this.player,
      config: roomConfig,
      portalTint: this.stage.portalTint ?? this.stage.palette.accentSecondary,
      onStateChanged: (state) => this.handleRoomStateChanged(state),
      onExitRequested: () => {
        this.roomExitRequested = true;
      },
    });

    this.enemyCombatDirector.destroyEnemies();
    this.roomState = 'idle';
    gameEvents.emit('room-state-changed', this.roomState);
    this.enemyCombatDirector.emitEnemyHealth();

    this.rebuildTerrainForRoom(roomConfig, this.stage);

    // 연출용 강하 방은 교전 없이 자유 이동만 한다.
    if (roomConfig.kind === 'descent') {
      return;
    }

    // 모든 방은 활성 교전으로 시작한다. 방이 열릴 때부터 적이 존재하므로
    // 스테이지 진입 후 보이지 않는 전투 트리거가 따로 생기지 않는다.
    if (roomConfig.kind === 'combat') {
      this.spawnRoomEnemies();
    }
    this.startRoomEncounter();
  }

  private spawnRoomEnemies() {
    const enemyFactory = new EnemyFactory({
      scene: this,
      floor: this.floorBuilder.group,
      terrain: this.terrainBuilder.group,
      enemyPitBarriers: this.floorBuilder.enemyPitBarriers,
      intensity: this.activeRoomConfig.intensity,
      damagePlayer: (damage) => this.applyPlayerDamage(damage),
      tetherPlayer: (sourceX, slowFactor, pullSpeed) =>
        this.playerController.applyTether(sourceX, slowFactor, pullSpeed),
      isPlayerDashing: () => this.playerController.isDashing,
      pullPlayer: (bossX, pullSpeed) =>
        this.playerController.applyVacuum(bossX, pullSpeed),
      ceilingPipes: this.activeRoomConfig.ceilingPipes ?? [],
      bossArena: {
        left: this.activeRoomConfig.entranceX,
        right: this.activeRoomConfig.exitX,
      },
      onBossPhaseChanged: (phase) =>
        gameEvents.emit('boss-phase-changed', phase),
      patrolBoundsFor: (spawnX) =>
        patrolSpan({
          spawnX,
          range: MELEE_ENEMY_COMBAT_CONFIG.patrolRange,
          left: this.activeRoomConfig.entranceX,
          right: this.activeRoomConfig.exitX,
          pits: this.activeRoomConfig.pits,
          edgeMargin: MELEE_ENEMY_COMBAT_CONFIG.patrolEdgeMargin,
          minimumSpan: MELEE_ENEMY_COMBAT_CONFIG.patrolMinimumSpan,
        }),
      flyingSprite: this.stage.flyingSprite,
      meleeSwing: this.stage.meleeSwing,
      rangedSprite: this.stage.rangedSprite,
      meleeSprite: this.stage.meleeSprite,
    });
    const spawned = this.activeRoomConfig.enemySpawns.map((spawn) =>
      enemyFactory.create(spawn),
    );
    this.enemyCombatDirector.replaceEnemies(spawned);
  }

  private startRoomEncounter() {
    // 일반 전투방은 buildRoom에서 적을 배치하지만, 보스방은 이 시점에 비어 있다.
    if (this.enemies.length === 0) {
      this.spawnRoomEnemies();
    }

    this.roomDirector.beginEncounter(this.enemies);
  }

  private advanceToNextRoom() {
    this.setPhase('transitioning');
    this.playerController.stop();
    this.playerController.cancelJump();
    this.player.setVelocity(0);
    this.weaponSystem.clearProjectiles();

    if (this.currentRoomIndex + 1 < this.stage.rooms.length) {
      this.currentRoomIndex += 1;
      this.enterCurrentRoom();
      // 무겁고 동기적인 방 재구성 '이후'에만 플래시함. 그래야 효과가 깨끗한
      // 프레임에 걸쳐 애니메이션되고, 재구성 프레임 내내 풀 불투명으로
      // 멈춰(화면이 멈춘 것처럼 보이던) 있지 않음.
      //
      // resetFX로 이전에 남아 멈춰 있을 수 있는 플래시(예: 일시정지 중 얼어붙은
      // 효과)를 먼저 지운다. 그러지 않으면 force 없는 flash는 아직 실행 중으로
      // 표시된 옛 효과 때문에 무시되어, 흰색 오버레이가 화면에 그대로 남는다.
      // force=true로 항상 새로 시작해 반드시 끝까지 재생(소멸)되게 한다.
      this.cameras.main.resetFX();
      this.cameras.main.flash(180, 255, 255, 255, true);
      return;
    }

    this.advanceToNextStage();
  }

  /** 보스가 사라진 장면을 잠시 유지한 뒤 화면 파괴 연출로 넘어간다. */
  private beginShatterExit() {
    this.time.delayedCall(SHATTER_POST_BOSS_DELAY_MS, () =>
      this.advanceToNextStage(),
    );
  }

  private advanceToNextStage() {
    this.stageTransitionDirector.advance(
      getStageExitPlan(STAGES, this.currentStageIndex),
      this.scale.width,
    );
  }

  private completeStageExit(nextStageIndex: number | null) {
    if (nextStageIndex === null) {
      this.handleRunCleared();
      return;
    }

    const exitPortalY = this.activeRoomConfig.portal.y;
    this.currentStageIndex = nextStageIndex;
    this.currentRoomIndex = 0;
    gameEvents.emit('stage-changed', this.stage.id);
    this.restorePlayerHealthForStage();
    this.enterCurrentRoom(true, exitPortalY);
  }

  private enterCurrentRoom(stageChanged = false, exitPortalY?: number) {
    if (stageChanged) {
      this.preloadStageAssets();
    }

    this.configureRoomWorld();
    this.rebuildFloorForRoom();
    this.showStageBackdrop();
    const entersFlightFromPortal =
      stageChanged &&
      exitPortalY !== undefined &&
      this.stage.movementMode === MovementMode.FLIGHT;
    // 지상에서는 포탈에서 떨어지고, 비행 전환은 이전 포탈 높이에서 시작해
    // 중앙보다 높은 정점을 지난 뒤 비행 밴드 중앙에 착지한다.
    const drop =
      this.stage.movementMode === MovementMode.GROUND ? PORTAL_DROP_HEIGHT : 0;
    const entryY = entersFlightFromPortal
      ? exitPortalY
      : this.getStartingPlayerY() - drop;
    this.player.setPosition(this.getStartingPlayerX(), entryY);
    this.player.setVelocity(0);
    this.resetCameraToRoomEntrance();

    if (stageChanged) {
      this.applyStageMovementMode();
    }

    if (entersFlightFromPortal) {
      this.beginFlightEntryLift(entryY);
    }

    this.buildRoom(this.currentRoomConfig);
    this.emitStageLocation();
    this.setPhase('playing');
  }

  private handleRunCleared() {
    this.setPhase('ending');
    this.weaponSystem.hide();
    this.combatUi.clearEnemyRanges();
    this.scene.start('credits');
  }
  /** 전환 연출이 시작되기 전 플레이어와 전투 객체를 공통 정리한다. */
  private prepareStageTransition() {
    this.setPhase('transitioning');
    this.weaponSystem.cancelHitStop();
    this.playerController.stop();
    this.player.setVelocity(0);
    // 화면을 캡처하거나 흰 화면이 방 교체를 가리는 종료 연출은 직전 무기 자세를 유지한다.
    if (
      this.stage.endEvent !== 'shatter' &&
      this.stage.endEvent !== 'ascension'
    ) {
      this.weaponSystem.hide();
    }
    this.weaponDropDirector.clear();
    this.combatUi.clearGuides();
  }

  /** 강하·승천 연출이 공유하는 지하 착지 방을 해당 연출의 스킨으로 구성한다. */
  private enterTransitionLandingRoom(mode: 'descent' | 'ascension') {
    this.activeRoomConfig = UNDERGROUND_LANDING_ROOM;
    this.configureRoomWorld();
    if (mode === 'descent') {
      this.rebuildFloorForRoom();
      this.rebuildTerrainForRoom(this.activeRoomConfig, this.stage);
      this.showUndergroundLandingBackdrop();
      this.resetCameraToRoomEntrance();
      return;
    }

    this.weaponSystem.hide();
    this.enemyCombatDirector.destroyEnemies();
    // 흰 화면 뒤에서 엔딩 방으로 교체되는 순간 현재 음악을 완전히 끔.
    gameEvents.emit('ending-ascension-cue', 'silence');
    // 어드민으로 5스테이지 보스에 직행하면 3스테이지 지형은 아직 캐시에 없다.
    // 도착 뒤 다시 그려 콜드 로드에서도 바닥 스킨이 placeholder로 굳지 않게 한다.
    //
    // 포위 대형도 같이 복구한다. 스프라이트는 이 프리로드가 끝나기를 기다리지
    // 않고 흰 화면 뒤에서 곧바로 생성되므로, 아틀라스가 늦으면 엔딩 내내
    // __MISSING 박스가 대형을 이룬 채 걸어 나간다.
    this.stageAssetPreloader.preload(STAGE_THREE_CONFIG, () => {
      if (this.activeRoomConfig === UNDERGROUND_LANDING_ROOM) {
        this.drawAscensionRoom();
      }
      this.eventDirector.reskinSiege();
    });
    this.drawAscensionRoom();
    // 엔딩 포위 장면의 배경만 검게 가리고 바닥·지형·등장인물은 앞에 남김.
    this.add
      .rectangle(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        this.cameras.main.width,
        this.cameras.main.height,
        0x000000,
        0.6,
      )
      .setDepth(-9.5)
      .setScrollFactor(0);
    this.resetCameraToRoomEntrance();
    this.playerController.setMovementMode(MovementMode.GROUND);
  }

  /** 5스테이지 엔딩의 지하 포위 방 배경과 바닥을 다시 그림. */
  private drawAscensionRoom() {
    this.floorBuilder.build(
      UNDERGROUND_LANDING_ROOM,
      Boolean(STAGE_THREE_CONFIG.background),
      STAGE_THREE_CONFIG.showFloor,
      STAGE_THREE_CONFIG.floorSkin,
    );
    this.rebuildTerrainForRoom(UNDERGROUND_LANDING_ROOM, STAGE_THREE_CONFIG);
    this.showUndergroundLandingBackdrop();
  }

  private showUndergroundLandingBackdrop() {
    this.backdropDirector.show(
      UNDERGROUND_LANDING_BACKDROP,
      this.roomWorldWidth,
      undefined,
    );
  }

  private showAscensionPlayerPose() {
    this.player.anims.stop();
    this.player.setTexture(
      STAGE_THREE_PLAYER_SPRITE.texture,
      STAGE_THREE_ENDING_FRAME,
    );
    this.playerHalo.setVisible(false);
  }

  private playAscensionAlive(onComplete: () => void) {
    this.time.delayedCall(ASCENSION_ALIVE_DELAY_MS, () => {
      this.player.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
        this.flyInEndingDrone(onComplete),
      );
      this.player.play(STAGE_THREE_PLAYER_SPRITE.animations.alive, true);
    });
  }

  private flyInEndingDrone(onComplete: () => void) {
    const camera = this.cameras.main.worldView;
    const drone = this.add
      .sprite(
        camera.right + (STAGE_ENDING_DRONE.width * STAGE_ENDING_DRONE.scale) / 2,
        this.player.y + ASCENSION_DRONE_OFFSET_Y,
        STAGE_ENDING_DRONE.texture,
      )
      .setFlipX(true)
      .setScale(STAGE_ENDING_DRONE.scale)
      .setDepth(PLAYER_STACK_DEPTH.frontArm + 1)
      .play(STAGE_ENDING_DRONE.animation);
    this.tweens.add({
      targets: drone,
      x: this.player.x + ASCENSION_DRONE_OFFSET_X,
      duration: ASCENSION_DRONE_FLIGHT_MS,
      ease: 'Sine.easeOut',
      onComplete,
    });
  }

  private emitStageLocation() {
    gameEvents.emit(
      'stage-location-changed',
      formatStageLabel(this.stage.label),
      this.currentRoomIndex + 1,
    );
  }

  private showStageBackdrop() {
    this.backdropDirector.show(
      this.stage,
      this.roomWorldWidth,
      STAGES[this.currentStageIndex + 1],
    );
  }

  private preloadStageAssets() {
    // 현재 스테이지는 보통 이미 워밍돼 있음. 예측 로딩이 실패했으면 재시도한
    // 뒤, 플레이 중 정확히 한 스테이지 앞을 미리 가져옴.
    // 콜드 스타트에서는 아래의 바닥/지형 빌드가 로드보다 앞서 나가므로,
    // 아트가 도착하면 방을 다시 스킨함(워밍된 스테이지에서는 no-op).
    this.stageAssetPreloader.preload(this.stage, () =>
      this.reskinCurrentRoom(),
    );
    this.stageAssetPreloader.preload(STAGES[this.currentStageIndex + 1]);
    if (this.stage.endEvent === 'ascension') {
      this.stageAssetPreloader.preload(STAGE_THREE_CONFIG);
    }
  }

  /**
   * 콜드 스테이지의 아트 로드가 끝나면 바닥·지형을 다시 그리고, 아틀라스보다
   * 먼저 스폰돼 __MISSING이던 적 스프라이트를 제자리에서 갱신한다(적을 파괴/
   * 재스폰하지 않아 전투 상태를 유지함). 워밍된 스테이지에서는 onReady가
   * 호출되지 않아 no-op.
   */
  private reskinCurrentRoom() {
    if (!this.floorBuilder || !this.terrainBuilder) {
      return;
    }

    this.rebuildFloorForRoom();
    this.rebuildTerrainForRoom(this.activeRoomConfig, this.stage);
    for (const enemy of this.enemies) {
      enemy.refreshAtlasSprite();
    }
  }

  private createCombatSystems() {
    this.playerController = new PlayerController(
      this,
      this.player,
      PLAYER_COMBAT_CONFIG,
    );
    this.applyStageMovementMode();
    this.enemyCombatDirector = new EnemyCombatDirector({
      scene: this,
      player: this.player,
      enemies: this.enemies,
      projectileBlockers: this.terrainBuilder.projectileGroup,
      projectileFloor: this.floorBuilder.group,
      canDamageEnemy: () =>
        this.phase === 'playing' && this.roomState === 'locked',
      isPlayerInvulnerable: () => this.playerController.isInvulnerable,
      damagePlayer: (damage) => this.applyPlayerDamage(damage),
      isOverPit: (x) => this.floorBuilder.isOverPit(x),
      notifyEnemyDefeated: (enemy) =>
        this.roomDirector.notifyEnemyDefeated(enemy),
      dropBossReward: (enemy) => {
        // 포탈 없이 종료 연출로 넘어가는 보스는 총기를 남기지 않음.
        if (
          this.stage.endEvent === 'shatter' ||
          this.stage.endEvent === 'ascension'
        ) {
          return;
        }
        this.weaponDropDirector.dropBossReward(
          enemy.x,
          enemy.y,
          this.weaponSystem.ownedWeaponIds,
        );
      },
      clearEnemyRanges: () => this.combatUi?.clearEnemyRanges(),
      drawEnemyRange: (enemy, targetInRange) => {
        if (useGameSettingsStore.getState().showEnemyRanges) {
          this.combatUi?.drawEnemyRange(enemy, targetInRange);
        }
      },
    });
    this.weaponSystem = new WeaponSystem(
      this,
      this.player,
      this.enemies,
      WEAPON_CONFIGS,
      STARTING_WEAPON_ID,
      () => canPlayerFireInPhase(this.phase),
      (enemy, defeated) =>
        this.enemyCombatDirector.handleEnemyHit(enemy, defeated),
      () => canPlayerFireInRoom(this.phase, this.roomState),
    );
    this.weaponSystem.blockProjectilesWith(
      this.terrainBuilder.projectileGroup,
      isProjectileBlocker,
    );
    this.weaponDropDirector = new WeaponDropDirector(
      this,
      this.floorBuilder.group,
      WEAPON_CONFIGS,
      (weapon) => gameEvents.emit('nearby-weapon-changed', weapon?.id ?? null),
    );
  }

  private tryEquipNearbyWeapon() {
    if (this.phase !== 'playing' && this.phase !== 'room-cleared') {
      return;
    }

    const weapon = this.weaponDropDirector.takeNearest(
      this.player,
      ({ id }) => this.weaponSystem.collect(id),
    );
    if (!weapon) {
      return;
    }

    this.syncWeaponUi();
    this.showWeaponEquipped(weapon);
  }

  private syncWeaponUi() {
    const weapon = this.weaponSystem.activeConfig;
    const inventory = this.weaponSystem.inventorySnapshot;
    gameEvents.emit('weapon-changed', weapon.id, weapon.label);
    gameEvents.emit(
      'weapon-inventory-changed',
      inventory.slots,
      inventory.activeSlotIndex,
    );
  }

  private handleWeaponSlotInput(event: KeyboardEvent) {
    if (
      event.repeat ||
      (this.phase !== 'playing' && this.phase !== 'room-cleared')
    ) {
      return;
    }

    const slotIndex = Number(event.key) - 1;
    if (
      !Number.isInteger(slotIndex) ||
      slotIndex < 0 ||
      slotIndex >= WEAPON_INVENTORY_SIZE
    ) {
      return;
    }
    event.preventDefault();
    const { activeSlotIndex } = this.weaponSystem.inventorySnapshot;
    if (
      slotIndex === activeSlotIndex ||
      !this.weaponSystem.equipSlot(slotIndex)
    ) {
      return;
    }

    this.syncWeaponUi();
    this.showWeaponEquipped(this.weaponSystem.activeConfig);
  }

  private showWeaponEquipped(weapon: WeaponConfig) {
    this.combatUi.showWeaponEquipped(weapon);
    this.weaponSystem.playEquipFeedback();
  }

  private resetRunState() {
    // Phaser는 재시작 시 Scene 인스턴스를 재사용하지만 이전 물리 그룹은 파괴한다.
    // createCombatSystems가 필드를 교체하기 전에 buildRoom이 실행되므로, 선택적
    // 정리 과정이 오래된 풀이나 디렉터를 참조하지 않게 비워 둔다.
    this.playerLifeCycle?.reset();
    this.weaponDropDirector = undefined!;
    this.weaponSystem = undefined!;
    this.roomDirector = undefined!;
    this.enemies.splice(0, this.enemies.length);
    this.enemyCombatDirector?.replaceEnemies([]);
    // Scene 인스턴스 재사용 시 이전 연출 방과 컷신 가드를 함께 초기화한다.
    this.stageTransitionDirector?.reset();
    const request = this.adminStageNavigator.consumeRequest();
    this.startCurrentRoomImmediately = request.immediateEncounter;
    const requestedStageIndex = request.stageIndex;
    this.currentStageIndex = requestedStageIndex ?? STARTING_STAGE_INDEX;
    this.currentRoomIndex = Phaser.Math.Clamp(
      request.roomIndex ?? 0,
      0,
      this.stage.rooms.length - 1,
    );
    this.startFlightEntryLift =
      requestedStageIndex !== undefined &&
      this.stage.movementMode === MovementMode.FLIGHT;
    this.restorePlayerHealthForStage();
    this.restartEnabled = false;
    this.roomState = 'idle';
    gameEvents.emit('room-state-changed', this.roomState);
  }

  private getStartingPlayerX() {
    return this.currentRoomConfig.entranceX + ROOM_ENTRY_OFFSET_X;
  }

  /** 비행 스테이지의 진입 착지 높이. */
  private getStartingPlayerY() {
    return this.stage.movementMode === MovementMode.FLIGHT
      ? (PLAYER_FLIGHT_BOUNDS.minY + PLAYER_FLIGHT_BOUNDS.maxY) / 2
      : PLAYER_START_Y;
  }

  /** 포탈 높이에서 시작해 비행 밴드 중앙에 착지하는 점프 전환을 재생한다. */
  private beginFlightEntryLift(entryY: number) {
    this.player.setY(entryY);
    this.playerController.beginFlightEntryLift(this.getStartingPlayerY());
  }

  /** 관리자 직행은 바로 앞 스테이지의 마지막 포탈을 가상 출발점으로 쓴다. */
  private previousStagePortalY() {
    const previousStage = STAGES[this.currentStageIndex - 1];
    const previousRoom = previousStage?.rooms[previousStage.rooms.length - 1];
    return previousRoom?.portal.y ?? PLAYER_FLIGHT_BOUNDS.maxY;
  }

  private restorePlayerHealthForStage() {
    this.playerHealth.restore(this.stage.playerMaxHealth);
  }

  private applyStageMovementMode() {
    this.playerController.setMovementMode(this.stage.movementMode);
    this.player.setTexture(this.playerSprite.texture, PLAYER_INITIAL_FRAME);
    this.playerController.setAnimations(this.playerSprite.animations);
    this.playerHalo.setVisible(
      this.playerSprite.texture === STAGE_FIVE_PLAYER_SPRITE.texture,
    );
  }

  private setPhase(phase: GamePhase) {
    this.phase = phase;
    gameEvents.emit('phase-changed', phase);
  }

  private handleRoomStateChanged(state: RoomState) {
    this.roomState = state;
    gameEvents.emit('room-state-changed', state);

    if (state === 'locked') {
      // 이번 교전이 시작되기 전에 이전 방의 탄환을 정리한다.
      this.weaponSystem?.clearProjectiles();
      this.enemyCombatDirector.emitEnemyHealth();
      return;
    }

    if (state === 'cleared') {
      this.setPhase('room-cleared');
      this.enemyCombatDirector.clearProjectiles();
      this.combatUi.clearEnemyRanges();
      // 보스방은 고유 처치·스테이지 전환 연출을 우선한다.
      if (this.currentRoomConfig.kind !== 'boss') {
        this.combatUi.showRoomCleared(this.stage.palette.accentSecondary);
      }

      // 4스테이지: 보스가 사라진 직후 포탈을 거치지 않고 바로 화면 파괴 연출.
      if (
        this.stage.endEvent === 'shatter' &&
        !this.stageTransitionDirector.hasRoomOverride &&
        this.currentRoomIndex === this.stage.rooms.length - 1
      ) {
        this.beginShatterExit();
      }

      // 5스테이지: 보스 사망 연출이 끝나면 포탈 없이 종료 연출을 시작한다.
      if (
        this.stage.endEvent === 'ascension' &&
        !this.stageTransitionDirector.hasRoomOverride &&
        this.currentRoomIndex === this.stage.rooms.length - 1
      ) {
        this.stageTransitionDirector.beginAscension();
      }
    }
  }

  private handleRestartInput() {
    if (
      this.phase === 'ending' ||
      (this.phase === 'dead' && this.restartEnabled)
    ) {
      this.scene.restart();
    }
  }

  /** 위/W로 클리어된 방을 나감. 단, 열린 포탈 안에 서 있을 때만. */
  private handlePortalEnter() {
    if (this.phase === 'room-cleared') {
      this.roomDirector.tryExit();
    }
  }

  /**
   * Death and the ending already hold the screen with their own prompts, and
   * boot has nothing to pause, so those three are left alone.
   */
  private canPause() {
    return (
      this.phase !== 'boot' && this.phase !== 'dead' && this.phase !== 'ending'
    );
  }

  private handlePauseToggleRequested = () => {
    if (this.paused) {
      this.setPaused(false);
      return;
    }

    if (this.canPause()) {
      this.setPaused(true);
    }
  };

  private setPaused(paused: boolean) {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    // Pausing the scene stops its update loop, timers and physics in one call,
    // which is what keeps a hit-stop or a burst timer from firing behind the
    // overlay and resolving the moment the player looks away.
    if (paused) {
      this.scene.pause();
    } else {
      this.scene.resume();
    }
    gameEvents.emit('pause-changed', paused);
  }

  /**
   * Hands the player a weapon without one having to drop. Every weapon is
   * already instantiated at scene start, so this is the same path `E` takes —
   * it just skips the pickup. Restarting the stage to test the rail rifle was
   * the alternative, and the drop tables do not guarantee it appears at all.
   */
  private handleAdminWeaponRequested = (weaponId: string) => {
    if (!this.weaponSystem.collect(weaponId)) {
      return;
    }

    this.syncWeaponUi();

    // The equip flourish is a camera flash and two tweens, and neither advances
    // while the scene is paused — asked for from the pause menu they would sit
    // frozen over the overlay until the player resumed. The swap itself still
    // happens, which is the whole point of the button.
    if (!this.paused) {
      this.showWeaponEquipped(this.weaponSystem.activeConfig);
    }
  };

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (
      this.phase === 'dead' ||
      this.phase === 'ending' ||
      this.phase === 'transitioning'
    ) {
      return;
    }

    if (pointer.button === 2) {
      this.playerController.tryDash(this.time.now);
      return;
    }

    if (!canPlayerFireInPhase(this.phase) || pointer.button !== 0) {
      return;
    }

    const aimPoint = pointer.positionToCamera(
      this.cameras.main,
    ) as Phaser.Math.Vector2;
    this.weaponSystem.tryFire(aimPoint, this.time.now);
  }

  /**
   * When the player's feet sink past the floor surface they have dropped into a
   * pit (the floor collider stops them everywhere else). Lift them out onto the
   * far ledge and dock health — the pit is a hazard, not a dead end.
   */
  private handlePitFall() {
    if (this.playerController.isFlightMode) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.bottom <= FLOOR_SURFACE_Y + PIT_FALL_TRIGGER_DEPTH) {
      return;
    }

    // 강하 방에서는 구멍에 떨어지는 것이 목적이다. 되살리지 않고 강하 컷신 시작.
    if (this.activeRoomConfig.kind === 'descent') {
      this.stageTransitionDirector.beginDescentCutscene();
      return;
    }

    if (this.applyPlayerDamage(PIT_FALL_DAMAGE)) {
      this.player.setVisible(false);
      return;
    }

    // 살아남으면 추락한 쪽에서 가까운 가장자리 위로 되살린다.
    const pit = this.floorBuilder.findPitAt(this.player.x, FLOOR_TILE);
    let targetX = this.player.x;
    if (pit) {
      const nearStart =
        Math.abs(this.player.x - pit.start) <=
        Math.abs(this.player.x - pit.end);
      targetX = nearStart
        ? pit.start - FLOOR_TILE / 2
        : pit.end + FLOOR_TILE / 2;
    }
    this.player.setPosition(targetX, FLOOR_SURFACE_Y - PIT_RESPAWN_LIFT);
    body.setVelocity(0, 0);
  }

  private applyPlayerDamage(damage: number) {
    return this.playerLifeCycle.applyDamage(damage);
  }

}
