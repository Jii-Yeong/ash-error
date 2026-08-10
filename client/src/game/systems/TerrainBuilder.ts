import Phaser from 'phaser';
import type {
  CeilingPipe,
  TerrainPiece,
} from '@/game/config/roomConfig';
import type { SliceSkinConfig } from '@/game/config/terrainSkinConfig';
import { drawSliceSkin } from '@/game/systems/SliceSkin';

const TERRAIN_DEPTH = 5;
const PIPE_DEPTH = 4;
const TERRAIN_TYPE_DATA_KEY = 'terrain-type';

const TERRAIN_STYLE = {
  platform: { fill: 0x9aa4ab, edge: 0xe8eef1 },
  wall: { fill: 0x707a81, edge: 0xc4ccd0 },
  pipe: {
    fill: 0x182326,
    edge: 0x536468,
    seam: 0x26383a,
    bracket: 0x6a7c7e,
    light: 0x9bcc78,
    height: 26,
    radius: 8,
    seamY: 17,
    bracketStartX: 80,
    bracketSpacing: 180,
    bracketWidth: 14,
    bracketHeight: 36,
    bracketY: -5,
    lightRadius: 3,
  },
} as const;

/**
 * 캐릭터 물리를 막는 지형 조각의 면을 정의한다.
 *
 * 발판은 아래에서 통과해 위에 착지하는 일방통행 지형이다. 이 게임은 점프 속도가
 * 하나뿐이라 간격을 넘을 때 필요 여부와 관계없이 130.7px 상승한다. 발판 밑면이
 * 단단하면 아래에서 하는 평범한 점프마다 머리를 부딪힌다. 기존 레벨 데이터는 이를
 * 피하려고 우회했고, 스테이지 1의 열린 구간마다 위에 발판이 있어 구덩이조차 두지
 * 못하는 등 필요 없는 충돌면에 많은 배치를 소비했다.
 *
 * 벽은 모든 면이 단단하며, 플레이어가 넘어야 하는 장애물이다.
 */
export const terrainCollisionFaces = (type: TerrainPiece['type']) =>
  type === 'wall'
    ? { up: true, down: true, left: true, right: true }
    : { up: true, down: false, left: false, right: false };

/** 탄환용 지형은 발판 밑면을 포함해 모든 방향에서 단단하다. */
export const projectileCollisionFaces = {
  up: true,
  down: true,
  left: true,
  right: true,
};

/** 모든 지형 조각은 플레이어와 적 탄환을 막는다. */
export const terrainBlocksProjectiles = (_type: TerrainPiece['type']) => true;

/** 1·2스테이지 비행형 탄환은 발판을 통과하고 벽에만 막힌다. */
export const terrainBlocksFlyingProjectiles = (
  type: TerrainPiece['type'],
) => type === 'wall';

export const isProjectileBlocker = (terrain: Phaser.GameObjects.GameObject) =>
  terrainBlocksProjectiles(
    terrain.getData(TERRAIN_TYPE_DATA_KEY) as TerrainPiece['type'],
  );

export const isFlyingProjectileBlocker = (
  terrain: Phaser.GameObjects.GameObject,
) =>
  terrainBlocksFlyingProjectiles(
    terrain.getData(TERRAIN_TYPE_DATA_KEY) as TerrainPiece['type'],
  );

/**
 * 방의 단단한 지형(발판과 벽)을 임시 시각 요소가 있는 정적 몸체로 만든다.
 * 몸체는 하나의 정적 그룹에 두어 유지되는 플레이어 충돌체가 방 사이에서도
 * 추적하게 하며, `build`가 방마다 내용을 교체한다.
 */
export class TerrainBuilder {
  readonly group: Phaser.Physics.Arcade.StaticGroup;
  readonly projectileGroup: Phaser.Physics.Arcade.StaticGroup;
  private skinObjects: Phaser.GameObjects.GameObject[] = [];
  private pipeObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.group = scene.physics.add.staticGroup();
    this.projectileGroup = scene.physics.add.staticGroup();
  }

  build(
    pieces: readonly TerrainPiece[] = [],
    stoolSkin?: SliceSkinConfig,
    ceilingPipes: readonly CeilingPipe[] = [],
    pipeSkin?: SliceSkinConfig,
  ) {
    this.group.clear(true, true);
    this.projectileGroup.clear(true, true);
    this.clearSkin();
    this.clearPipes();

    for (const piece of pieces) {
      const style = TERRAIN_STYLE[piece.type];
      const skinned = Boolean(stoolSkin) && piece.type === 'platform';
      // 스킨된 발판은 아트의 두께를 따라, 충돌이 픽셀 판과 일치하게 함.
      // 상단 표면(piece.y)은 어느 쪽이든 변하지 않음.
      const height = skinned ? stoolSkin!.height : piece.height;
      const block = this.scene.add
        .rectangle(
          piece.x + piece.width / 2,
          piece.y + height / 2,
          piece.width,
          height,
          style.fill,
        )
        .setStrokeStyle(2, style.edge, 0.9)
        .setDepth(TERRAIN_DEPTH);

      block.setData(TERRAIN_TYPE_DATA_KEY, piece.type);

      this.group.add(block);
      // A static body added to a shape isn't sized from the shape until it is
      // synced to the game object's current transform.
      const body = block.body as Phaser.Physics.Arcade.StaticBody;
      body.updateFromGameObject();
      Object.assign(body.checkCollision, terrainCollisionFaces(piece.type));

      // 플레이어 이동에는 발판을 일방통행으로 유지한다. 탄환은 별도의 보이지 않는
      // 몸체를 사용해, 점프할 때 밑면에 부딪히지 않으면서 같은 시각 지형의 모든 면을
      // 단단하게 처리한다.
      const projectileBlocker = this.scene.add
        .rectangle(
          piece.x + piece.width / 2,
          piece.y + piece.height / 2,
          piece.width,
          piece.height,
          0,
          0,
        )
        .setVisible(false);
      projectileBlocker.setData(TERRAIN_TYPE_DATA_KEY, piece.type);
      this.projectileGroup.add(projectileBlocker);
      const projectileBody =
        projectileBlocker.body as Phaser.Physics.Arcade.StaticBody;
      projectileBody.updateFromGameObject();
      Object.assign(projectileBody.checkCollision, projectileCollisionFaces);

      if (skinned) {
        // 블록은 물리 바디로 유지하되 픽셀 스킨 아래에 숨김.
        block.setVisible(false);
        this.skinObjects.push(
          ...drawSliceSkin(
            this.scene,
            stoolSkin!,
            piece.x,
            piece.x + piece.width,
            piece.y,
            TERRAIN_DEPTH,
          ),
        );
      }
    }

    for (const pipe of ceilingPipes) {
      if (pipeSkin) {
        this.pipeObjects.push(
          ...drawSliceSkin(
            this.scene,
            pipeSkin,
            pipe.x,
            pipe.x + pipe.width,
            pipe.y,
            PIPE_DEPTH,
          ),
        );
      } else {
        this.drawCeilingPipe(pipe);
      }
    }
  }

  /** 산업용 배관과 자석 발이 붙는 하부 레일을 한 오브젝트로 그림. */
  private drawCeilingPipe(pipe: CeilingPipe) {
    const style = TERRAIN_STYLE.pipe;
    const graphics = this.scene.add
      .graphics({ x: pipe.x, y: pipe.y })
      .setDepth(PIPE_DEPTH);
    graphics.fillStyle(style.fill, 1);
    graphics.fillRoundedRect(0, 0, pipe.width, style.height, style.radius);
    graphics.lineStyle(3, style.edge, 1);
    graphics.strokeRoundedRect(0, 0, pipe.width, style.height, style.radius);
    graphics.lineStyle(2, style.seam, 1);
    graphics.lineBetween(0, style.seamY, pipe.width, style.seamY);
    graphics.fillStyle(style.bracket, 1);
    for (
      let x = style.bracketStartX;
      x < pipe.width;
      x += style.bracketSpacing
    ) {
      graphics.fillRect(
        x,
        style.bracketY,
        style.bracketWidth,
        style.bracketHeight,
      );
      graphics.fillStyle(style.light, 0.75);
      graphics.fillCircle(
        x + style.bracketWidth / 2,
        style.height / 2,
        style.lightRadius,
      );
      graphics.fillStyle(style.bracket, 1);
    }
    this.pipeObjects.push(graphics);
  }

  private clearSkin() {
    for (const obj of this.skinObjects) {
      obj.destroy();
    }
    this.skinObjects = [];
  }

  private clearPipes() {
    for (const obj of this.pipeObjects) {
      obj.destroy();
    }
    this.pipeObjects = [];
  }
}
