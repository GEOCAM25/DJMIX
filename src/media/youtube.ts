/**
 * Utilidades de YouTube: espera de la IFrame API, parseo de IDs y búsqueda.
 *
 * Estrategia de reproducción sin anuncios (YouTube Premium):
 *   El vídeo se reproduce SIEMPRE dentro del IFrame Player oficial de YouTube,
 *   que corre bajo el dominio youtube.com con las cookies/sesión del usuario.
 *   Si esa sesión tiene Premium activo, YouTube sirve el contenido sin
 *   anuncios de forma nativa. No "esquivamos" anuncios: delegamos la
 *   reproducción al reproductor oficial, que respeta la suscripción.
 *   (No se puede, ni se debe, extraer el stream de audio para saltar anuncios).
 */

let apiReadyPromise: Promise<void> | null = null;

/** Resuelve cuando window.YT.Player está disponible. */
export function whenYouTubeApiReady(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && window.YT && window.YT.Player) {
      resolve();
      return;
    }
    // La API llama a esta función global cuando termina de cargar.
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
  });
  return apiReadyPromise;
}

/** Extrae el ID de vídeo desde una URL de YouTube o devuelve la cadena si ya es un ID. */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  // ID puro (11 caracteres del alfabeto base64url de YouTube).
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1, 12) || null;
    if (url.searchParams.has('v')) return url.searchParams.get('v');
    const parts = url.pathname.split('/');
    const idx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].slice(0, 11);
  } catch {
    /* no era una URL */
  }
  return null;
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
}

/**
 * Busca vídeos con la YouTube Data API v3. Requiere una API key (cuota gratis).
 * Si no hay key, la UI ofrece cargar por URL/ID directamente (sin buscador).
 *
 * @param query   Texto de búsqueda.
 * @param apiKey  Clave de la Data API v3 (el usuario la guarda localmente).
 */
export async function searchYouTube(
  query: string,
  apiKey: string,
  maxResults = 12,
): Promise<YouTubeSearchResult[]> {
  if (!apiKey) throw new Error('Falta la API key de YouTube. Configúrala o carga por URL.');
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCategoryId', '10'); // Música
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('q', query);
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Error de búsqueda (${res.status})`);
  }
  const data = await res.json();
  return (data.items ?? [])
    .filter((it: { id?: { videoId?: string } }) => it.id?.videoId)
    .map((it: {
      id: { videoId: string };
      snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } };
    }) => ({
      id: it.id.videoId,
      title: decodeHtml(it.snippet.title),
      channel: it.snippet.channelTitle,
      thumbnail: it.snippet.thumbnails?.medium?.url ?? '',
    }));
}

/** Decodifica entidades HTML que devuelve la API de YouTube (&amp;, &#39;, …). */
function decodeHtml(text: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}
