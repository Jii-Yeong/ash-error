import { describe, expect, it, vi } from 'vitest';
import { STAGE_FOUR_PLAYER_SPRITE } from '@/game/config/playerAnimationConfig';
import { MovementMode } from '@/game/config/playerMovementConfig';
import { PlayerController } from '@/game/controllers/PlayerController';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: { A: 65, D: 68, W: 87, S: 83, SHIFT: 16 },
      },
    },
    Math: {
      Clamp: (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value)),
    },
    Events: {
      EventEmitter: class {
        emit() {}
        on() {}
        off() {}
      },
    },
  },
}));

describe('PlayerController stage transition', () => {
  it('clamps flight entry against the current wide viewport instead of stale worldView', () => {
    const keys = {
      left: {},
      right: {},
      jump: {},
      down: {},
      dash: {},
    };
    const scene = {
      input: {
        keyboard: {
          addKeys: vi.fn(() => keys),
          createCursorKeys: vi.fn(() => ({})),
        },
        mouse: { disableContextMenu: vi.fn() },
      },
      cameras: {
        main: {
          width: 2048,
          scrollX: 2152,
          worldView: { left: 4720 },
        },
      },
      anims: { exists: vi.fn(() => true) },
    };
    const body = {
      setAllowGravity: vi.fn(),
      setVelocity: vi.fn(),
    };
    const player = {
      x: 4136,
      y: 566,
      body,
      anims: { stop: vi.fn() },
      setPosition: vi.fn(),
      play: vi.fn(),
    };
    const controller = new PlayerController(scene as never, player as never, {
      moveSpeed: 300,
      flightSpeed: 300,
      jumpSpeed: 560,
      fastFallSpeed: 720,
      dash: { speed: 760, duration: 170, cooldown: 800 },
    });

    controller.setMovementMode(MovementMode.FLIGHT);

    expect(player.setPosition).toHaveBeenCalledWith(4136, 566);
  });

  it('uses the stage-specific ground animations after a sprite swap', () => {
    const scene = {
      input: {
        keyboard: {
          addKeys: vi.fn(() => ({})),
          createCursorKeys: vi.fn(() => ({})),
        },
        mouse: { disableContextMenu: vi.fn() },
      },
      anims: { exists: vi.fn(() => true) },
    };
    const player = { play: vi.fn() };
    const controller = new PlayerController(scene as never, player as never, {
      moveSpeed: 300,
      flightSpeed: 300,
      jumpSpeed: 560,
      fastFallSpeed: 720,
      dash: { speed: 760, duration: 170, cooldown: 800 },
    });

    controller.setAnimations(STAGE_FOUR_PLAYER_SPRITE.animations);

    expect(player.play).toHaveBeenCalledWith('stage-4-player-idle', true);
  });
});

describe('PlayerController ground dash direction', () => {
  const DASH_SPEED = 760;

  function setupGroundDash(options: {
    left?: boolean;
    right?: boolean;
    flipX?: boolean;
  }) {
    const keys = {
      left: { isDown: options.left ?? false },
      right: { isDown: options.right ?? false },
      jump: { isDown: false },
      down: { isDown: false },
      dash: { isDown: false },
    };
    const cursor = {
      left: { isDown: false },
      right: { isDown: false },
      up: { isDown: false },
      down: { isDown: false },
      space: { isDown: false },
    };
    const captured = { x: 0, y: 0 };
    const player = {
      x: 100,
      y: 100,
      flipX: options.flipX ?? false,
      body: { setAllowGravity: vi.fn(), setVelocity: vi.fn() },
      anims: { stop: vi.fn() },
      setPosition: vi.fn(),
      play: vi.fn(),
      setVelocity: vi.fn((vx: number, vy: number) => {
        captured.x = vx;
        captured.y = vy;
        return { setTint: vi.fn() };
      }),
    };
    const scene = {
      input: {
        keyboard: {
          addKeys: vi.fn(() => keys),
          createCursorKeys: vi.fn(() => cursor),
        },
        mouse: { disableContextMenu: vi.fn() },
      },
      cameras: { main: { scrollX: 0, worldView: { left: 0 } } },
      anims: { exists: vi.fn(() => true) },
    };
    const controller = new PlayerController(scene as never, player as never, {
      moveSpeed: 300,
      flightSpeed: 300,
      jumpSpeed: 560,
      fastFallSpeed: 720,
      dash: { speed: DASH_SPEED, duration: 170, cooldown: 800 },
    });
    return { controller, captured };
  }

  it('dashes toward the held direction key', () => {
    const right = setupGroundDash({ right: true });
    right.controller.tryDash(0);
    expect(right.captured.x).toBe(DASH_SPEED);

    const left = setupGroundDash({ left: true });
    left.controller.tryDash(0);
    expect(left.captured.x).toBe(-DASH_SPEED);
  });

  it('dashes toward the facing (flipX) when no direction key is held', () => {
    const facingRight = setupGroundDash({ flipX: false });
    facingRight.controller.tryDash(0);
    expect(facingRight.captured.x).toBe(DASH_SPEED);

    const facingLeft = setupGroundDash({ flipX: true });
    facingLeft.controller.tryDash(0);
    expect(facingLeft.captured.x).toBe(-DASH_SPEED);
  });

  it('treats simultaneous left+right as no input and dashes toward the facing', () => {
    // 좌우를 동시에 누르면 서로 상쇄되어(horizontal === 0) 방향키 미입력과 동일하게
    // 쳐다보는 방향으로 대시한다.
    const facingLeft = setupGroundDash({ left: true, right: true, flipX: true });
    facingLeft.controller.tryDash(0);
    expect(facingLeft.captured.x).toBe(-DASH_SPEED);

    const facingRight = setupGroundDash({
      left: true,
      right: true,
      flipX: false,
    });
    facingRight.controller.tryDash(0);
    expect(facingRight.captured.x).toBe(DASH_SPEED);
  });
});
