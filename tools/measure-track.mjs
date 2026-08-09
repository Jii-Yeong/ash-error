/**
 * 후보 음원 한 곡을 재는 단일 구현.
 *
 *   node tools/measure-track.mjs <파일> [--loop-from <초>]
 *
 * ffmpeg는 디코딩에만 쓰고 계산은 전부 여기서 한다. 실행마다 값이 흔들리지
 * 않는 이유가 그것이다.
 *
 * `tools/bake-candidates.mjs`가 이 파일의 `measure()`를 불러 매니페스트를
 * 만들고, `tools/audio-check.html`은 그 매니페스트를 그리기만 한다.
 * **측정 구현은 이 파일 하나뿐이어야 한다.** 한때 점검 페이지가 브라우저에서
 * 같은 값을 따로 계산했는데, 두 눈금이 대역마다 3~10dB씩 어긋나 같은 곡을
 * 두고 다른 판정이 나왔다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE ?? 'ffprobe';

/** 포락선·온셋·루프 상관에는 이 정도면 충분하고 훨씬 빠르다. */
const LOOP_RATE = 11025;
/**
 * 대역은 자기 상한 위에서 재야 한다. ffmpeg는 `-af`를 소스 레이트로 걸고
 * **그 다음에** 리샘플하므로, 공기감 대역을 11025Hz로 디코딩하면 Nyquist가
 * 5.5kHz라 8~16kHz 통과대역이 통째로 사라지고 필터 저지대역 누설만 남는다.
 */
const ANALYSIS_RATE = 44100;

const BANDS = [
  { key: 'low', from: 0, to: 250 },
  { key: 'lowMid', from: 250, to: 1000 },
  { key: 'mid', from: 1000, to: 4000 },
  { key: 'high', from: 4000, to: 8000 },
  { key: 'air', from: 8000, to: 16000 },
];

/** 루프 후보를 레벨 차로 먼저 거르는 폭. 아래 `loop()` 참고. */
const LEVEL_GATE_DB = 1.5;

function ffmpeg(args) {
  return execFileSync(FFMPEG, args, { maxBuffer: 1 << 30 });
}

/** 지정한 레이트·채널 수로 디코딩한다. 스테레오는 인터리브로 돌아온다. */
function decode(path, extraFilters = [], rate = ANALYSIS_RATE, channels = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'soot-measure-'));
  const raw = join(dir, 'pcm.raw');
  try {
    ffmpeg([
      '-v', 'error', '-i', path,
      ...(extraFilters.length > 0 ? ['-af', extraFilters.join(',')] : []),
      '-ac', String(channels), '-ar', String(rate), '-f', 'f32le', raw, '-y',
    ]);
    const buf = readFileSync(raw);
    return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 컨테이너가 들고 있는 값. 디코딩 결과는 우리가 지정한 레이트로 나오므로
 * 파일 자체의 샘플레이트를 답하지 못한다.
 */
function probe(path) {
  try {
    const out = execFileSync(FFPROBE, [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate,channels',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      path,
    ]).toString().trim().split(/\s+/);
    const containerRate = Number.parseInt(out[0], 10);
    const channels = Number.parseInt(out[1], 10);
    return {
      containerRate: Number.isFinite(containerRate) ? containerRate : null,
      channels: Number.isFinite(channels) ? channels : 1,
    };
  } catch {
    return { containerRate: null, channels: 1 };
  }
}

function toDb(value) {
  return value > 0 ? 20 * Math.log10(value) : -Infinity;
}

function rms(data, from = 0, to = data.length) {
  let sum = 0;
  const end = Math.min(to, data.length);
  for (let i = from; i < end; i += 1) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, end - from));
}

function rmsDb(data, from = 0, length = data.length) {
  return toDb(rms(data, from, from + length));
}

// ── 페이드와 기승전결 ────────────────────────────────────────────────────────

/** 창마다의 RMS를 dB로. 페이드·전체 윤곽·이음매가 전부 이 위에서 계산된다. */
function envelopeFrames(mono, rate, windowSeconds) {
  const size = Math.max(1, Math.round(rate * windowSeconds));
  const frames = [];
  for (let start = 0; start + size <= mono.length; start += size) {
    frames.push(toDb(rms(mono, start, start + size)));
  }
  return frames;
}

function median(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  return finite.length === 0 ? -Infinity : finite[Math.floor(finite.length / 2)];
}

/**
 * 페이드는 포락선이 곡 자기 레벨보다 한참 아래에서 시작해 올라오는 모양으로
 * 나타난다. 도달까지 걸린 시간을 초로 돌려준다.
 */
function fadeSeconds(frames, windowSeconds, reversed) {
  const ordered = reversed ? [...frames].reverse() : frames;
  const target = median(ordered) - 6;
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index] >= target) return index * windowSeconds;
  }
  return ordered.length * windowSeconds;
}

/**
 * `from`..`to` 구간을 12토막 내어 레벨을 잰다. 남은 페이드를 구간 밖으로
 * 빼는 것이 요점이다 — 페이드는 어차피 잘라낼 것이고, 넣어 두면 모든 곡이
 * 거대한 기승전결을 가진 것처럼 보인다.
 */
function arc(mono, from, to, segments = 12) {
  const size = Math.floor((to - from) / segments);
  const levels = [];
  for (let index = 0; index < segments; index += 1) {
    levels.push(toDb(rms(mono, from + index * size, from + (index + 1) * size)));
  }
  const finite = levels.filter(Number.isFinite);
  const third = Math.floor(segments / 3);
  const average = (list) =>
    list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
  return {
    levels,
    spread: Math.max(...finite) - Math.min(...finite),
    build:
      average(levels.slice(-third).filter(Number.isFinite)) -
      average(levels.slice(0, third).filter(Number.isFinite)),
  };
}

// ── 대역 ────────────────────────────────────────────────────────────────────

/**
 * 각 대역을 곡 자기 레벨 대비로 낸다. 마스터 볼륨이 다른 두 테이크도 그대로
 * 비교할 수 있다. 구간은 페이드를 뺀 `from`..`to`이고 기준 레벨도 같은 구간에서
 * 낸다.
 */
function bandEnergy(path, from, to) {
  const reference = toDb(rms(decode(path), from, to));
  const powers = {};
  const relative = {};

  for (const band of BANDS) {
    const filters = [];
    // 엣지마다 두 번씩 걸어야 스커트가 믿을 만큼 가파르다.
    if (band.from > 0) {
      filters.push(`highpass=f=${band.from}`, `highpass=f=${band.from}`);
    }
    filters.push(`lowpass=f=${band.to}`, `lowpass=f=${band.to}`);
    const level = rms(decode(path, filters), from, to);
    powers[band.key] = level * level;
    relative[band.key] = toDb(level) - reference;
  }

  const total = Object.values(powers).reduce((sum, p) => sum + p, 0) || 1;
  const shares = {};
  for (const band of BANDS) shares[band.key] = powers[band.key] / total;

  return { shares, relative };
}

// ── 박 ──────────────────────────────────────────────────────────────────────

/**
 * 온셋 포락선에서 뽑은 대략의 템포. 곡이 엉뚱한 템포로 돌아온 것을 잡아내는
 * 용도이지 소수점까지 믿을 값은 아니다.
 */
function estimateBpm(mono, rate, from, to) {
  const hop = 512;
  const perSecond = rate / hop;
  const onsets = [];
  let previous = 0;

  for (let start = from; start + hop <= to; start += hop) {
    const level = rms(mono, start, start + hop);
    onsets.push(Math.max(0, level - previous));
    previous = level;
  }

  const minLag = Math.floor((60 / 200) * perSecond);
  const maxLag = Math.ceil((60 / 60) * perSecond);
  const scores = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let total = 0;
    for (let index = 0; index + lag < onsets.length; index += 1) {
      total += onsets[index] * onsets[index + lag];
    }
    scores.push({ bpm: (60 * perSecond) / lag, score: total });
  }

  // 자기상관은 2배·절반 템포에도 똑같이 잘 걸리므로 한 옥타브로 접는다.
  const fold = (bpm) => {
    let folded = bpm;
    while (folded >= 140) folded /= 2;
    while (folded < 70) folded *= 2;
    return Math.round(folded);
  };

  const merged = new Map();
  for (const entry of scores) {
    const bpm = fold(entry.bpm);
    merged.set(bpm, (merged.get(bpm) ?? 0) + entry.score);
  }

  return [...merged]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 3)
    .map(([bpm]) => bpm);
}

/**
 * 스펙트럴 플럭스는 직전 프레임보다 **늘어난** 에너지, 즉 음의 시작점을
 * 짚는다. 그 포락선을 자기상관하면 박 주기가 나오고, 봉우리 높이가 박이
 * 실제로 얼마나 뚜렷한지를 말한다.
 */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k += 1) {
        const w = ang * k, wr = Math.cos(w), wi = Math.sin(w);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

function pulse(mono) {
  const N = 1024, HOP = 128;
  const flux = [];
  let previous = new Float64Array(N / 2);
  for (let start = 0; start + N < mono.length; start += HOP) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i += 1) {
      re[i] = (mono[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    }
    fft(re, im);
    const mag = new Float64Array(N / 2);
    let sum = 0;
    for (let i = 0; i < N / 2; i += 1) {
      mag[i] = Math.hypot(re[i], im[i]);
      const rise = mag[i] - previous[i];
      if (rise > 0) sum += rise;
    }
    flux.push(sum);
    previous = mag;
  }
  const mean = flux.reduce((a, b) => a + b, 0) / Math.max(1, flux.length);
  const centred = flux.map((v) => v - mean);
  const fps = LOOP_RATE / HOP;
  const score = (bpm) => {
    const lag = Math.round((60 / bpm) * fps);
    let dot = 0, norm = 0;
    for (let i = 0; i + lag < centred.length; i += 1) {
      dot += centred[i] * centred[i + lag];
      norm += centred[i] * centred[i];
    }
    return dot / (norm + 1e-12);
  };
  let best = { bpm: 0, score: -2 };
  for (let bpm = 60; bpm <= 180; bpm += 0.25) {
    const s = score(bpm);
    if (s > best.score) best = { bpm, score: s };
  }
  return best;
}

// ── 루프 ────────────────────────────────────────────────────────────────────

/**
 * 곡이 어디서 되감길 수 있는지 찾는다. 후보 끝점을 루프 시작과 얼마나 닮았는지로
 * 점수 매기는 이유는, 그 닮음이 크로스페이드가 들리느냐를 결정하기 때문이다.
 *
 * 상관만으로는 부족하다. 꼬리 페이드는 본체와 같은 소재를 작게 연주한 것이라
 * 상관이 높게 나오므로, 게이트 없는 탐색은 레벨이 12dB 떨어지는 이음매를 1등으로
 * 돌려준다. 그래서 레벨 차로 먼저 거르고 그 안에서만 상관으로 줄 세운다.
 */
function loop(mono, from) {
  const seconds = mono.length / LOOP_RATE;
  const start = from ?? Math.min(24, seconds * 0.2);
  const win = Math.round(LOOP_RATE * 1.0);
  const at = (s) => Math.round(s * LOOP_RATE);
  const corr = (a0, b0) => {
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < win; i += 1) {
      const a = mono[a0 + i] ?? 0, b = mono[b0 + i] ?? 0;
      dot += a * b; aa += a * a; bb += b * b;
    }
    return dot / (Math.sqrt(aa * bb) + 1e-12);
  };

  const startDb = rmsDb(mono, at(start), win);
  let best = { end: 0, corr: -2, levelDelta: 0 };
  let bestUngated = { end: 0, corr: -2, levelDelta: 0 };

  for (let end = start + 45; end <= seconds - 1; end += 0.02) {
    const c = corr(at(start), at(end));
    const levelDelta = rmsDb(mono, at(end) - win, win) - startDb;
    if (c > bestUngated.corr) bestUngated = { end, corr: c, levelDelta };
    if (Math.abs(levelDelta) <= LEVEL_GATE_DB && c > best.corr) {
      best = { end, corr: c, levelDelta };
    }
  }

  return best.corr > -2
    ? { start, ...best, gated: true }
    : { start, ...bestUngated, gated: false };
}

/** 굵직한 포락선. 숫자 옆에 모양을 눈으로 확인하려고 둔다. */
function envelope(mono, step = 4) {
  const rows = [];
  for (let s = 0; s + step <= mono.length / LOOP_RATE; s += step) {
    rows.push({
      at: s,
      db: rmsDb(mono, Math.round(s * LOOP_RATE), Math.round(step * LOOP_RATE)),
    });
  }
  return rows;
}

// ── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 한 파일의 전체 측정값. 반환 형태가 곧 `tools/audio-candidates.js`에 구워지는
 * 스키마이고 점검 페이지가 읽는 필드 목록이다.
 */
export function measure(file, { loopFrom } = {}) {
  const { containerRate, channels } = probe(file);
  const mono = decode(file);
  const duration = mono.length / ANALYSIS_RATE;
  const isSfx = /(^|[\\/])sfx|sfx-/i.test(file) || duration <= 5;

  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const value = Math.abs(mono[i]);
    if (value > peak) peak = value;
    if (value >= 0.999) clipped += 1;
  }

  const windowSeconds = 0.05;
  const frames = envelopeFrames(mono, ANALYSIS_RATE, windowSeconds);
  const headFade = fadeSeconds(frames, windowSeconds, false);
  const tailFade = fadeSeconds(frames, windowSeconds, true);

  // 페이드는 깔끔한 경계에서 끝나지 않으므로 0.5초씩 여유를 둔다.
  const from = Math.min(
    mono.length - 1,
    Math.round((headFade + 0.5) * ANALYSIS_RATE),
  );
  const to = Math.max(
    from + 1,
    mono.length - Math.round((tailFade + 0.5) * ANALYSIS_RATE),
  );

  const shape = arc(mono, from, to);
  const { shares, relative } = bandEnergy(file, from, to);
  const bpm = estimateBpm(mono, ANALYSIS_RATE, from, to);

  const edge = Math.round(ANALYSIS_RATE * 0.2);
  const headDb = toDb(rms(mono, 0, edge));
  const tailDb = toDb(rms(mono, mono.length - edge, mono.length));

  const stereo = channels >= 2 ? decode(file, [], ANALYSIS_RATE, 2) : null;
  const duplicated = stereo ? channelsIdentical(stereo) : false;

  const loopMono = decode(file, [], LOOP_RATE);
  const round = (value) => Math.round(value * 1000) / 1000;

  return {
    duration: round(duration),
    isSfx,
    containerRate,
    channels,
    duplicated,
    peak: round(toDb(peak)),
    clipped,
    level: round(toDb(rms(mono))),
    headFade: round(headFade),
    tailFade: round(tailFade),
    build: round(shape.build),
    spread: round(shape.spread),
    seamStep: round(Math.abs(tailDb - headDb)),
    seamJump: round(Math.abs(mono[0] - mono[mono.length - 1])),
    bpm,
    air: round(relative.air),
    mid: round(relative.mid),
    bands: Object.fromEntries(
      BANDS.map((band) => [band.key, round(relative[band.key])]),
    ),
    midShare: round(shares.mid),
    // 아래는 CLI 보고용이라 매니페스트에는 굽지 않는다.
    pulse: pulse(loopMono),
    loop: loop(loopMono, loopFrom),
    envelope: envelope(loopMono, Math.max(4, Math.round(duration / 30))),
  };
}

/** 인터리브 스테레오에서 두 채널이 사실상 같은지 본다. */
function channelsIdentical(interleaved) {
  const pairs = Math.floor(interleaved.length / 2);
  if (pairs === 0) return false;
  const step = Math.max(1, Math.floor(pairs / 20000));
  for (let i = 0; i < pairs; i += step) {
    if (Math.abs(interleaved[i * 2] - interleaved[i * 2 + 1]) > 1e-4) {
      return false;
    }
  }
  return true;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function report(file, m) {
  const lp = m.loop;
  console.log(`${file}`);
  console.log(`  길이        ${m.duration.toFixed(1)}초`);
  console.log(
    `  빌드        ${m.build >= 0 ? '+' : ''}${m.build.toFixed(1)} dB   (구간 편차 ${m.spread.toFixed(1)} dB)`,
  );
  console.log(`  박          상관 ${m.pulse.score.toFixed(3)} @ ${m.pulse.bpm.toFixed(2)} BPM`);
  const band = (key) => m.bands[key].toFixed(1);
  console.log(
    `  대역        저 ${band('low')} / 중저 ${band('lowMid')} / 중 ${band('mid')} / 고 ${band('high')} / 공기감 ${band('air')}`,
  );
  console.log(
    `  루프        ${lp.start.toFixed(2)}s → ${lp.end.toFixed(2)}s (${(lp.end - lp.start).toFixed(1)}초)` +
      `  상관 ${lp.corr.toFixed(3)}  레벨차 ${lp.levelDelta >= 0 ? '+' : ''}${lp.levelDelta.toFixed(2)}dB` +
      (lp.gated ? '' : `  ※ ±${LEVEL_GATE_DB}dB 안에 드는 후보가 없다`),
  );
  console.log('  윤곽');
  for (const row of m.envelope) {
    const bar = '#'.repeat(Math.max(0, Math.round((row.db + 40) / 0.6)));
    console.log(`    ${String(Math.round(row.at)).padStart(4)}s ${row.db.toFixed(1).padStart(7)} ${bar}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/measure-track.mjs <file> [--loop-from <sec>]');
    process.exit(1);
  }
  const flag = process.argv.indexOf('--loop-from');
  report(
    file,
    measure(file, {
      loopFrom: flag > 0 ? Number.parseFloat(process.argv[flag + 1]) : undefined,
    }),
  );
}
