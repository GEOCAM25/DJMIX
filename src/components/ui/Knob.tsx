import { useCallback, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** Color del indicador: canal A (cian) o B (rosa). */
  color?: 'a' | 'b';
  /** Color de acento explícito (p. ej. por banda de EQ). Prevalece sobre `color`. */
  accent?: string;
  /** Formatea el valor mostrado bajo el control. */
  format?: (v: number) => string;
  /** Doble toque para restablecer a este valor. */
  resetTo?: number;
}

/**
 * Control vertical tipo fader (NO circular): se toca/arrastra hacia arriba para
 * subir y hacia abajo para bajar, como un deslizador. Es mucho más fácil en
 * pantallas táctiles que una perilla giratoria (sin ambigüedad de dirección):
 * al pulsar, el valor salta a la posición del dedo y luego se afina arrastrando.
 * Para valores bipolares (EQ, filtro) el relleno crece desde el centro (0).
 */
export function Knob({ label, value, min, max, onChange, color, accent, format, resetTo }: KnobProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const ratio = (value - min) / (max - min); // 0..1
  const bipolar = min < 0 && max > 0;
  const zeroRatio = bipolar ? (0 - min) / (max - min) : 0;
  const lo = Math.min(ratio, zeroRatio);
  const hi = Math.max(ratio, zeroRatio);
  const accentColor = accent ?? (color === 'b' ? 'var(--accent-b)' : 'var(--accent-a)');

  const setFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = 1 - (clientY - r.top) / r.height; // 1 arriba .. 0 abajo
      onChange(min + Math.max(0, Math.min(1, t)) * (max - min));
    },
    [max, min, onChange],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = true;
      setFromClientY(e.clientY);
    },
    [setFromClientY],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (dragging.current) setFromClientY(e.clientY);
    },
    [setFromClientY],
  );
  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    dragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <div className="control-col">
      <div
        ref={trackRef}
        className="vknob"
        style={
          {
            '--accent': accentColor,
            '--lo': `${lo * 100}%`,
            '--hi': `${hi * 100}%`,
            '--pos': `${ratio * 100}%`,
          } as CSSProperties
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuemin={min}
        aria-valuemax={max}
      >
        <div className="vknob-fill" />
        <div className="vknob-thumb" />
      </div>
      <span>{label}</span>
      {format && <span className="ctl-val">{format(value)}</span>}
    </div>
  );
}
