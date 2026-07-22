/**
 * Vibración táctil breve en dispositivos compatibles (teléfonos Android/Chrome).
 * En navegadores sin soporte (iOS Safari) no hace nada.
 */
export function haptic(pattern: number | number[] = 50): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* Algunos navegadores lanzan sin activación del usuario; se ignora. */
  }
}
