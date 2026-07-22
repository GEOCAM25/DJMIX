import { useEffect, useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../state/store';

interface TourStep {
  sel?: string; // selector del elemento a resaltar (ausente = paso centrado)
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  { title: 'Bienvenido a BEAT DJ 🎧', body: 'Un estudio DJ completo, 100% gratis, privado y local. Este recorrido rápido te muestra lo esencial.' },
  { sel: '.deck-A', title: 'Decks A y B', body: 'Carga tus pistas y controla Play, Cue, Sync y el pitch. Verás BPM, tonalidad (Camelot) y la onda coloreada por frecuencia.' },
  { sel: '.deck-A .jog', title: 'Jog wheel (plato)', body: 'Gíralo: al reproducir hace “nudge” para cuadrar el beat; en pausa hace scratch/buscar el punto de entrada.' },
  { sel: '.crossfader', title: 'Mezclador', body: 'Cruza entre A y B con el crossfader. Arriba, EQ de 3 bandas por color y vúmetros LED en tiempo real.' },
  { sel: '.style-picker', title: 'Estilo de género', body: 'Colorea toda la mezcla al instante con DSP: Lo-Fi, Club o Ambient. Sin descargar nada.' },
  { sel: '.seq-grid', title: 'Secuenciador', body: 'Programa ritmos de 16 pasos y sincronízalos al tempo de tu mezcla con Sync.' },
  { sel: '.loop-grid', title: 'Live Looping', body: 'Graba capas de tu mezcla en 4 pistas y déjalas en bucle para construir en vivo.' },
  { sel: '.crate-builder', title: 'Smart Crates', body: 'Crea carpetas automáticas por reglas: BPM, clave compatible, energía o ánimo (IA).' },
  { sel: '.dropzone', title: 'Tu biblioteca', body: 'Arrastra MP3/WAV/FLAC o vídeos. Se analizan (BPM/clave/ánimo) y se guardan en tu navegador, nunca en un servidor.' },
  { title: '¡A mezclar! 🚀', body: 'También tienes Auto-DJ, grabación de mixes, exportar vídeo y control MIDI. Puedes reabrir este tour desde Ajustes.' },
];

/**
 * Tour de bienvenida (sin dependencias externas): resalta cada zona clave con
 * un "spotlight" y un globo explicativo. Se muestra en el primer arranque y se
 * puede reabrir desde Ajustes.
 */
export function OnboardingTour() {
  const show = useStore((s) => s.showTour);
  const setShow = useStore((s) => s.setShowTour);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (show) setI(0);
  }, [show]);

  const step = STEPS[i];

  useLayoutEffect(() => {
    if (!show) return;
    if (!step.sel) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.sel);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    const t = setTimeout(() => setRect(el.getBoundingClientRect()), 320);
    return () => clearTimeout(t);
  }, [show, i, step]);

  useEffect(() => {
    if (!show || !step.sel) return;
    const recompute = () => {
      const el = document.querySelector(step.sel as string);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [show, step]);

  if (!show) return null;
  const last = i === STEPS.length - 1;
  const finish = () => setShow(false);

  let tipStyle: CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const below = rect.bottom + 190 < window.innerHeight;
    const top = below ? rect.bottom + 12 : Math.max(12, rect.top - 190);
    const left = Math.max(180, Math.min(window.innerWidth - 180, rect.left + rect.width / 2));
    tipStyle = { left, top, transform: 'translateX(-50%)' };
  }

  return (
    <div className="tour-root">
      {rect ? (
        <div
          className="tour-spot"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-tip" style={tipStyle}>
        <div className="tour-step">{i + 1} / {STEPS.length}</div>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="mini-btn" onClick={finish}>Saltar</button>
          <div className="spacer" />
          {i > 0 && (
            <button className="mini-btn" onClick={() => setI(i - 1)}>Atrás</button>
          )}
          {!last ? (
            <button className="primary" onClick={() => setI(i + 1)}>Siguiente</button>
          ) : (
            <button className="primary" onClick={finish}>Empezar</button>
          )}
        </div>
      </div>
    </div>
  );
}
