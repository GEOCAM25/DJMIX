/**
 * Catálogo de "destinos" MIDI (qué controla cada CC/nota aprendida) y la
 * función que traduce un valor normalizado (0..1) del controlador al rango real
 * de cada control del mezclador/decks.
 *
 * La UI usa MIDI_TARGETS para pintar la lista de "MIDI Learn"; el store llama a
 * applyMidiTarget() cuando llega un mensaje mapeado.
 */
import type { DeckId } from '../audio/types';

export type MidiTargetKind = 'range' | 'button';

export interface MidiTarget {
  id: string;
  label: string;
  kind: MidiTargetKind;
  group: 'Mezclador' | 'Deck A' | 'Deck B';
}

/** Todos los destinos mapeables, agrupados para la UI. */
export const MIDI_TARGETS: MidiTarget[] = [
  { id: 'crossfader', label: 'Crossfader', kind: 'range', group: 'Mezclador' },
  { id: 'master', label: 'Volumen máster', kind: 'range', group: 'Mezclador' },

  { id: 'volumeA', label: 'Volumen', kind: 'range', group: 'Deck A' },
  { id: 'tempoA', label: 'Pitch (tempo)', kind: 'range', group: 'Deck A' },
  { id: 'eqHighA', label: 'EQ High', kind: 'range', group: 'Deck A' },
  { id: 'eqMidA', label: 'EQ Mid', kind: 'range', group: 'Deck A' },
  { id: 'eqLowA', label: 'EQ Low', kind: 'range', group: 'Deck A' },
  { id: 'filterA', label: 'Filtro', kind: 'range', group: 'Deck A' },
  { id: 'playA', label: 'Play / Pausa', kind: 'button', group: 'Deck A' },
  { id: 'cueA', label: 'Cue', kind: 'button', group: 'Deck A' },
  { id: 'syncA', label: 'Sync', kind: 'button', group: 'Deck A' },

  { id: 'volumeB', label: 'Volumen', kind: 'range', group: 'Deck B' },
  { id: 'tempoB', label: 'Pitch (tempo)', kind: 'range', group: 'Deck B' },
  { id: 'eqHighB', label: 'EQ High', kind: 'range', group: 'Deck B' },
  { id: 'eqMidB', label: 'EQ Mid', kind: 'range', group: 'Deck B' },
  { id: 'eqLowB', label: 'EQ Low', kind: 'range', group: 'Deck B' },
  { id: 'filterB', label: 'Filtro', kind: 'range', group: 'Deck B' },
  { id: 'playB', label: 'Play / Pausa', kind: 'button', group: 'Deck B' },
  { id: 'cueB', label: 'Cue', kind: 'button', group: 'Deck B' },
  { id: 'syncB', label: 'Sync', kind: 'button', group: 'Deck B' },
];

/** Acciones del store que necesita applyMidiTarget para aplicar un valor. */
export interface MidiApi {
  setCrossfade(v: number): void;
  setMaster(v: number): void;
  setChannelFader(deck: DeckId, v: number): void;
  setTempo(deck: DeckId, percent: number): void;
  setEq(deck: DeckId, band: 'low' | 'mid' | 'high', db: number): void;
  setChannelFilter(deck: DeckId, v: number): void;
  togglePlay(deck: DeckId): void;
  cue(deck: DeckId): void;
  syncToOther(deck: DeckId): void;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Aplica un valor normalizado (0..1) al destino indicado, mapeándolo al rango
 * real de ese control. Para botones (kind 'button') el store solo llama aquí en
 * el flanco de subida, así que basta con disparar la acción.
 */
export function applyMidiTarget(id: string, value01: number, api: MidiApi): void {
  const v = Math.max(0, Math.min(1, value01));
  switch (id) {
    case 'crossfader':
      return api.setCrossfade(lerp(-1, 1, v));
    case 'master':
      return api.setMaster(lerp(0, 1.2, v));

    case 'volumeA':
      return api.setChannelFader('A', v);
    case 'volumeB':
      return api.setChannelFader('B', v);

    // El pitch se centra en 0% cuando el fader está a la mitad (±8%).
    case 'tempoA':
      return api.setTempo('A', lerp(-8, 8, v));
    case 'tempoB':
      return api.setTempo('B', lerp(-8, 8, v));

    case 'eqHighA':
      return api.setEq('A', 'high', lerp(-26, 6, v));
    case 'eqMidA':
      return api.setEq('A', 'mid', lerp(-26, 6, v));
    case 'eqLowA':
      return api.setEq('A', 'low', lerp(-26, 6, v));
    case 'eqHighB':
      return api.setEq('B', 'high', lerp(-26, 6, v));
    case 'eqMidB':
      return api.setEq('B', 'mid', lerp(-26, 6, v));
    case 'eqLowB':
      return api.setEq('B', 'low', lerp(-26, 6, v));

    case 'filterA':
      return api.setChannelFilter('A', lerp(-1, 1, v));
    case 'filterB':
      return api.setChannelFilter('B', lerp(-1, 1, v));

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
  }
}

/** Clave estable de un control físico (para el diccionario de mapeos). */
export function controlKey(kind: 'cc' | 'note', channel: number, control: number): string {
  return `${kind}:${channel}:${control}`;
}

/** Etiqueta legible de una clave de control, p. ej. "CC7 · canal 1". */
export function describeControl(key: string): string {
  const [kind, channel, control] = key.split(':');
  const prefix = kind === 'cc' ? `CC${control}` : `Nota ${control}`;
  return `${prefix} · canal ${Number(channel) + 1}`;
}
