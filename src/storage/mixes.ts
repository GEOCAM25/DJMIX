import { getDB, newId, type MixMeta } from './db';

/** Repositorio de mixes grabados (metadatos + blob separados). */

export async function saveMix(
  name: string,
  blob: Blob,
  mimeType: string,
  durationMs: number,
): Promise<MixMeta> {
  const db = await getDB();
  const id = newId('mix');
  const meta: MixMeta = {
    id,
    name,
    mimeType,
    durationMs,
    size: blob.size,
    createdAt: Date.now(),
  };
  const tx = db.transaction(['mixes', 'mixBlobs'], 'readwrite');
  await tx.objectStore('mixes').put(meta);
  await tx.objectStore('mixBlobs').put({ id, blob });
  await tx.done;
  return meta;
}

export async function listMixes(): Promise<MixMeta[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('mixes', 'by-createdAt');
  return all.reverse();
}

/** Devuelve un object URL para reproducir/descargar el mix (recuerda revocarlo). */
export async function getMixUrl(id: string): Promise<string | null> {
  const db = await getDB();
  const rec = await db.get('mixBlobs', id);
  if (!rec) return null;
  return URL.createObjectURL(rec.blob);
}

export async function getMixBlob(id: string): Promise<Blob | null> {
  const db = await getDB();
  const rec = await db.get('mixBlobs', id);
  return rec?.blob ?? null;
}

export async function renameMix(id: string, name: string): Promise<void> {
  const db = await getDB();
  const meta = await db.get('mixes', id);
  if (meta) await db.put('mixes', { ...meta, name });
}

export async function deleteMix(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['mixes', 'mixBlobs'], 'readwrite');
  await tx.objectStore('mixes').delete(id);
  await tx.objectStore('mixBlobs').delete(id);
  await tx.done;
}
