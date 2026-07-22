/**
 * Smart Crates: carpetas inteligentes que agrupan pistas de la biblioteca según
 * reglas (BPM, energía, compatibilidad de clave, título, fuente). Los matches se
 * calculan en vivo sobre IndexedDB; no se duplican pistas.
 */
import type { TrackMeta } from '../storage/db';
import { camelotCompatibility, parseCamelot } from '../analysis/camelot';

export type CrateRule =
  | { type: 'bpm'; min: number; max: number }
  | { type: 'energy'; min: number } // 0..1
  | { type: 'key'; camelot: string }
  | { type: 'title'; text: string }
  | { type: 'source'; engine: 'local' | 'youtube' };

export interface SmartCrate {
  id: string;
  name: string;
  rules: CrateRule[];
}

/** ¿Cumple una pista una regla concreta? */
export function ruleMatches(track: TrackMeta, rule: CrateRule): boolean {
  switch (rule.type) {
    case 'bpm':
      return track.bpm != null && track.bpm >= rule.min && track.bpm <= rule.max;
    case 'energy':
      return track.energy != null && track.energy >= rule.min;
    case 'key':
      return track.camelotKey != null && camelotCompatibility(track.camelotKey, rule.camelot) >= 0.6;
    case 'title': {
      const hay = `${track.artist ?? ''} ${track.title}`.toLowerCase();
      return hay.includes(rule.text.toLowerCase());
    }
    case 'source':
      return track.engine === rule.engine;
  }
}

/** Todas las reglas se combinan con AND. Un crate sin reglas no matchea nada. */
export function trackMatchesCrate(track: TrackMeta, rules: CrateRule[]): boolean {
  return rules.length > 0 && rules.every((r) => ruleMatches(track, r));
}

export function crateMatches(crate: SmartCrate, library: TrackMeta[]): TrackMeta[] {
  return library.filter((t) => trackMatchesCrate(t, crate.rules));
}

/** Texto legible de una regla, para las etiquetas de la UI. */
export function describeRule(rule: CrateRule): string {
  switch (rule.type) {
    case 'bpm':
      return `BPM ${rule.min}–${rule.max}`;
    case 'energy':
      return `Energía ≥ ${Math.round(rule.min * 100)}%`;
    case 'key':
      return `Clave ~ ${rule.camelot}`;
    case 'title':
      return `Título: "${rule.text}"`;
    case 'source':
      return rule.engine === 'local' ? 'Solo locales' : 'Solo YouTube';
  }
}

/** Valida el texto de una clave Camelot (p. ej. "8A"). */
export function isValidCamelot(code: string): boolean {
  return parseCamelot(code) != null;
}

/** Las 24 claves Camelot (1A..12B) para los selectores. */
export function allCamelotCodes(): string[] {
  const codes: string[] = [];
  for (let n = 1; n <= 12; n++) {
    codes.push(`${n}A`);
    codes.push(`${n}B`);
  }
  return codes;
}
