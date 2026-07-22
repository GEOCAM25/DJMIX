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
  /** Formatea el valor mostrado bajo el knob. */
  format?: (v: number) => string;
  /** Doble clic para restablecer a este valor. */
  resetTo?: number;
}

/**
 * Knob rotatorio controlado por arrastre vertical (ratón/táctil).
 * El recorrido cubre -135°..+135° mapeado a [min, max].
 */
export function Knob({ label, value, min, max, onChange, color, accent, format, resetTo }: KnobProps) {
  const dragging = useRef<{ startY: number; startVal: number } | null>(null);

  const ratio = (value - min) / (max - min);
  const rot = -135 + ratio * 270;

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = { startY: e.clientY, startVal: value };
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragging.current) return;
      const dy = dragging.current.startY - e.clientY;
      // 200 px de recorrido = rango completo.
      const delta = (dy / 200) * (max - min);
      const next = Math.max(min, Math.min(max, dragging.current.startVal + delta));
      onChange(next);
    },
    [max, min, onChange],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragging.current = null;
  }, []);

  return (
    <div className="control-col">
      <div
        className={`knob${color === 'b' ? ' b' : ''}${accent ? ' accented' : ''}`}
        style={{ '--rot': `${rot}deg`, ...(accent ? { '--knob-accent': accent } : {}) } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuemin={min}
        aria-valuemax={max}
      />
      <span>{label}</span>
      {format && <span style={{ color: 'var(--text)' }}>{format(value)}</span>}
    </div>
  );
}
