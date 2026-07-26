import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { shouldBlockPortrait, subscribeOrientation } from '../../ui/orientation';

/**
 * Aviso a pantalla completa cuando el teléfono está en VERTICAL: BEAT DJ solo se
 * usa en horizontal. Cubre y bloquea la interfaz hasta girar el dispositivo.
 *
 * En Android/PWA la orientación suele quedar bloqueada en horizontal y este aviso
 * casi nunca aparece; en iOS Safari (que no permite bloquearla) es el que impide
 * usar la app en vertical, como pidió el usuario.
 */
export function RotateGate() {
  const blocked = useSyncExternalStore(subscribeOrientation, shouldBlockPortrait, () => false);
  if (!blocked) return null;

  return createPortal(
    <div className="rotate-gate" role="dialog" aria-label="Gira el teléfono">
      <div className="rotate-gate-inner">
        <div className="rotate-phone" aria-hidden="true">
          <div className="rotate-phone-body">
            <span className="rotate-phone-cam" />
          </div>
          <svg className="rotate-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 12a8 8 0 0 1 13.7-5.6M20 12A8 8 0 0 1 6.3 17.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M17.5 2.5V6.8H13.2M6.5 21.5V17.2h4.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2>Pon el teléfono en horizontal</h2>
        <p>
          BEAT DJ es un tablero de DJ y solo funciona en <strong>horizontal</strong>.
          Gira tu teléfono de lado para usar el estudio.
        </p>
        <p className="rotate-hint">
          Consejo: si tienes activado el bloqueo de rotación, desactívalo (Centro de control)
          o instala la app para que se abra siempre en horizontal.
        </p>
      </div>
    </div>,
    document.body,
  );
}
