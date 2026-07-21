import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Esquema de IndexedDB de DJMIX (local-first, cero servidor).
 *
 * Principio anti-saturación de memoria:
 *   Los BLOBS de audio (pesados) se guardan en stores separados de sus
 *   METADATOS (ligeros). Así, listar la biblioteca o el historial de mixes
 *   solo lee metadatos; el audio se carga BAJO DEMANDA (al montar un deck o
 *   reproducir un mix). IndexedDB persiste los blobs en disco, no en RAM.
 *
 * Stores:
 *   tracks     -> metadatos de pistas importadas (id, título, bpm, key, cues…)
 *   trackBlobs -> audio original/decodificado de cada pista  (id -> Blob)
 *   mixes      -> metadatos de sesiones grabadas
 *   mixBlobs   -> audio de cada mix grabado                  (id -> Blob)
 *   sessions   -> snapshots del estado del estudio (asignación de decks, mezcla)
 *   settings   -> pares clave/valor (preferencias, claves API del usuario…)
 */
export interface TrackMeta {
  id: string;
  title: string;
  artist?: string;
  engine: 'local' | 'youtube';
  /** Para YouTube guardamos el ID; no hay blob asociado. */
  youtubeId?: string;
  format?: string;
  bpm: number | null;
  camelotKey: string | null;
  /** Energía relativa 0..1 estimada por el analizador. */
  energy: number | null;
  duration: number;
  /** Hot cues en segundos. */
  cues: number[];
  /** Tamaño del blob en bytes (0 para YouTube). */
  size: number;
  createdAt: number;
}

export interface MixMeta {
  id: string;
  name: string;
  mimeType: string;
  durationMs: number;
  size: number;
  createdAt: number;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  createdAt: number;
  /** Estado serializable del estudio (asignación de decks, EQ, crossfader…). */
  state: unknown;
}

interface DjmixDB extends DBSchema {
  tracks: {
    key: string;
    value: TrackMeta;
    indexes: { 'by-createdAt': number };
  };
  trackBlobs: {
    key: string;
    value: { id: string; blob: Blob };
  };
  mixes: {
    key: string;
    value: MixMeta;
    indexes: { 'by-createdAt': number };
  };
  mixBlobs: {
    key: string;
    value: { id: string; blob: Blob };
  };
  sessions: {
    key: string;
    value: SessionSnapshot;
    indexes: { 'by-createdAt': number };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'djmix';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DjmixDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<DjmixDB>> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<DjmixDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const tracks = db.createObjectStore('tracks', { keyPath: 'id' });
      tracks.createIndex('by-createdAt', 'createdAt');
      db.createObjectStore('trackBlobs', { keyPath: 'id' });

      const mixes = db.createObjectStore('mixes', { keyPath: 'id' });
      mixes.createIndex('by-createdAt', 'createdAt');
      db.createObjectStore('mixBlobs', { keyPath: 'id' });

      const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('by-createdAt', 'createdAt');

      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

/** Genera un id único y ordenable en el tiempo. */
export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Estima cuánto espacio ocupa la app y cuánto hay disponible (Storage API).
 * Útil para avisar al usuario antes de saturar el dispositivo.
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  }
  return { usage: 0, quota: 0 };
}
