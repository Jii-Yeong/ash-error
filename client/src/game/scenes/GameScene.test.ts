// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  STAGE_ENDING_DRONE,
  STAGE_FIVE_PLAYER_SPRITE,
  STAGE_THREE_PLAYER_SPRITE,
} from '@/game/config/playerAnimationConfig';
import type { Enemy } from '@/game/entities/Enemy';
import { GameScene } from '@/game/scenes/GameScene';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('GameScene run reset', () => {
  it('4스테이지 보스가 사라진 뒤 1초 후 화면 파괴 전환을 시작한다', () => {
    let afterDelay: (() => void) | undefined;
    const advanceToNextStage = vi.fn();
    const delayedCall = vi.fn((_delay: number, callback: () => void) => {
      afterDelay = callback;
    });
    const gameScene = Object.assign(Object.create(GameScene.prototype), {
      advanceToNextStage,
      time: { delayedCall },
    }) as GameScene;

    (gameScene as unknown as { beginShatterExit(): void }).beginShatterExit();

    expect(delayedCall).toHaveBeenCalledWith(1000, expect.any(Function));
    expect(advanceToNextStage).not.toHaveBeenCalled();
    afterDelay?.();
    expect(advanceToNextStage).toHaveBeenCalledOnce();
  });

  it('4스테이지 화면 파괴 캡처 전까지 직전 무기 자세를 유지한다', () => {
    const hideWeapon = vi.fn();
    const gameScene = Object.assign(Object.create(GameScene.prototype), {
      currentStageIndex: 3,
      setPhase: vi.fn(),
      weaponSystem: { cancelHitStop: vi.fn(), hide: hideWeapon },
      playerController: { stop: vi.fn() },
      player: { setVelocity: vi.fn() },
      weaponDropDirector: { clear: vi.fn() },
      combatUi: { clearGuides: vi.fn() },
    }) as GameScene;

    (
      gameScene as unknown as { prepareStageTransition(): void }
    ).prepareStageTransition();

    expect(hideWeapon).not.toHaveBeenCalled();
  });

  it('clears enemies and descent cutscene state before a restarted run', () => {
    const gameScene = new GameScene();
    const staleEnemy = {} as Enemy;
    const runState = gameScene as unknown as { enemies: Enemy[] };
    runState.enemies.push(staleEnemy);
    const resetTransition = vi.fn();
    const replaceEnemies = vi.fn();
    Object.assign(gameScene, {
      stageTransitionDirector: { reset: resetTransition },
      enemyCombatDirector: { replaceEnemies },
      adminStageNavigator: {
        consumeRequest: () => ({ immediateEncounter: false }),
      },
    });

    (gameScene as unknown as { resetRunState(): void }).resetRunState();

    expect(runState.enemies).toEqual([]);
    expect(replaceEnemies).toHaveBeenCalledWith([]);
    expect(resetTransition).toHaveBeenCalledOnce();
  });

  it('drops an airborne player to the floor before showing the landed death frame', () => {
    const setFrame = vi.fn();
    const stopAnimation = vi.fn();
    const addTween = vi.fn();
    const body = {
      blocked: { down: false },
      bottom: 300,
      enable: true,
    };
    const player = {
      anims: { stop: stopAnimation },
      body,
      setFrame,
      y: 250,
    };
    const gameScene = Object.assign(Object.create(GameScene.prototype), {
      currentStageIndex: 4,
      player,
      tweens: { add: addTween },
    }) as GameScene;

    (
      gameScene as unknown as { playPlayerDeathAnimation(): void }
    ).playPlayerDeathAnimation();

    expect(body.enable).toBe(false);
    expect(stopAnimation).toHaveBeenCalledOnce();
    expect(setFrame).toHaveBeenCalledWith(
      STAGE_FIVE_PLAYER_SPRITE.deathFrames?.[0],
    );
    const tween = addTween.mock.calls[0]?.[0] as {
      onComplete: () => void;
      y: number;
    };
    expect(tween.y).toBeGreaterThan(player.y);
    tween.onComplete();
    expect(setFrame).toHaveBeenLastCalledWith(
      STAGE_FIVE_PLAYER_SPRITE.deathFrames?.[1],
    );
  });

  it('구덩이 피해로 죽으면 가장자리로 옮기지 않고 플레이어를 숨긴다', () => {
    const setPosition = vi.fn();
    const setVisible = vi.fn();
    const applyPlayerDamage = vi.fn(() => true);
    const gameScene = Object.assign(Object.create(GameScene.prototype), {
      player: {
        body: { bottom: 10_000 },
        setPosition,
        setVisible,
      },
      playerController: { isFlightMode: false },
      activeRoomConfig: { kind: 'combat' },
      applyPlayerDamage,
    }) as GameScene;

    (gameScene as unknown as { handlePitFall(): void }).handlePitFall();

    expect(applyPlayerDamage).toHaveBeenCalledOnce();
    expect(setVisible).toHaveBeenCalledWith(false);
    expect(setPosition).not.toHaveBeenCalled();
  });

  it('줌인 뒤 쉬었다가 생존 애니메이션과 드론 진입을 순서대로 재생한다', () => {
    let afterPause: (() => void) | undefined;
    let afterAlive: (() => void) | undefined;
    const onComplete = vi.fn();
    const drone = {
      play: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      setFlipX: vi.fn().mockReturnThis(),
      setScale: vi.fn().mockReturnThis(),
    };
    const tween = vi.fn();
    const player = {
      once: vi.fn((_event: string, callback: () => void) => {
        afterAlive = callback;
      }),
      play: vi.fn(),
      x: 640,
      y: 620,
    };
    const gameScene = Object.assign(Object.create(GameScene.prototype), {
      add: { sprite: vi.fn(() => drone) },
      cameras: { main: { worldView: { right: 1280 } } },
      player,
      time: {
        delayedCall: vi.fn((_delay: number, callback: () => void) => {
          afterPause = callback;
        }),
      },
      tweens: { add: tween },
    }) as GameScene;

    (
      gameScene as unknown as {
        playAscensionAlive(callback: () => void): void;
      }
    ).playAscensionAlive(onComplete);

    expect(player.play).not.toHaveBeenCalled();
    afterPause?.();
    expect(player.play).toHaveBeenCalledWith(
      STAGE_THREE_PLAYER_SPRITE.animations.alive,
      true,
    );
    afterAlive?.();
    expect(drone.setFlipX).toHaveBeenCalledWith(true);
    expect(drone.play).toHaveBeenCalledWith(STAGE_ENDING_DRONE.animation);
    const droneTween = tween.mock.calls[0]?.[0] as { onComplete: () => void };
    expect(onComplete).not.toHaveBeenCalled();
    droneTween.onComplete();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('plays a screen-fixed clear notification when the final enemy is defeated', () => {
    const clearProjectiles = vi.fn();
    const clearEnemyRanges = vi.fn();
    const showRoomCleared = vi.fn();
    const setPhase = vi.fn();
    const accentSecondary = 0xb6ffe4;
    const scene = Object.assign(Object.create(GameScene.prototype), {
      roomState: 'locked',
      setPhase,
      enemyCombatDirector: { clearProjectiles },
      combatUi: { clearEnemyRanges, showRoomCleared },
      stageTransitionDirector: { hasRoomOverride: false },
      currentRoomIndex: 0,
    }) as GameScene;
    Object.defineProperty(scene, 'stage', {
      value: { palette: { accentSecondary }, rooms: [] },
    });

    (
      scene as unknown as {
        handleRoomStateChanged(state: 'cleared'): void;
      }
    ).handleRoomStateChanged('cleared');

    expect(setPhase).toHaveBeenCalledWith('room-cleared');
    expect(clearProjectiles).toHaveBeenCalledOnce();
    expect(clearEnemyRanges).toHaveBeenCalledOnce();
    expect(showRoomCleared).toHaveBeenCalledWith(accentSecondary);
  });
});
