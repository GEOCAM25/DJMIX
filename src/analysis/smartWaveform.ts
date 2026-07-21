import { fftMagnitudes } from './fft';

/**
 * Onda "inteligente": para cada columna (bin) de la forma de onda calcula la
 * amplitud (altura) y cómo se reparte la energía entre tres bandas —graves,
 * medios y agudos— para poder colorearla como Serato/Rekordbox:
 *   graves/kick → rojo · medios/voz → verde · agudos/hi-hat → azul.
 *
 * Se resuelve en UNA pasada con FFT por ventana (sin renders offline extra).
 */
export interface SmartWave {
  /** Amplitud pico por columna, 0..1 (altura de la barra). */
  peaks: Float32Array;
  /** Energía relativa de graves por columna, 0..1. */
  low: Float32Array;
  /** Energía relativa de medios por columna, 0..1. */
  mid: Float32Array;
  /** Energía relativa de agudos por columna, 0..1. */
  high: Float32Array;
}

const LOW_MAX_HZ = 200;
const MID_MAX_HZ = 2000;

export function computeSmartWaveform(buffer: AudioBuffer, bins = 1000): SmartWave {
  const data = downmixMono(buffer);
  const sr = buffer.sampleRate;
  const fftSize = 1024;
  const half = fftSize >> 1;
  const hann = makeHann(fftSize);
  const step = Math.max(1, Math.floor(data.length / bins));

  // Índices de bin de FFT que delimitan cada banda (freq = k * sr / fftSize).
  const lowBin = Math.max(1, Math.round((LOW_MAX_HZ * fftSize) / sr));
  const midBin = Math.round((MID_MAX_HZ * fftSize) / sr);

  const peaks = new Float32Array(bins);
  const low = new Float32Array(bins);
  const mid = new Float32Array(bins);
  const high = new Float32Array(bins);
  const frame = new Float32Array(fftSize);

  for (let i = 0; i < bins; i++) {
    const center = i * step;

    // Altura: pico en el bloque (coincide con la forma de onda clásica).
    let peak = 0;
    for (let j = 0; j < step; j++) {
      const v = Math.abs(data[center + j] || 0);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;

    // Espectro de una ventana Hann centrada en el bloque.
    const start = Math.max(0, Math.min(center - half, data.length - fftSize));
    for (let k = 0; k < fftSize; k++) frame[k] = (data[start + k] || 0) * hann[k];
    const mags = fftMagnitudes(frame);

    let lo = 0;
    let md = 0;
    let hi = 0;
    for (let k = 1; k < half; k++) {
      const m = mags[k];
      if (k < lowBin) lo += m;
      else if (k < midBin) md += m;
      else hi += m;
    }
    const total = lo + md + hi || 1;
    low[i] = lo / total;
    mid[i] = md / total;
    high[i] = hi / total;
  }

  normalize(peaks);
  return { peaks, low, mid, high };
}

function makeHann(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  return w;
}

function downmixMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}

function normalize(v: Float32Array): void {
  let max = 1e-6;
  for (let i = 0; i < v.length; i++) if (v[i] > max) max = v[i];
  for (let i = 0; i < v.length; i++) v[i] /= max;
}
