/**
 * Orientación del estudio: BEAT DJ solo funciona en HORIZONTAL.
 *
 * - Donde el navegador lo permite, se bloquea la orientación en horizontal
 *   (manifiesto PWA "orientation": "landscape" + screen.orientation.lock).
 * - Donde no se puede (p. ej. iOS Safari sin instalar), la app NO se usa en
 *   vertical: se muestra un aviso "pon el teléfono en horizontal" (ver RotateGate)
 *   que cubre y bloquea la interfaz hasta girar el dispositivo.
 *
 * El modo compacto (consola densa de teléfono) se decide por el LADO CORTO físico
 * de la pantalla (no la orientación), así el diseño horizontal es idéntico se
 * sostenga el teléfono como se sostenga. Se expone en <html data-compact>.
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
 * del usuario (al entrar al estudio). Si el navegador no lo permite (iOS Safari
 * sin instalar), el aviso "gira el teléfono" actúa de respaldo.
 */
export async function lockLandscape(): Promise<void> {
  const orientation = getScreenOrientation();
  if (!orientation?.lock) return;
  try {
    await orientation.lock('landscape');
  } catch {
    // No soportado o requiere pantalla completa: el aviso de girar se encarga.
  }
}

/** ¿Es un teléfono (por el lado corto físico, independiente de la orientación)? */
export function isPhoneScreen(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth || document.documentElement.clientWidth;
  const h = window.innerHeight || document.documentElement.clientHeight;
  return Math.min(w, h) <= PHONE_MAX_SHORT_SIDE;
}

/** ¿Debe bloquearse el uso? (teléfono en vertical) */
export function shouldBlockPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth || document.documentElement.clientWidth;
  const h = window.innerHeight || document.documentElement.clientHeight;
  return isPhoneScreen() && h > w;
}

/** Calcula y aplica el modo compacto en <html> (idempotente). */
function applyDisplayMode(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window.innerWidth || document.documentElement.clientWidth;
  if (!w) return;
  // Teléfono (lado corto, no cambia al girar) o ventana estrecha → consola densa.
  const compact = isPhoneScreen() || w <= 900;
  document.documentElement.dataset.compact = compact ? '1' : '0';
}

const listeners = new Set<() => void>();

/** Suscribe a cambios de tamaño/orientación (para hooks de React). */
export function subscribeOrientation(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let installed = false;

/** Instala el controlador de modo/orientación (una sola vez, al arrancar). */
export function initDisplayMode(): void {
  if (installed) return;
  installed = true;
  const onChange = () => {
    applyDisplayMode();
    listeners.forEach((cb) => cb());
  };
  applyDisplayMode();
  window.addEventListener('resize', onChange, { passive: true });
  window.addEventListener('orientationchange', onChange, { passive: true });
}
