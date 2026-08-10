/**
 * 레일건이 보스 장갑에 명중했을 때의 타격당 피해를 계산한다.
 *
 * 레일건은 관통 다단 히트라 한 발이 여러 번 적중하므로, 보스별 장갑 배율로
 * 타격당 피해를 줄여 한 발의 총 피해를 맞춘다. 스테이지 2~5 보스가 공유하는
 * 규칙이라 한곳에 둔다(스테이지 1 레이저 보스는 장갑 배율이 없어 제외).
 */
export const getRailArmoredDamage = (
  baseDamage: number,
  railRifleDamageMultiplier: number,
  weaponId?: string,
) =>
  weaponId === 'rail-rifle'
    ? baseDamage * railRifleDamageMultiplier
    : baseDamage;
