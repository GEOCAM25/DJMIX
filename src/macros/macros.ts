/**
 * Macros no-code: encadena acciones del estudio con tiempos y las reproduce con
 * un clic. Útil para lanzar transiciones o "escenas" en vivo (p. ej. bajar el
 * crossfader, activar eco y disparar un sample en secuencia).
 *
 * Cada acción es discreta (sin parámetros) para que el constructor sea 100%
 * no-code. El runtime ejecuta los pasos respetando su retardo.
 */
import type { DeckId } from '../audio/types';

export interface MacroStep {
  /** id de la acción (ver MACRO_ACTIONS). */
  action: string;
  /** Retardo (ms) ANTES de ejecutar este paso, respecto al anterior. */
  delayMs: number;
}

export interface Macro {
  id: string;
  name: string;
  steps: MacroStep[];
}

export interface MacroActionDef {
  id: string;
  label: string;
  group: 'Transporte' | 'Mezcla' | 'Efectos' | 'Sampler' | 'Ritmo';
}

/** Catálogo de acciones disponibles para el constructor de macros. */
export const MACRO_ACTIONS: MacroActionDef[] = [
  { id: 'playA', label: 'Play/Pausa A', group: 'Transporte' },
  { id: 'playB', label: 'Play/Pausa B', group: 'Transporte' },
  { id: 'cueA', label: 'Cue A', group: 'Transporte' },
  { id: 'cueB', label: 'Cue B', group: 'Transporte' },
  { id: 'syncA', label: 'Sync A', group: 'Transporte' },
  { id: 'syncB', label: 'Sync B', group: 'Transporte' },

  { id: 'xfadeA', label: 'Crossfader → A', group: 'Mezcla' },
  { id: 'xfadeCenter', label: 'Crossfader → centro', group: 'Mezcla' },
  { id: 'xfadeB', label: 'Crossfader → B', group: 'Mezcla' },

  { id: 'reverbOn', label: 'Reverb ON', group: 'Efectos' },
  { id: 'reverbOff', label: 'Reverb OFF', group: 'Efectos' },
  { id: 'echoOn', label: 'Echo ON', group: 'Efectos' },
  { id: 'echoOff', label: 'Echo OFF', group: 'Efectos' },
  { id: 'styleClub', label: 'Estilo Club', group: 'Efectos' },
  { id: 'styleLofi', label: 'Estilo Lo-Fi', group: 'Efectos' },
  { id: 'styleOff', label: 'Estilo Normal', group: 'Efectos' },

  { id: 'padKick', label: 'Pad Kick', group: 'Sampler' },
  { id: 'padSnare', label: 'Pad Snare', group: 'Sampler' },
  { id: 'padHat', label: 'Pad HiHat', group: 'Sampler' },
  { id: 'padClap', label: 'Pad Clap', group: 'Sampler' },

  { id: 'seqPlay', label: 'Secuenciador ▶', group: 'Ritmo' },
  { id: 'seqStop', label: 'Secuenciador ■', group: 'Ritmo' },
  { id: 'loopStop', label: 'Detener loops', group: 'Ritmo' },
];

const ACTION_LABELS: Record<string, string> = Object.fromEntries(
  MACRO_ACTIONS.map((a) => [a.id, a.label]),
);

export function macroActionLabel(id: string): string {
  return ACTION_LABELS[id] ?? id;
}

/** Acciones del store que necesita el runtime de macros. */
export interface MacroApi {
  togglePlay(deck: DeckId): void;
  cue(deck: DeckId): void;
  syncToOther(deck: DeckId): void;
  setCrossfade(v: number): void;
  setReverb(v: number): void;
  setEcho(v: number): void;
  setAudioStyle(id: string): void;
  triggerSample(padId: string): void;
  seqPlay(): void;
  seqStop(): void;
  loopStopAll(): void;
}

/** Ejecuta una acción de macro contra la API del store. */
export function applyMacroAction(id: string, api: MacroApi): void {
  switch (id) {
    case 'playA':
      return api.togglePlay('A');
    case 'playB':
      return api.togglePlay('B');
    case 'cueA':
      return api.cue('A');
    case 'cueB':
      return api.cue('B');
    case 'syncA':
      return api.syncToOther('A');
    case 'syncB':
      return api.syncToOther('B');

    case 'xfadeA':
      return api.setCrossfade(-1);
    case 'xfadeCenter':
      return api.setCrossfade(0);
    case 'xfadeB':
      return api.setCrossfade(1);

    case 'reverbOn':
      return api.setReverb(0.4);
    case 'reverbOff':
      return api.setReverb(0);
    case 'echoOn':
      return api.setEcho(0.35);
    case 'echoOff':
      return api.setEcho(0);
    case 'styleClub':
      return api.setAudioStyle('club');
    case 'styleLofi':
      return api.setAudioStyle('lofi');
    case 'styleOff':
      return api.setAudioStyle('off');

    case 'padKick':
      return api.triggerSample('pad-0');
    case 'padSnare':
      return api.triggerSample('pad-1');
    case 'padHat':
      return api.triggerSample('pad-2');
    case 'padClap':
      return api.triggerSample('pad-3');

    case 'seqPlay':
      return api.seqPlay();
    case 'seqStop':
      return api.seqStop();
    case 'loopStop':
      return api.loopStopAll();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Reproduce una macro respetando los retardos. `shouldStop` permite abortar
 * (p. ej. si el usuario detiene la macro o inicia otra).
 */
export async function runMacro(macro: Macro, api: MacroApi, shouldStop: () => boolean): Promise<void> {
  for (const step of macro.steps) {
    if (shouldStop()) return;
    if (step.delayMs > 0) await sleep(step.delayMs);
    if (shouldStop()) return;
    applyMacroAction(step.action, api);
  }
}
