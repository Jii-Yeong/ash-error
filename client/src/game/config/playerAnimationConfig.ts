const frameName = (index: number) =>
  `shoot-posture-hand ${index}.aseprite`;

export const PLAYER_ATLAS_KEY = 'player';

export const PLAYER_ANIMATIONS = {
  idle: 'player-idle',
  run: 'player-run',
  flyIdle: 'player_fly_idle',
  flyMove: 'player_fly_move',
  flyDash: 'player_fly_dash',
  death: 'player-death',
  alive: 'player-alive',
} as const;

export type PlayerAnimationSet = {
  [K in keyof typeof PLAYER_ANIMATIONS]: string;
};

export type PlayerSpriteConfig = {
  texture: string;
  png: string;
  json: string;
  animations: PlayerAnimationSet;
  flyFrames?: readonly string[];
  deathFrames?: readonly string[];
  aliveFrames?: readonly string[];
};

export const PLAYER_SPRITE_CONFIG: PlayerSpriteConfig = {
  texture: PLAYER_ATLAS_KEY,
  png: '/assets/player/player.png',
  json: '/assets/player/player.json',
  animations: PLAYER_ANIMATIONS,
};

export const STAGE_ONE_TWO_PLAYER_SPRITE: PlayerSpriteConfig = {
  texture: 'stage-1-2-player',
  png: '/assets/player/stage-1-2-player.png',
  json: '/assets/player/stage-1-2-player.json',
  animations: {
    ...PLAYER_ANIMATIONS,
    idle: 'stage-1-2-player-idle',
    run: 'stage-1-2-player-run',
    death: 'stage-1-2-player-death',
  },
  deathFrames: [13, 14].map(frameName),
};

export const STAGE_THREE_PLAYER_SPRITE: PlayerSpriteConfig = {
  texture: 'stage-3-player',
  png: '/assets/player/stage-3-player.png',
  json: '/assets/player/stage-3-player.json',
  animations: {
    ...PLAYER_ANIMATIONS,
    idle: 'stage-3-player-idle',
    run: 'stage-3-player-run',
    death: 'stage-3-player-death',
    alive: 'stage-3-player-alive',
  },
  deathFrames: [13, 14].map(frameName),
  aliveFrames: [15, 16, 17].map(frameName),
};

export const STAGE_FOUR_PLAYER_SPRITE: PlayerSpriteConfig = {
  texture: 'stage-4-player',
  png: '/assets/player/stage-4-player.png',
  json: '/assets/player/stage-4-player.json',
  animations: {
    ...PLAYER_ANIMATIONS,
    idle: 'stage-4-player-idle',
    run: 'stage-4-player-run',
    death: 'stage-4-player-death',
  },
  deathFrames: [13, 14].map(frameName),
};

export const STAGE_FIVE_PLAYER_SPRITE: PlayerSpriteConfig = {
  texture: 'stage-5-player',
  png: '/assets/player/stage-5-player.png',
  json: '/assets/player/stage-5-player.json',
  animations: {
    ...PLAYER_ANIMATIONS,
    idle: 'stage-5-player-idle',
    run: 'stage-5-player-run',
    flyIdle: 'stage-5-player-fly',
    flyMove: 'stage-5-player-fly',
    flyDash: 'stage-5-player-fly',
    death: 'stage-5-player-death',
  },
  flyFrames: [13, 14].map(frameName),
  deathFrames: [15, 16].map(frameName),
};

export const STAGE_ENDING_DRONE = {
  texture: 'stage-ending-drone',
  png: '/assets/player/stage-ending-dron.png',
  json: '/assets/player/stage-ending-dron.json',
  animation: 'stage-ending-drone-fly',
  frames: [
    'stage-ending-dron 0.aseprite',
    'stage-ending-dron 1.aseprite',
  ],
  width: 105,
  scale: 1.35,
} as const;

/** 5스테이지 플레이어 뒤에서 회전하는 헤일로. */
export const STAGE_FIVE_PLAYER_HALO = {
  texture: 'stage-5-player-halo',
  png: '/assets/player/stage-5-halo.png',
  animation: 'stage-5-player-halo-spin',
  frameWidth: 94,
  frameHeight: 98,
  frameCount: 4,
  spacing: 1,
  offsetX: 6,
  offsetY: -34,
} as const;

export const PLAYER_IDLE_FRAMES = [0, 1, 2, 3].map(frameName);
export const PLAYER_RUN_FRAMES = [7, 8, 9, 10, 11, 12].map(frameName);

export const PLAYER_JUMP_FRAMES = {
  airborne: frameName(6),
  apex: frameName(5),
  landing: frameName(4),
} as const;

export const PLAYER_INITIAL_FRAME = PLAYER_IDLE_FRAMES[0];
