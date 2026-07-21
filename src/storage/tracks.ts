import { getDB, newId, type TrackMeta } from './db';

/**
 * Repositorio de pistas. Separa metadatos (ligeros) del blob de audio (pesado).
 */

export interface SaveTrackInput {
  title: string;
  artist?: string;
  engine: 'local' | 'youtube';
  youtubeId?: string;
  format?: string;
  bpm?: number | null;
  camelotKey?: string | null;
  energy?: number | null;
  duration: number;
  cues?: number[];
  /** Blob de audio para pistas locales (no aplica a YouTube). */
  blob?: Blob;
}

export async function saveTrack(input: SaveTrackInput): Promise<TrackMeta> {
  const db = await getDB();
  const id = newId('trk');
  const meta: TrackMeta = {
    id,
    title: input.title,
    artist: input.artist,
    engine: input.engine,
    youtubeId: input.youtubeId,
    format: input.format,
    bpm: input.bpm ?? null,
    camelotKey: input.camelotKey ?? null,
    energy: input.energy ?? null,
    duration: input.duration,
    cues: input.cues ?? [],
    size: input.blob?.size ?? 0,
    createdAt: Date.now(),
  };

  const tx = db.transaction(['tracks', 'trackBlobs'], 'readwrite');
  await tx.objectStore('tracks').put(meta);
  if (input.blob) await tx.objectStore('trackBlobs').put({ id, blob: input.blob });
  await tx.done;
  return meta;
}

/** Lista SOLO metadatos (no carga blobs). Ordenado por más reciente. */
export async function listTracks(): Promise<TrackMeta[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('tracks', 'by-createdAt');
  return all.reverse();
}

/** Carga el blob de audio de una pista bajo demanda. */
export async function getTrackBlob(id: string): Promise<Blob | null> {
  const db = await getDB();
  const rec = await db.get('trackBlobs', id);
  return rec?.blob ?? null;
}

export async function updateTrack(id: string, patch: Partial<TrackMeta>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('tracks', id);
  if (!existing) return;
  await db.put('tracks', { ...existing, ...patch, id });
}

/** Actualiza los hot cues de una pista. */
export async function setTrackCues(id: string, cues: number[]): Promise<void> {
  await updateTrack(id, { cues });
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['tracks', 'trackBlobs'], 'readwrite');
  await tx.objectStore('tracks').delete(id);
  await tx.objectStore('trackBlobs').delete(id);
  await tx.done;
}
