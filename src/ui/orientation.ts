/**
 * Fuerza la orientación HORIZONTAL (landscape) del estudio y — sobre todo —
 * garantiza UN SOLO diseño horizontal, idéntico tengas el teléfono en horizontal
 * o en vertical (nada de "horizontal falso" que cambie el diseño o quite botones).
 *
 * El problema clásico: las media queries de CSS (`orientation`, `max-width`) se
 * evalúan contra el viewport, que se INTERCAMBIA al girar el teléfono. Así, el
 * mismo móvil recibía reglas distintas en horizontal vs. vertical. La solución es
 * decidir el modo con JavaScript según el LADO CORTO físico de la pantalla (que NO
 * cambia al girar) y exponerlo como atributos en <html>:
 *
 *   data-compact="1"      → es un teléfono (lado corto ≤ 560px): consola densa.
 *   data-force-rotate="1" → teléfono en vertical: se rota la app por CSS.
 *
 * El CSS cuelga de estos atributos (no de la orientación), de modo que el diseño
 * es EXACTAMENTE el mismo en ambas posiciones; al ponerlo vertical solo se le
 * añade la rotación, sin alterar nada más.
 *
 * Capas complementarias donde el navegador lo permite:
 *   1) Manifiesto PWA "orientation": "landscape" (si se instala).
 *   2) screen.orientation.lock('landscape') (Android/Chrome a pantalla completa).
 *   3) Rotación por CSS de respaldo (universal), controlada por data-force-rotate.
 */

interface LockableOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

/** Lado corto (px) a partir del cual dejamos de considerarlo teléfono. */
const PHONE_MAX_SHORT_SIDE = 560;

function getScreenOrientation(): LockableOrientation | undefined {
  if (typeof screen === 'undefined') return undefined;
  return (screen as unknown as { orientation?: LockableOrientation }).orientation;
}

/**
 * Intenta bloquear la orientación en horizontal. Debe llamarse dentro de un gesto
 * del usuario (al entrar al estudio). Si el navegador no lo permite (p. ej. iOS
 * Safari sin instalar), no pasa nada: la rotación por CSS actúa de respaldo.
 */
export async function lockLandscape(): Promise<void> {
  const orientation = getScreenOrientation();
  if (!orientation?.lock) return;
  try {
    await orientation.lock('landscape');
  } catch {
    // No soportado o requiere pantalla completa: el respaldo por CSS se encarga.
  }
}

/** Calcula y aplica el modo de visualización en <html> (idempotente). */
function applyDisplayMode(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window.innerWidth || document.documentElement.clientWidth;
  const h = window.innerHeight || document.documentElement.clientHeight;
  if (!w || !h) return;

  const portrait = h >= w;
  const shortSide = Math.min(w, h);
  const isPhone = shortSide <= PHONE_MAX_SHORT_SIDE;
  // "Compacto" = cualquier teléfono (en H o en V, decisión por el lado corto que
  // NO cambia al girar) O una ventana estrecha (ancho ≤ 900px, como el @media
  // anterior). Como isPhone no depende de la orientación, el layout móvil queda
  // IDÉNTICO con el teléfono en horizontal o en vertical.
  const isCompact = isPhone || w <= 900;

  const root = document.documentElement;
  root.dataset.compact = isCompact ? '1' : '0';
  // Teléfono en vertical → rotar por CSS para presentarlo horizontal.
  root.dataset.forceRotate = isPhone && portrait ? '1' : '0';
}

let installed = false;

/**
 * Instala el controlador de modo de visualización. Se llama al arrancar (antes de
 * pintar React) y reacciona a cambios de tamaño/orientación del dispositivo.
 */
export function initDisplayMode(): void {
  if (installed) return;
  installed = true;
  applyDisplayMode();
  window.addEventListener('resize', applyDisplayMode, { passive: true });
  window.addEventListener('orientationchange', applyDisplayMode, { passive: true });
}
