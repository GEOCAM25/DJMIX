/**
 * Auto-Slicer: corta un AudioBuffer en trozos según sus transitorios (golpes)
 * y devuelve un sub-AudioBuffer por trozo, listo para mapear a los pads del
 * sampler y tocarlo en vivo.
 *
 * Reutiliza la misma idea de detección de energía que los Smart Cues, pero con
 * separación mínima menor para conseguir 8–16 cortes.
 */
export interface Slice {
  label: string;
  buffer: AudioBuffer;
}

export function sliceBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, maxSlices = 8): Slice[] {
  const points = detectOnsetTimes(buffer, maxSlices);
  const slices: Slice[] = [];
  for (let i = 0; i < points.length && slices.length < maxSlices; i++) {
    const start = points[i];
    const end = i + 1 < points.length ? points[i + 1] : buffer.duration;
    if (end - start < 0.05) continue;
    slices.push({ label: `${slices.length + 1}`, buffer: copyRegion(ctx, buffer, start, end) });
  }
  return slices;
}

/** Devuelve tiempos de inicio (s) de los trozos, incluyendo 0, ordenados. */
function detectOnsetTimes(buffer: AudioBuffer, maxSlices: number): number[] {
  const data = downmixMono(buffer);
  const sr = buffer.sampleRate;
  const winSec = 0.03;
  const win = Math.max(1, Math.floor(sr * winSec));
  const nWin = Math.floor(data.length / win);
  if (nWin < 4) return [0];

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

  const baseWins = 12;
  const onset = new Float32Array(nWin);
  for (let i = 1; i < nWin; i++) {
    let base = 0;
    let count = 0;
    for (let k = Math.max(0, i - baseWins); k < i; k++) {
      base += energy[k];
      count++;
    }
    base = count ? base / count : 0;
    onset[i] = Math.max(0, energy[i] - base);
  }

  let maxOnset = 1e-6;
  for (let i = 0; i < nWin; i++) if (onset[i] > maxOnset) maxOnset = onset[i];
  const threshold = maxOnset * 0.2;
  const minGapWins = Math.max(1, Math.floor(0.28 / winSec));

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
    if (chosen.length >= maxSlices - 1) break;
  }

  const times = chosen.map((i) => i * winSec).sort((a, b) => a - b);
  return [0, ...times];
}

function copyRegion(ctx: BaseAudioContext, buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const startFrame = Math.floor(start * sr);
  const endFrame = Math.min(buffer.length, Math.floor(end * sr));
  const length = Math.max(1, endFrame - startFrame);
  const out = ctx.createBuffer(buffer.numberOfChannels, length, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < length; i++) dst[i] = src[startFrame + i] || 0;
  }
  return out;
}

function downmixMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}
