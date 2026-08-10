/**
 * Synthesis primitives shared by the SFX generators.
 *
 * Everything here is deterministic: same arguments in, byte-identical samples
 * out. That is what lets a cue be regenerated months later and still be the
 * file that was auditioned and mixed, so the repo can carry the recipe instead
 * of only the rendered audio.
 */

export const RATE = 44100;

/** Butterworth Q. Nothing resonates at this value, so nothing reads as pitch. */
export const BUTTER = Math.SQRT1_2;

/** Seeded so a regenerated file is byte-identical to the one that was auditioned. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

/** RBJ biquad. Only the shapes these cues need. */
export function biquad(type, freq, q) {
  const w = (2 * Math.PI * freq) / RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;

  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    // bandpass, constant skirt gain
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  a0 = 1 + alpha;
  a1 = -2 * cos;
  a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

export function apply(signal, ...filters) {
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i += 1) {
    let v = signal[i];
    for (const f of filters) v = f(v);
    out[i] = v;
  }
  return out;
}

export function noise(frames, seed) {
  const random = rng(seed);
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i += 1) out[i] = random() * 2;
  return out;
}

/** Exponential decay. `tau` in seconds is the time to fall to 1/e. */
export function decay(frames, tau, delay = 0) {
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / RATE - delay;
    out[i] = t < 0 ? 0 : Math.exp(-t / tau);
  }
  return out;
}

export function mix(frames, ...layers) {
  const out = new Float64Array(frames);
  for (const [signal, envelope, gain] of layers) {
    for (let i = 0; i < frames; i += 1) out[i] += signal[i] * envelope[i] * gain;
  }
  return out;
}

/**
 * Chamberlin state-variable filter whose cutoff moves per sample.
 *
 * A *swept* resonance has no stable pitch, so it can carry a mechanical
 * character — a coil, a turbine, an intake — without landing on a note that
 * could clash with a stage's key. A fixed biquad cannot do this: its
 * coefficients are baked at construction.
 */
export function sweptBandpass(signal, fromHz, toHz, q) {
  const out = new Float64Array(signal.length);
  let low = 0;
  let band = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const t = i / (signal.length - 1);
    // Exponential glide, so the sweep is even in pitch rather than in hertz.
    const hz = fromHz * Math.pow(toHz / fromHz, t);
    const f = 2 * Math.sin((Math.PI * Math.min(hz, RATE * 0.45)) / RATE);
    const high = signal[i] - low - (1 / q) * band;
    band += f * high;
    low += f * band;
    out[i] = band;
  }
  return out;
}

/** Rises then falls. The charge before a release, not a hit. */
export function swell(frames, attack, tau, delay = 0) {
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / RATE - delay;
    if (t < 0) out[i] = 0;
    else if (t < attack) out[i] = t / attack;
    else out[i] = Math.exp(-(t - attack) / tau);
  }
  return out;
}

/** The 1ms ramp, the tail fade and the -1dBFS normalise, shared by every shape. */
export function finish(out, frames, fadeSeconds) {
  const ramp = Math.round(RATE * 0.001);
  for (let i = 0; i < ramp; i += 1) out[i] *= i / ramp;
  const fade = Math.round(RATE * fadeSeconds);
  for (let i = 0; i < fade; i += 1) out[frames - 1 - i] *= i / fade;

  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const target = Math.pow(10, -1 / 20);
  for (let i = 0; i < frames; i += 1) out[i] = (out[i] / peak) * target;
  return out;
}

/** A steady sine. Phase starts at zero so layers stack without cancelling. */
export function sine(frames, hz) {
  const out = new Float64Array(frames);
  const step = (2 * Math.PI * hz) / RATE;
  for (let i = 0; i < frames; i += 1) out[i] = Math.sin(step * i);
  return out;
}

/**
 * A sine whose frequency glides exponentially. Phase is accumulated rather
 * than recomputed per sample, because `sin(2*pi*f(t)*t)` sweeps at twice the
 * intended rate and lands on the wrong end frequency.
 */
export function glide(frames, fromHz, toHz) {
  const out = new Float64Array(frames);
  let phase = 0;
  for (let i = 0; i < frames; i += 1) {
    const t = frames === 1 ? 0 : i / (frames - 1);
    const hz = fromHz * Math.pow(toHz / fromHz, t);
    out[i] = Math.sin(phase);
    phase += (2 * Math.PI * hz) / RATE;
  }
  return out;
}

/**
 * A struck-metal voice: partials at arbitrary ratios of a base frequency, each
 * with its own decay.
 *
 * Ratios are given per partial rather than derived, because what separates a
 * bell from a note is that its partials are *not* whole multiples. Feeding
 * slightly stretched ratios is what makes the result read as struck metal
 * instead of an organ.
 */
export function partials(frames, baseHz, spec) {
  const out = new Float64Array(frames);
  for (const { ratio, gain, tau } of spec) {
    const voice = sine(frames, baseHz * ratio);
    const envelope = decay(frames, tau);
    for (let i = 0; i < frames; i += 1) out[i] += voice[i] * envelope[i] * gain;
  }
  return out;
}

/**
 * Turns a rendered tail into a seamless loop by folding the material that runs
 * past the loop end back over its opening.
 *
 * `source` must be at least `frames + fadeFrames` long: the extra tail is what
 * the opening crossfades against. Linear rather than equal-power, because the
 * two sides here are the same stationary process and therefore correlated —
 * equal-power would add up to +3dB across the seam.
 */
export function loopCrossfade(source, frames, fadeFrames) {
  const out = new Float64Array(frames);
  for (let i = fadeFrames; i < frames; i += 1) out[i] = source[i];
  for (let i = 0; i < fadeFrames; i += 1) {
    const t = i / fadeFrames;
    out[i] = source[i] * t + source[frames + i] * (1 - t);
  }
  return out;
}

/** Normalise to `dbfs` without touching the edges. Loops must not be faded. */
export function normalize(out, dbfs = -1) {
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const target = Math.pow(10, dbfs / 20) / peak;
  for (let i = 0; i < out.length; i += 1) out[i] *= target;
  return out;
}

/** 16-bit mono PCM in a RIFF container. */
export function wav(samples) {
  const bytes = samples.length * 2;
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
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buffer;
}
