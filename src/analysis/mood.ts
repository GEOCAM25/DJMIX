/**
 * AI Mood Tagger: extrae características de audio (energía, brillo/centroide
 * espectral y dinámica) y las traduce a etiquetas de ánimo en español. Se usa
 * al importar (en un Web Worker) y como regla de Smart Crates.
 *
 * Es DSP puro (sin ML): rápido, offline y explicable.
 */
import { fftMagnitudes } from './fft';

export interface MoodFeatures {
  energy: number; // 0..1 (RMS global escalada)
  brightness: number; // 0..1 (centroide espectral normalizado)
  dynamics: number; // 0..1 (variación de energía entre ventanas)
  bpm: number | null;
}

/** Todas las etiquetas de ánimo posibles (para selectores de la UI). */
export const ALL_MOODS = [
  'Enérgico',
  'Suave',
  'Lento',
  'Bailable',
  'Brillante',
  'Oscuro',
  'Dinámico',
  'Hipnótico',
];

/**
 * Calcula las características de ánimo a partir de una señal mono. `sampleRate`
 * se acepta por simetría con el worker (el centroide se normaliza por Nyquist,
 * así que no depende de la tasa de muestreo).
 */
export function computeMoodFeatures(mono: Float32Array, _sampleRate: number, bpm: number | null): MoodFeatures {
  const n = mono.length;
  if (n < 2048) return { energy: 0, brightness: 0, dynamics: 0, bpm };

  // Energía global (RMS) escalada a un rango perceptual aproximado.
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += mono[i] * mono[i];
  const rms = Math.sqrt(sumSq / n);
  const energy = Math.min(1, rms * 3.5);

  // Ventanas FFT para centroide espectral y dinámica.
  const fftSize = 2048;
  const nWin = Math.floor(n / fftSize);
  const step = Math.max(1, Math.floor(nWin / 60)); // hasta ~60 ventanas muestreadas
  const win = new Float32Array(fftSize);
  let centroidAcc = 0;
  let centroidCount = 0;
  const winRms: number[] = [];

  for (let w = 0; w + fftSize <= n; w += fftSize * step) {
    let wSum = 0;
    for (let i = 0; i < fftSize; i++) {
      const v = mono[w + i];
      win[i] = v;
      wSum += v * v;
    }
    winRms.push(Math.sqrt(wSum / fftSize));

    const mag = fftMagnitudes(win);
    let num = 0;
    let den = 0;
    for (let k = 1; k < mag.length; k++) {
      num += k * mag[k];
      den += mag[k];
    }
    if (den > 1e-6) {
      const centroidBin = num / den; // 0..mag.length
      centroidAcc += centroidBin / mag.length; // 0..1 (fracción de Nyquist)
      centroidCount++;
    }
  }

  const brightness = centroidCount ? Math.min(1, (centroidAcc / centroidCount) * 2.4) : 0;

  // Dinámica = coeficiente de variación de la RMS por ventana.
  let mean = 0;
  for (const r of winRms) mean += r;
  mean /= Math.max(1, winRms.length);
  let varr = 0;
  for (const r of winRms) varr += (r - mean) ** 2;
  varr /= Math.max(1, winRms.length);
  const dynamics = mean > 1e-6 ? Math.min(1, Math.sqrt(varr) / mean) : 0;

  return { energy, brightness, dynamics, bpm };
}

/** Traduce las características a 1–4 etiquetas de ánimo. */
export function moodTags(f: MoodFeatures): string[] {
  const tags: string[] = [];
  if (f.energy > 0.6) tags.push('Enérgico');
  else if (f.energy < 0.33) tags.push('Suave');

  if (f.bpm != null) {
    if (f.bpm < 92) tags.push('Lento');
    else if (f.bpm > 128) tags.push('Bailable');
  }

  if (f.brightness > 0.58) tags.push('Brillante');
  else if (f.brightness < 0.32) tags.push('Oscuro');

  if (f.dynamics > 0.5) tags.push('Dinámico');
  else if (f.dynamics < 0.22) tags.push('Hipnótico');

  if (tags.length === 0) tags.push('Neutro');
  return tags.slice(0, 4);
}
