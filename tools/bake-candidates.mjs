/**
 * `client/src/assets/audio/candidates/`에 있는 것을 훑어
 * `tools/audio-candidates.js`를 다시 만든다.
 *
 *   node tools/bake-candidates.mjs
 *
 * 왜 미리 굽는가: `audio-check.html`은 파일 시스템에서 바로 열도록 만든
 * 페이지이고, `file://`로 열린 페이지는 오디오를 재생할 수는 있어도 바이트를
 * 읽지는 못한다. 그래서 측정은 미리 끝나 있어야 한다.
 *
 * 측정은 `measure-track.mjs` 하나만 쓴다. 한때 이 스크립트가 브라우저를 띄워
 * 점검 페이지 안의 별도 분석 코드를 돌렸는데, 같은 곡을 두고 두 구현이 대역마다
 * 3~10dB씩 다른 값을 내놓아 어느 쪽 눈금인지 매번 따져야 했다. 이제 페이지는
 * 그리기만 하고 숫자는 전부 여기서 나온다.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from './measure-track.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = 'client/src/assets/audio/candidates';
const PLAYABLE = /\.(ogg|mp3|wav|m4a|webm)$/i;

/** 큐 순서는 플레이어가 실제로 듣는 순서와 같다. */
const GROUPS = [
  { cue: 'bgm-title', dir: 'title' },
  { cue: 'bgm-city', dir: 'city' },
  { cue: 'bgm-alley', dir: 'alley' },
  { cue: 'bgm-underground', dir: 'underground' },
  { cue: 'bgm-inferno', dir: 'inferno' },
  { cue: 'bgm-return', dir: 'return' },
];

/**
 * 매니페스트에 굽지 않는 필드. 루프 탐색 결과와 포락선은 CLI 보고용이라
 * 크고, 페이지는 쓰지 않는다.
 */
const REPORT_ONLY = ['pulse', 'loop', 'envelope'];

function takesIn(dir) {
  const folder = path.join(ROOT, CANDIDATES, dir);

  if (!statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }

  return readdirSync(folder).filter((name) => PLAYABLE.test(name)).sort();
}

const groups = [];

for (const group of GROUPS) {
  const files = takesIn(group.dir);

  if (files.length === 0) {
    continue;
  }

  process.stdout.write(`${group.dir}: ${files.length}개 분석 중`);

  const takes = files.map((file) => {
    const full = measure(path.join(ROOT, CANDIDATES, group.dir, file));
    const metrics = Object.fromEntries(
      Object.entries(full).filter(([key]) => !REPORT_ONLY.includes(key)),
    );
    process.stdout.write('.');
    return { file, metrics };
  });

  groups.push({
    cue: group.cue,
    base: `../${CANDIDATES}/${group.dir}/`,
    takes,
  });

  process.stdout.write(' 완료\n');
}

// 테이크 한 줄에 하나. 이 파일을 여는 사람은 파일명을 찾으러 오는데, 측정값을
// 예쁘게 펼쳐 놓으면 그 한 줄이 서른 줄 아래로 묻힌다.
const body = groups
  .map((group) =>
    [
      '  {',
      `    cue: '${group.cue}',`,
      `    base: '${group.base}',`,
      '    takes: [',
      ...group.takes.map((take) => `      ${JSON.stringify(take)},`),
      '    ],',
      '  },',
    ].join('\n'),
  )
  .join('\n');

writeFileSync(
  path.join(ROOT, 'tools/audio-candidates.js'),
  [
    '// 후보 음원의 측정 결과. tools/audio-check.html이 이 파일을 읽어',
    '// 열자마자 목록을 보여 준다. 같은 파일이면 결과가 늘 같으므로',
    '// 열 때마다 다시 분석하지 않는다.',
    '//',
    '// 측정은 tools/measure-track.mjs 하나에서만 나온다. 점검 페이지는',
    '// 이 숫자를 그리기만 하고 스스로 재지 않는다.',
    '//',
    '// 후보를 추가하거나 교체한 뒤에는 tools/bake-candidates.mjs를 돌려',
    '// 이 파일을 다시 만든다. 손으로 고치지 않는다.',
    '',
    `window.AUDIO_CANDIDATES = [\n${body}\n];`,
    '',
  ].join('\n'),
);

const total = groups.reduce((count, group) => count + group.takes.length, 0);
console.log(`\ntools/audio-candidates.js 갱신 — ${groups.length}개 큐, ${total}개 테이크`);
