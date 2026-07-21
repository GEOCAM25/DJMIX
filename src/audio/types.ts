/**
 * Tipos compartidos por el motor de audio.
 *
 * DJMIX maneja dos "motores" de reproducción distintos por deck:
 *  - 'local'   -> audio decodificado a AudioBuffer y enrutado por Web Audio API
 *                 (permite EQ, filtros, efectos y GRABACIÓN del máster).
 *  - 'youtube' -> reproducción vía IFrame Player API. El audio es cross-origin,
 *                 así que NO puede pasar por el grafo de Web Audio: el control
 *                 se limita a play/pause/seek/velocidad y volumen (crossfader).
 *                 Ver README > "Manejo de YouTube y la barrera cross-origin".
 */
export type EngineType = 'local' | 'youtube';

export type DeckId = 'A' | 'B';

export interface EqValues {
  /** Ganancia banda grave en dB (-26..+6 aprox). */
  low: number;
  /** Ganancia banda media en dB. */
  mid: number;
  /** Ganancia banda aguda en dB. */
  high: number;
}

export interface DeckState {
  id: DeckId;
  engine: EngineType;
  /** Metadatos de la pista cargada (o null si vacío). */
  trackId: string | null;
  title: string;
  playing: boolean;
  /** Posición de reproducción en segundos. */
  position: number;
  /** Duración total en segundos. */
  duration: number;
  /** Ajuste de tempo en % (-8..+8 típico, hasta ±50 en la UI). */
  tempo: number;
  /** BPM original detectado. */
  bpm: number | null;
  /** Tonalidad musical (notación Camelot, ej. "8A"). */
  camelotKey: string | null;
  /** Puntos de cue guardados, en segundos. */
  cuePoints: number[];
}

/** Descriptor mínimo de una pista lista para cargar en un deck. */
export interface LoadableTrack {
  id: string;
  title: string;
  engine: EngineType;
  /** Para 'local': AudioBuffer ya decodificado. */
  buffer?: AudioBuffer;
  /** Para 'youtube': ID del vídeo. */
  youtubeId?: string;
  bpm?: number | null;
  camelotKey?: string | null;
  duration?: number;
}

/** Par entrada/salida para encadenar unidades de proceso reutilizables. */
export interface AudioUnit {
  input: AudioNode;
  output: AudioNode;
}
