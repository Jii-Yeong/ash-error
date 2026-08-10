import Phaser from 'phaser';
import { STAGES } from '@/game/config/stageConfig';

export type AdminStageRequest = {
  stageIndex?: number;
  roomIndex?: number;
  immediateEncounter: boolean;
};

export class AdminStageNavigator {
  private pendingRequest: AdminStageRequest = { immediateEncounter: false };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly beforeRestart: () => void,
  ) {}

  requestStage = (stageIndex: number) => {
    if (!this.isValidStage(stageIndex)) {
      return;
    }
    this.pendingRequest = {
      stageIndex,
      roomIndex: 0,
      immediateEncounter: false,
    };
    this.restartToStage(stageIndex);
  };

  requestStageBoss = (stageIndex: number) => {
    if (!this.isValidStage(stageIndex)) {
      return;
    }
    this.pendingRequest = {
      stageIndex,
      roomIndex: STAGES[stageIndex].rooms.length - 1,
      immediateEncounter: true,
    };
    this.restartToStage(stageIndex);
  };

  consumeRequest() {
    const request = this.pendingRequest;
    this.pendingRequest = { immediateEncounter: false };
    return request;
  }

  private isValidStage(stageIndex: number) {
    return Number.isInteger(stageIndex) && Boolean(STAGES[stageIndex]);
  }

  /** 대상 배경을 먼저 준비해 어드민 직행 첫 프레임의 빈 배경을 방지한다. */
  private restartToStage(stageIndex: number) {
    this.beforeRestart();
    const background = STAGES[stageIndex].background;
    if (!background || this.scene.textures.exists(background.key)) {
      this.scene.scene.restart();
      return;
    }

    const completeEvent = `filecomplete-image-${background.key}`;
    const restart = () => {
      this.scene.load.off(completeEvent, restart);
      this.scene.load.off('loaderror', handleError);
      this.scene.scene.restart();
    };
    const handleError = (file: Phaser.Loader.File) => {
      if (file.key === background.key) {
        restart();
      }
    };
    this.scene.load.once(completeEvent, restart);
    this.scene.load.on('loaderror', handleError);
    this.scene.load.image(background.key, background.path);
    this.scene.load.start();
  }
}
