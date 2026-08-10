import { writeFileSync } from 'node:fs';
import {
  RATE,
  BUTTER,
  apply,
  biquad,
  decay,
  finish,
  mix,
  noise,
  swell,
  sweptBandpass,
  wav,
} from './audio-dsp.mjs';

/**
 * A firearm report is a pressure step, not a note. Every layer here is noise
 * and every filter is Butterworth (Q = 1/sqrt(2)), so nothing resonates and
 * nothing can read as a pitch.
 *
 * The character comes from the decay times, not the spectrum: high frequencies
 * die in milliseconds while the low end hangs on. That ratio is what the ear
 * hears as "a hard thing happened", and it is why a sine thump is the wrong
 * tool — a pure tone is maximal pitch by definition.
 */
function gunshot({ seconds, topHz, midLoHz, midHiHz, lowHz, topTau, midTau, lowTau, tailTau, gains, seed }) {
  const frames = Math.round(RATE * seconds);
  const source = noise(frames, seed);

  const top = apply(source, biquad('highpass', topHz, BUTTER));
  const mid = apply(source, biquad('highpass', midLoHz, BUTTER), biquad('lowpass', midHiHz, BUTTER));
  const low = apply(source, biquad('lowpass', lowHz, BUTTER), biquad('lowpass', lowHz, BUTTER));
  const tail = apply(noise(frames, seed + 7), biquad('lowpass', 1200, BUTTER), biquad('highpass', 200, BUTTER));

  const out = mix(
    frames,
    [top, decay(frames, topTau), gains.top],
    [mid, decay(frames, midTau), gains.mid],
    [low, decay(frames, lowTau), gains.low],
    [tail, decay(frames, tailTau, 0.01), gains.tail],
  );

  // 1ms ramp so the very first sample is not a step, then normalise to -1dBFS.
  return wav(finish(out, frames, 0.006));
}

/**
 * Burst rifle. Deliberately darker and heavier than the SMG.
 *
 * A first pass built it bright and short and measured at a 3049Hz opening
 * centroid against the SMG's 3276 over the same 0.15s — near enough that in play
 * they were the same sound. A rifle round is the heavier one; the contrast lives
 * there, not in being brighter.
 */
function burstRifle() {
  const seconds = 0.17;
  const frames = Math.round(RATE * seconds);
  const source = noise(frames, 4242);

  const crack = apply(source, biquad('highpass', 3000, BUTTER));
  const body = apply(source, biquad('highpass', 480, BUTTER), biquad('lowpass', 3000, BUTTER));
  const low = apply(source, biquad('lowpass', 260, BUTTER), biquad('lowpass', 260, BUTTER));
  const room = apply(noise(frames, 4249), biquad('lowpass', 1400, BUTTER), biquad('highpass', 260, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [crack, decay(frames, 0.004), 0.62],
        [body, decay(frames, 0.016), 1.0],
        // Trimmed against the 72ms burst interval: long enough that three
        // rounds stack into one aggressive event, short enough that they do
        // not smear into a single low blur.
        [low, decay(frames, 0.033), 0.85],
        [room, decay(frames, 0.03, 0.008), 0.1],
      ),
      frames,
      0.008,
    ),
  );
}

/**
 * Rail rifle. 75 damage on a 760ms interval, so it is allowed to be the longest
 * and heaviest cue in the game: a short coil charge, the discharge, then a
 * resonance sweeping down out of everything else's way.
 *
 * The all-noise rule above has one exception here. The rail rifle is a coilgun,
 * and a swept resonance is the whole of that sound; a glide has no stable pitch,
 * so it still cannot clash with a stage's key.
 */
function railRifle() {
  const seconds = 0.52;
  const frames = Math.round(RATE * seconds);
  const source = noise(frames, 909);

  const charge = sweptBandpass(noise(frames, 911), 320, 2600, 4);
  const snap = apply(source, biquad('highpass', 5000, BUTTER));
  const body = apply(source, biquad('highpass', 600, BUTTER), biquad('lowpass', 5000, BUTTER));
  const slam = apply(
    apply(source, biquad('lowpass', 150, BUTTER)),
    biquad('lowpass', 150, BUTTER),
  );
  // Q는 4를 넘기지 않는다. 9로 두면 스윕이 아니라 **음**이 된다 — 실측 Q가
  // 11.1로, 일부러 음정을 준 5스테이지 종(7.96)보다 뾰족했다. 760ms마다
  // 반복되는 큐가 그 정도로 서 있으면 코일이 아니라 음계로 들린다.
  // 스윕 자체는 남으므로 코일건이라는 성격은 유지된다.
  const coil = sweptBandpass(noise(frames, 913), 1800, 190, 4);

  return wav(
    finish(
      mix(
        frames,
        [charge, swell(frames, 0.055, 0.008), 0.5],
        // The shot lands at 60ms, after the charge has risen.
        [snap, decay(frames, 0.006, 0.06), 0.85],
        [body, decay(frames, 0.02, 0.06), 1.0],
        [slam, decay(frames, 0.09, 0.06), 0.9],
        [coil, decay(frames, 0.16, 0.062), 0.75],
      ),
      frames,
      0.008,
    ),
  );
}

const SHAPED = {
  'burst-rifle-fire_synth-crack': burstRifle,
  'rail-rifle-fire_synth-coil': railRifle,
};

const VARIANTS = {
  // Tight and dry. Built for a 110ms fire interval — barely any tail to stack.
  'synth-a-dry': {
    seconds: 0.16, topHz: 3200, midLoHz: 700, midHiHz: 3200, lowHz: 260,
    topTau: 0.007, midTau: 0.016, lowTau: 0.038, tailTau: 0.045,
    gains: { top: 0.9, mid: 1.0, low: 0.7, tail: 0.15 }, seed: 12345,
  },
  // Same shape with more air and a longer tail. Reads as a bigger room.
  'synth-b-open': {
    seconds: 0.24, topHz: 3800, midLoHz: 800, midHiHz: 3800, lowHz: 240,
    topTau: 0.009, midTau: 0.02, lowTau: 0.042, tailTau: 0.09,
    gains: { top: 1.0, mid: 0.95, low: 0.6, tail: 0.3 }, seed: 2024,
  },
  // Weighted low. Sits furthest from the BGM's bright content.
  'synth-c-heavy': {
    seconds: 0.2, topHz: 2600, midLoHz: 500, midHiHz: 2600, lowHz: 300,
    topTau: 0.006, midTau: 0.018, lowTau: 0.055, tailTau: 0.06,
    gains: { top: 0.6, mid: 0.9, low: 1.0, tail: 0.18 }, seed: 777,
  },
};

const dir = process.argv[2];
for (const [name, options] of Object.entries(VARIANTS)) {
  writeFileSync(`${dir}/${name}.wav`, gunshot(options));
  console.log('written', name);
}
for (const [name, build] of Object.entries(SHAPED)) {
  writeFileSync(`${dir}/${name}.wav`, build());
  console.log('written', name);
}
