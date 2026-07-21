import { pitchClassToCamelot } from './camelot';

/**
 * Detección de tonalidad musical (key) en el cliente.
 *
 * Método:
 *   1. Se calcula un CHROMAGRAMA (12 clases de altura) con detectores Goertzel
 *      en varias octavas. Goertzel evita una FFT completa: mide la energía en
 *      frecuencias concretas (las 12 notas × octavas).
 *   2. Se correlaciona el chroma con los perfiles Krumhansl–Schmuckler de
 *      cada tonalidad mayor y menor (24 en total).
 *   3. Se elige la de mayor correlación y se traduce a notación Camelot para
 *      mezcla armónica (ver camelot.ts).
 */
export interface KeyResult {
  /** Clase de altura 0..11 (0=C). */
  pitchClass: number;
  mode: 'major' | 'minor';
  /** Notación estándar, ej. "A minor". */
  name: string;
  /** Notación Camelot, ej. "8A". */
  camelot: string;
  confidence: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Perfiles Krumhansl–Schmuckler (pesos de cada grado en modo mayor/menor).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export async function detectKey(buffer: AudioBuffer): Promise<KeyResult> {
  const chroma = computeChroma(buffer);

  let best = { pitchClass: 0, mode: 'major' as 'major' | 'minor', score: -Infinity };
  let runnerUp = -Infinity;

  for (let tonic = 0; tonic < 12; tonic++) {
    const majScore = correlate(chroma, rotate(MAJOR_PROFILE, tonic));
    const minScore = correlate(chroma, rotate(MINOR_PROFILE, tonic));
    if (majScore > best.score) {
      runnerUp = best.score;
      best = { pitchClass: tonic, mode: 'major', score: majScore };
    } else if (majScore > runnerUp) runnerUp = majScore;
    if (minScore > best.score) {
      runnerUp = best.score;
      best = { pitchClass: tonic, mode: 'minor', score: minScore };
    } else if (minScore > runnerUp) runnerUp = minScore;
  }

  const camelot = pitchClassToCamelot(best.pitchClass, best.mode);
  const confidence = best.score <= 0 ? 0 : Math.max(0, Math.min(1, (best.score - runnerUp) / best.score));

  return {
    pitchClass: best.pitchClass,
    mode: best.mode,
    name: `${NOTE_NAMES[best.pitchClass]} ${best.mode}`,
    camelot,
    confidence,
  };
}

/** Chromagrama de 12 clases usando Goertzel sobre octavas 3–6. */
function computeChroma(buffer: AudioBuffer): number[] {
  // Downmix a mono y downsample simple a ~11025 Hz para acelerar.
  const targetRate = 11025;
  const mono = downmixMono(buffer);
  const factor = Math.max(1, Math.floor(buffer.sampleRate / targetRate));
  const rate = buffer.sampleRate / factor;

  // Analizar hasta 90 s del centro del track (parte más representativa).
  const maxSamples = Math.floor(rate * 90);
  const totalDown = Math.floor(mono.length / factor);
  const start = Math.max(0, Math.floor((totalDown - maxSamples) / 2));
  const count = Math.min(maxSamples, totalDown - start);

  const signal = new Float32Array(count);
  for (let i = 0; i < count; i++) signal[i] = mono[(start + i) * factor];

  const chroma = new Array(12).fill(0);
  for (let pc = 0; pc < 12; pc++) {
    for (let octave = 3; octave <= 6; octave++) {
      const midi = pc + 12 * (octave + 1);
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      if (freq < rate / 2) {
        chroma[pc] += goertzelPower(signal, rate, freq);
      }
    }
  }
  return normalize(chroma);
}

function downmixMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}

/** Potencia de una frecuencia concreta mediante el algoritmo de Goertzel. */
function goertzelPower(signal: Float32Array, sampleRate: number, freq: number): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const s0 = signal[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

function rotate(profile: number[], by: number): number[] {
  return profile.map((_, i) => profile[(i - by + 12) % 12]);
}

/** Correlación de Pearson entre el chroma y un perfil. */
function correlate(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

function normalize(v: number[]): number[] {
  const max = Math.max(...v, 1e-9);
  return v.map((x) => x / max);
}

function mean(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / v.length;
}
