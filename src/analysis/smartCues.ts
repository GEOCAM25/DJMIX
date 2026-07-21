/**
 * Smart Cues: detección automática de puntos de cue por análisis de energía.
 *
 * Al cargar una pista, se calcula la envolvente de energía (RMS por ventanas) y
 * se buscan los ASCENSOS bruscos respecto a la línea base reciente —los típicos
 * cambios estructurales de un tema: intro, drops, subidas—. Se eligen los más
 * prominentes, bien espaciados, y se colocan como cue points en la línea de
 * tiempo del deck.
 */
export function detectSmartCues(buffer: AudioBuffer, maxCues = 8): number[] {
  const data = downmixMono(buffer);
  const sr = buffer.sampleRate;
  const winSec = 0.05; // 50 ms por ventana
  const win = Math.max(1, Math.floor(sr * winSec));
  const nWin = Math.floor(data.length / win);
  if (nWin < 4) return [];

  // Envolvente de energía (RMS por ventana).
  const energy = new Float32Array(nWin);
  for (let i = 0; i < nWin; i++) {
    let sum = 0;
    const start = i * win;
    for (let j = 0; j < win; j++) {
      const v = data[start + j];
      sum += v * v;
    }
    energy[i] = Math.sqrt(sum / win);
  }

  // Fuerza de "onset": cuánto sube la energía respecto a la media reciente (~1 s).
  const baselineWins = 20;
  const onset = new Float32Array(nWin);
  for (let i = 1; i < nWin; i++) {
    let base = 0;
    let count = 0;
    for (let k = Math.max(0, i - baselineWins); k < i; k++) {
      base += energy[k];
      count++;
    }
    base = count ? base / count : 0;
    onset[i] = Math.max(0, energy[i] - base);
  }

  // Selección de picos con separación mínima (4 s) y umbral relativo.
  let maxOnset = 1e-6;
  for (let i = 0; i < nWin; i++) if (onset[i] > maxOnset) maxOnset = onset[i];
  const threshold = maxOnset * 0.25;
  const minGapWins = Math.floor(4 / winSec);

  const peaks: Array<{ index: number; strength: number }> = [];
  for (let i = 1; i < nWin - 1; i++) {
    if (onset[i] >= threshold && onset[i] >= onset[i - 1] && onset[i] > onset[i + 1]) {
      peaks.push({ index: i, strength: onset[i] });
    }
  }
  peaks.sort((a, b) => b.strength - a.strength);

  const chosen: number[] = [];
  for (const peak of peaks) {
    if (chosen.every((c) => Math.abs(c - peak.index) >= minGapWins)) chosen.push(peak.index);
    if (chosen.length >= maxCues) break;
  }

  return chosen
    .map((i) => Math.round(i * winSec * 100) / 100)
    .sort((a, b) => a - b);
}

function downmixMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}
