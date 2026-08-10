export type ShardPatternLayout = {
  safeLaneIndex: number;
  hazardXPositions: number[];
};

export type InfernalAttack = 'rupture' | 'charge' | 'shards';

/** 1페이즈에서 반복하는 공격 순서. */
export const INFERNAL_PHASE_ONE_SEQUENCE: readonly InfernalAttack[] = [
  'rupture',
  'charge',
];

/** 전환 직후 강제 파편부터 시작하는 2페이즈 공격 순서. */
export const INFERNAL_PHASE_TWO_SEQUENCE: readonly InfernalAttack[] = [
  'shards',
  'rupture',
  'charge',
  'rupture',
  'shards',
  'charge',
];

/** 레일건에만 보스 장갑 배율을 적용함. */
export const getInfernalProjectileDamage = (
  baseDamage: number,
  railRifleDamageMultiplier: number,
  weaponId?: string,
) =>
  weaponId === 'rail-rifle'
    ? baseDamage * railRifleDamageMultiplier
    : baseDamage;

type ShardPatternOptions = {
  arenaLeft: number;
  arenaRight: number;
  playerX: number;
  laneCount?: number;
};

/**
 * Leaves one adjacent, centre-facing lane open and targets every other lane.
 * The player must relocate, but never has to cross more than one lane to find
 * guaranteed safety.
 */
export function getShardPatternLayout({
  arenaLeft,
  arenaRight,
  playerX,
  laneCount = 4,
}: ShardPatternOptions): ShardPatternLayout {
  const laneWidth = (arenaRight - arenaLeft) / laneCount;
  const playerLaneIndex = Math.max(
    0,
    Math.min(
      laneCount - 1,
      Math.floor((playerX - arenaLeft) / laneWidth),
    ),
  );
  const safeLaneIndex =
    playerLaneIndex < laneCount / 2
      ? playerLaneIndex + 1
      : playerLaneIndex - 1;

  return {
    safeLaneIndex,
    hazardXPositions: Array.from({ length: laneCount }, (_, index) => index)
      .filter((index) => index !== safeLaneIndex)
      .map((index) => arenaLeft + laneWidth * (index + 0.5)),
  };
}

/** Applies the exposed-core multiplier while keeping health values integral. */
export function getInfernalBossDamage(
  baseDamage: number,
  coreDamageMultiplier: number,
  coreExposed: boolean,
) {
  return Math.round(
    baseDamage * (coreExposed ? coreDamageMultiplier : 1),
  );
}
