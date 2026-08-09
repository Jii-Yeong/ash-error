import Phaser from 'phaser';
import type { BossPhase } from '@/game/state/bossPhase';
import type { GamePhase } from '@/game/state/gamePhase';
import type { GameSceneKey } from '@/game/state/gameSceneKey';
import type { RoomState } from '@/game/state/roomState';
import type {
  AudioMix,
  StageFiveBossCue,
  StageFourBossCue,
  StageThreeBossCue,
} from '@/game/config/audioConfig';

/**
 * State events describe what the world *is* and drive the React HUD. Cue events
 * describe what just *happened* and carry the origin point, so audio, particles
 * and camera effects can subscribe without gameplay code knowing they exist.
 *
 * These names are a cross-developer contract — rename only by agreement.
 */
type GameEventMap = {
  'health-changed': [current: number, max: number];
  'enemy-health-changed': [
    current: number,
    max: number,
    isBoss: boolean,
  ];
  'boss-phase-changed': [phase: BossPhase | null];
  'phase-changed': [phase: GamePhase];
  'room-state-changed': [state: RoomState];
  'scene-changed': [scene: GameSceneKey];
  'stage-changed': [stageId: string];
  'stage-location-changed': [stageLabel: string, roomNumber: number];
  'admin-stage-requested': [stageIndex: number];
  'admin-stage-boss-requested': [stageIndex: number];
  'admin-weapon-requested': [weaponId: string];
  /**
   * Asked for by the UI, answered by the scene. Split in two because the scene
   * is the only thing that knows whether pausing is allowed right now, and a UI
   * that flipped its own flag would drift out of step the first time it was not.
   */
  'pause-toggle-requested': [];
  'pause-changed': [paused: boolean];
  'audio-mix-changed': [mix: AudioMix];
  'weapon-fired': [weaponId: string, x: number, y: number];
  'player-damaged': [x: number, y: number];
  'player-dashed': [x: number, y: number];
  'player-stepped': [];
  'enemy-damaged': [x: number, y: number];
  'enemy-projectile-blocked': [kind: 'shield' | 'boss'];
  'enemy-defeated': [x: number, y: number];
  'boss-laser-fired': [
    cue: 'single' | 'double-first' | 'double-second',
  ];
  'boss-scan-cue': [cue: 'start' | 'target-lock' | 'end'];
  'boss-orb-fired': [];
  /**
   * One event per stage-3-to-5 boss, carrying the pattern moment rather than a
   * sound. The unions come from the cue maps in audioConfig, so a boss cannot
   * emit a moment that has no cue behind it.
   */
  'boss-purifier-cue': [cue: StageThreeBossCue];
  'boss-infernal-cue': [cue: StageFourBossCue];
  'boss-architect-cue': [cue: StageFiveBossCue];
  'weapon-changed': [id: string, label: string];
  'weapon-inventory-changed': [
    slots: readonly (string | null)[],
    activeSlotIndex: number,
  ];
  'nearby-weapon-changed': [id: string | null];
};

type GameEventName = keyof GameEventMap;
type GameEventListener<Event extends GameEventName> = (
  ...args: GameEventMap[Event]
) => void;

class GameEventBus {
  private readonly emitter = new Phaser.Events.EventEmitter();

  emit<Event extends GameEventName>(
    event: Event,
    ...args: GameEventMap[Event]
  ) {
    return this.emitter.emit(event, ...args);
  }

  on<Event extends GameEventName>(
    event: Event,
    listener: GameEventListener<Event>,
  ) {
    this.emitter.on(event, listener);
    return this;
  }

  off<Event extends GameEventName>(
    event: Event,
    listener: GameEventListener<Event>,
  ) {
    this.emitter.off(event, listener);
    return this;
  }
}

export const gameEvents = new GameEventBus();
