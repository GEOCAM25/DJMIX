import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../../state/store';
import type { DeckId } from '../../audio/types';
import { haptic } from '../../util/haptics';

/** Segundos que representa una vuelta completa del plato (feel de vinilo). */
const SECONDS_PER_REV = 1.8;

/**
 * Jog wheel (plato) de un deck. Dos comportamientos, como en un controlador DJ:
 *  - REPRODUCIENDO → "nudge": girar acelera/frena momentáneamente para cuadrar
 *    el beat (pitch-bend); al soltar, vuelve al tempo normal.
 *  - EN PAUSA → "scratch/scrub": girar mueve la posición para buscar el punto
 *    de entrada.
 * El plato gira mostrando el avance real (refleja nudges y scrubs).
 */
export function JogWheel({ id }: { id: DeckId }) {
  const playing = useStore((s) => s.decks[id].playing);
  const position = useStore((s) => s.decks[id].position);
  const engineType = useStore((s) => s.decks[id].engine);
  const nudge = useStore((s) => s.deckNudge);
  const scrub = useStore((s) => s.deckScrub);

  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, lastAngle: 0, cx: 0, cy: 0, wasPlaying: false });
  const [active, setActive] = useState(false);

  const disabled = engineType === 'youtube';
  const rotation = disabled ? 0 : (position / SECONDS_PER_REV) * 360;

  const angleAt = (e: ReactPointerEvent): number =>
    Math.atan2(e.clientY - drag.current.cy, e.clientX - drag.current.cx);

  const onDown = (e: ReactPointerEvent) => {
    if (disabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    drag.current.cx = rect.left + rect.width / 2;
    drag.current.cy = rect.top + rect.height / 2;
    drag.current.lastAngle = angleAt(e);
    drag.current.active = true;
    drag.current.wasPlaying = playing;
    setActive(true);
    try {
      ref.current.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores sin soporte de captura */
    }
    haptic(20);
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current.active) return;
    const a = angleAt(e);
    let delta = a - drag.current.lastAngle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    drag.current.lastAngle = a;
    if (drag.current.wasPlaying) {
      nudge(id, Math.max(-0.6, Math.min(0.6, delta * 1.6)));
    } else {
      scrub(id, (delta / (2 * Math.PI)) * SECONDS_PER_REV);
    }
  };

  const onUp = (e: ReactPointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setActive(false);
    if (drag.current.wasPlaying) nudge(id, 0); // soltar el pitch-bend
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="jog-wrap">
      <div
        ref={ref}
        className={`jog${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="slider"
        aria-label={`Plato del Deck ${id}`}
        aria-valuenow={Math.round(position)}
        title={disabled ? 'El plato no aplica a YouTube' : 'Gira: nudge al reproducir · scratch en pausa'}
      >
        <div className="jog-face" style={{ transform: `rotate(${rotation}deg)` }}>
          <span className="jog-mark" />
          <span className="jog-dot" />
        </div>
        <span className="jog-caption">{disabled ? '—' : playing ? 'NUDGE' : 'SCRATCH'}</span>
      </div>
    </div>
  );
}
