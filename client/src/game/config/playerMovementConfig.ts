import { GAME_HEIGHT } from '@/game/config/gameDimensions';

export enum MovementMode {
  GROUND = 'GROUND',
  FLIGHT = 'FLIGHT',
}

/** 비행 중 화면 가장자리와 HUD·바닥을 피해 이동할 수 있는 범위. */
export const PLAYER_FLIGHT_BOUNDS = {
  horizontalScreenInset: 48,
  minY: 128,
  maxY: GAME_HEIGHT - 120,
} as const;

export type MutableVelocity = {
  x: number;
  y: number;
};

export function writeNormalizedVelocity(
  output: MutableVelocity,
  horizontal: number,
  vertical: number,
  speed: number,
) {
  const length = Math.hypot(horizontal, vertical);
  if (length === 0) {
    output.x = 0;
    output.y = 0;
    return output;
  }

  const scale = speed / length;
  output.x = horizontal * scale;
  output.y = vertical * scale;
  return output;
}
