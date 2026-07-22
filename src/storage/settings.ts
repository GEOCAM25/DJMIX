import { getDB } from './db';

/**
 * Almacén clave/valor para preferencias y credenciales del usuario.
 *
 * PRIVACIDAD: las claves API (YouTube, IA) que el usuario introduce se guardan
 * SOLO aquí, en su navegador. Nunca se envían a un backend de DJMIX (no existe).
 */

export type SettingKey =
  | 'youtubeApiKey'
  | 'aiApiKey'
  | 'aiModel'
  | 'crossfaderCurve'
  | 'masterGain'
  | 'lastSessionId'
  | 'theme'
  | 'cueDeviceId'
  | 'cueVolume'
  | 'googleClientId'
  | 'midiMappings';

export async function getSetting<T = unknown>(key: SettingKey): Promise<T | undefined> {
  const db = await getDB();
  const rec = await db.get('settings', key);
  return rec?.value as T | undefined;
}

export async function setSetting(key: SettingKey, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key, value });
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const db = await getDB();
  const all = await db.getAll('settings');
  return Object.fromEntries(all.map((s) => [s.key, s.value]));
}

/**
 * Resuelve una credencial con prioridad: valor guardado por el usuario > .env.
 * Así la app funciona en despliegues demo (con .env) pero el usuario final
 * puede sobreescribir con su propia clave desde la UI.
 */
export async function resolveYouTubeKey(): Promise<string> {
  const stored = await getSetting<string>('youtubeApiKey');
  return stored || import.meta.env.VITE_YOUTUBE_API_KEY || '';
}

export async function resolveAiKey(): Promise<string> {
  const stored = await getSetting<string>('aiApiKey');
  return stored || import.meta.env.VITE_AI_API_KEY || '';
}
