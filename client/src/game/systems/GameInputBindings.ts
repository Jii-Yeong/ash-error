import Phaser from 'phaser';
import { gameEvents } from '@/game/events/gameEvents';

export function bindGameInput(
  scene: Phaser.Scene,
  handlers: {
    context: object;
    equip: () => void;
    pointerDown: (pointer: Phaser.Input.Pointer) => void;
    restart: () => void;
    enterPortal: () => void;
    selectWeaponSlot: (event: KeyboardEvent) => void;
    requestStage: (stageIndex: number) => void;
    requestStageBoss: (stageIndex: number) => void;
    requestWeapon: (weaponId: string) => void;
    togglePause: () => void;
    postUpdate: (time: number, delta: number) => void;
  },
) {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    throw new Error('Keyboard input is required for weapon pickup');
  }

  const equipKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  equipKey.on('down', handlers.equip, handlers.context);
  scene.input.on('pointerdown', handlers.pointerDown, handlers.context);
  keyboard.on('keydown-R', handlers.restart, handlers.context);
  keyboard.on('keydown-ENTER', handlers.restart, handlers.context);
  keyboard.on('keydown-UP', handlers.enterPortal, handlers.context);
  keyboard.on('keydown-W', handlers.enterPortal, handlers.context);
  keyboard.on('keydown', handlers.selectWeaponSlot, handlers.context);
  gameEvents.on('admin-stage-requested', handlers.requestStage);
  gameEvents.on('admin-stage-boss-requested', handlers.requestStageBoss);
  gameEvents.on('admin-weapon-requested', handlers.requestWeapon);
  gameEvents.on('pause-toggle-requested', handlers.togglePause);
  scene.events.on(
    Phaser.Scenes.Events.POST_UPDATE,
    handlers.postUpdate,
    handlers.context,
  );

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    // Scene 재시작 시 같은 emitter에 입력 리스너가 누적되지 않게 모두 해제한다.
    scene.events.off(
      Phaser.Scenes.Events.POST_UPDATE,
      handlers.postUpdate,
      handlers.context,
    );
    scene.input.off('pointerdown', handlers.pointerDown, handlers.context);
    keyboard.off('keydown-R', handlers.restart, handlers.context);
    keyboard.off('keydown-ENTER', handlers.restart, handlers.context);
    keyboard.off('keydown-UP', handlers.enterPortal, handlers.context);
    keyboard.off('keydown-W', handlers.enterPortal, handlers.context);
    keyboard.off('keydown', handlers.selectWeaponSlot, handlers.context);
    equipKey.off('down', handlers.equip, handlers.context);
    gameEvents.off('admin-stage-requested', handlers.requestStage);
    gameEvents.off('admin-stage-boss-requested', handlers.requestStageBoss);
    gameEvents.off('admin-weapon-requested', handlers.requestWeapon);
    gameEvents.off('pause-toggle-requested', handlers.togglePause);
  });
}
