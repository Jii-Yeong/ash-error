// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
  })) as unknown as HTMLCanvasElement['getContext'];
});

import { CREDITS_COPY } from '@/game/scenes/CreditsScene';

describe('CreditsScene copy', () => {
  it('외부 음원과 효과음 출처 및 라이선스를 표기한다', () => {
    expect(CREDITS_COPY.body).toContain('Google Lyria via Gemini');
    expect(CREDITS_COPY.body).toContain('Kenney');
    expect(CREDITS_COPY.body).toContain('CC0 1.0');
  });

  it('키보드와 클릭으로 돌아가는 방법을 안내한다', () => {
    expect(CREDITS_COPY.skip).toContain('ENTER');
    expect(CREDITS_COPY.skip).toContain('ESC');
    expect(CREDITS_COPY.skip).toContain('CLICK');
  });
});