import Phaser from 'phaser';
import { gameEvents } from '@/game/events/gameEvents';

export const CREDITS_COPY = {
  title: 'ASH//ERROR',
  subtitle: 'CREDITS',
  body: `MADE BY\nSOOT TEAM\n\nDESIGN · PROGRAMMING · ART\nJii-Yeong\n\nMUSIC\nGenerated with Google Lyria via Gemini\ngemini.google.com\n\nSOUND EFFECTS\nKenney — Sci-Fi Sounds · Impact Sounds · Digital Audio\nkenney.nl — CC0 1.0\n\nBUILT WITH\nPhaser · React · Vite`,
  skip: 'PRESS ENTER / ESC / CLICK TO RETURN',
} as const;

/** 첫 클리어와 타이틀 메뉴에서 공통으로 여는 제작·출처 표기 화면. */
export class CreditsScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super('credits');
  }

  create() {
    gameEvents.emit('scene-changed', 'credits');

    const backdrop = this.add.rectangle(0, 0, 1, 1, 0x060708).setOrigin(0);
    const title = this.add.text(0, 0, CREDITS_COPY.title, {
      color: '#ffe9c4',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    const subtitle = this.add.text(0, 0, CREDITS_COPY.subtitle, {
      color: '#6fd6a6',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    const body = this.add.text(0, 0, CREDITS_COPY.body, {
      align: 'center',
      color: '#d8dfdc',
      fontFamily: 'Arial, sans-serif',
    });
    const skip = this.add.text(0, 0, CREDITS_COPY.skip, {
      color: '#879197',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });

    const layout = () => {
      const { width, height } = this.scale;
      const bodyFontSize = Phaser.Math.Clamp(Math.round(height / 45), 11, 18);

      backdrop.setSize(width, height);
      title
        .setPosition(width / 2, height * 0.12)
        .setOrigin(0.5)
        .setFontSize(Phaser.Math.Clamp(Math.round(height / 18), 26, 44));
      subtitle
        .setPosition(width / 2, height * 0.2)
        .setOrigin(0.5)
        .setFontSize(Phaser.Math.Clamp(Math.round(height / 42), 12, 18));
      body
        .setPosition(width / 2, height * 0.54)
        .setOrigin(0.5)
        .setFontSize(bodyFontSize)
        .setLineSpacing(Math.round(bodyFontSize * 0.28))
        .setWordWrapWidth(Math.min(width * 0.82, 680));
      skip
        .setPosition(width / 2, height * 0.91)
        .setOrigin(0.5)
        .setFontSize(Phaser.Math.Clamp(Math.round(height / 54), 10, 14));
    };

    const returnToTitle = () => {
      if (this.leaving) {
        return;
      }

      this.leaving = true;
      this.scene.start('title');
    };

    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.input.once('pointerdown', returnToTitle);
    this.input.keyboard?.once('keydown-ENTER', returnToTitle);
    this.input.keyboard?.once('keydown-ESC', returnToTitle);
    this.input.keyboard?.once('keydown-SPACE', returnToTitle);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, layout),
    );
  }
}