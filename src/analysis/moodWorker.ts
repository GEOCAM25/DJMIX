/**
 * Web Worker del Mood Tagger: recibe la señal mono (transferida) y devuelve las
 * etiquetas de ánimo, sin bloquear el hilo principal durante la importación.
 */
import { computeMoodFeatures, moodTags, type MoodFeatures } from './mood';

interface MoodRequest {
  mono: Float32Array;
  sampleRate: number;
  bpm: number | null;
}

self.onmessage = (e: MessageEvent<MoodRequest>) => {
  const { mono, sampleRate, bpm } = e.data;
  const features: MoodFeatures = computeMoodFeatures(mono, sampleRate, bpm);
  const tags = moodTags(features);
  (self as unknown as Worker).postMessage({ tags, features });
};
