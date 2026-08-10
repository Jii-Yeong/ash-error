import type Phaser from 'phaser';

/** `Phaser.Scenes.Events.UPDATE`. 이 헬퍼가 런타임에 Phaser를 끌어오지 않도록
 * 리터럴로 둔다(그래야 순수 유닛 테스트가 jsdom 없이 돈다). */
const SCENE_UPDATE_EVENT = 'update';

/**
 * 씬 UPDATE 이벤트 구독을 대칭적으로 켜고 끄는 작은 도우미.
 *
 * 적이 사망한 뒤 남은 탄환을 스스로 갱신시키려면 씬 UPDATE에 콜백을 붙였다가
 * 탄환이 모두 사라지거나 씬이 파괴될 때 반드시 떼어야 한다. on/off 짝과 중복
 * 구독 방지를 한곳에 모아, 리스너 해제를 빠뜨려 파괴된 대상 위에서 콜백이 도는
 * 일을 막는다. 콜백은 아무 리스너나 아닌 고정된 화살표 필드라 off가 항상 on과
 * 같은 참조를 가리킨다.
 */
export class SceneUpdateLoop {
  private running = false;
  private readonly tick = (time: number) => this.onUpdate(time);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onUpdate: (time: number) => void,
  ) {}

  get isRunning() {
    return this.running;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.scene.events.on(SCENE_UPDATE_EVENT, this.tick);
  }

  stop() {
    if (!this.running) {
      return;
    }
    this.scene.events.off(SCENE_UPDATE_EVENT, this.tick);
    this.running = false;
  }
}
