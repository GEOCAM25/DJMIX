/**
 * Fuerza la orientación HORIZONTAL (landscape) del estudio.
 *
 * La app es un tablero de DJ y solo tiene sentido en horizontal. Se usan tres
 * capas complementarias para que NUNCA se vea en vertical:
 *
 *   1) Manifiesto PWA "orientation": "landscape" → si se instala, el sistema la
 *      bloquea en horizontal de forma nativa (iOS y Android).
 *   2) Screen Orientation API: screen.orientation.lock('landscape') → Android /
 *      Chrome la bloquean cuando la pantalla está a pantalla completa o instalada.
 *      Se intenta dentro del gesto del usuario (best-effort).
 *   3) Rotación por CSS (global.css) → respaldo universal para el navegador en
 *      teléfono: si el móvil está en vertical, la app se rota 90° para presentarse
 *      horizontal sin pedir "gira el teléfono".
 *
 * Ninguna capa hace daño donde no aplica (escritorio, orientación ya horizontal).
 */

interface LockableOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

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
