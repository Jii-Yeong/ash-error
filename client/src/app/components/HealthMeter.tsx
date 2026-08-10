import type { BossPhase } from '@/game/state/bossPhase';

type HealthMeterProps = {
  label: string;
  value: number;
  maxValue: number;
  variant: 'player' | 'enemy';
  bossPhase?: BossPhase | null;
  showValue?: boolean;
};

export function HealthMeter({
  label,
  value,
  maxValue,
  variant,
  bossPhase = null,
  showValue = true,
}: HealthMeterProps) {
  const percentage =
    maxValue > 0 ? Math.min(100, Math.max(0, (value / maxValue) * 100)) : 0;
  const accessibleLabel = `${label[0]}${label.slice(1).toLowerCase()}`;

  return (
    <aside
      className={`hud hud--${variant}${
        bossPhase ? ` hud--boss-phase-${bossPhase}` : ''
      }`}
      aria-label={`${accessibleLabel} status`}
      data-boss-phase={bossPhase ?? undefined}
    >
      <span className='hud__label'>
        {bossPhase ? `BOSS // PHASE ${bossPhase}` : label}
      </span>
      <div
        className='hud__meter'
        role='meter'
        aria-label={`${accessibleLabel} health`}
        aria-valuemin={0}
        aria-valuemax={maxValue}
        aria-valuenow={value}
      >
        <span
          className={`hud__meter-fill${
            variant === 'enemy' ? ' hud__meter-fill--enemy' : ''
          }`}
          style={{ width: `${percentage}%` }}
        />
        {bossPhase && <span className='hud__phase-threshold' aria-hidden />}
      </div>
      {showValue && (
        <span className='hud__value'>
          {value}/{maxValue}
        </span>
      )}
    </aside>
  );
}
