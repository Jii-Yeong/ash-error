/**
 * 레벨 지형용 수평 3-slice 스킨: 왼쪽 캡, 타일링되는 중앙, 그리고 임의
 * 길이에 맞춰지는 오른쪽 캡. 바닥과 발판('stool')은 각각 자신만의
 * 스테이지별 스킨을 제공할 수 있음. 물리는 기존 바디에 그대로 유지되며,
 * 이것들은 순수하게 시각적 오버레이임.
 */
export type SliceImage = {
  key: string;
  path: string;
  width: number;
};

export type SliceSkinConfig = {
  left: SliceImage;
  middle: SliceImage;
  right: SliceImage;
  /** 전체 이미지 높이(px). */
  height: number;
  /** 그려지는 표면 위쪽의 투명 여백. 발판 상단에 정확히 맞도록. */
  surfaceInset: number;
  /**
   * 중앙이 길이를 채우는 방식. 'stretch'는 한 장을 전체 길이에 늘림
   * (반복 이음새 없음 — 짧은 발판에 적합). 'tile'은 원본 크기로 반복함
   * (긴 바닥에서 선명). 기본값은 'stretch'.
   */
  middleFit?: 'tile' | 'stretch';
  /**
   * 타일링 전에 중앙 양쪽에서 잘라낼 열(column). 반복이 비쳐 보이는 틈이나
   * 박혀 있는 가장자리 선 없이 맞물리게 함. 타일링에서만 사용.
   */
  middleTrim?: { left: number; right: number };
  /**
   * 설정 시 중앙을 캡 '위'에 그리되 양쪽 바깥 끝에서 이 픽셀만큼 안으로
   * 들여서 그림 — 캡의 마감된 끝은 여전히 보이지만 안쪽 접합부는 연속된
   * 중앙 아래에 가려짐(이음새 없음). 생략하면 대신 전체 너비 중앙 위에
   * 캡을 올림.
   */
  capInset?: { left: number; right: number };
};

const asset = (name: string, width: number): SliceImage => ({
  key: name,
  path: `/assets/terrain/${name}.png`,
  width,
});

export const STAGE_ONE_FLOOR_SKIN: SliceSkinConfig = {
  left: asset('stage-1-floor-left', 309),
  middle: asset('stage-1-floor-middle', 296),
  right: asset('stage-1-floor-right', 230),
  height: 100,
  surfaceInset: 4,
  // 넓은 바닥: 원본 크기로 타일링(stretch면 스테이지 전체에 뭉개짐).
  // 중앙은 x[8,272]만 수평으로 균일함. 양옆 가장자리에는 이음새로 반복될
  // 장식 테두리가 있어, 평평한 내부만 남기고 잘라냄.
  middleFit: 'tile',
  middleTrim: { left: 8, right: 23 },
  // 캡의 안쪽 접합부 위에 중앙을 그림(왼쪽 캡은 ~x304에 어두운 안쪽
  // 가장자리가 있음). 캡의 마감된 바깥 끝만 보이게 함.
  capInset: { left: 36, right: 34 },
};

export const STAGE_TWO_FLOOR_SKIN: SliceSkinConfig = {
  left: asset('stage-2-floor-left', 173),
  middle: asset('stage-2-floor-middle', 169),
  right: asset('stage-2-floor-right', 158),
  height: 100,
  surfaceInset: 4,
  // 중앙은 x[16,152]만 수평으로 균일함. x8과 x160의 어두운 가장자리 선이
  // 이음새로 반복되므로, 평평한 내부만 남기고 잘라내 타일링함.
  middleFit: 'tile',
  middleTrim: { left: 16, right: 16 },
  // 캡의 안쪽 접합부 위에 중앙을 그림. 캡의 마감된 끝만 보이게 함.
  capInset: { left: 40, right: 34 },
};

export const STAGE_THREE_FLOOR_SKIN: SliceSkinConfig = {
  left: asset('stage-3-floor-left', 107),
  middle: asset('stage-3-floor-middle', 184),
  right: asset('stage-3-floor-right', 107),
  height: 100,
  // 불투명 표면이 원본 y=3에서 시작함.
  surfaceInset: 3,
  middleFit: 'tile',
  // 중앙 양끝의 수직 테두리를 반복하지 않고 내부 판만 이어 붙임.
  middleTrim: { left: 8, right: 8 },
  // 원본 캡 전체를 보존하는 정규 3-slice 배치.
  capInset: { left: 107, right: 107 },
};

export const STAGE_FOUR_FLOOR_SKIN: SliceSkinConfig = {
  left: asset('stage-4-floor-left', 120),
  middle: asset('stage-4-floor-middle', 137),
  right: asset('stage-4-floor-right', 155),
  height: 100,
  // 불투명 바닥 표면이 원본 y=3에서 시작함.
  surfaceInset: 3,
  middleFit: 'tile',
  // 양끝의 비스듬한 외곽선을 보존하고 중앙만 반복함.
  capInset: { left: 120, right: 155 },
};

export const STAGE_ONE_STOOL_SKIN: SliceSkinConfig = {
  left: asset('stage-1-stool-left', 55),
  middle: asset('stage-1-stool-middle', 68),
  right: asset('stage-1-stool-right', 55),
  height: 35,
  surfaceInset: 3,
};

export const STAGE_TWO_STOOL_SKIN: SliceSkinConfig = {
  left: asset('stage-2-stool-left', 38),
  middle: asset('stage-2-stool-middle', 100),
  right: asset('stage-2-stool-right', 38),
  height: 35,
  surfaceInset: 3,
};

export const STAGE_THREE_STOOL_SKIN: SliceSkinConfig = {
  left: asset('stage-3-stool-left', 26),
  middle: asset('stage-3-stool-middle', 41),
  right: asset('stage-3-stool-right', 35),
  height: 35,
  // 불투명 발판 표면이 원본 y=1에서 시작함.
  surfaceInset: 1,
  capInset: { left: 26, right: 35 },
};

export const STAGE_FOUR_STOOL_SKIN: SliceSkinConfig = {
  left: asset('stage-4-stool-left', 33),
  middle: asset('stage-4-stool-middle', 46),
  right: asset('stage-4-stool-right', 48),
  height: 35,
  surfaceInset: 0,
  // 양끝의 비스듬한 외곽선을 보존하고 중앙만 발판 길이에 맞춤.
  capInset: { left: 33, right: 48 },
};

export const STAGE_THREE_PIPE_SKIN: SliceSkinConfig = {
  left: asset('stage-3-pipe-left', 52),
  middle: asset('stage-3-pipe-middle', 102),
  right: asset('stage-3-pipe-right', 56),
  height: 40,
  surfaceInset: 0,
  middleFit: 'tile',
  // 둥근 바깥 끝과 체결부가 잘리지 않도록 캡 전체를 보존함.
  capInset: { left: 52, right: 56 },
};

export const ALL_TERRAIN_SKINS = [
  STAGE_ONE_FLOOR_SKIN,
  STAGE_ONE_STOOL_SKIN,
  STAGE_TWO_FLOOR_SKIN,
  STAGE_TWO_STOOL_SKIN,
  STAGE_THREE_FLOOR_SKIN,
  STAGE_THREE_STOOL_SKIN,
  STAGE_THREE_PIPE_SKIN,
  STAGE_FOUR_FLOOR_SKIN,
  STAGE_FOUR_STOOL_SKIN,
] as const;
