import { useEffect } from 'react';
import { useStore } from '../state/store';

/**
 * Atajos de teclado profesionales (estilo controlador de DJ). Permiten pinchar
 * sin soltar el ratón: transporte, cues, sync, crossfader, máster, grabación…
 *
 * Se ignoran mientras se escribe en un campo de texto (input/textarea/select o
 * elementos editables), para no romper la escritura del Locutor o las letras.
 */

export interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string; action: string }>;
}

/** Tabla de atajos que se muestra en la ayuda (tecla ?). */
export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Deck A',
    items: [
      { keys: 'Q', action: 'Reproducir / Pausa' },
      { keys: 'W', action: 'Cue' },
      { keys: 'E', action: 'Sync' },
      { keys: 'A', action: 'Poner Hot Cue' },
      { keys: '1 · 2 · 3', action: 'Saltar a Hot Cue 1/2/3' },
      { keys: 'Z · X', action: 'Tempo −/+' },
      { keys: 'H', action: 'Pre-escucha (audífonos)' },
    ],
  },
  {
    title: 'Deck B',
    items: [
      { keys: 'P', action: 'Reproducir / Pausa' },
      { keys: 'O', action: 'Cue' },
      { keys: 'I', action: 'Sync' },
      { keys: 'L', action: 'Poner Hot Cue' },
      { keys: '8 · 9 · 0', action: 'Saltar a Hot Cue 1/2/3' },
      { keys: ', · .', action: 'Tempo −/+' },
      { keys: 'J', action: 'Pre-escucha (audífonos)' },
    ],
  },
  {
    title: 'Mezcla y estudio',
    items: [
      { keys: '← · →', action: 'Crossfader A/B' },
      { keys: '↑ · ↓', action: 'Volumen máster' },
      { keys: 'C', action: 'Crossfader al centro' },
      { keys: 'R', action: 'Grabar / Detener' },
      { keys: 'M', action: 'Micrófono on/off' },
      { keys: 'B', action: 'Base musical (Crear) on/off' },
      { keys: 'V', action: 'Visualizador' },
      { keys: '?', action: 'Esta ayuda' },
      { keys: 'Esc', action: 'Cerrar ventanas' },
    ],
  },
];

/** ¿El foco está en un campo donde el usuario escribe? */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

interface ShortcutHandlers {
  toggleVisualizer: () => void;
  toggleHelp: () => void;
  closeOverlays: () => void;
}

export function useShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // no pisar atajos del sistema
      if (isTypingTarget(e.target)) return;
      const s = useStore.getState();
      if (!s.started) return;

      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      let handled = true;

      switch (lower) {
        // ── Transporte ──
        case 'q': s.togglePlay('A'); break;
        case 'p': s.togglePlay('B'); break;
        case 'w': s.cue('A'); break;
        case 'o': s.cue('B'); break;
        case 'e': s.syncToOther('A'); break;
        case 'i': s.syncToOther('B'); break;
        case 'a': s.addCue('A'); break;
        case 'l': s.addCue('B'); break;

        // ── Hot cues ──
        case '1': s.jumpToCue('A', 0); break;
        case '2': s.jumpToCue('A', 1); break;
        case '3': s.jumpToCue('A', 2); break;
        case '8': s.jumpToCue('B', 0); break;
        case '9': s.jumpToCue('B', 1); break;
        case '0': s.jumpToCue('B', 2); break;

        // ── Tempo ──
        case 'z': s.setTempo('A', s.decks.A.tempo - 0.5); break;
        case 'x': s.setTempo('A', s.decks.A.tempo + 0.5); break;
        case ',': s.setTempo('B', s.decks.B.tempo - 0.5); break;
        case '.': s.setTempo('B', s.decks.B.tempo + 0.5); break;

        // ── Pre-escucha ──
        case 'h': s.toggleCueMonitor('A'); break;
        case 'j': s.toggleCueMonitor('B'); break;

        // ── Mezcla ──
        case 'arrowleft': case 'ArrowLeft': s.setCrossfade(Math.max(-1, s.crossfade - 0.05)); break;
        case 'arrowright': case 'ArrowRight': s.setCrossfade(Math.min(1, s.crossfade + 0.05)); break;
        case 'arrowup': case 'ArrowUp': s.setMaster(Math.min(1.2, s.master + 0.05)); break;
        case 'arrowdown': case 'ArrowDown': s.setMaster(Math.max(0, s.master - 0.05)); break;
        case 'c': s.setCrossfade(0); break;

        // ── Estudio ──
        case 'r':
          if (s.recording) void s.stopRecording('');
          else void s.startRecording('master');
          break;
        case 'm': void s.toggleMic(); break;
        case 'b': void s.songToggle(); break;
        case 'v': handlers.toggleVisualizer(); break;
        case '?': case '/': handlers.toggleHelp(); break;
        case 'escape': case 'Escape': handlers.closeOverlays(); break;

        default:
          handled = false;
      }

      if (handled) e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}
