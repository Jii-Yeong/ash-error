import type Phaser from 'phaser';
import type { Enemy } from '@/game/entities/Enemy';

export type EnemyCollisionOptions = {
  collidesWithFloor?: boolean;
  collidesWithTerrain?: boolean;
  /**
   * 구덩이 가장자리 장벽을 무시할지. 기본값은 충돌(true)이며, **구덩이에
   * 빠지는 것이 설계된 동작인 적만** false를 준다.
   */
  collidesWithPitBarriers?: boolean;
};

/**
 * 적 몸체를 해당 적이 따라야 하는 방 지형에 연결함.
 *
 * 지형 그룹의 몸체는 이미 면별 충돌 정책을 가짐. 벽은 모든 면이 단단하고
 * 발판은 위에서 착지하는 몸체만 받음. 지상 적은 구덩이 가장자리 장벽에서
 * 멈춰 돌진이나 추격 때문에 추락하지 않음.
 *
 * 장벽은 바닥면이 아니라 `FLOOR_SURFACE_Y - 160` 높이의 얇은 수직 존이므로,
 * 위에서 떨어지는 몸체는 장벽 위에 올라선다. 천장 정비병처럼 **구덩이로
 * 떨어지는 것이 공략인 적**은 `collidesWithPitBarriers: false`로 빼야 하며,
 * 그러지 않으면 허공에 착지해 `handlePitFalls`도 회수하지 못한다.
 */
export function connectEnemyToRoomGeometry(
  scene: Phaser.Scene,
  enemy: Enemy,
  floor: Phaser.Physics.Arcade.StaticGroup,
  terrain: Phaser.Physics.Arcade.StaticGroup,
  options: EnemyCollisionOptions = {},
  enemyPitBarriers?: Phaser.Physics.Arcade.StaticGroup,
) {
  if (options.collidesWithFloor ?? true) {
    scene.physics.add.collider(enemy, floor);
    if (enemyPitBarriers && (options.collidesWithPitBarriers ?? true)) {
      scene.physics.add.collider(enemy, enemyPitBarriers);
    }
  }

  if (options.collidesWithTerrain ?? true) {
    scene.physics.add.collider(enemy, terrain);
  }
}
