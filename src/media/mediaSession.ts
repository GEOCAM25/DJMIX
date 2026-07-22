/**
 * Integración con la Media Session API.
 *
 * Muestra los controles de reproducción en la pantalla de bloqueo / centro de
 * control del sistema y ayuda a que el SO trate la app como reproductor de
 * medios (best-effort para seguir sonando en segundo plano). En navegadores
 * sin soporte (o iOS Safari, más limitado) simplemente no hace nada.
 */

export interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const LOGO = `${import.meta.env.BASE_URL}logo.png`;
let handlersSet = false;

/** Registra los handlers de los botones del sistema (una sola vez). */
export function setupMediaSession(handlers: MediaSessionHandlers): void {
  if (!('mediaSession' in navigator) || handlersSet) return;
  handlersSet = true;
  const ms = navigator.mediaSession;
  const safe = (action: MediaSessionAction, fn: () => void) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* acción no soportada por este navegador */
    }
  };
  safe('play', handlers.onPlay);
  safe('pause', handlers.onPause);
  safe('nexttrack', handlers.onNext);
  safe('previoustrack', handlers.onPrevious);
}

/** Actualiza los metadatos y el estado (playing/paused) del sistema. */
export function updateMediaSession(opts: { title: string; artist?: string; playing: boolean }): void {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  try {
    ms.metadata = new MediaMetadata({
      title: opts.title || 'BEAT DJ',
      artist: opts.artist || 'BEAT DJ',
      album: 'BEAT DJ',
      artwork: [{ src: LOGO, sizes: '512x512', type: 'image/png' }],
    });
    ms.playbackState = opts.playing ? 'playing' : 'paused';
  } catch {
    /* noop */
  }
}
