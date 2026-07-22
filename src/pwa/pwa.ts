import { useEffect, useState } from 'react';

/**
 * Integración PWA: registro del Service Worker y gestión del prompt de
 * instalación ("Añadir a pantalla de inicio" / "Instalar app").
 *
 * Funciona en subrutas (GitHub Pages sirve en /<repo>/): el SW se registra
 * respetando import.meta.env.BASE_URL.
 */

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Debe llamarse una vez al arrancar la app (main.tsx). */
export function initPwa(): void {
  // Solo en producción: en dev el SW interfiere con el HMR de Vite.
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch((err) => console.warn('SW no registrado:', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // evita el mini-infobar automático de Chrome
    deferredPrompt = e;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** Lanza el diálogo nativo de instalación. Devuelve true si se aceptó. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice.outcome === 'accepted';
}

/**
 * Intenta forzar la orientación horizontal tras un gesto del usuario.
 * En Android (pantalla completa / PWA instalada) rota físicamente la pantalla.
 * En iOS no existe esa API: allí el respaldo es la rotación por CSS (ver
 * .rotate-wrap en global.css), que presenta la consola en horizontal igual.
 */
export async function lockLandscape(): Promise<void> {
  // Solo en teléfonos/tablets táctiles; en escritorio no forzamos nada.
  const isTouchPhone =
    matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 1024;
  if (!isTouchPhone) return;
  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (el.requestFullscreen) {
      await el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen().catch(() => {});
    }
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (orientation?.lock) {
      await orientation.lock('landscape').catch(() => {});
    }
  } catch {
    /* Sin soporte (iOS): la rotación por CSS se encarga. */
  }
}

/** ¿Se está ejecutando ya como app instalada (standalone)? */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Hook React para mostrar/ocultar el botón de instalación. */
export function useInstallPrompt(): { available: boolean; install: () => Promise<boolean> } {
  const [available, setAvailable] = useState(canInstall());
  useEffect(() => {
    const update = () => setAvailable(canInstall());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return { available, install: promptInstall };
}
