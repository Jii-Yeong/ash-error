import Phaser from 'phaser';
import { gameEvents } from '@/game/events/gameEvents';

/**
 * 한 번의 입력으로 통과하는 브라우저 게이트. Phaser가 이 포인터 입력으로
 * Web Audio를 해제하므로, 타이틀의 Enter 안내에 서로 다른 두 역할을 맡기지 않고
 * 실제 타이틀 진입과 함께 음악을 시작할 수 있다.
 */
export class StartScene extends Phaser.Scene {
  constructor() {
    super('start');
  }

  create() {
    gameEvents.emit('scene-changed', 'start');
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;

    this.add
      .text(
        viewportWidth / 2,
        viewportHeight / 2,
        'CLICK OR PRESS ANY KEY TO START',
        {
        color: '#b6ffe4',
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        },
      )
      .setOrigin(0.5);

    let isStarting = false;
    const startTitle = () => {
      if (isStarting) {
        return;
      }

      isStarting = true;
      this.scene.start('title');
    };

    this.input.once('pointerdown', startTitle);
    this.input.keyboard?.once('keydown', startTitle);
  }
}
