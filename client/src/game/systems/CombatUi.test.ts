// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { CombatUi } from '@/game/systems/CombatUi';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

describe('CombatUi', () => {
  it('recentres fixed UI after the viewport resizes', () => {
    const overlays = Array.from({ length: 3 }, () => ({
      setPosition: vi.fn(),
    }));
    const weaponEquippedText = { setPosition: vi.fn() };
    const combatUi = Object.assign(Object.create(CombatUi.prototype), {
      scene: { scale: { width: 1600, height: 900 } },
      deathOverlay: overlays[0],
      victoryOverlay: overlays[1],
      stageEndOverlay: overlays[2],
      weaponEquippedText,
    }) as CombatUi;

    (combatUi as unknown as { layout(): void }).layout();

    for (const overlay of overlays) {
      expect(overlay.setPosition).toHaveBeenCalledWith(800, 450);
    }
    expect(weaponEquippedText.setPosition).toHaveBeenCalledWith(800, 772);
  });
});
