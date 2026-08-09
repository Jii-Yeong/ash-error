import Phaser from 'phaser';
import { GAME_HEIGHT } from '@/game/config/gameDimensions';
import { gameEvents } from '@/game/events/gameEvents';
import { UNDERGROUND_LANDING_ROOM } from '@/game/config/rooms/stageThreeRooms';
import type { StageEndEvent } from '@/game/config/stageConfig';
import {
  BLOCKER_CONFIG,
  CAPTOR_CONFIG,
  CEILING_MAINTAINER_CONFIG,
} from '@/game/config/stageThreeEnemyConfig';

/**
 * 지상 포위 대형. **한 줄이 좌우 한 쌍**이고, 어느 쪽에 무엇이 서는지를 직접
 * 적는다. 예전에는 인덱스 패리티 식으로 계산했는데, 그러면 줄을 하나 더하거나
 * 순서를 바꿀 때 대형 전체가 조용히 재배치되고 의도한 그림을 코드에서 읽어낼
 * 방법이 없었다.
 *
 * `y`가 적 종류마다 다른 것은 아트의 발 높이가 달라서다.
 */
const SIEGE_BLOCKER = {
  config: BLOCKER_CONFIG,
  y: GAME_HEIGHT - 130,
  flippedFacesRight: true,
} as const;
const SIEGE_CAPTOR = {
  config: CAPTOR_CONFIG,
  y: GAME_HEIGHT - 120,
  flippedFacesRight: true,
} as const;
/** 파이프형 아트만 기본 방향이 반대라 `flippedFacesRight`가 false다. */
const SIEGE_PIPE_MAINTAINER = {
  config: CEILING_MAINTAINER_CONFIG,
  flippedFacesRight: false,
} as const;

/** 강하 착지 후 실제 적이 좌우에서 걸어 들어올 위치. */
const DESCENT_SIEGE_FLANKS = [
  { offset: 150, left: SIEGE_BLOCKER, right: SIEGE_CAPTOR },
  { offset: 290, left: SIEGE_CAPTOR, right: SIEGE_BLOCKER },
  { offset: 430, left: SIEGE_BLOCKER, right: SIEGE_CAPTOR },
  { offset: 560, left: SIEGE_CAPTOR, right: SIEGE_BLOCKER },
];
/** 착지 방 상단 파이프에서 포위하는 파이프형 위치. */
const DESCENT_SIEGE_PIPE_OFFSETS = [220, 480];
/** 안드로이드가 하나씩 나타나는 간격. */
const SIEGE_REVEAL_INTERVAL = 200;
/** 5스테이지 종료에서 재현한 포위 대형을 유지하는 시간. */
const ASCENSION_FORMATION_HOLD_MS = 2200;
/** 5스테이지 보스 처치 화면이 완전히 하얘지는 시간. */
const ASCENSION_WHITEOUT_MS = 5800;
/** 완전히 하얀 화면으로 엔딩 방 교체를 가리는 시간. */
const ASCENSION_WHITE_HOLD_MS = 700;
/** 포위 잡몹이 플레이어 반대편으로 떠나는 시간. */
const ASCENSION_DEPARTURE_MS = 1200;
/** 지하 엔딩 방에서 플레이어를 강조하는 최종 카메라 배율. */
const ASCENSION_PLAYER_ZOOM = 1.35;
/** 포위 잡몹이 모두 떠난 뒤 플레이어를 천천히 확대하는 시간. */
const ASCENSION_PLAYER_ZOOM_MS = 1400;
/** 싱킹 연출에 쓰는 검은 선/점 개수. */
const SINK_STREAK_COUNT = 14;
const SHATTER_SNAPSHOT_KEY = 'stage-shatter-snapshot';

/**
 * 화면 파괴 안무 타이밍(파편이 화면을 덮은 시점 기준). 첫 조각이 뜸을 두고
 * 떨어지고, 몇 조각 더 떨어진 뒤 나머지가 우르르 쏟아진다.
 */
const SHATTER_FIRST_DROP = 700;
const SHATTER_AVALANCHE = 2900;

type SiegeEnemyView = {
  sprite: Phaser.GameObjects.Sprite;
  texture: string;
  moveAnimation: string;
  idleAnimation: string;
  /** 지금 보여야 하는 애니메이션. 아직 등록 전이라 못 틀었어도 기록해 둔다. */
  currentAnimation: string;
  /** flipX가 켜졌을 때 이 아트가 오른쪽을 보는지. 적 계열마다 다르다. */
  flippedFacesRight: boolean;
};

/**
 * 방향을 좌표로 정하고 flipX로 옮기는 자리를 한 곳에 모은다.
 *
 * 두 계열의 기본 방향이 반대라, 호출부마다 `flankX < centerX`와
 * `flankX > centerX`를 골라 쓰다가 이탈 연출에서 갱신을 통째로 빠뜨렸다.
 * 보여야 할 방향만 넘기면 나머지는 여기서 처리한다.
 */
function faceSprite(
  sprite: Phaser.GameObjects.Sprite,
  facesRight: boolean,
  flippedFacesRight: boolean,
) {
  sprite.setFlipX(facesRight === flippedFacesRight);
}

export class StageEndEventDirector {
  private shatterRunId = 0;
  /** 마지막으로 세운 포위 대형. 아틀라스가 늦게 도착하면 여기서 복구한다. */
  private siegeViews: SiegeEnemyView[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shatterRunId += 1;
      this.removeShatterSnapshot();
    });
  }

  play(event: Exclude<StageEndEvent, 'ascension'>, onBlackout: () => void) {
    switch (event) {
      case 'siege':
        this.playSiege(onBlackout);
        return;
      case 'shatter':
        this.playShatter(onBlackout);
        return;
      default: {
        const unhandledEvent: never = event;
        throw new Error(`Unsupported stage end event: ${unhandledEvent}`);
      }
    }
  }

  /**
   * 5스테이지 종료 연출: 화면이 점점 하얘진 뒤, 그 하얀 화면 뒤에서 3스테이지
   * 종료 포위 방으로 복귀(`onEnterRoom`)한다. 3스테이지 포위 장면을 다시
   * 보여준 뒤 적들이 플레이어 반대편으로 떠나면 카메라 확대 후 회복 연출을
   * 시작한다.
   */
  playAscension(onEnterRoom: () => void, onEnemiesDeparted: () => void) {
    // 화면 스케일이 EXPAND라 넓은 화면에서는 카메라 폭이 GAME_WIDTH보다 크다.
    // scrollFactor 0 오버레이는 실제 카메라 크기를 기준으로 배치해야 흰 화면이
    // 넓어진 뷰포트 양옆까지 덮는다.
    const camera = this.scene.cameras.main;
    const screenWidth = camera.width;
    const screenHeight = camera.height;
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    // 화면이 점점 하얘진다.
    const white = this.scene.add
      .rectangle(centerX, centerY, screenWidth, screenHeight, 0xffffff)
      .setAlpha(0)
      .setDepth(90)
      .setScrollFactor(0);
    this.scene.tweens.add({
      targets: white,
      alpha: 1,
      duration: ASCENSION_WHITEOUT_MS,
      ease: 'Linear',
      onComplete: () => {
        // 완전히 하얀 순간 3스테이지 지하 착지 방으로 교체(교체를 흰빛으로 감춤).
        onEnterRoom();

        const worldCenterX = this.scene.physics.world.bounds.centerX;
        const enemies = this.spawnUndergroundSiege(worldCenterX, true);

        // 흰빛을 완전히 내려 지하 포위 방과 잡몹 대형을 선명하게 드러낸다.
        this.scene.tweens.add({
          targets: white,
          alpha: 0,
          duration: 700,
          delay: ASCENSION_WHITE_HOLD_MS,
        });

        // 대형을 잠시 보여준 뒤 모두 플레이어 반대 방향인 화면 바깥으로 떠난다.
        this.scene.time.delayedCall(
          ASCENSION_WHITE_HOLD_MS + ASCENSION_FORMATION_HOLD_MS,
          () => {
            let remainingDepartures = enemies.length;
            gameEvents.emit('ending-ascension-cue', 'siege-footstep');
            this.scene.time.addEvent({
              delay: 240,
              repeat: 3,
              callback: () =>
                gameEvents.emit('ending-ascension-cue', 'siege-footstep'),
            });
            enemies.forEach((view) => {
              const { flippedFacesRight, moveAnimation, sprite } = view;
              this.playSiegeAnimation(view, moveAnimation);
              const leavesRight = sprite.x >= worldCenterX;
              const departureX = leavesRight
                ? worldCenterX + screenWidth / 2 + sprite.displayWidth
                : worldCenterX - screenWidth / 2 - sprite.displayWidth;
              // 대형에서는 가운데를 보고 서 있었다. 이제 바깥으로 나가므로
              // 돌아서야 한다 — 이 갱신이 빠져 있어 전원이 뒷걸음질했다.
              faceSprite(sprite, leavesRight, flippedFacesRight);
              this.scene.tweens.add({
                targets: sprite,
                x: departureX,
                duration: ASCENSION_DEPARTURE_MS,
                ease: 'Sine.easeIn',
                onComplete: () => {
                  sprite.destroy();
                  remainingDepartures -= 1;
                  if (remainingDepartures > 0) {
                    return;
                  }

                  camera.once(
                    Phaser.Cameras.Scene2D.Events.ZOOM_COMPLETE,
                    onEnemiesDeparted,
                  );
                  camera.zoomTo(
                    ASCENSION_PLAYER_ZOOM,
                    ASCENSION_PLAYER_ZOOM_MS,
                    'Sine.easeInOut',
                  );
                  this.scene.tweens.add({
                    targets: white,
                    alpha: 0,
                    duration: 500,
                    onComplete: () => white.destroy(),
                  });
                },
              });
            });
          },
        );
      },
    });
  }

  /**
   * 4스테이지 종료 연출: 현재 화면을 캡쳐해 그 이미지가 유리처럼 깨진다. 흰
   * 균열이 번지며 캡쳐 화면이 파편으로 갈라지고, 조각이 화면을 가린 순간
   * `onBlackout`(다음 스테이지 구성)을 호출해 교체를 감춘 뒤 흩뿌려 5스테이지를
   * 드러낸다.
   */
  private playShatter(onBlackout: () => void) {
    const runId = ++this.shatterRunId;
    // 현재 프레임을 캡쳐한 뒤(다음 렌더에 콜백) 그 이미지를 깨뜨린다.
    this.scene.game.renderer.snapshot((snapshot) => {
      if (runId !== this.shatterRunId || !this.scene.sys.isActive()) {
        return;
      }
      if (snapshot instanceof HTMLImageElement) {
        this.runShatter(snapshot, onBlackout);
      } else {
        onBlackout();
      }
    });
  }

  private runShatter(snapshotImage: HTMLImageElement, onBlackout: () => void) {
    const camera = this.scene.cameras.main;
    const viewportWidth = camera.width;
    const viewportHeight = camera.height;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    this.removeShatterSnapshot();
    this.scene.textures.addImage(SHATTER_SNAPSHOT_KEY, snapshotImage);

    // 캡쳐 화면으로 현재 프레임을 고정해 덮는다(그 아래 씬은 곧 교체됨).
    const cover = this.scene.add
      .image(0, 0, SHATTER_SNAPSHOT_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(viewportWidth, viewportHeight)
      .setDepth(94)
      .setScrollFactor(0);

    // 불규칙 유리 파편 그물: 중앙 충격점서 방사형 스포크 + 동심 링으로 화면을
    // 불규칙 셀로 나눈다. 스포크 각도·링 반경을 흔들어 진짜 깨진 유리처럼 만든다.
    const spokes = 12;
    const outerRadius = Math.hypot(viewportWidth, viewportHeight) * 0.62;
    const rings = [0, 0.15, 0.3, 0.48, 0.69, 1].map(
      (ratio) => outerRadius * ratio,
    );
    const angleJitter = Array.from({ length: spokes }, () =>
      Phaser.Math.FloatBetween(-0.16, 0.16),
    );
    const radiusJitter = rings.map((_, ring) =>
      Array.from({ length: spokes }, () =>
        ring === 0 ? 0 : Phaser.Math.FloatBetween(-0.18, 0.18),
      ),
    );
    const web = (ring: number, spoke: number) => {
      const index = ((spoke % spokes) + spokes) % spokes;
      const theta = (index / spokes) * Math.PI * 2 + angleJitter[index]!;
      const radius = rings[ring]! * (1 + radiusJitter[ring]![index]!);
      return {
        x: centerX + Math.cos(theta) * radius,
        y: centerY + Math.sin(theta) * radius,
      };
    };

    // 실제 파편과 같은 경계를 독립된 직선으로 그려 각진 유리 균열을 만든다.
    const cracks = this.scene.add
      .graphics()
      .setDepth(95)
      .setScrollFactor(0)
      .setAlpha(0);
    cracks.lineStyle(1, 0xffffff, 0.9);
    for (let ring = 0; ring < rings.length - 1; ring += 1) {
      for (let spoke = 0; spoke < spokes; spoke += 1) {
        const inner = web(ring, spoke);
        const outer = web(ring + 1, spoke);
        const next = web(ring + 1, spoke + 1);
        cracks.lineBetween(inner.x, inner.y, outer.x, outer.y);
        cracks.lineBetween(outer.x, outer.y, next.x, next.y);
      }
    }
    this.scene.tweens.add({ targets: cracks, alpha: 1, duration: 460 });
    camera.shake(600, 0.012);

    // 균열이 번진 뒤 캡쳐 화면을 불규칙 파편(Mesh2D)으로 잘라, 다음 스테이지로
    // 교체한 뒤 조각마다 회전·낙하시킨다. 각 메시는 캡쳐 텍스처를 UV로 매핑한
    // 폴리곤이라, 그 셀 모양 그대로 자신의 화면 픽셀을 담는다.
    this.scene.time.delayedCall(540, () => {
      const meshes: Phaser.GameObjects.Mesh2D[] = [];
      for (let ring = 0; ring < rings.length - 1; ring += 1) {
        for (let spoke = 0; spoke < spokes; spoke += 1) {
          const corners = [
            web(ring, spoke),
            web(ring, spoke + 1),
            web(ring + 1, spoke + 1),
            web(ring + 1, spoke),
          ];
          const cx =
            corners.reduce((sum, point) => sum + point.x, 0) / corners.length;
          const cy =
            corners.reduce((sum, point) => sum + point.y, 0) / corners.length;
          // 정점: [x, y, u, v] * 4. 위치는 중심(cx,cy) 기준 상대, UV는 캡쳐
          // 텍스처(화면 전체) 좌표. 회전축이 조각 중심에 오도록 상대 좌표로 둔다.
          const vertices = corners.flatMap((point) => [
            point.x - cx,
            point.y - cy,
            point.x / viewportWidth,
            point.y / viewportHeight,
          ]);
          const indices = [0, 1, 2, 0, 0, 2, 3, 0];
          // 캡쳐 텍스처는 위에서 아래로 저장되지만 GL UV는 아래에서 위라, flipV로
          // 상하 반전을 바로잡는다.
          const mesh = this.scene.add
            .mesh2d(cx, cy, SHATTER_SNAPSHOT_KEY, vertices, indices, true)
            .setDepth(94)
            .setScrollFactor(0);
          meshes.push(mesh);
        }
      }

      // 파편이 화면을 완전히 가린 지금 다음 스테이지를 구성한다(교체를 감춤).
      // 균열 간 캡쳐 화면은 잠시 그대로 멈춰 있다가 아래 안무대로 떨어진다.
      onBlackout();
      cover.destroy();
      camera.shake(240, 0.006);

      // 한 조각이 회전하며 떨어지는 낙하 트윈.
      let remainingShards = meshes.length;
      const dropShard = (mesh: Phaser.GameObjects.Mesh2D, delay: number) => {
        this.scene.tweens.add({
          targets: mesh,
          x: mesh.x + Phaser.Math.Between(-80, 80),
          y: mesh.y + viewportHeight * 1.1 + Phaser.Math.Between(0, 280),
          angle: Phaser.Math.Between(-180, 180),
          duration: Phaser.Math.Between(720, 1160),
          delay,
          ease: 'Quad.easeIn',
          onComplete: () => {
            mesh.destroy();
            remainingShards -= 1;
            if (remainingShards === 0) {
              this.removeShatterSnapshot();
            }
          },
        });
        this.scene.tweens.add({
          targets: mesh,
          alpha: 0,
          delay: delay + Phaser.Math.Between(200, 480),
          duration: 460,
        });
      };

      // 안무: 1초 뒤 한 조각, 1초 뒤 한 조각, 곧이어 한 조각, 그다음 우르르.
      Phaser.Utils.Array.Shuffle(meshes);
      const soloDelays = [SHATTER_FIRST_DROP, 1700, 2200];
      meshes.forEach((mesh, index) => {
        const delay =
          index < soloDelays.length
            ? soloDelays[index]!
            : SHATTER_AVALANCHE + Phaser.Math.Between(0, 700);
        dropShard(mesh, delay);
      });

      // 우르르 쏟아지는 순간 균열선을 지우고 화면을 크게 흔든다.
      this.scene.time.delayedCall(SHATTER_AVALANCHE, () => {
        camera.shake(520, 0.02);
        this.scene.tweens.add({
          targets: cracks,
          alpha: 0,
          duration: 260,
          onComplete: () => cracks.destroy(),
        });
      });
    });
  }

  /**
   * 애니메이션이 아직 등록 전이어도 의도만 기록해 두고 넘어간다.
   *
   * 등록 전에 `play`를 부르면 Phaser가 경고만 내고 아무것도 하지 않으므로,
   * 어느 프레임을 보여야 했는지가 그대로 사라진다. 기록해 두면 아틀라스가
   * 도착한 뒤 `reskinSiege`가 그 자리를 복구할 수 있다.
   */
  private playSiegeAnimation(view: SiegeEnemyView, animation: string) {
    view.currentAnimation = animation;
    if (this.scene.anims.exists(animation)) {
      view.sprite.play(animation, true);
    }
  }

  /**
   * 늦게 도착한 3스테이지 아틀라스를 이미 세워 둔 포위 대형에 입힌다.
   *
   * 콜드 로드(어드민으로 5스테이지 보스 직행, 혹은 느린 회선)에서는 프리로드가
   * 끝나기 전에 스프라이트가 생성돼 `__MISSING` 초록 박스로 굳는다. 방 지형을
   * 다시 그리는 콜백은 이 스프라이트들을 건드리지 않으므로 여기서 따로 복구한다.
   */
  reskinSiege() {
    for (const view of this.siegeViews) {
      if (!view.sprite.active || !this.scene.textures.exists(view.texture)) {
        continue;
      }

      view.sprite.setTexture(view.texture);
      this.playSiegeAnimation(view, view.currentAnimation);
    }
  }

  /** 방패형·포박형·파이프형 지하 포위 대형을 등장시키거나 즉시 배치함. */
  private spawnUndergroundSiege(
    centerX: number,
    revealImmediately = false,
  ): SiegeEnemyView[] {
    const enemies: SiegeEnemyView[] = [];
    this.siegeViews = enemies;
    const reveal = (
      enemy: Phaser.GameObjects.Sprite,
      targetX: number,
      delay: number,
      moveAnimation: string,
      idleAnimation: string,
      flippedFacesRight: boolean,
    ) => {
      const view: SiegeEnemyView = {
        sprite: enemy,
        texture: enemy.texture.key,
        moveAnimation,
        idleAnimation,
        currentAnimation: idleAnimation,
        flippedFacesRight,
      };
      enemies.push(view);

      if (revealImmediately) {
        enemy.setX(targetX).setAlpha(1);
        this.playSiegeAnimation(view, idleAnimation);
        return;
      }
      this.scene.time.delayedCall(delay, () => {
        enemy.setAlpha(1);
        this.playSiegeAnimation(view, moveAnimation);
        this.scene.tweens.add({
          targets: enemy,
          x: targetX,
          duration: 420,
          ease: 'Quad.easeOut',
          onComplete: () => this.playSiegeAnimation(view, idleAnimation),
        });
        this.scene.cameras.main.shake(80, 0.0025);
      });
    };

    // 한 줄에서 왼쪽 먼저, 그 다음 오른쪽. 등장 간격이 이 순서에 물려 있다.
    DESCENT_SIEGE_FLANKS.forEach(({ offset, left, right }, row) => {
      [
        { unit: left, flankX: centerX - offset, direction: -1 },
        { unit: right, flankX: centerX + offset, direction: 1 },
      ].forEach(({ unit, flankX, direction }, side) => {
        const enemy = this.scene.add
          .sprite(flankX + direction * 180, unit.y, unit.config.texture)
          .setScale(unit.config.scale)
          .setDepth(60)
          .setAlpha(0);
        // 대형은 가운데의 플레이어를 향해 선다.
        faceSprite(enemy, direction < 0, unit.flippedFacesRight);
        reveal(
          enemy,
          flankX,
          SIEGE_REVEAL_INTERVAL * (row * 2 + side),
          unit.config.animations.walk,
          unit.config.animations.idle,
          unit.flippedFacesRight,
        );
      });
    });

    const pipeY = (UNDERGROUND_LANDING_ROOM.ceilingPipes?.[0]?.y ?? 72) + 50;
    const pipeEnemyXs = DESCENT_SIEGE_PIPE_OFFSETS.flatMap((offset) => [
      centerX - offset,
      centerX + offset,
    ]);
    pipeEnemyXs.forEach((flankX, index) => {
      const direction = flankX < centerX ? -1 : 1;
      const enemy = this.scene.add
        .sprite(
          flankX + direction * 180,
          pipeY,
          SIEGE_PIPE_MAINTAINER.config.texture,
        )
        .setScale(SIEGE_PIPE_MAINTAINER.config.scale)
        .setDepth(60)
        .setAlpha(0);
      faceSprite(enemy, direction < 0, SIEGE_PIPE_MAINTAINER.flippedFacesRight);
      reveal(
        enemy,
        flankX,
        SIEGE_REVEAL_INTERVAL * (index * 2 + 1),
        SIEGE_PIPE_MAINTAINER.config.animations.pipeMove,
        SIEGE_PIPE_MAINTAINER.config.animations.pipeIdle,
        SIEGE_PIPE_MAINTAINER.flippedFacesRight,
      );
    });

    return enemies;
  }

  /** 3스테이지 포위 대형 뒤 화면을 아래로 가라앉혀 4스테이지로 전환함. */
  private playSiege(onBlackout: () => void) {
    // 안드로이드는 월드 좌표에 세워 바닥·플레이어와 같은 평면에 있게 한다. 그래야
    // 뒤이어 카메라가 하강할 때 바닥·플레이어와 함께 위로 올라간다. 화면 중심의
    // 월드 X(카메라가 따라가는 플레이어 위치)를 기준으로 좌우로 포위한다.
    const camera = this.scene.cameras.main;
    const centerX = camera.scrollX + camera.width / 2;
    const props: Phaser.GameObjects.GameObject[] = this.spawnUndergroundSiege(
      centerX,
    ).map(({ sprite }) => sprite);

    // 적이 다 나타난 뒤: 카메라가 아래로 내려가며 하강감을 주고, 그때 흰색
    // 선·점이 위로 흘러 밑으로 꺼지는 느낌을 표기한다. 이어서 암전 → 다음 스테이지.
    const descendDelay =
      SIEGE_REVEAL_INTERVAL * (DESCENT_SIEGE_FLANKS.length * 2) + 500;
    this.scene.time.delayedCall(descendDelay, () => {
      camera.shake(360, 0.012);
      camera.stopFollow();
      // 세로 하강만 허용하고 가로 스크롤은 현재 위치에 고정한다. 넓은 착지 방에서
      // 폭을 GAME_WIDTH로 두면 카메라가 좌측으로 스냅해 포위 실루엣·플레이어가
      // 화면 밖으로 튕겨 나간다.
      camera.setBounds(camera.scrollX, 0, camera.width, GAME_HEIGHT * 2);
      this.scene.tweens.add({
        targets: camera,
        scrollY: GAME_HEIGHT * 0.92,
        duration: 1100,
        ease: 'Sine.easeIn',
      });

      // 바닥 아래는 그려진 것이 없어 투명하게 비친다. 카메라가 내려가며 드러나는
      // 구간을 검은 월드 사각형으로 채운다.
      const voidHeight = GAME_HEIGHT * 1.5;
      const voidFill = this.scene.add
        .rectangle(
          centerX,
          GAME_HEIGHT + voidHeight / 2,
          camera.width,
          voidHeight,
          0x000000,
          1,
        )
        .setDepth(5);
      props.push(voidFill);

      const sinkStreaks = this.spawnSinkStreaks();
      const blackout = this.scene.add
        .rectangle(
          camera.width / 2,
          camera.height / 2,
          camera.width,
          camera.height,
          0x000000,
          1,
        )
        .setDepth(90)
        .setAlpha(0)
        .setScrollFactor(0);

      // 하강이 먼저 읽히도록 잠시 뒤 암전을 시작한다.
      this.scene.time.delayedCall(520, () => {
        this.scene.tweens.add({
          targets: blackout,
          alpha: 1,
          duration: 720,
          onComplete: () => {
            onBlackout();
            this.scene.tweens.add({
              targets: blackout,
              alpha: 0,
              duration: 560,
              onComplete: () => {
                blackout.destroy();
                for (const streak of sinkStreaks) {
                  streak.destroy();
                }
                for (const prop of props) {
                  prop.destroy();
                }
              },
            });
          },
        });
      });
    });
  }

  /**
   * 흰색 선과 점이 위로 빠르게 흘러가 카메라가 아래로 내려가는(꺼지는) 느낌을
   * 표기한다. 화면 좌표 고정(scrollFactor 0)이라 카메라 하강과 무관하게 흐른다.
   */
  private spawnSinkStreaks() {
    const { width, height } = this.scene.cameras.main;
    const streaks: Phaser.GameObjects.GameObject[] = [];
    for (let index = 0; index < SINK_STREAK_COUNT; index += 1) {
      const isDot = index % 2 === 0;
      const x = Phaser.Math.Between(40, width - 40);
      const y = Phaser.Math.Between(height, height * 2);
      const streak = isDot
        ? this.scene.add.rectangle(x, y, 4, 4, 0xffffff, 0.95)
        : this.scene.add.rectangle(x, y, 2, 46, 0xffffff, 0.85);
      streak.setDepth(89).setScrollFactor(0);
      streaks.push(streak);
      this.scene.tweens.add({
        targets: streak,
        y: -80,
        duration: Phaser.Math.Between(420, 780),
        repeat: -1,
        ease: 'Linear',
      });
    }
    return streaks;
  }

  private removeShatterSnapshot() {
    if (this.scene.textures.exists(SHATTER_SNAPSHOT_KEY)) {
      this.scene.textures.remove(SHATTER_SNAPSHOT_KEY);
    }
  }
}
