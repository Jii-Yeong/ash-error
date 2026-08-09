import { writeFileSync } from 'node:fs';
import {
  RATE,
  BUTTER,
  apply,
  biquad,
  decay,
  finish,
  glide,
  loopCrossfade,
  mix,
  noise,
  normalize,
  partials,
  sine,
  swell,
  sweptBandpass,
  wav,
} from './audio-dsp.mjs';

/**
 * Boss pattern cues for stages 3-5.
 *
 * Each stage gets one sound world, and a cue only belongs to a stage if it
 * could not be mistaken for a cue in either of the others:
 *
 * - Stage 3, the purification enforcer: pneumatics and hydraulics. Pressure
 *   rising, pressure released, metal landing on concrete. All noise.
 * - Stage 4, the infernal executioner: rock and magma. Lower and grittier than
 *   stage 3, with crack transients instead of machine hiss. All noise.
 * - Stage 5, the returning architect: bells and choir. **The only pitched
 *   material in the game**, which is the point — the final boss is the one
 *   thing that sounds like it belongs to a world above this one.
 *
 * Every cue is telegraph-first: a warning cue always resolves into an impact
 * cue, and the warning is the quieter and duller of the pair so the player
 * hears the resolution as the event.
 */

/** Flat envelope, for layers whose shaping is already in the signal. */
function hold(frames) {
  const out = new Float64Array(frames);
  out.fill(1);
  return out;
}

/** Ring-modulate an amplitude wobble onto a signal — turbines and flames. */
function flutter(signal, hz, depth) {
  const out = new Float64Array(signal.length);
  const step = (2 * Math.PI * hz) / RATE;
  for (let i = 0; i < signal.length; i += 1) {
    out[i] = signal[i] * (1 - depth + depth * (0.5 + 0.5 * Math.sin(step * i)));
  }
  return out;
}

/** Sparse impulses through a resonant band: rock cracking, debris landing. */
function crackle(frames, seed, count, fromHz, toHz, q, tau) {
  const source = new Float64Array(frames);
  const random = noise(count * 2, seed);
  for (let index = 0; index < count; index += 1) {
    // Squared spacing so the cracks bunch up at the start and thin out.
    const at = Math.round(frames * Math.pow(index / count, 1.6) * 0.9);
    source[at] += (index % 2 === 0 ? 1 : -1) * (0.5 + Math.abs(random[index]));
  }
  const rung = sweptBandpass(source, fromHz, toHz, q);
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i += 1) out[i] = rung[i];
  // Sparse one-sided impulses leave a DC offset that survives normalising and
  // costs headroom every layer it is mixed into, so it is blocked here.
  return apply(out, biquad('lowpass', 6000, BUTTER), biquad('highpass', 30, BUTTER));
}

const seconds = (value) => Math.round(RATE * value);

// ---------------------------------------------------------------------------
// Stage 3 — the purification enforcer
// ---------------------------------------------------------------------------

/**
 * 900ms of windup precedes the leap, so the cue is deliberately shorter than
 * the telegraph: it announces that something is being pressurised and then
 * leaves a beat of silence, which reads as "about to happen" far better than a
 * sound that runs right up to the event.
 */
function slamWarn() {
  const frames = seconds(0.62);
  const intake = sweptBandpass(noise(frames, 3101), 150, 820, 4);
  const rumble = apply(noise(frames, 3103), biquad('lowpass', 180, BUTTER), biquad('lowpass', 180, BUTTER));
  const hiss = apply(noise(frames, 3107), biquad('highpass', 4200, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [flutter(intake, 11, 0.35), swell(frames, 0.42, 0.2), 1.0],
        [rumble, swell(frames, 0.5, 0.12), 0.85],
        [hiss, swell(frames, 0.46, 0.05), 0.18],
      ),
      frames,
      0.05,
    ),
  );
}

/** The pneumatic release. Short, so the leap reads as sudden. */
function slamLeap() {
  const frames = seconds(0.34);
  const burst = apply(noise(frames, 3203), biquad('highpass', 900, BUTTER));
  const air = sweptBandpass(noise(frames, 3209), 1500, 340, 3);
  const thump = apply(noise(frames, 3211), biquad('lowpass', 120, BUTTER), biquad('lowpass', 120, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [burst, decay(frames, 0.035), 0.9],
        [air, decay(frames, 0.11), 1.0],
        [thump, decay(frames, 0.05), 0.7],
      ),
      frames,
      0.02,
    ),
  );
}

/**
 * The landing. This is the loudest cue stage 3 has, and it is allowed to run
 * long because the strike state holds for 300ms and recovery for another 900.
 */
function slamImpact() {
  const frames = seconds(0.78);
  const source = noise(frames, 3301);
  const sub = apply(source, biquad('lowpass', 85, BUTTER), biquad('lowpass', 85, BUTTER));
  const body = apply(source, biquad('highpass', 130, BUTTER), biquad('lowpass', 900, BUTTER));
  const strike = apply(noise(frames, 3307), biquad('highpass', 2600, BUTTER));
  const debris = crackle(frames, 3313, 14, 2400, 700, 7, 0.02);

  return wav(
    finish(
      mix(
        frames,
        [sub, decay(frames, 0.19), 1.0],
        [body, decay(frames, 0.07), 0.85],
        [strike, decay(frames, 0.008), 0.75],
        [debris, decay(frames, 0.26, 0.03), 0.3],
      ),
      frames,
      0.06,
    ),
  );
}

/**
 * The two pressure waves that leave the landing. Pitched down out of the
 * impact's way so the pair reads as one event with an aftermath, not as two
 * impacts.
 */
function shockwave() {
  const frames = seconds(0.5);
  const wave = sweptBandpass(noise(frames, 3401), 700, 190, 5);
  const floor = apply(noise(frames, 3407), biquad('lowpass', 240, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [wave, decay(frames, 0.14), 1.0],
        [floor, decay(frames, 0.1), 0.55],
      ),
      frames,
      0.05,
    ),
  );
}

/** Intake spinning up: 700ms of warning before the pull actually starts. */
function vacuumStart() {
  const frames = seconds(0.6);
  const turbine = sweptBandpass(noise(frames, 3501), 110, 620, 5);
  const draw = apply(noise(frames, 3503), biquad('bandpass', 900, 1.4));

  return wav(
    finish(
      mix(
        frames,
        [flutter(turbine, 17, 0.4), swell(frames, 0.5, 0.3), 1.0],
        [draw, swell(frames, 0.54, 0.08), 0.4],
      ),
      frames,
      0.03,
    ),
  );
}

/**
 * The 2.4s pull, held under a loop. Rendered a fade longer than the loop so
 * the opening can crossfade against its own overrun; the edges are left
 * un-faded on purpose, since a loop that fades at both ends pumps once per
 * revolution.
 */
function vacuumLoop() {
  const frames = seconds(1.2);
  const fade = seconds(0.25);
  const total = frames + fade;

  const turbine = apply(noise(total, 3601), biquad('bandpass', 520, 2.2));
  const roar = apply(noise(total, 3607), biquad('lowpass', 300, BUTTER), biquad('highpass', 90, BUTTER));
  const air = apply(noise(total, 3613), biquad('highpass', 3200, BUTTER));

  const bed = mix(
    total,
    [flutter(turbine, 23, 0.5), hold(total), 1.0],
    [roar, hold(total), 0.8],
    [air, hold(total), 0.12],
  );

  return wav(normalize(loopCrossfade(bed, frames, fade), -6));
}

/** Intake spinning down. The mirror of `vacuumStart`, so the pair brackets. */
function vacuumEnd() {
  const frames = seconds(0.55);
  const turbine = sweptBandpass(noise(frames, 3701), 600, 95, 5);
  const vent = apply(noise(frames, 3709), biquad('highpass', 2000, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [flutter(turbine, 13, 0.3), decay(frames, 0.24), 1.0],
        [vent, decay(frames, 0.06), 0.35],
      ),
      frames,
      0.05,
    ),
  );
}

// ---------------------------------------------------------------------------
// Stage 4 — the infernal executioner
// ---------------------------------------------------------------------------

/** Ground splitting under the marker. 700ms of warning before the eruption. */
function ruptureWarn() {
  const frames = seconds(0.5);
  const cracks = crackle(frames, 4101, 9, 900, 320, 9, 0.02);
  const groan = apply(noise(frames, 4103), biquad('lowpass', 150, BUTTER), biquad('lowpass', 150, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [cracks, decay(frames, 0.3), 1.0],
        [groan, swell(frames, 0.34, 0.14), 0.7],
      ),
      frames,
      0.04,
    ),
  );
}

/**
 * The eruption. Three of these fire 250ms apart, so the tail is cut short of
 * that interval — long enough to feel like magma, short enough that the third
 * column is still a distinct hit rather than the end of a smear.
 */
function ruptureErupt() {
  const frames = seconds(0.38);
  const source = noise(frames, 4201);
  const blast = apply(source, biquad('lowpass', 700, BUTTER));
  const spray = apply(noise(frames, 4207), biquad('highpass', 1800, BUTTER));
  const sub = apply(source, biquad('lowpass', 70, BUTTER), biquad('lowpass', 70, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [blast, decay(frames, 0.055), 1.0],
        [spray, decay(frames, 0.09), 0.45],
        [sub, decay(frames, 0.1), 0.8],
      ),
      frames,
      0.03,
    ),
  );
}

/** 850ms of hooves-and-pressure before the rush. */
function chargeWarn() {
  const frames = seconds(0.8);
  const build = apply(noise(frames, 4301), biquad('lowpass', 220, BUTTER), biquad('highpass', 60, BUTTER));
  const scrape = sweptBandpass(noise(frames, 4307), 340, 1100, 6);
  const flame = apply(noise(frames, 4311), biquad('bandpass', 2600, 1.1));

  return wav(
    finish(
      mix(
        frames,
        [build, swell(frames, 0.62, 0.16), 1.0],
        [flutter(scrape, 7, 0.55), swell(frames, 0.66, 0.1), 0.45],
        [flame, swell(frames, 0.6, 0.08), 0.22],
      ),
      frames,
      0.05,
    ),
  );
}

/** The rush itself: 600ms of broadband roar dropping in pitch as it passes. */
function chargeRush() {
  const frames = seconds(0.58);
  const roar = apply(noise(frames, 4401), biquad('lowpass', 1400, BUTTER), biquad('highpass', 110, BUTTER));
  const pass = sweptBandpass(noise(frames, 4409), 1300, 260, 3);
  const sub = apply(noise(frames, 4413), biquad('lowpass', 95, BUTTER), biquad('lowpass', 95, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [roar, swell(frames, 0.08, 0.4), 1.0],
        [pass, swell(frames, 0.1, 0.3), 0.7],
        [sub, swell(frames, 0.06, 0.35), 0.85],
      ),
      frames,
      0.05,
    ),
  );
}

/**
 * Hitting the arena wall. The stagger that follows is the player's damage
 * window, so this cue has to read as *the boss failing* — the pitch collapses
 * rather than resolving.
 */
function chargeImpact() {
  const frames = seconds(0.82);
  const source = noise(frames, 4501);
  const slam = apply(source, biquad('lowpass', 80, BUTTER), biquad('lowpass', 80, BUTTER));
  const stone = apply(source, biquad('highpass', 200, BUTTER), biquad('lowpass', 1600, BUTTER));
  const shatter = crackle(frames, 4507, 18, 3000, 500, 6, 0.02);
  const collapse = sweptBandpass(noise(frames, 4519), 500, 70, 4);

  return wav(
    finish(
      mix(
        frames,
        [slam, decay(frames, 0.2), 1.0],
        [stone, decay(frames, 0.05), 0.8],
        [shatter, decay(frames, 0.3, 0.02), 0.4],
        [collapse, decay(frames, 0.28, 0.05), 0.5],
      ),
      frames,
      0.06,
    ),
  );
}

/** Shards falling. 650ms of descent, quiet, so the landing is the event. */
function shardFall() {
  const frames = seconds(0.62);
  const whistle = sweptBandpass(noise(frames, 4601), 2600, 620, 11);
  const air = apply(noise(frames, 4607), biquad('highpass', 3000, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [whistle, swell(frames, 0.45, 0.14), 1.0],
        [air, swell(frames, 0.5, 0.1), 0.22],
      ),
      frames,
      0.05,
    ),
  );
}

/** Shard landing plus the magma pool it leaves. */
function shardImpact() {
  const frames = seconds(0.5);
  const source = noise(frames, 4701);
  const hit = apply(source, biquad('highpass', 700, BUTTER), biquad('lowpass', 4000, BUTTER));
  const thud = apply(source, biquad('lowpass', 110, BUTTER), biquad('lowpass', 110, BUTTER));
  const sizzle = apply(noise(frames, 4709), biquad('bandpass', 5200, 0.9));

  return wav(
    finish(
      mix(
        frames,
        [hit, decay(frames, 0.02), 1.0],
        [thud, decay(frames, 0.09), 0.85],
        [sizzle, decay(frames, 0.22, 0.02), 0.3],
      ),
      frames,
      0.05,
    ),
  );
}

/** The phase-two eruption. The largest cue stage 4 owns. */
function infernalPhase() {
  const frames = seconds(1.3);
  const roar = apply(noise(frames, 4801), biquad('lowpass', 400, BUTTER));
  const rise = sweptBandpass(noise(frames, 4807), 90, 900, 3);
  const flame = apply(noise(frames, 4813), biquad('highpass', 2200, BUTTER));
  const rubble = crackle(frames, 4817, 26, 1800, 300, 5, 0.02);

  return wav(
    finish(
      mix(
        frames,
        [roar, swell(frames, 0.34, 0.42), 1.0],
        [flutter(rise, 6, 0.4), swell(frames, 0.4, 0.3), 0.7],
        [flame, swell(frames, 0.3, 0.36), 0.3],
        [rubble, decay(frames, 0.5, 0.1), 0.35],
      ),
      frames,
      0.1,
    ),
  );
}

// ---------------------------------------------------------------------------
// Stage 5 — the returning architect
// ---------------------------------------------------------------------------

/**
 * D is the game's tonal centre: the BGM brief puts `title` and `city` in D
 * major and `alley` in D minor, the same tonic soured. Stage 5's bells are
 * built on the same root and use only root and fifth, which belong to both
 * modes — so whatever ends up being written for `bgm-return`, these cues
 * cannot be in the wrong key.
 */
const D3 = 146.83;
const D4 = 293.66;
const A4 = 440.0;
const D5 = 587.33;

/**
 * Stretched partial ratios. A real bell's overtones sit above whole multiples,
 * which is why a bell rings rather than sounding a note; keeping that stretch
 * is what stops this reading as an organ pad.
 */
const BELL = [
  { ratio: 1, gain: 1.0, tau: 0.5 },
  { ratio: 2.02, gain: 0.6, tau: 0.32 },
  { ratio: 2.99, gain: 0.42, tau: 0.2 },
  // 위쪽 둘은 한 번 들으면 좋은데 halo는 패턴당 2~3발, wings는 3연발이다.
  // 반복되는 큐에서 이 대역이 세면 종이 아니라 삑삑거림으로 굳는다.
  { ratio: 4.17, gain: 0.18, tau: 0.11 },
  { ratio: 5.42, gain: 0.08, tau: 0.06 },
];

/** The halo charging. Choir-like, rising, no transient — nothing has happened. */
function haloWarn() {
  const frames = seconds(0.72);
  const choir = mix(
    frames,
    [sine(frames, D3), hold(frames), 1.0],
    [sine(frames, D3 * 1.5), hold(frames), 0.7],
    [sine(frames, D4), hold(frames), 0.5],
    // A fifth-plus-a-hair. The beating it makes against the clean fifth is the
    // "not quite holy" the boss is supposed to sound like.
    [sine(frames, D3 * 1.505), hold(frames), 0.45],
  );
  const shimmer = apply(noise(frames, 5101), biquad('bandpass', 6200, 0.8));

  return wav(
    finish(
      mix(
        frames,
        [choir, swell(frames, 0.56, 0.16), 1.0],
        [shimmer, swell(frames, 0.6, 0.1), 0.08],
      ),
      frames,
      0.07,
    ),
  );
}

/** A ring of bullets leaving. Struck, not swelled. */
function haloRing() {
  const frames = seconds(0.56);
  const bell = partials(frames, D5, BELL);
  const strike = apply(noise(frames, 5201), biquad('highpass', 5000, BUTTER));
  const body = apply(noise(frames, 5207), biquad('bandpass', 1400, 1.2));

  return wav(
    finish(
      mix(
        frames,
        [bell, hold(frames), 1.0],
        [strike, decay(frames, 0.006), 0.5],
        [body, decay(frames, 0.04), 0.3],
      ),
      frames,
      0.05,
    ),
  );
}

/** Wings unfolding. Air and cloth, with one soft partial under it. */
function wingsWarn() {
  const frames = seconds(0.52);
  const sweep = sweptBandpass(noise(frames, 5301), 400, 2400, 2.5);
  const tone = partials(frames, A4, [
    { ratio: 1, gain: 1.0, tau: 0.3 },
    { ratio: 2.01, gain: 0.4, tau: 0.18 },
  ]);

  return wav(
    finish(
      mix(
        frames,
        [sweep, swell(frames, 0.36, 0.12), 1.0],
        [tone, swell(frames, 0.3, 0.14), 0.5],
      ),
      frames,
      0.05,
    ),
  );
}

/** One wing volley. Brighter and shorter than the halo — three fire in a row. */
function wingsFan() {
  const frames = seconds(0.42);
  const bell = partials(frames, A4 * 2, [
    { ratio: 1, gain: 1.0, tau: 0.14 },
    { ratio: 2.03, gain: 0.5, tau: 0.09 },
    { ratio: 3.01, gain: 0.3, tau: 0.05 },
  ]);
  const cut = apply(noise(frames, 5401), biquad('highpass', 4000, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [bell, hold(frames), 1.0],
        [cut, decay(frames, 0.012), 0.45],
      ),
      frames,
      0.04,
    ),
  );
}

/**
 * The eye tracking the player for 800ms. A slow upward glide with no arrival:
 * an unresolved rise is the cheapest way to make a player want to move.
 */
function eyeTrack() {
  const frames = seconds(0.86);
  const search = glide(frames, D4 * 1.5, D5 * 1.5);
  const under = glide(frames, D3, D4);
  const air = apply(noise(frames, 5501), biquad('bandpass', 3400, 1.6));

  return wav(
    finish(
      mix(
        frames,
        [search, swell(frames, 0.7, 0.1), 1.0],
        [under, swell(frames, 0.72, 0.08), 0.4],
        [air, swell(frames, 0.68, 0.08), 0.2],
      ),
      frames,
      0.06,
    ),
  );
}

/**
 * Lock-on, 350ms before the orb fires. A tritone above the tonic — the one
 * interval the stage's own key cannot absorb, so it reads as an alarm rather
 * than as part of the music.
 */
function eyeLock() {
  const frames = seconds(0.3);
  const alarm = mix(
    frames,
    [sine(frames, D5), hold(frames), 1.0],
    [sine(frames, D5 * Math.SQRT2), hold(frames), 0.8],
  );
  const tick = apply(noise(frames, 5601), biquad('highpass', 6000, BUTTER));

  return wav(
    finish(
      mix(
        frames,
        [alarm, decay(frames, 0.07), 1.0],
        [tick, decay(frames, 0.004), 0.4],
      ),
      frames,
      0.03,
    ),
  );
}

/** The judgment orb landing and splitting. Bell plus burst. */
function eyeOrb() {
  const frames = seconds(0.86);
  const bell = partials(frames, D4, BELL);
  const burst = apply(noise(frames, 5701), biquad('highpass', 1200, BUTTER));
  const drop = sweptBandpass(noise(frames, 5709), 600, 90, 4);

  return wav(
    finish(
      mix(
        frames,
        [bell, hold(frames), 1.0],
        [burst, decay(frames, 0.03), 0.6],
        [drop, decay(frames, 0.24, 0.02), 0.55],
      ),
      frames,
      0.08,
    ),
  );
}

/** Phase two. The choir arrives properly for the first time. */
function architectPhase() {
  const frames = seconds(1.3);
  const bell = partials(frames, D3, BELL);
  const choir = mix(
    frames,
    [sine(frames, D4), hold(frames), 1.0],
    [sine(frames, D4 * 1.5), hold(frames), 0.75],
    [sine(frames, D5), hold(frames), 0.5],
    [sine(frames, D4 * 1.498), hold(frames), 0.5],
  );
  const shimmer = apply(noise(frames, 5801), biquad('bandpass', 7000, 0.7));

  return wav(
    finish(
      mix(
        frames,
        // 종의 2.02배음(296.6Hz)이 성가의 D4(293.7Hz)와 2.9Hz로 맥놀이한다.
        // 종을 앞세울 이유가 없는 큐라 게인을 낮춰 맥놀이 깊이를 줄인다.
        [bell, hold(frames), 0.5],
        [choir, swell(frames, 0.5, 0.5), 1.0],
        [shimmer, swell(frames, 0.55, 0.3), 0.09],
      ),
      frames,
      0.12,
    ),
  );
}

/**
 * False Salvation. The longest cue in the game and the only one that is
 * supposed to sound beautiful.
 *
 * It opens as a clean D major triad and then slides flat over its own length —
 * the chord the player is being offered is decaying while they listen to it,
 * which is the whole plot of the fight stated in one sound. The glide is
 * roughly a semitone, far enough to hear and near enough to stay a triad.
 */
function falseSalvation() {
  const frames = seconds(1.8);
  const SAG = 0.945;
  const triad = mix(
    frames,
    [glide(frames, D4, D4 * SAG), hold(frames), 1.0],
    [glide(frames, D4 * 1.26, D4 * 1.26 * SAG), hold(frames), 0.8],
    [glide(frames, D4 * 1.5, D4 * 1.5 * SAG), hold(frames), 0.75],
    [glide(frames, D5, D5 * SAG), hold(frames), 0.45],
  );
  const bell = partials(frames, D3, BELL);
  const light = apply(noise(frames, 5901), biquad('bandpass', 8000, 0.6));

  return wav(
    finish(
      mix(
        frames,
        [triad, swell(frames, 0.5, 0.9), 1.0],
        [bell, hold(frames), 0.55],
        [light, swell(frames, 0.6, 0.6), 0.07],
      ),
      frames,
      0.16,
    ),
  );
}

/**
 * The core opening — the only window in which the boss can be hurt. Held and
 * hollow: an octave with the upper voice pulled flat, so the cue is unpleasant
 * to sit inside and the player is pushed to spend the window shooting.
 *
 * How flat matters more than it looks. The first pass used 1.97, which puts the
 * upper voice 8.8Hz under the true octave — and 3~30Hz is the band the ear
 * fuses into *roughness* rather than hearing as two notes. The cue read as
 * buzzing, not as unease. 1.996 lands the beat near 1Hz: one slow drift across
 * the window, which is the wrongness that was wanted.
 */
function coreExposed() {
  const frames = seconds(0.92);
  const hollow = mix(
    frames,
    [sine(frames, D4), hold(frames), 1.0],
    [sine(frames, D4 * 1.996), hold(frames), 0.7],
  );
  const grind = apply(noise(frames, 6001), biquad('bandpass', 1100, 2.4));

  return wav(
    finish(
      mix(
        frames,
        [hollow, swell(frames, 0.1, 0.42), 1.0],
        [grind, swell(frames, 0.14, 0.3), 0.3],
      ),
      frames,
      0.09,
    ),
  );
}

const CUES = {
  'stage3-boss-slam-warn': slamWarn,
  'stage3-boss-slam-leap': slamLeap,
  'stage3-boss-slam-impact': slamImpact,
  'stage3-boss-shockwave': shockwave,
  'stage3-boss-vacuum-start': vacuumStart,
  'stage3-boss-vacuum-loop': vacuumLoop,
  'stage3-boss-vacuum-end': vacuumEnd,
  'stage4-boss-rupture-warn': ruptureWarn,
  'stage4-boss-rupture-erupt': ruptureErupt,
  'stage4-boss-charge-warn': chargeWarn,
  'stage4-boss-charge-rush': chargeRush,
  'stage4-boss-charge-impact': chargeImpact,
  'stage4-boss-shard-fall': shardFall,
  'stage4-boss-shard-impact': shardImpact,
  'stage4-boss-phase-shift': infernalPhase,
  'stage5-boss-halo-warn': haloWarn,
  'stage5-boss-halo-ring': haloRing,
  'stage5-boss-wings-warn': wingsWarn,
  'stage5-boss-wings-fan': wingsFan,
  'stage5-boss-eye-track': eyeTrack,
  'stage5-boss-eye-lock': eyeLock,
  'stage5-boss-eye-orb': eyeOrb,
  'stage5-boss-phase-shift': architectPhase,
  'stage5-boss-salvation': falseSalvation,
  'stage5-boss-core-exposed': coreExposed,
};

const dir = process.argv[2];

if (!dir) {
  throw new Error('usage: node tools/make-boss-sfx.mjs <output-dir>');
}

for (const [name, build] of Object.entries(CUES)) {
  writeFileSync(`${dir}/${name}.wav`, build());
  console.log('written', name);
}
