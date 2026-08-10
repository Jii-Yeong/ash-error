import Phaser from 'phaser';
import {
  UI_PANEL_SLICE,
  UI_PANEL_TEXTURES,
} from '@/game/config/uiAssetConfig';
import type { WeaponConfig } from '@/game/config/weaponConfig';
import type { Enemy } from '@/game/entities/Enemy';

/** Phaser 캔버스 안의 조준선·적 범위·전투 결과 오버레이를 관리함. */
export class CombatUi {
  private readonly aimGraphics: Phaser.GameObjects.Graphics;
  private readonly enemyRangeGraphics: Phaser.GameObjects.Graphics;
  private readonly deathOverlay: Phaser.GameObjects.Container;
  private readonly victoryOverlay: Phaser.GameObjects.Container;
  private readonly stageEndOverlay: Phaser.GameObjects.Container;
  private readonly weaponEquippedText: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    this.aimGraphics = scene.add.graphics().setDepth(10);
    this.enemyRangeGraphics = scene.add.graphics().setDepth(2);
    this.deathOverlay = this.createOverlay(
      UI_PANEL_TEXTURES.danger.key,
      '#ff7180',
      'SYSTEM FAILURE',
      'PRESS R OR ENTER TO RESTART',
    );
    this.victoryOverlay = this.createOverlay(
      UI_PANEL_TEXTURES.victory.key,
      '#ffe9c4',
      'This Is Not the End.',
      'YOU\'RE AWAKE  //  PRESS R OR ENTER TO REPLAY',
    );
    this.stageEndOverlay = this.createOverlay(
      UI_PANEL_TEXTURES.danger.key,
      '#ff7180',
      'SURROUNDED',
      'SIGNAL LOST  //  PRESS R OR ENTER TO REPLAY',
    );
    this.weaponEquippedText = scene.add
      .text(0, 0, '', {
        color: '#ffffff',
        backgroundColor: '#070a0be8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  destroy() {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  clearAim() {
    this.aimGraphics.clear();
  }

  clearEnemyRanges() {
    this.enemyRangeGraphics.clear();
  }

  clearGuides() {
    this.clearAim();
    this.clearEnemyRanges();
  }

  showDeath() {
    this.deathOverlay.setVisible(true);
  }

  showVictory() {
    this.victoryOverlay.setVisible(true);
  }

  showStageEnd() {
    this.stageEndOverlay.setVisible(true);
  }

  showWeaponEquipped(weapon: WeaponConfig) {
    this.scene.tweens.killTweensOf(this.weaponEquippedText);
    this.weaponEquippedText
      .setText(`EQUIPPED // ${weapon.label}`)
      .setColor(`#${weapon.pickupColor.toString(16).padStart(6, '0')}`)
      .setAlpha(1)
      .setVisible(true);
    this.scene.tweens.add({
      targets: this.weaponEquippedText,
      alpha: 0,
      delay: 850,
      duration: 260,
      onComplete: () => this.weaponEquippedText.setVisible(false),
    });
  }

  /** 포탈이 화면 밖에 있어도 방 클리어를 바로 알 수 있게 알림을 표시한다. */
  showRoomCleared(accentColor: number) {
    const labelColor = `#${accentColor.toString(16).padStart(6, '0')}`;
    const centerX = this.scene.scale.width / 2;
    const centerY = this.scene.scale.height / 2;
    const pulse = this.scene.add
      .circle(centerX, centerY, 22, accentColor, 0)
      .setStrokeStyle(3, accentColor, 0.9)
      .setDepth(30)
      .setScrollFactor(0);
    const label = this.scene.add
      .text(centerX, centerY - 72, 'ROOM CLEARED', {
        color: labelColor,
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        stroke: '#070a0b',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setScrollFactor(0)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: pulse,
      scale: 18,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => pulse.destroy(),
    });
    this.scene.tweens.add({
      targets: label,
      alpha: 1,
      scale: 1.08,
      duration: 150,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 620,
      onComplete: () => label.destroy(),
    });
  }
  drawAimGuide(aimPoint: Phaser.Math.Vector2) {
    // 무기 총구가 발사 방향을 보여주므로 플레이어부터 이어지던 선은 그리지 않음.
    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(1, 0xb6ffe4, 0.75);
    this.aimGraphics.strokeCircle(aimPoint.x, aimPoint.y, 8);
    this.aimGraphics.lineBetween(
      aimPoint.x - 12,
      aimPoint.y,
      aimPoint.x + 12,
      aimPoint.y,
    );
    this.aimGraphics.lineBetween(
      aimPoint.x,
      aimPoint.y - 12,
      aimPoint.x,
      aimPoint.y + 12,
    );
  }

  drawEnemyRange(enemy: Enemy, targetInRange: boolean) {
    this.enemyRangeGraphics.lineStyle(
      targetInRange ? 2 : 1,
      targetInRange ? enemy.aggroIndicatorColor : 0x6d7b80,
      targetInRange ? 0.28 : 0.12,
    );
    this.enemyRangeGraphics.strokeCircle(
      enemy.x,
      enemy.y,
      enemy.aggroRadius,
    );
  }

  private layout() {
    const centerX = this.scene.scale.width / 2;
    const centerY = this.scene.scale.height / 2;
    this.deathOverlay.setPosition(centerX, centerY);
    this.victoryOverlay.setPosition(centerX, centerY);
    this.stageEndOverlay.setPosition(centerX, centerY);
    this.weaponEquippedText.setPosition(
      centerX,
      this.scene.scale.height - 128,
    );
  }

  private createOverlay(
    panelTexture: string,
    titleColor: string,
    titleText: string,
    promptText: string,
  ) {
    const panel = this.scene.add
      .nineslice(
        0,
        0,
        panelTexture,
        undefined,
        470,
        150,
        UI_PANEL_SLICE,
        UI_PANEL_SLICE,
        UI_PANEL_SLICE,
        UI_PANEL_SLICE,
        true,
        true,
      )
      .setOrigin(0.5);
    const title = this.scene.add
      .text(0, -28, titleText, {
        color: titleColor,
        fontFamily: 'Arial, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const prompt = this.scene.add
      .text(0, 34, promptText, {
        color: '#e8ece9',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
      })
      .setOrigin(0.5);

    return this.scene.add
      .container(0, 0, [panel, title, prompt])
      .setDepth(100)
      .setScrollFactor(0)
      .setVisible(false);
  }
}
