import Phaser from 'phaser';
import { resolveAudioAssets } from '@/game/config/audioAssets';
import {
  DEFERRED_SFX_KEYS,
  MUSIC_CONFIG,
} from '@/game/config/audioConfig';
import {
  BOSS_ANIMATION_ATLASES,
  STAGE_FIVE_BOSS_ATLAS_KEY,
  STAGE_FOUR_MAGMA_RUPTURE_FIRE_PILLAR,
  STAGE_FOUR_MAGMA_RUPTURE_WARNING,
  STAGE_FOUR_MAGMA_SHARD,
  STAGE_FOUR_MAGMA_SHARD_IMPACT,
  STAGE_ONE_BOSS_LASER_ASSETS,
  STAGE_ONE_BOSS_WEAPON_ASSETS,
  STAGE_TWO_BOSS_ENERGY_ORB,
  STAGE_TWO_BOSS_HEAD,
  STAGE_TWO_BOSS_SEARCHLIGHT,
  STAGE_THREE_BOSS_SHOCKWAVE,
} from '@/game/config/bossAnimationConfig';
import { BOSS_COMBAT_CONFIGS } from '@/game/config/bossConfig';
import {
  STAGE_THREE_CEILING_MAINTAINER_BOMB,
  STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT,
} from '@/game/config/ceilingMaintainerAnimationConfig';
import { STAGE_THREE_CAPTOR_TETHER } from '@/game/config/captorAnimationConfig';
import { MELEE_SWING_EFFECT } from '@/game/config/meleeEnemyAnimationConfig';
import {
  JUDGMENT_EYE_ORB,
  JUDGMENT_EYE_RETICLE,
} from '@/game/config/stageFourEnemyConfig';
import {
  PLAYER_IDLE_FRAMES,
  PLAYER_RUN_FRAMES,
  PLAYER_SPRITE_CONFIG,
  STAGE_FIVE_PLAYER_HALO,
  STAGE_FIVE_PLAYER_SPRITE,
  STAGE_FOUR_PLAYER_SPRITE,
  STAGE_ONE_TWO_PLAYER_SPRITE,
  STAGE_THREE_PLAYER_SPRITE,
} from '@/game/config/playerAnimationConfig';
import { BACK_ARM, FRONT_ARM } from '@/game/config/playerRigConfig';
import {
  ROOM_PORTAL_ANIMATION,
  ROOM_PORTAL_TEXTURE,
} from '@/game/config/portalConfig';
import { UI_PANEL_TEXTURES } from '@/game/config/uiAssetConfig';
import { WEAPON_CONFIGS } from '@/game/config/weaponConfig';
import { createAtlasAnimations } from '@/game/systems/createAtlasAnimations';

const PLAYER_SPRITES = [
  PLAYER_SPRITE_CONFIG,
  STAGE_ONE_TWO_PLAYER_SPRITE,
  STAGE_THREE_PLAYER_SPRITE,
  STAGE_FOUR_PLAYER_SPRITE,
  STAGE_FIVE_PLAYER_SPRITE,
];

const CELESTIAL_PROJECTILE_COLORS = {
  shadow: 0x123f3a,
  midtone: 0x58d6b3,
  highlight: 0xd8fff4,
  orbHighlight: 0xffe38a,
} as const;

const BOSS_PROJECTILE_TONES = {
  shadow: 0x999999,
  midtone: 0xeeeeee,
  highlight: 0xffffff,
} as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    for (const sprite of PLAYER_SPRITES) {
      this.load.atlas(sprite.texture, sprite.png, sprite.json);
    }
    for (const atlas of BOSS_ANIMATION_ATLASES) {
      this.load.atlas(atlas.texture, atlas.png, atlas.json);
    }
    this.load.image(MELEE_SWING_EFFECT.texture, MELEE_SWING_EFFECT.png);
    this.load.image(
      STAGE_THREE_CEILING_MAINTAINER_BOMB.texture,
      STAGE_THREE_CEILING_MAINTAINER_BOMB.png,
    );
    this.load.image(
      STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT.texture,
      STAGE_THREE_CEILING_MAINTAINER_BOMB_IMPACT.png,
    );
    this.load.image(
      STAGE_THREE_CAPTOR_TETHER.line.texture,
      STAGE_THREE_CAPTOR_TETHER.line.png,
    );
    this.load.image(
      STAGE_THREE_CAPTOR_TETHER.claw.texture,
      STAGE_THREE_CAPTOR_TETHER.claw.png,
    );
    for (const asset of Object.values(STAGE_ONE_BOSS_WEAPON_ASSETS)) {
      this.load.image(asset.key, asset.url);
    }
    this.load.image(
      STAGE_TWO_BOSS_ENERGY_ORB.texture,
      STAGE_TWO_BOSS_ENERGY_ORB.png,
    );
    this.load.image(STAGE_TWO_BOSS_HEAD.texture, STAGE_TWO_BOSS_HEAD.png);
    this.load.image(
      STAGE_TWO_BOSS_SEARCHLIGHT.texture,
      STAGE_TWO_BOSS_SEARCHLIGHT.png,
    );
    this.load.image(
      STAGE_THREE_BOSS_SHOCKWAVE.texture,
      STAGE_THREE_BOSS_SHOCKWAVE.png,
    );
    this.load.image(
      STAGE_FOUR_MAGMA_SHARD.texture,
      STAGE_FOUR_MAGMA_SHARD.png,
    );
    this.load.image(
      STAGE_FOUR_MAGMA_SHARD_IMPACT.texture,
      STAGE_FOUR_MAGMA_SHARD_IMPACT.png,
    );
    this.load.image(
      STAGE_FOUR_MAGMA_RUPTURE_WARNING.texture,
      STAGE_FOUR_MAGMA_RUPTURE_WARNING.png,
    );
    this.load.image(
      STAGE_FOUR_MAGMA_RUPTURE_FIRE_PILLAR.texture,
      STAGE_FOUR_MAGMA_RUPTURE_FIRE_PILLAR.png,
    );
    this.load.image(JUDGMENT_EYE_RETICLE.texture, JUDGMENT_EYE_RETICLE.png);
    this.load.image(JUDGMENT_EYE_ORB.texture, JUDGMENT_EYE_ORB.png);
    for (const asset of Object.values(STAGE_ONE_BOSS_LASER_ASSETS)) {
      this.load.image(asset.key, asset.url);
    }
    // Four small PNGs, a kilobyte each. They load with the boot batch rather
    // than in the background because the player is holding one the instant the
    // stage starts.
    for (const weapon of WEAPON_CONFIGS) {
      this.load.image(weapon.displayTexture, `/assets/weapons/${weapon.id}.png`);
    }
    for (const panel of Object.values(UI_PANEL_TEXTURES)) {
      this.load.image(panel.key, panel.path);
    }
    this.load.spritesheet(ROOM_PORTAL_TEXTURE.key, ROOM_PORTAL_TEXTURE.path, {
      frameWidth: ROOM_PORTAL_TEXTURE.frameWidth,
      frameHeight: ROOM_PORTAL_TEXTURE.frameHeight,
    });
    this.load.image(BACK_ARM.texture, BACK_ARM.url);
    this.load.image(FRONT_ARM.texture, FRONT_ARM.url);
    this.load.spritesheet(
      STAGE_FIVE_PLAYER_HALO.texture,
      STAGE_FIVE_PLAYER_HALO.png,
      {
        frameWidth: STAGE_FIVE_PLAYER_HALO.frameWidth,
        frameHeight: STAGE_FIVE_PLAYER_HALO.frameHeight,
        spacing: STAGE_FIVE_PLAYER_HALO.spacing,
      },
    );

    const { assets, missingKeys, unusedFiles } = resolveAudioAssets();

    for (const asset of assets) {
      // 타이틀 곡은 후반 스테이지용 선택 자원이 아니라 타이틀 화면의 일부이므로,
      // 타이틀 진입 즉시 재생을 시도할 수 있도록 미리 불러온다. 나머지 음악은
      // AudioDirector에서 지연 로드해 초기 다운로드를 첫 화면과 작은 효과음으로 제한한다.
      if (asset.key in MUSIC_CONFIG && asset.key !== 'bgm-title') {
        continue;
      }

      // 스테이지 전용 효과음도 같은 이유로 미룬다. 여기 남는 것은 어느
      // 스테이지에서도 나는 공용 큐뿐이다 — 무기, 피격, 방 잠금 같은 것들.
      if (DEFERRED_SFX_KEYS.has(asset.key)) {
        continue;
      }

      this.load.audio(asset.key, asset.url);
    }

    this.reportAudioGaps(missingKeys, unusedFiles);
  }

  create() {
    this.createRuntimeTextures();
    this.createAnimations();
    this.scene.start('start');
  }

  /**
   * Sound files arrive one at a time and a cue without a file simply stays
   * quiet, so the run always plays end to end. This reports what is still
   * open: cues with no sound, and files whose name matched no cue.
   */
  private reportAudioGaps(missingKeys: string[], unusedFiles: string[]) {
    if (!import.meta.env.DEV) {
      return;
    }

    if (missingKeys.length > 0) {
      console.warn(
        `[audio] ${missingKeys.length} cue(s) still have no file: ${missingKeys.join(', ')}`,
      );
    }

    if (unusedFiles.length > 0) {
      console.warn(
        `[audio] file(s) matched no cue, check the name: ${unusedFiles.join(', ')}`,
      );
    }
  }

  private createRuntimeTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);

    // One round per weapon, drawn from that weapon's own identity colour. The
    // four weapons used to share three textures, so an SMG burst and a burst
    // rifle volley were indistinguishable in flight.
    for (const weapon of WEAPON_CONFIGS) {
      const { color, tipColor, length, thickness, round } = weapon.projectile;
      graphics.clear();
      if (round) {
        const radius = thickness / 2;
        graphics.fillStyle(color);
        graphics.fillCircle(radius, radius, radius);
        // Lit on the leading side, so a pellet still reads as travelling.
        graphics.fillStyle(tipColor);
        graphics.fillCircle(radius + radius * 0.35, radius, radius * 0.45);
      } else {
        graphics.fillStyle(color);
        graphics.fillRect(0, 0, length, thickness);
        graphics.fillStyle(tipColor);
        graphics.fillRect(length - Math.ceil(length * 0.3), 0, Math.ceil(length * 0.3), thickness);
      }
      graphics.generateTexture(
        weapon.texture,
        round ? thickness : length,
        thickness,
      );
    }

    graphics.clear();
    graphics.fillStyle(0xe45d68);
    graphics.fillRect(0, 0, 38, 52);
    graphics.fillStyle(0x621f2a);
    graphics.fillRect(5, 7, 28, 9);
    graphics.fillStyle(0xffd4d7);
    graphics.fillRect(8, 10, 22, 3);
    graphics.fillStyle(0x9f3544);
    graphics.fillRect(30, 24, 14, 7);
    graphics.generateTexture('enemy-placeholder', 44, 52);

    graphics.clear();
    graphics.fillStyle(0xf08b52);
    graphics.fillRect(0, 8, 48, 44);
    graphics.fillStyle(0x6b2c20);
    graphics.fillRect(5, 14, 38, 11);
    graphics.fillStyle(0xffd29f);
    graphics.fillTriangle(8, 14, 16, 2, 20, 14);
    graphics.fillTriangle(28, 14, 32, 2, 40, 14);
    graphics.fillStyle(0xffe0ba);
    graphics.fillRect(9, 18, 30, 3);
    graphics.generateTexture('melee-enemy-placeholder', 48, 52);

    graphics.clear();
    graphics.fillStyle(0xff5263);
    graphics.fillRect(0, 0, 14, 5);
    graphics.fillStyle(0xffd0d5);
    graphics.fillRect(0, 1, 4, 3);
    graphics.generateTexture('enemy-bullet-placeholder', 14, 5);

    graphics.clear();
    graphics.fillStyle(0x6a4bb0);
    graphics.fillEllipse(24, 20, 44, 20);
    graphics.fillStyle(0xb884ff);
    graphics.fillCircle(24, 14, 9);
    graphics.fillStyle(0x2c1f4d);
    graphics.fillRect(4, 18, 40, 4);
    graphics.generateTexture('flying-enemy-placeholder', 48, 40);

    // 4스테이지 사냥개: 악마의 붉은 균열 사이로 민트색 회로가 노출됨.
    graphics.clear();
    graphics.fillStyle(0x160d10);
    graphics.fillEllipse(42, 27, 70, 34);
    graphics.fillTriangle(10, 25, 2, 42, 24, 34);
    graphics.fillTriangle(65, 20, 82, 9, 76, 33);
    graphics.fillStyle(0xd12632);
    graphics.fillRect(24, 22, 34, 4);
    graphics.fillStyle(0x8fffe0);
    graphics.fillRect(36, 21, 12, 2);
    graphics.fillCircle(68, 20, 3);
    graphics.fillStyle(0x312027);
    graphics.fillRect(14, 35, 10, 13);
    graphics.fillRect(58, 35, 10, 13);
    graphics.generateTexture('infernal-hound-placeholder', 84, 48);

    // 처형인형: 찢어진 금속 날개와 뿔 아래 산업용 관절이 남아 있음.
    graphics.clear();
    graphics.fillStyle(0x191116);
    graphics.fillTriangle(20, 34, 0, 52, 22, 70);
    graphics.fillTriangle(52, 34, 72, 52, 50, 70);
    graphics.fillRoundedRect(20, 20, 32, 68, 8);
    graphics.fillTriangle(22, 23, 18, 3, 30, 20);
    graphics.fillTriangle(50, 23, 54, 3, 42, 20);
    graphics.fillStyle(0xc72b36);
    graphics.fillRect(27, 30, 18, 34);
    graphics.fillStyle(0x8fffe0);
    graphics.fillRect(33, 33, 6, 22);
    graphics.fillCircle(36, 26, 3);
    graphics.fillStyle(0x34383b);
    graphics.fillRect(22, 82, 11, 14);
    graphics.fillRect(41, 82, 11, 14);
    graphics.generateTexture('executioner-doll-placeholder', 72, 96);

    // 심판의 눈: 검붉은 후광 안쪽에 카메라 렌즈와 정비 회로가 보임.
    graphics.clear();
    graphics.lineStyle(7, 0x53131b, 0.95);
    graphics.strokeCircle(36, 36, 27);
    graphics.fillStyle(0x171116);
    graphics.fillCircle(36, 36, 23);
    graphics.fillStyle(0xc92b39);
    graphics.fillEllipse(36, 36, 34, 16);
    graphics.fillStyle(0x07090a);
    graphics.fillCircle(36, 36, 8);
    graphics.fillStyle(0x8fffe0);
    graphics.fillCircle(36, 36, 3);
    graphics.fillRect(14, 15, 12, 2);
    graphics.fillRect(47, 55, 11, 2);
    graphics.generateTexture('judgment-eye-placeholder', 72, 72);

    // 성가의 소형 서포터: 작은 날개와 밝아지는 후광을 가진 천사 드론.
    graphics.clear();
    graphics.lineStyle(4, 0xffeaa1, 0.95);
    graphics.strokeCircle(28, 24, 20);
    graphics.fillStyle(0xe9edf0);
    graphics.fillCircle(28, 28, 15);
    graphics.fillTriangle(14, 28, 0, 18, 7, 38);
    graphics.fillTriangle(42, 28, 56, 18, 49, 38);
    graphics.fillStyle(0x8fffe0);
    graphics.fillCircle(28, 28, 5);
    graphics.fillStyle(0x88959b);
    graphics.fillRect(24, 42, 8, 10);
    graphics.generateTexture('choir-supporter-placeholder', 56, 54);

    // 성역의 집행자: 창 발사기와 금속 날개를 단 중형 안드로이드.
    graphics.clear();
    graphics.fillStyle(0xd7dde0);
    graphics.fillRoundedRect(18, 8, 36, 68, 7);
    graphics.fillTriangle(18, 20, 0, 34, 18, 48);
    graphics.fillTriangle(54, 20, 72, 34, 54, 48);
    graphics.fillStyle(0xffd66f);
    graphics.fillRect(25, 19, 22, 8);
    graphics.fillStyle(0x69767c);
    graphics.fillRect(4, 38, 52, 8);
    graphics.fillStyle(0x8fffe0);
    graphics.fillRect(31, 32, 10, 26);
    graphics.generateTexture('sanctum-enforcer-placeholder', 72, 84);

    // 천계의 오라클: 후광과 성서 조각이 둘러싼 대형 카메라 코어.
    graphics.clear();
    graphics.lineStyle(7, 0xffe59a, 0.9);
    graphics.strokeCircle(48, 48, 40);
    graphics.fillStyle(0xf0f2ee);
    graphics.fillCircle(48, 48, 30);
    graphics.fillStyle(0x3a4248);
    graphics.fillEllipse(48, 48, 42, 20);
    graphics.fillStyle(0x8fffe0);
    graphics.fillCircle(48, 48, 7);
    graphics.fillStyle(0xfff1b8);
    graphics.fillRect(0, 23, 18, 28);
    graphics.fillRect(78, 45, 18, 28);
    graphics.generateTexture('celestial-oracle-placeholder', 96, 96);

    graphics.clear();
    graphics.fillStyle(CELESTIAL_PROJECTILE_COLORS.shadow);
    graphics.fillCircle(6, 6, 6);
    graphics.fillStyle(CELESTIAL_PROJECTILE_COLORS.midtone);
    graphics.fillCircle(6, 6, 4);
    graphics.fillStyle(CELESTIAL_PROJECTILE_COLORS.orbHighlight);
    graphics.fillCircle(5, 5, 2);
    graphics.generateTexture('celestial-bullet-placeholder', 12, 12);

    graphics.clear();
    graphics.fillStyle(CELESTIAL_PROJECTILE_COLORS.shadow);
    graphics.fillTriangle(0, 4, 25, 0, 25, 8);
    graphics.fillStyle(CELESTIAL_PROJECTILE_COLORS.midtone);
    graphics.fillTriangle(3, 4, 24, 1, 24, 7);
    graphics.fillStyle(CELESTIAL_PROJECTILE_COLORS.highlight);
    graphics.fillRect(8, 3, 22, 2);
    graphics.generateTexture('celestial-spear-placeholder', 30, 8);

    graphics.clear();
    graphics.fillStyle(0x6f0713);
    graphics.fillCircle(5, 5, 5);
    graphics.fillStyle(0xff5b65);
    graphics.fillCircle(5, 5, 2);
    graphics.generateTexture('judgment-eye-bullet-placeholder', 10, 10);

    graphics.clear();
    graphics.fillStyle(0xb884ff);
    graphics.fillCircle(5, 5, 5);
    graphics.fillStyle(0xe6d6ff);
    graphics.fillCircle(5, 5, 2);
    graphics.generateTexture('flying-enemy-bullet-placeholder', 10, 10);

    graphics.clear();
    graphics.fillStyle(BOSS_PROJECTILE_TONES.shadow);
    graphics.fillCircle(7, 7, 7);
    graphics.fillStyle(BOSS_PROJECTILE_TONES.midtone);
    graphics.fillCircle(7, 7, 6);
    graphics.fillStyle(BOSS_PROJECTILE_TONES.highlight);
    graphics.fillCircle(6, 5, 2);
    graphics.generateTexture('architect-bullet-placeholder', 14, 14);

    const createBossPlaceholder = (
      key: string,
      bodyColor: number,
      accentColor: number,
    ) => {
      graphics.clear();
      graphics.fillStyle(0x111719);
      graphics.fillRect(8, 18, 80, 78);
      graphics.fillStyle(bodyColor);
      graphics.fillRect(13, 23, 70, 66);
      graphics.fillStyle(0x070a0b);
      graphics.fillRect(23, 35, 50, 18);
      graphics.fillStyle(accentColor);
      graphics.fillRect(28, 40, 40, 7);
      graphics.fillTriangle(8, 31, 8, 70, 0, 55);
      graphics.fillTriangle(88, 31, 88, 70, 96, 55);
      graphics.fillStyle(0xdbe8ec);
      graphics.fillRect(18, 89, 22, 15);
      graphics.fillRect(56, 89, 22, 15);
      graphics.generateTexture(key, 96, 104);
    };

    for (const config of Object.values(BOSS_COMBAT_CONFIGS)) {
      // 실제 아틀라스 키에는 placeholder를 만들지 않아 지연 로더가 캐시로
      // 오인하지 않게 함. 아직 없는 텍스처는 로드 완료 후 현재 보스가 갱신함.
      if (
        this.textures.exists(config.texture) ||
        config.texture === STAGE_FIVE_BOSS_ATLAS_KEY
      ) {
        continue;
      }
      createBossPlaceholder(
        config.texture,
        config.placeholder.bodyColor,
        config.placeholder.accentColor,
      );
    }

    graphics.clear();
    graphics.fillStyle(0x202629);
    graphics.fillRect(0, 0, 64, 64);
    graphics.lineStyle(2, 0x445056);
    graphics.strokeRect(0, 0, 64, 64);
    graphics.generateTexture('floor-placeholder', 64, 64);

    graphics.destroy();
  }

  private createAnimations() {
    this.anims.create({
      key: ROOM_PORTAL_ANIMATION.key,
      frames: this.anims.generateFrameNumbers(ROOM_PORTAL_TEXTURE.key, {
        start: 0,
        end: ROOM_PORTAL_TEXTURE.frameCount - 1,
      }),
      frameRate: ROOM_PORTAL_ANIMATION.frameRate,
      repeat: -1,
    });
    for (const sprite of PLAYER_SPRITES) {
      this.anims.create({
        key: sprite.animations.idle,
        frames: PLAYER_IDLE_FRAMES.map((frame) => ({
          key: sprite.texture,
          frame,
        })),
        duration: 1500,
        repeat: -1,
      });
      this.anims.create({
        key: sprite.animations.run,
        frames: PLAYER_RUN_FRAMES.map((frame) => ({
          key: sprite.texture,
          frame,
        })),
        duration: 480,
        repeat: -1,
      });
      if (sprite.flyFrames) {
        this.anims.create({
          key: sprite.animations.flyIdle,
          frames: sprite.flyFrames.map((frame) => ({
            key: sprite.texture,
            frame,
          })),
          duration: 200,
          repeat: -1,
        });
      }
      if (sprite.deathFrames) {
        this.anims.create({
          key: sprite.animations.death,
          frames: sprite.deathFrames.map((frame) => ({
            key: sprite.texture,
            frame,
          })),
          duration: 400,
        });
      }
      if (sprite.aliveFrames) {
        this.anims.create({
          key: sprite.animations.alive,
          frames: sprite.aliveFrames.map((frame) => ({
            key: sprite.texture,
            frame,
          })),
          duration: 1200,
        });
      }
    }
    this.anims.create({
      key: STAGE_FIVE_PLAYER_HALO.animation,
      frames: this.anims.generateFrameNumbers(
        STAGE_FIVE_PLAYER_HALO.texture,
        { start: 0, end: STAGE_FIVE_PLAYER_HALO.frameCount - 1 },
      ),
      duration: 400,
      repeat: -1,
    });
    for (const atlas of BOSS_ANIMATION_ATLASES) {
      createAtlasAnimations(this.anims, atlas);
    }
  }
}
