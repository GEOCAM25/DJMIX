/**
 * Cliente del Mood Tagger: prepara la señal mono y delega el análisis en el Web
 * Worker (fuera del hilo principal). Si el entorno no soporta Workers, calcula
 * de forma síncrona como respaldo.
 */
import { computeMoodFeatures, moodTags } from './mood';

function downmix(buffer: AudioBuffer): Float32Array {
  const ch0 = buffer.getChannelData(0);
  if (buffer.numberOfChannels === 1) return Float32Array.from(ch0);
  const ch1 = buffer.getChannelData(1);
  const out = new Float32Array(ch0.length);
  for (let i = 0; i < out.length; i++) out[i] = (ch0[i] + ch1[i]) * 0.5;
  return out;
}

/** Analiza el ánimo de un AudioBuffer y devuelve sus etiquetas. */
export function analyzeMood(buffer: AudioBuffer, bpm: number | null): Promise<string[]> {
  const mono = downmix(buffer);
  const fallback = () => moodTags(computeMoodFeatures(mono, buffer.sampleRate, bpm));

  if (typeof Worker === 'undefined') return Promise.resolve(fallback());

  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./moodWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(fallback());
      return;
    }
    const done = (tags: string[]) => {
      resolve(tags);
      worker.terminate();
    };
    worker.onmessage = (e: MessageEvent<{ tags: string[] }>) => done(e.data.tags);
    worker.onerror = () => done(fallback());
    // Transferimos el ArrayBuffer del mono (copia propia, no la del AudioBuffer).
    worker.postMessage({ mono, sampleRate: buffer.sampleRate, bpm }, [mono.buffer]);
  });
}
