import { getDB } from './db';

/**
 * Handle sin tipado de esquema. El respaldo recorre stores de forma dinámica,
 * así que evitamos el tipado por-store de idb con un acceso genérico.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDB = any;

/**
 * Respaldo local-first (Bring Your Own Cloud).
 *
 * Exporta/importa TODA la base de datos de IndexedDB a un único JSON, para que
 * el usuario guarde su configuración (pistas y sus cues, mixes, sesiones,
 * Smart Crates, ajustes…) donde quiera: disco, USB o su propia nube.
 *
 * El recorrido es GENÉRICO (vuelca todos los object stores), así que cualquier
 * store nuevo que añadamos entra en el respaldo automáticamente. Los blobs de
 * audio (pesados) se excluyen por defecto y solo se incluyen (en base64) si el
 * usuario pide un respaldo completo.
 */

const BLOB_STORES = ['trackBlobs', 'mixBlobs'];

export interface BackupEnvelope {
  app: 'DJMIX';
  kind: 'backup';
  version: number;
  exportedAt: string;
  includeBlobs: boolean;
  data: Record<string, unknown[]>;
}

export async function exportBackup(includeBlobs = false): Promise<BackupEnvelope> {
  const db: LooseDB = await getDB();
  const storeNames = [...db.objectStoreNames];
  const data: Record<string, unknown[]> = {};

  for (const name of storeNames) {
    if (BLOB_STORES.includes(name)) {
      if (!includeBlobs) continue;
      const records = (await db.getAll(name)) as Array<{ id: string; blob: Blob }>;
      data[name] = await Promise.all(
        records.map(async (r) => ({
          id: r.id,
          blobBase64: await blobToBase64(r.blob),
          type: r.blob.type,
        })),
      );
    } else {
      data[name] = await db.getAll(name);
    }
  }

  return {
    app: 'DJMIX',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    includeBlobs,
    data,
  };
}

/** Serializa el respaldo a un Blob JSON descargable. */
export async function exportBackupBlob(includeBlobs = false): Promise<Blob> {
  const envelope = await exportBackup(includeBlobs);
  return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
}

export interface RestoreResult {
  restored: Record<string, number>;
  mode: 'merge' | 'replace';
}

/**
 * Restaura un respaldo. `merge` conserva lo existente y sobrescribe por clave;
 * `replace` vacía cada store antes de escribir.
 */
export async function importBackup(
  envelope: BackupEnvelope,
  mode: 'merge' | 'replace' = 'merge',
): Promise<RestoreResult> {
  if (!envelope || envelope.app !== 'DJMIX' || envelope.kind !== 'backup') {
    throw new Error('El archivo no es un respaldo válido de DJMIX.');
  }
  const db: LooseDB = await getDB();
  const restored: Record<string, number> = {};

  for (const [name, records] of Object.entries(envelope.data)) {
    if (!db.objectStoreNames.contains(name)) continue;
    const tx = db.transaction(name, 'readwrite');
    if (mode === 'replace') await tx.store.clear();
    for (const rec of records as Array<Record<string, unknown>>) {
      let toPut: unknown = rec;
      if (BLOB_STORES.includes(name) && typeof rec.blobBase64 === 'string') {
        toPut = { id: rec.id, blob: base64ToBlob(rec.blobBase64, String(rec.type ?? '')) };
      }
      await tx.store.put(toPut);
    }
    await tx.done;
    restored[name] = records.length;
  }
  return { restored, mode };
}

/** Lee un File JSON y lo valida como envelope de respaldo. */
export async function parseBackupFile(file: File): Promise<BackupEnvelope> {
  const text = await file.text();
  const parsed = JSON.parse(text) as BackupEnvelope;
  if (parsed.app !== 'DJMIX' || parsed.kind !== 'backup') {
    throw new Error('El archivo no es un respaldo de DJMIX.');
  }
  return parsed;
}

// ── Helpers base64 ↔ Blob ────────────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(((reader.result as string) || '').split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
