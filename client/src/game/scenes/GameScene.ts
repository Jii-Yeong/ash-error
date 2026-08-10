import Phaser from 'phaser';
import {
  FLYING_ENEMY_COMBAT_CONFIG,
  MELEE_ENEMY_COMBAT_CONFIG,
  PLAYER_COMBAT_CONFIG,
  RANGED_ENEMY_COMBAT_CONFIG,
} from '@/game/config/combatConfig';
import { GAME_HEIGHT, GAME_WIDTH } from '@/game/config/gameDimensions';
import {
  PLAYER_ANIMATIONS,
  PLAYER_ATLAS_KEY,
  PLAYER_INITIAL_FRAME,
} from '@/game/config/playerAnimationConfig';
import {
  MovementMode,
  PLAYER_FLIGHT_BOUNDS,
} from '@/game/config/playerMovementConfig';
import type { RoomConfig } from '@/game/config/roomConfig';
import {
  STARTING_STAGE_INDEX,
  STAGES,
  type StageEndEvent,
} from '@/game/config/stageConfig';
import { formatStageLabel } from '@/game/config/stageLabel';
import { getStageExitPlan } from '@/game/config/stageProgression';
import { PLAYER_STACK_DEPTH } from '@/game/config/renderDepth';
import { ROOM_CAMERA_FOLLOW_LERP_X } from '@/game/config/worldConfig';
import {
  UI_PANEL_SLICE,
  UI_PANEL_TEXTURES,
} from '@/game/config/uiAssetConfig';
import {
  STARTING_WEAPON_ID,
  WEAPON_CONFIGS,
  WEAPON_INVENTORY_SIZE,
  type WeaponConfig,
} from '@/game/config/weaponConfig';
import { PlayerController } from '@/game/controllers/PlayerController';
import { BossEnemy } from '@/game/entities/BossEnemy';
import { Enemy, type EnemyProjectileKind } from '@/game/entities/Enemy';
import { gameEvents } from '@/game/events/gameEvents';
import {
  canPlayerFireInPhase,
  canPlayerFireInRoom,
  type GamePhase,
} from '@/game/state/gamePhase';
import { PlayerHealthState } from '@/game/state/playerHealthState';
import type { RoomState } from '@/game/state/roomState';
import { BackdropDirector } from '@/game/systems/BackdropDirector';
import { EnemyFactory } from '@/game/systems/EnemyFactory';
import {
  FLOOR_SURFACE_Y,
  FLOOR_TILE,
  FloorBuilder,
} from '@/game/systems/FloorBuilder';
import { patrolSpan } from '@/game/systems/patrolSpan';
import { ProjectilePool } from '@/game/systems/ProjectilePool';
import { RoomDirector } from '@/game/systems/RoomDirector';
import { StageAssetPreloader } from '@/game/systems/StageAssetPreloader';
import { StageEndEventDirector } from '@/game/systems/StageEndEventDirector';
import {
  isProjectileBlocker,
  TerrainBuilder,
} from '@/game/systems/TerrainBuilder';
import { WeaponDropDirector } from '@/game/systems/WeaponDropDirector';
import { WeaponSystem } from '@/game/systems/WeaponSystem';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';

const PLAYER_DAMAGE_FLASH_DURATION = 80;

/** How far the feet must sink past the floor surface to count as a pit fall. */
const PIT_FALL_TRIGGER_DEPTH = 22;
const PIT_FALL_DAMAGE = 12;
/** 구덩이로 떨어진 적을 즉시 제거하는 화면 아래 경계. */
const ENEMY_PIT_DEATH_Y = GAME_HEIGHT + 96;
/** Height above the floor the player is placed at after climbing out of a pit. */
const PIT_RESPAWN_LIFT = 60;
const PLAYER_START_Y = GAME_HEIGHT - 120;
const ROOM_ENTRY_OFFSET_X = 116;
/** 지상 스테이지에서 플레이어가 포탈에서 나오듯 이 높이에서 떨어져 진입함. */
const PORTAL_DROP_HEIGHT = 170;

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private roomWorldWidth = 0;
  private enemies: Enemy[] = [];
  private floorBuilder!: FloorBuilder;
  private terrainBuilder!: TerrainBuilder;
  private currentStageIndex = STARTING_STAGE_INDEX;
  private requestedStartingStageIndex?: number;
  private requestedStartingRoomIndex?: number;
  private requestedImmediateEncounter = false;
  private startCurrentRoomImmediately = false;
  private startFlightEntryLift = false;
  private currentRoomIndex = 0;
  private activeRoomConfig!: RoomConfig;
  private roomDirector!: RoomDirector;
  private playerController!: PlayerController;
  private weaponDropDirector!: WeaponDropDirector;
  private weaponSystem!: WeaponSystem;
  private stageEndEventDirector!: StageEndEventDirector;
  private stageAssetPreloader!: StageAssetPreloader;
  private equipKey!: Phaser.Input.Keyboard.Key;
  private enemyProjectiles!: ProjectilePool;
  private flyingEnemyProjectiles!: ProjectilePool;
  private enemyProjectilePools!: Record<EnemyProjectileKind, ProjectilePool>;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private enemyRangeGraphics!: Phaser.GameObjects.Graphics;
  private backdropDirector!: BackdropDirector;
  private deathOverlay!: Phaser.GameObjects.Container;
  private victoryOverlay!: Phaser.GameObjects.Container;
  private stageEndOverlay!: Phaser.GameObjects.Container;
  private weaponEquippedText!: Phaser.GameObjects.Text;
  private controlHintText?: Phaser.GameObjects.Text;
  private playerDamageFlashTimer?: Phaser.Time.TimerEvent;
  private readonly playerHealth = new PlayerHealthState(
    (currentHealth, maxHealth) =>
      gameEvents.emit('health-changed', currentHealth, maxHealth),
  );
  private phase: GamePhase = 'boot';
  private roomState: RoomState = 'idle';
  /** 바닥선을 지나 레벨 밖으로 추락 중인 적. */
  private readonly fallingEnemies = new Set<Enemy>();
  private paused = false;
  private roomExitRequested = false;

  constructor() {
    super('game');
  }

  private get stage() {
    return STAGES[this.currentStageIndex];
  }

  private get currentRoomConfig() {
    return this.stage.rooms[this.currentRoomIndex];
  }

  create() {
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
    this.createRoom();
    this.createCombatSystems();
    if (this.startFlightEntryLift) {
      this.startFlightEntryLift = false;
      this.beginFlightEntryLift(this.previousStagePortalY());
    }
    this.stageEndEventDirector = new StageEndEventDirector(this);
    this.createCombatUi();
    this.bindInputHandlers();

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
    this.handleEnemyPitFalls();
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
    if (
      this.phase === 'dead' ||
      this.phase === 'ending' ||
      this.phase === 'transitioning'
    ) {
      return;
    }

    const pointer = this.input.activePointer;
    const aimPoint = pointer.positionToCamera(
      this.cameras.main,
    ) as Phaser.Math.Vector2;
    this.weaponSystem.update(delta, aimPoint);
    this.drawAimGuide(aimPoint);

    if (canPlayerFireInPhase(this.phase) && pointer.leftButtonDown()) {
      this.weaponSystem.tryFire(aimPoint, time);
    }
    if (this.phase === 'playing' && this.roomState === 'locked') {
      this.updateEnemyCombat(time);
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

  private createPlayer() {
    this.player = this.physics.add.sprite(
      this.getStartingPlayerX(),
      this.getStartingPlayerY(),
      PLAYER_ATLAS_KEY,
      PLAYER_INITIAL_FRAME,
    );
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(36, 76, true);
    this.player.play(PLAYER_ANIMATIONS.idle);
    this.player.setCollideWorldBounds(true);
    // Enemies default to the same depth (0) and are added to the display
    // list after the player, so without this they render on top of the
    // player whenever a melee enemy closes to contact range.
    this.player.setDepth(PLAYER_STACK_DEPTH.body);
    this.physics.add.collider(this.player, this.floorBuilder.group);
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
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
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
      portalTint: this.stage.palette.accentSecondary,
      onStateChanged: (state) => this.handleRoomStateChanged(state),
      onExitRequested: () => {
        this.roomExitRequested = true;
      },
    });

    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    this.replaceEnemies([]);
    this.roomState = 'idle';
    gameEvents.emit('room-state-changed', this.roomState);
    this.emitEnemyHealth();

    this.terrainBuilder.build(
      roomConfig.terrain,
      this.stage.terrainSkin,
      roomConfig.ceilingPipes,
      this.stage.pipeSkin,
    );

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
    this.replaceEnemies(spawned);
  }

  /**
   * Mutates `this.enemies` in place instead of reassigning it: the physics
   * overlaps set up in createCombatSystems() were registered against this
   * exact array reference, so reassigning it here would silently stop
   * player bullets and contact damage from hitting the next room's enemies.
   */
  private replaceEnemies(spawned: Enemy[]) {
    this.fallingEnemies.clear();
    this.enemies.splice(0, this.enemies.length, ...spawned);
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
      // 멈춰(민트 화면이 멈춘 것처럼 보이던) 있지 않음.
      this.cameras.main.flash(180, 182, 255, 228);
      return;
    }

    this.advanceToNextStage();
  }

  private advanceToNextStage() {
    const plan = getStageExitPlan(STAGES, this.currentStageIndex);

    if (plan.event) {
      this.playStageEndEvent(plan.event, plan.nextStageIndex);
      return;
    }

    this.completeStageExit(plan.nextStageIndex);
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
    this.enemyRangeGraphics.clear();
    // Beating the final stage ('The Return') is the true victory — wash the
    // screen to warm light (waking up) before the ending card resolves.
    this.cameras.main.flash(700, 255, 240, 210);
    this.victoryOverlay.setVisible(true);
  }

  private playStageEndEvent(
    event: StageEndEvent,
    nextStageIndex: number | null,
  ) {
    this.setPhase('transitioning');
    this.weaponSystem.cancelHitStop();
    this.playerController.stop();
    this.player.setVelocity(0);
    this.weaponSystem.hide();
    this.weaponDropDirector.clear();
    this.aimGraphics.clear();
    this.enemyRangeGraphics.clear();
    this.stageEndEventDirector.play(event, () => {
      if (nextStageIndex === null) {
        this.setPhase('ending');
        this.stageEndOverlay.setVisible(true);
        return;
      }

      this.completeStageExit(nextStageIndex);
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
    this.terrainBuilder.build(
      this.activeRoomConfig.terrain,
      this.stage.terrainSkin,
      this.activeRoomConfig.ceilingPipes,
      this.stage.pipeSkin,
    );
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
    this.weaponSystem = new WeaponSystem(
      this,
      this.player,
      this.enemies,
      WEAPON_CONFIGS,
      STARTING_WEAPON_ID,
      () => canPlayerFireInPhase(this.phase),
      (enemy, defeated) => this.handleEnemyHit(enemy, defeated),
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
    this.enemyProjectiles = new ProjectilePool(
      this,
      RANGED_ENEMY_COMBAT_CONFIG.projectile,
    );
    this.flyingEnemyProjectiles = new ProjectilePool(
      this,
      FLYING_ENEMY_COMBAT_CONFIG.projectile,
    );
    this.enemyProjectilePools = {
      ranged: this.enemyProjectiles,
      flying: this.flyingEnemyProjectiles,
    };
    this.enemyProjectiles.collideWith(
      this.terrainBuilder.projectileGroup,
      isProjectileBlocker,
    );
    this.flyingEnemyProjectiles.collideWith(
      this.terrainBuilder.projectileGroup,
      isProjectileBlocker,
    );
    this.physics.add.overlap(
      this.enemyProjectiles.group,
      this.player,
      this.createPlayerHitHandler(RANGED_ENEMY_COMBAT_CONFIG.projectile.damage),
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.flyingEnemyProjectiles.group,
      this.player,
      this.createPlayerHitHandler(FLYING_ENEMY_COMBAT_CONFIG.projectile.damage),
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handleEnemyContact,
      undefined,
      this,
    );
  }

  private createCombatUi() {
    this.aimGraphics = this.add.graphics().setDepth(10);
    this.enemyRangeGraphics = this.add.graphics().setDepth(2);
    this.deathOverlay = this.createOverlay(
      UI_PANEL_TEXTURES.danger.key,
      '#ff7180',
      'SYSTEM FAILURE',
      'PRESS R OR ENTER TO RESTART',
    );
    this.victoryOverlay = this.createOverlay(
      UI_PANEL_TEXTURES.victory.key,
      '#ffe9c4',
      'RETURN COMPLETE',
      'YOU\'RE AWAKE  //  PRESS R OR ENTER TO REPLAY',
    );
    this.stageEndOverlay = this.createOverlay(
      UI_PANEL_TEXTURES.danger.key,
      '#ff7180',
      'SURROUNDED',
      'SIGNAL LOST  //  PRESS R OR ENTER TO REPLAY',
    );

    this.emitStageLocation();

    this.syncWeaponUi();

    this.weaponEquippedText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 128, '', {
        color: '#ffffff',
        backgroundColor: '#070a0be8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.controlHintText = this.add
      .text(GAME_WIDTH - 32, GAME_HEIGHT - 96, '', {
        color: '#d8dfdc',
        backgroundColor: '#070a0bd9',
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0.5)
      .setDepth(20)
      .setScrollFactor(0);
    this.updateControlHint();
  }

  private bindInputHandlers() {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is required for weapon pickup');
    }

    this.equipKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.equipKey.on('down', this.tryEquipNearbyWeapon, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    keyboard.on('keydown-R', this.handleRestartInput, this);
    keyboard.on('keydown-ENTER', this.handleRestartInput, this);
    keyboard.on('keydown-UP', this.handlePortalEnter, this);
    keyboard.on('keydown-W', this.handlePortalEnter, this);
    keyboard.on('keydown', this.handleWeaponSlotInput, this);
    gameEvents.on('admin-stage-requested', this.handleAdminStageRequested);
    gameEvents.on(
      'admin-stage-boss-requested',
      this.handleAdminStageBossRequested,
    );
    gameEvents.on('admin-weapon-requested', this.handleAdminWeaponRequested);
    gameEvents.on('pause-toggle-requested', this.handlePauseToggleRequested);

    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.updateAiming, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // This one is `on`, and the scene restarts onto the same emitter, so it
      // has to come off or every restart adds another rig update.
      this.events.off(
        Phaser.Scenes.Events.POST_UPDATE,
        this.updateAiming,
        this,
      );
      this.input.off('pointerdown', this.handlePointerDown, this);
      keyboard.off('keydown-R', this.handleRestartInput, this);
      keyboard.off('keydown-ENTER', this.handleRestartInput, this);
      keyboard.off('keydown-UP', this.handlePortalEnter, this);
      keyboard.off('keydown-W', this.handlePortalEnter, this);
      keyboard.off('keydown', this.handleWeaponSlotInput, this);
      this.equipKey.off('down', this.tryEquipNearbyWeapon, this);
      gameEvents.off('admin-stage-requested', this.handleAdminStageRequested);
      gameEvents.off(
        'admin-stage-boss-requested',
        this.handleAdminStageBossRequested,
      );
      gameEvents.off('admin-weapon-requested', this.handleAdminWeaponRequested);
      gameEvents.off('pause-toggle-requested', this.handlePauseToggleRequested);
      // A scene that shuts down while paused would leave the overlay up over
      // whatever replaces it.
      this.setPaused(false);
    });
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
    this.tweens.killTweensOf(this.weaponEquippedText);
    this.weaponEquippedText
      .setText(`EQUIPPED // ${weapon.label}`)
      .setColor(`#${weapon.pickupColor.toString(16).padStart(6, '0')}`)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({
      targets: this.weaponEquippedText,
      alpha: 0,
      delay: 850,
      duration: 260,
      onComplete: () => this.weaponEquippedText.setVisible(false),
    });
    this.weaponSystem.playEquipFeedback();
  }

  private resetRunState() {
    // 관리자 스테이지 이동에 사용하는 장면 재시작은 이 인스턴스를 재사용하므로,
    // 각 필드가 이미 파괴된 이전 실행의 게임 객체를 계속 가리킨다. 특히
    // applyStageMovementMode는 createCombatSystems 안에서 실행되어 createCombatUi가
    // 다시 만들기 전의 안내 텍스트에 접근하므로, 파괴된 Text의 setText가 없는
    // 캔버스를 참조하지 않도록 초기화한다.
    this.controlHintText = undefined;
    // Phaser는 재시작 시 Scene 인스턴스를 재사용하지만 이전 물리 그룹은 파괴한다.
    // createCombatSystems가 필드를 교체하기 전에 buildRoom이 실행되므로, 선택적
    // 정리 과정이 오래된 풀이나 디렉터를 참조하지 않게 비워 둔다.
    this.weaponDropDirector = undefined!;
    this.weaponSystem = undefined!;
    this.roomDirector = undefined!;
    this.startCurrentRoomImmediately = this.requestedImmediateEncounter;
    this.requestedImmediateEncounter = false;
    const requestedStageIndex = this.requestedStartingStageIndex;
    this.currentStageIndex = requestedStageIndex ?? STARTING_STAGE_INDEX;
    this.requestedStartingStageIndex = undefined;
    this.currentRoomIndex = Phaser.Math.Clamp(
      this.requestedStartingRoomIndex ?? 0,
      0,
      this.stage.rooms.length - 1,
    );
    this.requestedStartingRoomIndex = undefined;
    this.startFlightEntryLift =
      requestedStageIndex !== undefined &&
      this.stage.movementMode === MovementMode.FLIGHT;
    this.restorePlayerHealthForStage();
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
    this.updateControlHint();
  }

  private updateControlHint() {
    this.controlHintText?.setText(
      this.playerController.isFlightMode
        ? 'W/SPACE  UP    S  DOWN    A/D  MOVE    SHIFT/RMB  DASH    LMB  FIRE'
        : 'A/D  MOVE    SPACE/W  JUMP    SHIFT/RMB  DASH    LMB  FIRE    E  EQUIP',
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
      this.emitEnemyHealth();
      return;
    }

    if (state === 'cleared') {
      this.setPhase('room-cleared');
      this.enemyProjectiles.clear();
      this.flyingEnemyProjectiles.clear();
      this.enemyRangeGraphics.clear();
      this.playRoomClearedFeedback();
    }
  }

  /** 포탈이 화면 밖에 있어도 방 클리어를 즉시 읽을 수 있게 알림을 표시함. */
  private playRoomClearedFeedback() {
    const { accentSecondary } = this.stage.palette;
    const labelColor = `#${accentSecondary.toString(16).padStart(6, '0')}`;
    const pulse = this.add
      .circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 22, accentSecondary, 0)
      .setStrokeStyle(3, accentSecondary, 0.9)
      .setDepth(30)
      .setScrollFactor(0);
    const label = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 72, 'ROOM CLEARED', {
        color: labelColor,
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        stroke: '#070a0b',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setScrollFactor(0)
      .setAlpha(0);

    this.tweens.add({
      targets: pulse,
      scale: 18,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => pulse.destroy(),
    });
    this.tweens.add({
      targets: label,
      alpha: 1,
      scale: 1.08,
      duration: 150,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 620,
      onComplete: () => label.destroy(),
    });
  }

  private handleRestartInput() {
    if (this.phase === 'dead' || this.phase === 'ending') {
      this.scene.restart();
    }
  }

  /** 위/W로 클리어된 방을 나감. 단, 열린 포탈 안에 서 있을 때만. */
  private handlePortalEnter() {
    if (this.phase === 'room-cleared') {
      this.roomDirector.tryExit();
    }
  }

  private handleAdminStageRequested = (stageIndex: number) => {
    if (!Number.isInteger(stageIndex) || !STAGES[stageIndex]) {
      return;
    }

    this.requestedStartingStageIndex = stageIndex;
    this.requestedStartingRoomIndex = 0;
    this.requestedImmediateEncounter = false;
    this.setPaused(false);
    this.scene.restart();
  };

  private handleAdminStageBossRequested = (stageIndex: number) => {
    if (!Number.isInteger(stageIndex) || !STAGES[stageIndex]) {
      return;
    }

    this.requestedStartingStageIndex = stageIndex;
    this.requestedStartingRoomIndex = STAGES[stageIndex].rooms.length - 1;
    this.requestedImmediateEncounter = true;
    this.setPaused(false);
    this.scene.restart();
  };

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

  private updateEnemyCombat(time: number) {
    this.enemyRangeGraphics.clear();

    for (const enemy of this.enemies) {
      // 레벨 밖으로 추락 중인 적은 더 이상 사격하지 않는다.
      if (!enemy.active || this.fallingEnemies.has(enemy)) {
        continue;
      }

      const targetInRange = enemy.updateCombat(
        time,
        this.player,
        this.fireEnemyProjectile,
      );

      this.enemyRangeGraphics.lineStyle(
        targetInRange ? 2 : 1,
        targetInRange ? enemy.aggroIndicatorColor : 0x6d7b80,
        targetInRange ? 0.28 : 0.12,
      );
      this.enemyRangeGraphics.strokeCircle(enemy.x, enemy.y, enemy.aggroRadius);
    }
  }

  private fireEnemyProjectile = (
    enemy: Enemy,
    target: Phaser.Physics.Arcade.Sprite,
  ) => {
    if (!enemy.projectile) {
      return;
    }

    const pool = this.enemyProjectilePools[enemy.projectile.kind];
    const angle = Phaser.Math.Angle.Between(
      enemy.x,
      enemy.y,
      target.x,
      target.y,
    );
    const { x, y } = this.muzzlePosition(
      enemy.x,
      enemy.y,
      angle,
      enemy.projectile.muzzleOffset,
    );
    pool.fire(x, y, angle, { owner: enemy });
  };

  private muzzlePosition(
    originX: number,
    originY: number,
    angle: number,
    offset: number,
  ) {
    return {
      x: originX + Math.cos(angle) * offset,
      y: originY + Math.sin(angle) * offset,
    };
  }

  private handleEnemyHit(enemy: Enemy, defeated: boolean) {
    // 현재 방의 교전이 활성화된 동안에만 피해를 적용한다.
    if (this.phase !== 'playing' || this.roomState !== 'locked') {
      return;
    }

    this.emitEnemyHealth();
    gameEvents.emit('enemy-damaged', enemy.x, enemy.y);

    if (!defeated) {
      return;
    }

    this.defeatEnemy(enemy);
  }

  private defeatEnemy(enemy: Enemy) {
    gameEvents.emit('enemy-defeated', enemy.x, enemy.y);
    if (enemy instanceof BossEnemy) {
      this.weaponDropDirector.dropBossReward(
        enemy.x,
        enemy.y,
        this.weaponSystem.ownedWeaponIds,
      );
    } else {
      if (!enemy.playsOwnDeathAnimation) {
        this.spawnDeathPop(enemy);
      }
      // 이미 발사된 탄환은 사수보다 오래 남으므로, 적이 사라진 뒤 맞으면 게임이
      // 공짜로 공격하는 것처럼 느껴진다. 보스 탄환은 패턴 자체가 전투이므로 유지해,
      // 마지막 타격 순간 화면을 비워 전투의 마무리 흐름을 지우지 않는다.
      if (enemy.projectile) {
        this.enemyProjectilePools[enemy.projectile.kind].clearFrom(enemy);
      }
    }
    enemy.defeat();
    this.roomDirector.notifyEnemyDefeated(enemy);
  }

  /**
   * 적은 플레이어가 뛰어넘는 가장자리에서 걸어 나가며, 기존에는 월드 경계가
   * 화면 바닥에서 적을 붙잡았다. 전투와 공격 범위에서는 벗어났지만 수에는 남아
   * 방을 영원히 열 수 없었다. 플레이어 추락은 handlePitFall로 복귀하는 위험이지만
   * 적에게는 돌아올 방법이 없다.
   *
   * 적은 착지 지점에서 죽지 않고 화면 밖으로 떨어진다. 바닥선을 넘으면 전투와
   * 탄환을 정리하고 충돌을 해제한다. 이어 화면 하단보다 96px 아래로 내려가면
   * 죽음 모션을 재생하지 않고 즉시 제거해, 추락이 지상 폭발처럼 보이지 않게 한다.
   */
  private handleEnemyPitFalls() {
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy instanceof BossEnemy) {
        continue;
      }

      const body = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (!body) {
        continue;
      }

      if (this.fallingEnemies.has(enemy)) {
        if (body.top > ENEMY_PIT_DEATH_Y) {
          this.fallingEnemies.delete(enemy);
          enemy.despawnAfterPitFall();
        }
        continue;
      }

      // 몸체의 위쪽 가장자리를 기준으로 전체가 바닥 아래에 있어야 판정하므로,
      // 구덩이 가장자리에 선 적을 추락 중인 적으로 오인하지 않는다.
      if (body.top <= FLOOR_SURFACE_Y) {
        continue;
      }

      this.fallingEnemies.add(enemy);
      body.setCollideWorldBounds(false);
      body.checkCollision.none = true;
      if (enemy.projectile) {
        this.enemyProjectilePools[enemy.projectile.kind].clearFrom(enemy);
      }
      this.roomDirector.notifyEnemyDefeated(enemy);
    }
  }

  /** A fading, expanding ghost of the enemy so a kill has a beat of weight. */
  private spawnDeathPop(enemy: Enemy) {
    const pop = this.add
      .image(enemy.x, enemy.y, enemy.texture.key, enemy.frame.name)
      .setFlipX(enemy.flipX)
      .setScale(enemy.scaleX, enemy.scaleY)
      .setDepth(enemy.depth)
      .setTint(0xffffff)
      .setTintMode(Phaser.TintModes.FILL);
    this.tweens.add({
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
        this.phase !== 'playing' ||
        this.roomState !== 'locked' ||
        this.playerController.isInvulnerable
      ) {
        return;
      }

      const damage = enemy.tryContactAttack(this.time.now);

      if (damage !== null) {
        this.applyPlayerDamage(damage);
      }
    };

  private findEnemy(firstObject: unknown, secondObject: unknown) {
    if (firstObject instanceof Enemy) {
      return firstObject;
    }

    return secondObject instanceof Enemy ? secondObject : null;
  }

  private emitEnemyHealth() {
    const current = this.enemies.reduce(
      (total, enemy) => total + enemy.currentHealth,
      0,
    );
    const max = this.enemies.reduce(
      (total, enemy) => total + enemy.maxHealth,
      0,
    );
    const isBoss = this.enemies.some((enemy) => enemy instanceof BossEnemy);
    gameEvents.emit('enemy-health-changed', current, max, isBoss);
  }

  private createPlayerHitHandler(
    damage: number,
  ): Phaser.Types.Physics.Arcade.ArcadePhysicsCallback {
    return (firstObject, secondObject) => {
      const bullet =
        firstObject === this.player
          ? (secondObject as Phaser.Physics.Arcade.Image)
          : (firstObject as Phaser.Physics.Arcade.Image);

      if (!bullet.active) {
        return;
      }

      bullet.disableBody(true, true);
      this.applyPlayerDamage(damage);
    };
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

    const pit = this.floorBuilder.findPitAt(this.player.x, FLOOR_TILE);
    const targetX = pit ? pit.end + FLOOR_TILE / 2 : this.player.x;
    this.player.setPosition(targetX, FLOOR_SURFACE_Y - PIT_RESPAWN_LIFT);
    body.setVelocity(0, 0);

    this.applyPlayerDamage(PIT_FALL_DAMAGE);
  }

  private applyPlayerDamage(damage: number) {
    if (
      this.phase !== 'playing' ||
      this.playerController.isInvulnerable ||
      useGameSettingsStore.getState().invincible
    ) {
      return;
    }

    const playerDefeated = this.playerHealth.takeDamage(damage);
    gameEvents.emit('player-damaged', this.player.x, this.player.y);

    this.flashPlayerDamage();
    this.cameras.main.shake(90, 0.004);

    if (playerDefeated) {
      this.handlePlayerDeath();
    }
  }

  private flashPlayerDamage() {
    this.playerDamageFlashTimer?.remove(false);
    this.player.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.playerDamageFlashTimer = this.time.delayedCall(
      PLAYER_DAMAGE_FLASH_DURATION,
      () => {
        this.playerDamageFlashTimer = undefined;
        if (this.phase !== 'dead') {
          this.player.clearTint();
        }
      },
    );
  }

  private cancelPlayerDamageFlash() {
    if (this.playerDamageFlashTimer) {
      this.playerDamageFlashTimer.remove(false);
      this.playerDamageFlashTimer = undefined;
    }
  }

  private handlePlayerDeath() {
    this.cancelPlayerDamageFlash();
    this.weaponSystem.cancelHitStop();
    this.playerController.stop();
    for (const enemy of this.enemies) {
      enemy.setVelocity(0);
    }
    this.setPhase('dead');
    this.player.setVelocity(0).setTint(0xe45d68).setAlpha(0.6);
    this.weaponSystem.hide();
    this.weaponDropDirector.clear();
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.weaponSystem.clearProjectiles();
    this.enemyProjectiles.clear();
    this.flyingEnemyProjectiles.clear();
    this.aimGraphics.clear();
    this.enemyRangeGraphics.clear();
    this.deathOverlay.setVisible(true);
    this.cameras.main.shake(180, 0.008);
  }

  private createOverlay(
    panelTexture: string,
    titleColor: string,
    titleText: string,
    promptText: string,
  ) {
    const panel = this.add
      .nineslice(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        panelTexture,
        undefined,
        470,
        150,
        UI_PANEL_SLICE,
        UI_PANEL_SLICE,
        UI_PANEL_SLICE,
        UI_PANEL_SLICE,
        true,
        true,
      )
      .setOrigin(0.5);
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 28, titleText, {
        color: titleColor,
        fontFamily: 'Arial, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 34, promptText, {
        color: '#e8ece9',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
      })
      .setOrigin(0.5);

    return this.add
      .container(0, 0, [panel, title, prompt])
      .setDepth(100)
      .setScrollFactor(0)
      .setVisible(false);
  }

  private drawAimGuide(aimPoint: Phaser.Math.Vector2) {
    // Only the crosshair. The 58px stub that used to run from the player is
    // redundant now that the weapon sprite points where the shot goes, and it
    // drew straight over the barrel.
    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(1, 0xb6ffe4, 0.75);
    this.aimGraphics.strokeCircle(aimPoint.x, aimPoint.y, 8);
    this.aimGraphics.lineBetween(
      aimPoint.x - 12,
      aimPoint.y,
      aimPoint.x + 12,
      aimPoint.y,
    );
    this.aimGraphics.lineBetween(
      aimPoint.x,
      aimPoint.y - 12,
      aimPoint.x,
      aimPoint.y + 12,
    );
  }
}
