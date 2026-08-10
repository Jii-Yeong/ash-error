import Phaser from 'phaser';
import { GAME_WIDTH } from '@/game/config/gameDimensions';
import type { RoomConfig } from '@/game/config/roomConfig';
import {
  createUndergroundDescentRoom,
  UNDERGROUND_LANDING_ROOM,
} from '@/game/config/rooms/stageThreeRooms';
import type { StageExitPlan } from '@/game/config/stageProgression';
import { gameEvents } from '@/game/events/gameEvents';
import { FLOOR_SURFACE_Y } from '@/game/systems/FloorBuilder';
import { StageEndEventDirector } from '@/game/systems/StageEndEventDirector';

const DESCENT_FALL_OFF_MS = 750;
const DESCENT_LOOK_INTERVAL = 360;
const DESCENT_POST_LOOK_PAUSE = 2000;
const DESCENT_LANDING_TIMEOUT_MS = 4000;

type StageTransitionDirectorOptions = {
  scene: Phaser.Scene;
  player: Phaser.Physics.Arcade.Sprite;
  eventDirector: StageEndEventDirector;
  prepare: () => void;
  enterCurrentRoom: () => void;
  enterLandingRoom: (mode: 'descent' | 'ascension') => void;
  setAscensionPose: () => void;
  playAscensionAlive: (onComplete: () => void) => void;
  completeStageExit: (nextStageIndex: number | null) => void;
  finish: (outcome: 'victory' | 'stage-end') => void;
  idleAnimation: () => string;
  aimWeapon: (aimPoint: Phaser.Math.Vector2) => void;
};

export class StageTransitionDirector {
  private roomConfig?: RoomConfig;
  private descentStarted = false;
  private ascensionStarted = false;
  private promptText?: Phaser.GameObjects.Text;
  private pendingNextStageIndex: number | null = null;

  constructor(private readonly options: StageTransitionDirectorOptions) {}

  get roomOverride() {
    return this.roomConfig;
  }

  get hasRoomOverride() {
    return Boolean(this.roomConfig);
  }

  reset() {
    this.promptText?.destroy();
    this.promptText = undefined;
    this.roomConfig = undefined;
    this.descentStarted = false;
    this.ascensionStarted = false;
    this.pendingNextStageIndex = null;
  }

  /** 게임 진행 없이 화면 전환 연출 자체만 실행한다. */
  playEffect(
    event: Exclude<NonNullable<StageExitPlan['event']>, 'ascension'>,
    onBlackout: () => void,
  ) {
    this.options.eventDirector.play(event, onBlackout);
  }

  advance(plan: StageExitPlan, viewportWidth: number) {
    if (plan.event === 'siege') {
      this.enterDescentRoom(plan.nextStageIndex, viewportWidth);
      return;
    }
    if (plan.event === 'ascension') {
      this.beginAscension();
      return;
    }
    if (plan.event) {
      this.playStageEndEvent(plan.event, plan.nextStageIndex);
      return;
    }
    this.complete(plan.nextStageIndex);
  }

  /** 강하 방 구멍에 떨어졌을 때 지하 착지 연출을 한 번만 시작한다. */
  beginDescentCutscene() {
    if (this.descentStarted) {
      return;
    }
    this.descentStarted = true;
    this.promptText?.destroy();
    this.promptText = undefined;
    const body = this.options.player.body as Phaser.Physics.Arcade.Body;
    const fallVelocity = body.velocity.y;
    this.options.prepare();
    this.syncDescentWeaponPose();

    body.checkCollision.none = true;
    body.setCollideWorldBounds(false);
    this.options.player.setVelocityY(Math.max(200, fallVelocity));
    this.options.scene.time.delayedCall(DESCENT_FALL_OFF_MS, () =>
      this.dropIntoLandingRoom(),
    );
  }

  /** 마지막 비행 보스 처치 뒤 지하 포위 장면으로 복귀하는 연출을 시작한다. */
  beginAscension() {
    if (this.ascensionStarted) {
      return;
    }
    this.ascensionStarted = true;
    this.options.prepare();
    gameEvents.emit('ending-ascension-cue', 'silence');
    gameEvents.emit('ending-ascension-cue', 'transition-start');
    this.options.eventDirector.playAscension(
      () => {
        this.roomConfig = UNDERGROUND_LANDING_ROOM;
        this.options.enterLandingRoom('ascension');
        this.placePlayer(FLOOR_SURFACE_Y - 40);
        this.options.setAscensionPose();
      },
      () =>
        this.options.playAscensionAlive(() =>
          this.options.finish('victory'),
        ),
    );
  }

  private enterDescentRoom(
    nextStageIndex: number | null,
    viewportWidth: number,
  ) {
    this.pendingNextStageIndex = nextStageIndex;
    this.descentStarted = false;
    this.roomConfig = createUndergroundDescentRoom(viewportWidth);
    this.options.enterCurrentRoom();
    this.showDescentPrompt();
  }

  private showDescentPrompt() {
    const pit = this.roomConfig?.pits?.[0];
    const holeCenterX = pit ? pit.x + pit.width / 2 : GAME_WIDTH / 2;
    const text = this.options.scene.add
      .text(holeCenterX, FLOOR_SURFACE_Y - 150, '▼  떨어져라  ▼', {
        color: '#c9ffe0',
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.options.scene.tweens.add({
      targets: text,
      y: text.y - 14,
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.promptText = text;
  }

  private dropIntoLandingRoom() {
    this.roomConfig = UNDERGROUND_LANDING_ROOM;
    this.options.enterLandingRoom('descent');
    this.placePlayer(-60);

    const body = this.options.player.body as Phaser.Physics.Arcade.Body;
    const watchStartedAt = this.options.scene.time.now;
    const landingWatcher = this.options.scene.time.addEvent({
      delay: 60,
      loop: true,
      callback: () => {
        const landed = body.blocked.down;
        if (
          !landed &&
          this.options.scene.time.now - watchStartedAt <
            DESCENT_LANDING_TIMEOUT_MS
        ) {
          return;
        }

        landingWatcher.remove();
        if (!landed) {
          this.placePlayer(FLOOR_SURFACE_Y - 40);
        }
        this.playDescentLookAround();
      },
    });
  }

  private placePlayer(y: number) {
    const body = this.options.player.body as Phaser.Physics.Arcade.Body;
    const centerX = this.options.scene.physics.world.bounds.width / 2;
    body.checkCollision.none = false;
    body.setCollideWorldBounds(true);
    this.options.player.setPosition(centerX, y);
    body.reset(centerX, y);
    this.options.player.setVelocity(0, 0);
    this.options.player.play(this.options.idleAnimation(), true);
    this.options.scene.cameras.main.centerOnX(centerX);
  }

  private playDescentLookAround() {
    this.options.player.setVelocity(0, 0);
    this.syncDescentWeaponPose();

    const facings = [true, false, true, false];
    facings.forEach((faceLeft, index) => {
      this.options.scene.time.delayedCall(
        DESCENT_LOOK_INTERVAL * (index + 1),
        () => {
          this.options.player.setFlipX(faceLeft);
          this.syncDescentWeaponPose();
        },
      );
    });

    const lookDoneAt = DESCENT_LOOK_INTERVAL * (facings.length + 1);
    this.options.scene.time.delayedCall(
      lookDoneAt + DESCENT_POST_LOOK_PAUSE,
      () => {
        this.playEffect('siege', () =>
          this.complete(this.pendingNextStageIndex),
        );
      },
    );
  }

  /** 강하 중 직전 장착 무기와 양팔을 플레이어 위치에 계속 붙여 둠. */
  syncDescentWeaponPose() {
    if (!this.descentStarted) {
      return;
    }

    const faceLeft = this.options.player.flipX;
    this.options.aimWeapon(
      new Phaser.Math.Vector2(
        this.options.player.x + (faceLeft ? -120 : 120),
        this.options.player.y,
      ),
    );
  }

  private playStageEndEvent(
    event: Exclude<NonNullable<StageExitPlan['event']>, 'ascension'>,
    nextStageIndex: number | null,
  ) {
    this.options.prepare();
    this.playEffect(event, () => {
      if (nextStageIndex === null) {
        this.options.finish('stage-end');
        return;
      }
      this.complete(nextStageIndex);
    });
  }

  private complete(nextStageIndex: number | null) {
    this.roomConfig = undefined;
    this.pendingNextStageIndex = null;
    // 강하 컷신 진행 표시를 전환 종료와 함께 해제해, 다음 방/스테이지로 상태가
    // 남지 않게 한다.
    this.descentStarted = false;
    this.options.completeStageExit(nextStageIndex);
  }
}
