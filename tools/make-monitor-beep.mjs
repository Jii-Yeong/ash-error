/**
 * `sfx-player-hit` 아래에 겹치는 병원 모니터 비프를 합성한다.
 *
 *   node tools/make-monitor-beep.mjs <out.wav> [hz] [ms]
 *
 * Kenney 팩을 먼저 재봤지만 이 소리를 댈 수 없었다. 가장 가까운 `tone1`이
 * 261Hz짜리 81ms인데, 원래 음정으로 쓰면 기음이 타격음 자체의 310Hz 성분 바로
 * 위에 앉고, 모니터 대역으로 올리면 20ms로 짧아져 비프가 아니라 클릭이 된다.
 * 배속은 음정과 길이를 함께 바꾸므로 어떤 값에서도 둘을 같이 얻지 못한다.
 * 비프는 그냥 음이라 샘플과 씨름하는 것보다 만드는 편이 싸다.
 *
 * 목표는 실제 병실 모니터다. 1kHz 내외, 130ms 남짓, 단단한 시작과 짧은 감쇠.
 * 순음을 피한 것은 의도다 — 그 스피커들은 작고 싸며, 거기서 생기는 홀수 배음이
 * 이 소리를 게임 UI 블립이 아니라 의료기기로 읽히게 하는 대부분이다.
 */
import { writeFileSync } from 'node:fs';

const RATE = 44100;

/**
 * 홀수 배음만, 가파르게 감쇠시킨다. 사각파 쪽으로 살짝 기울인 정도다 — 작은
 * 트랜스듀서처럼 들릴 만큼의 날은 서되, 진짜 사각파가 4~8kHz에 쌓을 버즈까지는
 * 가지 않는다. 그 대역은 타격음이 비어 있어 가려 줄 것이 없다.
 */
const HARMONICS = [
  { multiple: 1, gain: 1 },
  { multiple: 3, gain: 0.125 },
  { multiple: 5, gain: 0.05 },
];

/** 양 끝에서 클릭이 나지 않도록 페이드를 raised-cosine으로 건다. */
const ATTACK_MS = 2;
const RELEASE_MS = 28;

const [, , outPath, hzArg, msArg] = process.argv;

if (!outPath) {
  console.error('usage: node tools/make-monitor-beep.mjs <out.wav> [hz] [ms]');
  process.exit(1);
}

const hz = Number(hzArg ?? 1000);
const totalMs = Number(msArg ?? 130);
const frames = Math.round((totalMs / 1000) * RATE);
const attack = Math.round((ATTACK_MS / 1000) * RATE);
const release = Math.round((RELEASE_MS / 1000) * RATE);

const samples = new Float64Array(frames);

for (let i = 0; i < frames; i += 1) {
  const t = i / RATE;
  let value = 0;
  for (const { multiple, gain } of HARMONICS) {
    value += Math.sin(2 * Math.PI * hz * multiple * t) * gain;
  }

  let envelope = 1;
  if (i < attack) {
    envelope = 0.5 - 0.5 * Math.cos((Math.PI * i) / attack);
  } else if (i >= frames - release) {
    const position = (i - (frames - release)) / release;
    envelope = 0.5 + 0.5 * Math.cos(Math.PI * position);
  }

  samples[i] = value * envelope;
}

// Kenney 팩이 전 파일 0dBFS 근처로 통일돼 있어 거기에 맞춰 -1dBFS로 정규화한다.
// 큐 사이 밸런스는 파일이 아니라 SFX_CONFIG가 잡는다.
let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const scale = (10 ** (-1 / 20) / peak) || 0;

const bytes = frames * 2;
const buffer = Buffer.alloc(44 + bytes);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + bytes, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(RATE, 24);
buffer.writeUInt32LE(RATE * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(bytes, 40);

for (let i = 0; i < frames; i += 1) {
  const value = Math.max(-1, Math.min(1, samples[i] * scale));
  buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
}

writeFileSync(outPath, buffer);
console.log(`${outPath}  ${hz}Hz  ${totalMs}ms  ${frames} frames`);
