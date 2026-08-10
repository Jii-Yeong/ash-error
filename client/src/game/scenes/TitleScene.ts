import Phaser from 'phaser';
import {
  STARTING_STAGE_INDEX,
  STAGES,
} from '@/game/config/stageConfig';
import { gameEvents } from '@/game/events/gameEvents';
import { StageAssetPreloader } from '@/game/systems/StageAssetPreloader';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  preload() {
    this.load.image('title-player', '/assets/title-player.png');
    this.load.image('title-logo', '/assets/ui/title/ash-error-logo.png');
  }

  create() {
    gameEvents.emit('scene-changed', 'title');
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;

    // 1스테이지 배경을 cover로 채움(비율 유지, 다른 해상도 지원). 맨 뒤.
    // 콜드 로드에서도 타이틀 진입은 막지 않고, 도착 즉시 배경만 붙인다.
    const bg = STAGES[STARTING_STAGE_INDEX]?.background;
    let backgroundImage: Phaser.GameObjects.Image | undefined;
    const showBackground = () => {
      if (!bg || backgroundImage || !this.textures.exists(bg.key)) {
        return;
      }

      const image = this.add
        .image(viewportWidth / 2, viewportHeight / 2, bg.key)
        .setDepth(-2);
      image.setScale(
        Math.max(
          viewportWidth / image.width,
          viewportHeight / image.height,
        ),
      );
      backgroundImage = image;
    };

    if (bg && this.textures.exists(bg.key)) {
      showBackground();
    } else if (bg) {
      this.load.once(`filecomplete-image-${bg.key}`, showBackground);
    }

    // 우하단 정렬, 높이는 화면의 80%(비율 유지). 배경 앞, 텍스트 뒤.
    const player = this.add
      .image(viewportWidth, viewportHeight, 'title-player')
      .setOrigin(1, 1)
      .setDepth(-1);
    player.setScale((viewportHeight * 0.8) / player.height);

    // 로고는 원본 비율을 유지하며 플레이어와 겹치지 않는 빈 영역에 배치한다.
    // 자동으로 사라지지 않고 로고를 직접 클릭했을 때만 페이드아웃한다.
    const title = this.add
      .image(viewportWidth * 0.42, viewportHeight / 2 - 32, 'title-logo')
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    title.setScale(
      Math.min(
        (viewportWidth * 0.58) / title.width,
        (viewportHeight * 0.14) / title.height,
      ),
    );
    title.once('pointerdown', () => {
      title.disableInteractive();
      this.tweens.add({
        targets: title,
        alpha: 0,
        duration: 600,
        onComplete: () => title.destroy(),
      });
    });

    const prompt = this.add
      .text(viewportWidth / 2, viewportHeight / 2 + 68, 'PRESS ENTER', {
        color: '#b6ffe4',
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
      })
      .setOrigin(0.5);

    const startingStage = STAGES[STARTING_STAGE_INDEX];
    const background = startingStage?.background;
    let queued = false;

    if (background && !this.textures.exists(background.key)) {
      this.load.image(background.key, background.path);
      queued = true;
    }
    queued = new StageAssetPreloader(this).preload(startingStage) || queued;
    if (queued && !this.load.isLoading()) {
      this.load.start();
    }

    this.input.keyboard?.once('keydown-ENTER', () => {
      if (this.load.isLoading()) {
        prompt.setText('LOADING...');
        this.load.once('complete', () => this.scene.start('game'));
        return;
      }

      this.scene.start('game');
    });
  }
}
