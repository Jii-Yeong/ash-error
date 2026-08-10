import Phaser from 'phaser';
import {
  PLAYER_ANIMATIONS,
  PLAYER_JUMP_FRAMES,
  type PlayerAnimationSet,
} from '@/game/config/playerAnimationConfig';
import {
  MovementMode,
  PLAYER_FLIGHT_BOUNDS,
  writeNormalizedVelocity,
} from '@/game/config/playerMovementConfig';
import { getTetheredVelocityX } from '@/game/combat/stageThreeEnemyCombat';
import { getVacuumVelocityX } from '@/game/combat/vacuumPull';
import { gameEvents } from '@/game/events/gameEvents';
import {
  FLIGHT_ENTRY_JUMP_FALL_DURATION,
  FLIGHT_ENTRY_JUMP_RISE_DURATION,
  getFlightEntryJumpY,
} from '@/game/movement/flightEntryJump';

export type PlayerMovementConfig = {
  moveSpeed: number;
  flightSpeed: number;
  jumpSpeed: number;
  fastFallSpeed: number;
  dash: {
    speed: number;
    duration: number;
    cooldown: number;
  };
};

type MovementKeys = Record<
  'left' | 'right' | 'jump' | 'down' | 'dash',
  Phaser.Input.Keyboard.Key
>;

const JUMP_APEX_VELOCITY_THRESHOLD = 150;
const LANDING_POSE_DURATION = 260;
/** Grace window to still jump just after walking off a ledge. */
const COYOTE_TIME = 90;
/** A jump pressed this long before landing still fires on touchdown. */
const JUMP_BUFFER_TIME = 110;
/** 포탈 진입 후 점프 입력을 무시하는 시간(위/W 키를 공유하므로). */
const JUMP_SUPPRESS_AFTER_PORTAL = 200;
/** 중앙 착지 후 비행 조작을 열기 전의 착지 자세 시간. */
const FLIGHT_ENTRY_LANDING_DURATION = 180;
/** 비행 밴드 중앙보다 높게 잡는 포탈 진입 점프의 정점. */
const FLIGHT_ENTRY_JUMP_APEX_HEIGHT = 90;
/** 480ms 달리기 루프에서 양발이 한 번씩 닿는 간격. */
const PLAYER_FOOTSTEP_INTERVAL = 240;

export class PlayerController {
  private readonly movementKeys: MovementKeys;
  private readonly cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  private dashReadyAt = 0;
  private dashEndsAt = 0;
  private readonly movementVelocity = { x: 0, y: 0 };
  private readonly dashVelocity = { x: 1, y: 0 };
  private dashing = false;
  private invulnerable = false;
  private lastGroundedAt = 0;
  private jumpBufferedUntil = 0;
  private jumpSuppressedUntil = 0;
  private wasGrounded = true;
  private landingPoseUntil = 0;
  private nextFootstepAt = 0;
  private currentPose: string | null = null;
  private animations: PlayerAnimationSet = PLAYER_ANIMATIONS;
  private movementMode = MovementMode.GROUND;
  private flightEntryLift?: {
    startY: number;
    targetY: number;
    startsAt: number;
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Sprite,
    private readonly config: PlayerMovementConfig,
  ) {
    const keyboard = scene.input.keyboard;

    if (!keyboard) {
      throw new Error('Keyboard input is required for player controls');
    }

    this.movementKeys = keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    }) as MovementKeys;
    this.cursorKeys = keyboard.createCursorKeys();
    scene.input.mouse?.disableContextMenu();
  }

  update(time: number) {
    if (this.updateFlightEntryLift(time)) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.movementKeys.dash)) {
      this.tryDash(time);
    }

    if (this.dashing && time >= this.dashEndsAt) {
      this.finishDash();
    }

    if (this.dashing) {
      this.player.setVelocity(
        this.config.dash.speed * this.dashVelocity.x,
        this.config.dash.speed * this.dashVelocity.y,
      );
      if (this.movementMode === MovementMode.FLIGHT) {
        this.updateFlightAnimation(true);
        this.clampFlightPosition();
      }
      return;
    }

    if (this.movementMode === MovementMode.FLIGHT) {
      this.updateFlightMovement();
      return;
    }

    this.updateGroundMovement(time);
  }

  setMovementMode(mode: MovementMode) {
    if (this.movementMode === mode) {
      return;
    }

    this.finishDash();
    this.movementMode = mode;
    this.invulnerable = false;
    this.lastGroundedAt = 0;
    this.jumpBufferedUntil = 0;
    this.wasGrounded = mode === MovementMode.GROUND;
    this.landingPoseUntil = 0;
    this.nextFootstepAt = 0;
    this.currentPose = null;
    this.flightEntryLift = undefined;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(mode === MovementMode.GROUND);
    body.setVelocity(0, 0);
    this.player.anims.stop();

    if (mode === MovementMode.FLIGHT) {
      this.clampFlightPosition();
      this.playAnimationWithFallback(
        this.animations.flyIdle,
        this.animations.idle,
      );
      return;
    }

    this.playAnimation(this.animations.idle);
  }

  setAnimations(animations: PlayerAnimationSet) {
    this.animations = animations;
    this.currentPose = null;
    if (this.movementMode === MovementMode.FLIGHT) {
      this.playAnimationWithFallback(animations.flyIdle, animations.idle);
      return;
    }
    this.playAnimation(animations.idle);
  }

  private updateGroundMovement(time: number) {
    const movingLeft = this.isMovingLeft();
    const movingRight = this.isMovingRight();

    if (movingLeft === movingRight) {
      this.player.setVelocityX(0);
    } else {
      this.player.setVelocityX(
        movingLeft ? -this.config.moveSpeed : this.config.moveSpeed,
      );
      this.player.setFlipX(movingLeft);
    }

    if (this.player.body?.blocked.down) {
      this.lastGroundedAt = time;
    }

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.movementKeys.jump) ||
      Phaser.Input.Keyboard.JustDown(this.cursorKeys.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursorKeys.space);

    // 포탈 전환 직후 잠시 점프 입력(및 버퍼된 입력)을 무시함. 포탈에
    // 진입한 위/W 누름이 다음 방에서 점프까지 하지 않도록.
    if (time <= this.jumpSuppressedUntil) {
      this.jumpBufferedUntil = 0;
    } else if (jumpPressed) {
      this.jumpBufferedUntil = time + JUMP_BUFFER_TIME;
    }

    // Coyote time + jump buffer: forgive a jump pressed slightly early or a
    // step after leaving the ledge, so platforming over pits feels responsive.
    const withinCoyoteWindow = time - this.lastGroundedAt <= COYOTE_TIME;
    if (time <= this.jumpBufferedUntil && withinCoyoteWindow) {
      this.player.setVelocityY(-this.config.jumpSpeed);
      this.jumpBufferedUntil = 0;
      this.lastGroundedAt = time - COYOTE_TIME - 1;
    }

    if (
      (this.movementKeys.down.isDown || this.cursorKeys.down.isDown) &&
      !this.player.body?.blocked.down &&
      this.player.body!.velocity.y < this.config.fastFallSpeed
    ) {
      this.player.setVelocityY(this.config.fastFallSpeed);
    }

    this.updateAnimation(time);
  }

  private updateFlightMovement() {
    const horizontal =
      Number(this.isMovingRight()) - Number(this.isMovingLeft());
    const vertical = Number(this.isMovingDown()) - Number(this.isMovingUp());
    writeNormalizedVelocity(
      this.movementVelocity,
      horizontal,
      vertical,
      this.config.flightSpeed,
    );
    this.player.setVelocity(this.movementVelocity.x, this.movementVelocity.y);

    if (horizontal !== 0) {
      this.player.setFlipX(horizontal < 0);
    }

    this.updateFlightAnimation(false);
    this.clampFlightPosition();
  }

  private updateAnimation(time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    const grounded = body?.blocked.down ?? false;

    if (!this.wasGrounded && grounded) {
      this.landingPoseUntil = time + LANDING_POSE_DURATION;
    }
    this.wasGrounded = grounded;

    if (!grounded) {
      this.nextFootstepAt = 0;
      const velocityY = body?.velocity.y ?? 0;
      this.setPose(
        Math.abs(velocityY) < JUMP_APEX_VELOCITY_THRESHOLD
          ? PLAYER_JUMP_FRAMES.apex
          : PLAYER_JUMP_FRAMES.airborne,
      );
      return;
    }

    if (time < this.landingPoseUntil) {
      this.nextFootstepAt = 0;
      this.setPose(PLAYER_JUMP_FRAMES.landing);
      return;
    }

    const isRunning = Math.abs(body?.velocity.x ?? 0) > 1;
    this.updateFootsteps(time, isRunning);
    this.playAnimation(
      isRunning ? this.animations.run : this.animations.idle,
    );
  }

  private updateFootsteps(time: number, isRunning: boolean) {
    if (!isRunning) {
      this.nextFootstepAt = 0;
      return;
    }

    if (time < this.nextFootstepAt) {
      return;
    }

    this.nextFootstepAt = time + PLAYER_FOOTSTEP_INTERVAL;
    gameEvents.emit('player-stepped');
  }

  private setPose(frameName: string) {
    if (this.currentPose === frameName) {
      return;
    }

    this.currentPose = frameName;
    this.player.anims.stop();
    this.player.setFrame(frameName);
  }

  private playAnimation(animationKey: string) {
    if (this.currentPose === animationKey) {
      return;
    }

    this.currentPose = animationKey;
    this.player.play(animationKey, true);
  }

  private playAnimationWithFallback(animationKey: string, fallbackKey: string) {
    this.playAnimation(
      this.scene.anims.exists(animationKey) ? animationKey : fallbackKey,
    );
  }

  private updateFlightAnimation(dashing: boolean) {
    const moving =
      Math.abs(this.movementVelocity.x) > 1 ||
      Math.abs(this.movementVelocity.y) > 1;
    const desiredAnimation = dashing
      ? this.animations.flyDash
      : moving
        ? this.animations.flyMove
        : this.animations.flyIdle;
    const fallbackAnimation =
      dashing || moving ? this.animations.run : this.animations.idle;
    this.playAnimationWithFallback(desiredAnimation, fallbackAnimation);
  }

  tryDash(time: number) {
    if (this.dashing || time < this.dashReadyAt) {
      return false;
    }

    this.resolveDashVelocity();
    this.dashing = true;
    this.invulnerable = true;
    this.dashEndsAt = time + this.config.dash.duration;
    this.dashReadyAt = time + this.config.dash.cooldown;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    this.player
      .setVelocity(
        this.config.dash.speed * this.dashVelocity.x,
        this.config.dash.speed * this.dashVelocity.y,
      )
      .setTint(0xb6ffe4);
    // Emitted here rather than at the call sites so the keyboard and the
    // right-click dash raise the same cue exactly once.
    gameEvents.emit('player-dashed', this.player.x, this.player.y);

    return true;
  }

  stop() {
    this.finishDash();
    this.flightEntryLift = undefined;
    this.nextFootstepAt = 0;
    // 방 전환 시 중력을 스테이지 모드에 맞춰 강제 복원한다. 보스 그랩·포박·대시
    // 등으로 중력이 꺼진 채 다음 방으로 넘어가 플레이어가 공중에 멈추는 것을 막는다.
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(
      this.movementMode === MovementMode.GROUND,
    );
    this.player.setVelocity(0);
  }

  /**
   * 이전 방의 포탈 높이에서 중앙 착지점 위 정점까지 뛰어오른 뒤 내려온다.
   * 상승·하강·착지 중에는 방향 입력을 받지 않아 전환 연출이 흐트러지지 않는다.
   */
  beginFlightEntryLift(targetY: number) {
    if (this.movementMode !== MovementMode.FLIGHT) {
      return;
    }

    this.flightEntryLift = {
      startY: this.player.y,
      targetY,
      startsAt: this.scene.time.now,
    };
    this.player.setVelocity(0);
  }

  /**
   * 대기 중인 점프를 버리고 잠시 새 점프 입력을 무시함 — 위/W가 포탈
   * 진입과 점프를 겸하므로, 플레이어가 포탈로 나갈 때 호출됨.
   */
  cancelJump() {
    this.jumpBufferedUntil = 0;
    this.jumpSuppressedUntil = this.scene.time.now + JUMP_SUPPRESS_AFTER_PORTAL;
  }

  get isInvulnerable() {
    return this.invulnerable;
  }

  get isDashing() {
    return this.dashing;
  }

  get isFlightMode() {
    return this.movementMode === MovementMode.FLIGHT;
  }

  /**
   * Applies one frame of boss suction after normal movement input. The caller
   * invokes this throughout the attack, so holding away continuously counters
   * the pull while an idle player slides toward the boss.
   */
  applyVacuum(sourceX: number, pullSpeed: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.player.setVelocityX(
      getVacuumVelocityX({
        playerX: this.player.x,
        sourceX,
        currentVelocityX: body.velocity.x,
        pullSpeed,
      }),
    );
  }

  /** 포획 케이블이 입력 속도를 낮추고 포획기 쪽으로 조금씩 끌어당김. */
  applyTether(sourceX: number, slowFactor: number, pullSpeed: number) {
    if (this.dashing) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.player.setVelocityX(
      getTetheredVelocityX(
        this.player.x,
        sourceX,
        body.velocity.x,
        slowFactor,
        pullSpeed,
      ),
    );
  }

  private finishDash() {
    if (!this.dashing) {
      return;
    }

    this.dashing = false;
    this.invulnerable = false;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(this.movementMode === MovementMode.GROUND);
    if (this.movementMode === MovementMode.FLIGHT) {
      this.player.setVelocity(0, 0);
    } else {
      this.player.setVelocityX(0);
    }
    this.player.clearTint();
  }

  private updateFlightEntryLift(time: number) {
    const lift = this.flightEntryLift;
    if (!lift) {
      return false;
    }

    // 진입 연출은 짧은 연출일 뿐이다. 플레이어가 이동 입력을 시작하면 즉시
    // 끝내고 제어를 넘겨, 연출이 어떤 이유로든 끝나지 않아 플레이어가 제자리에서
    // 파닥이며 움직이지 못하는 상태에 갇히지 않게 한다. 시간 상한도 함께 둔다.
    const completesAt =
      FLIGHT_ENTRY_JUMP_RISE_DURATION +
      FLIGHT_ENTRY_JUMP_FALL_DURATION +
      FLIGHT_ENTRY_LANDING_DURATION;
    if (this.hasFlightMovementInput() || time - lift.startsAt >= completesAt) {
      this.flightEntryLift = undefined;
      this.currentPose = null;
      this.updateFlightAnimation(false);
      return false;
    }

    const elapsed = time - lift.startsAt;
    const apexY = Phaser.Math.Clamp(
      lift.targetY - FLIGHT_ENTRY_JUMP_APEX_HEIGHT,
      PLAYER_FLIGHT_BOUNDS.minY,
      PLAYER_FLIGHT_BOUNDS.maxY,
    );
    const fallStartsAt = FLIGHT_ENTRY_JUMP_RISE_DURATION;
    const landingStartsAt = fallStartsAt + FLIGHT_ENTRY_JUMP_FALL_DURATION;

    if (elapsed < fallStartsAt) {
      this.moveFlightEntryBodyTo(
        getFlightEntryJumpY(
          { startY: lift.startY, apexY, targetY: lift.targetY },
          elapsed,
        ),
      );
      this.setPose(PLAYER_JUMP_FRAMES.airborne);
    } else if (elapsed < landingStartsAt) {
      const progress = Phaser.Math.Clamp(
        (elapsed - fallStartsAt) / FLIGHT_ENTRY_JUMP_FALL_DURATION,
        0,
        1,
      );
      this.moveFlightEntryBodyTo(
        getFlightEntryJumpY(
          { startY: lift.startY, apexY, targetY: lift.targetY },
          elapsed,
        ),
      );
      this.setPose(
        progress < 0.25 ? PLAYER_JUMP_FRAMES.apex : PLAYER_JUMP_FRAMES.airborne,
      );
    } else {
      this.moveFlightEntryBodyTo(lift.targetY);
      this.setPose(PLAYER_JUMP_FRAMES.landing);
    }
    this.player.setVelocity(0);

    return true;
  }

  /** Arcade Physics가 POST_UPDATE에 되돌리지 않도록 바디와 스프라이트를 함께 이동한다. */
  private moveFlightEntryBodyTo(y: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.reset(this.player.x, y);
  }

  private resolveDashVelocity() {
    if (this.movementMode === MovementMode.FLIGHT) {
      const horizontal =
        Number(this.isMovingRight()) - Number(this.isMovingLeft());
      const vertical = Number(this.isMovingDown()) - Number(this.isMovingUp());
      writeNormalizedVelocity(this.dashVelocity, horizontal, vertical, 1);
      if (horizontal !== 0 || vertical !== 0) {
        return;
      }
    }

    // 지상 대시 방향: 좌/우 방향키를 누르고 있으면 그 방향으로 대시한다. 좌우를
    // 동시에 눌러 서로 상쇄되면(horizontal === 0) 방향키 미입력과 똑같이 취급해
    // 쳐다보는 방향(flipX)으로 대시한다.
    const horizontal = Number(this.isMovingRight()) - Number(this.isMovingLeft());
    if (horizontal !== 0) {
      this.dashVelocity.x = horizontal;
      this.dashVelocity.y = 0;
      return;
    }

    this.dashVelocity.x = this.player.flipX ? -1 : 1;
    this.dashVelocity.y = 0;
  }

  private clampFlightPosition() {
    const camera = this.scene.cameras.main;
    // setScroll()은 scrollX를 즉시 바꾸지만 worldView는 다음 카메라 갱신까지
    // 이전 방 값을 유지하므로, 스테이지 전환 프레임에는 scrollX를 기준으로 함.
    const viewportLeft = camera.scrollX;
    this.player.setPosition(
      Phaser.Math.Clamp(
        this.player.x,
        viewportLeft + PLAYER_FLIGHT_BOUNDS.horizontalScreenInset,
        viewportLeft +
          camera.width -
          PLAYER_FLIGHT_BOUNDS.horizontalScreenInset,
      ),
      Phaser.Math.Clamp(
        this.player.y,
        PLAYER_FLIGHT_BOUNDS.minY,
        PLAYER_FLIGHT_BOUNDS.maxY,
      ),
    );
  }

  /** 비행 중 어느 방향으로든 이동 입력이 있는지. */
  private hasFlightMovementInput() {
    return (
      this.isMovingLeft() ||
      this.isMovingRight() ||
      this.isMovingUp() ||
      this.isMovingDown()
    );
  }

  private isMovingLeft() {
    return this.movementKeys.left.isDown || this.cursorKeys.left.isDown;
  }

  private isMovingRight() {
    return this.movementKeys.right.isDown || this.cursorKeys.right.isDown;
  }

  private isMovingUp() {
    return (
      this.movementKeys.jump.isDown ||
      this.cursorKeys.up.isDown ||
      this.cursorKeys.space?.isDown
    );
  }

  private isMovingDown() {
    return this.movementKeys.down.isDown || this.cursorKeys.down.isDown;
  }
}
