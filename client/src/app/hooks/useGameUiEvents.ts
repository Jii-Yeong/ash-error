import { useEffect } from 'react';
import { gameEvents } from '@/game/events/gameEvents';
import type { BossPhase } from '@/game/state/bossPhase';
import type { GamePhase } from '@/game/state/gamePhase';
import type { GameSceneKey } from '@/game/state/gameSceneKey';
import type { RoomState } from '@/game/state/roomState';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';
import { useGameUiStore } from '@/stores/gameUiStore';

export function useGameUiEvents() {
  useEffect(() => {
    const handleHealthChanged = (current: number, max: number) => {
      useGameUiStore.getState().setHealth(current, max);
    };
    const handleEnemyHealthChanged = (
      current: number,
      max: number,
      isBoss: boolean,
    ) => {
      useGameUiStore.getState().setEnemyHealth(current, max, isBoss);
    };
    const handleBossPhaseChanged = (bossPhase: BossPhase | null) => {
      useGameUiStore.getState().setBossPhase(bossPhase);
    };
    const handlePhaseChanged = (phase: GamePhase) => {
      useGameUiStore.getState().setPhase(phase);
    };
    const handleSceneChanged = (scene: GameSceneKey) => {
      useGameUiStore.getState().setScene(scene);
    };
    const handleRoomStateChanged = (roomState: RoomState) => {
      useGameUiStore.getState().setRoomState(roomState);
    };
    const handleStageLocationChanged = (
      stageLabel: string,
      roomNumber: number,
    ) => {
      useGameUiStore.getState().setStageLocation(stageLabel, roomNumber);
    };
    const handleWeaponChanged = (id: string, label: string) => {
      useGameUiStore.getState().setWeapon(id, label);
    };
    const handleWeaponInventoryChanged = (
      slots: readonly (string | null)[],
      activeSlotIndex: number,
    ) => {
      useGameUiStore
        .getState()
        .setWeaponInventory(slots, activeSlotIndex);
    };
    const handleNearbyWeaponChanged = (id: string | null) => {
      useGameUiStore.getState().setNearbyWeapon(id);
    };
    const handlePauseChanged = (paused: boolean) => {
      useGameUiStore.getState().setPaused(paused);
    };
    /** Phaser 입력도 씬과 함께 멈추므로, 일시정지 해제용 ESC는 window에서 받는다. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) {
        return;
      }

      const guide = document.getElementById('control-guide');
      if (guide instanceof HTMLDialogElement && guide.open) {
        return;
      }

      event.preventDefault();

      if (useGameSettingsStore.getState().settingsOpen) {
        useGameSettingsStore.getState().closeSettings();
        return;
      }

      gameEvents.emit('pause-toggle-requested');
    };
    window.addEventListener('keydown', handleKeyDown);

    gameEvents.on('health-changed', handleHealthChanged);
    gameEvents.on('enemy-health-changed', handleEnemyHealthChanged);
    gameEvents.on('boss-phase-changed', handleBossPhaseChanged);
    gameEvents.on('phase-changed', handlePhaseChanged);
    gameEvents.on('room-state-changed', handleRoomStateChanged);
    gameEvents.on('stage-location-changed', handleStageLocationChanged);
    gameEvents.on('scene-changed', handleSceneChanged);
    gameEvents.on('weapon-changed', handleWeaponChanged);
    gameEvents.on('weapon-inventory-changed', handleWeaponInventoryChanged);
    gameEvents.on('nearby-weapon-changed', handleNearbyWeaponChanged);
    gameEvents.on('pause-changed', handlePauseChanged);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      gameEvents.off('pause-changed', handlePauseChanged);
      gameEvents.off('health-changed', handleHealthChanged);
      gameEvents.off('enemy-health-changed', handleEnemyHealthChanged);
      gameEvents.off('boss-phase-changed', handleBossPhaseChanged);
      gameEvents.off('phase-changed', handlePhaseChanged);
      gameEvents.off('room-state-changed', handleRoomStateChanged);
      gameEvents.off('stage-location-changed', handleStageLocationChanged);
      gameEvents.off('scene-changed', handleSceneChanged);
      gameEvents.off('weapon-changed', handleWeaponChanged);
      gameEvents.off(
        'weapon-inventory-changed',
        handleWeaponInventoryChanged,
      );
      gameEvents.off('nearby-weapon-changed', handleNearbyWeaponChanged);
    };
  }, []);
}
