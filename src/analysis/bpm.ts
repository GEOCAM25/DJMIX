/**
 * Detección de BPM 100% en el cliente.
 *
 * Técnica (clásica y ligera):
 *   1. Se re-renderiza el audio en un OfflineAudioContext pasándolo por un
 *      filtro pasa-bajos (aísla bombo/kick) + pasa-altos (quita DC/sub).
 *   2. Se detectan picos de energía por encima de un umbral dinámico.
 *   3. Se miden los intervalos entre picos y se agrupan en candidatos de tempo.
 *   4. Se elige el tempo con más soporte, normalizado al rango 80–180 BPM.
 *
 * No es tan preciso como un analizador dedicado, pero es suficiente para
 * sugerencias de mezcla y auto-sync, y no depende de librerías externas.
 */
export interface BpmResult {
  bpm: number;
  /** Confianza relativa 0..1 (cuán dominante fue el candidato ganador). */
  confidence: number;
  /** Energía RMS normalizada 0..1 (proxy de "intensidad" del track). */
  energy: number;
}

export async function detectBpm(buffer: AudioBuffer): Promise<BpmResult> {
  const offline = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = buffer;

  const lowpass = offline.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 150;
  lowpass.Q.value = 1;

  const highpass = offline.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 90;
  highpass.Q.value = 1;

  source.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  const data = rendered.getChannelData(0);
  const sampleRate = rendered.sampleRate;

  const peaks = findPeaks(data, sampleRate);
  const { bpm, confidence } = intervalsToBpm(peaks, sampleRate);
  const energy = computeEnergy(buffer);

  return { bpm, confidence, energy };
}

/** Detecta picos por encima de un umbral, con separación mínima entre ellos. */
function findPeaks(data: Float32Array, sampleRate: number): number[] {
  // Umbral: fracción del pico máximo absoluto.
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > max) max = v;
  }
  const threshold = max * 0.6;
  const minGap = Math.floor(sampleRate * 0.25); // 250 ms => máx. 240 BPM

  const peaks: number[] = [];
  let last = -minGap;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= threshold && i - last >= minGap) {
      peaks.push(i);
      last = i;
    }
  }
  return peaks;
}

/** Convierte intervalos entre picos en un BPM dominante. */
function intervalsToBpm(peaks: number[], sampleRate: number): { bpm: number; confidence: number } {
  if (peaks.length < 4) return { bpm: 120, confidence: 0 };

  const counts = new Map<number, number>();
  for (let i = 0; i < peaks.length - 1; i++) {
    for (let j = i + 1; j < Math.min(i + 10, peaks.length); j++) {
      const intervalSec = (peaks[j] - peaks[i]) / sampleRate;
      if (intervalSec === 0) continue;
      let bpm = 60 / intervalSec;
      // Normalizar octavas de tempo al rango musical habitual.
      while (bpm < 80) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      const rounded = Math.round(bpm);
      counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
    }
  }

  let best = 120;
  let bestCount = 0;
  let total = 0;
  for (const [bpm, count] of counts) {
    total += count;
    if (count > bestCount) {
      best = bpm;
      bestCount = count;
    }
  }
  return { bpm: best, confidence: total > 0 ? bestCount / total : 0 };
}

/** RMS global normalizado como proxy de energía/intensidad. */
function computeEnergy(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / 100_000)); // muestreo
  let sumSquares = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += step) {
    sumSquares += data[i] * data[i];
    n++;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, n));
  // Mapeo suave a 0..1 (rms ~0.3 ya es bastante intenso).
  return Math.max(0, Math.min(1, rms * 3));
}
