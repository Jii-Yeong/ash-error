import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HealthMeter } from '@/app/components/HealthMeter';

describe('HealthMeter', () => {
  it('보스 체력 숫자를 숨겨도 접근성 수치는 유지한다', () => {
    const markup = renderToStaticMarkup(
      <HealthMeter
        label='BOSS'
        value={1200}
        maxValue={2900}
        variant='enemy'
        showValue={false}
      />,
    );

    expect(markup).not.toContain('1200/2900');
    expect(markup).toContain('aria-valuenow="1200"');
    expect(markup).toContain('aria-valuemax="2900"');
  });
});
