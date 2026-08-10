import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/game/config/gameDimensions';
import { BootScene } from '@/game/scenes/BootScene';
import { GameScene } from '@/game/scenes/GameScene';
import { StartScene } from '@/game/scenes/StartScene';
import { TitleScene } from '@/game/scenes/TitleScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#090b0c',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1200 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  scene: [BootScene, StartScene, TitleScene, GameScene],
};
