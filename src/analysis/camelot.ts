/**
 * Rueda de Camelot para mezcla armónica.
 *
 * Cada tonalidad se codifica como número (1–12) + letra (A=menor, B=mayor).
 * Dos pistas mezclan bien si sus códigos son "vecinos" en la rueda:
 *   - mismo código           (idéntica tonalidad)
 *   - mismo número, otra letra (relativo mayor/menor)
 *   - número ±1, misma letra   (quinta arriba/abajo)
 * Estas relaciones son la base del "harmonic mixing" que usa el copiloto.
 */

// pitchClass (0=C..11=B) -> número Camelot, por modo.
const MAJOR_PC_TO_NUMBER: Record<number, number> = {
  0: 8, 7: 9, 2: 10, 9: 11, 4: 12, 11: 1, 6: 2, 1: 3, 8: 4, 3: 5, 10: 6, 5: 7,
};
const MINOR_PC_TO_NUMBER: Record<number, number> = {
  9: 8, 4: 9, 11: 10, 6: 11, 1: 12, 8: 1, 3: 2, 10: 3, 5: 4, 0: 5, 7: 6, 2: 7,
};

export function pitchClassToCamelot(pitchClass: number, mode: 'major' | 'minor'): string {
  const table = mode === 'major' ? MAJOR_PC_TO_NUMBER : MINOR_PC_TO_NUMBER;
  const number = table[((pitchClass % 12) + 12) % 12];
  return `${number}${mode === 'major' ? 'B' : 'A'}`;
}

export interface CamelotCode {
  number: number; // 1..12
  letter: 'A' | 'B';
}

export function parseCamelot(code: string): CamelotCode | null {
  const m = /^(\d{1,2})([AB])$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  const number = parseInt(m[1], 10);
  if (number < 1 || number > 12) return null;
  return { number, letter: m[2] as 'A' | 'B' };
}

const wrap = (n: number): number => ((n - 1 + 12) % 12) + 1;

/**
 * Puntúa la compatibilidad armónica entre dos códigos Camelot (0..1).
 *   1.0  misma tonalidad
 *   0.9  relativo mayor/menor (mismo número, otra letra)
 *   0.85 vecino ±1 misma letra
 *   0.6  "energy boost" +2 misma letra
 *   0.0  incompatibles
 */
export function camelotCompatibility(a: string, b: string): number {
  const ca = parseCamelot(a);
  const cb = parseCamelot(b);
  if (!ca || !cb) return 0;
  if (ca.number === cb.number && ca.letter === cb.letter) return 1;
  if (ca.number === cb.number && ca.letter !== cb.letter) return 0.9;
  if (ca.letter === cb.letter) {
    if (cb.number === wrap(ca.number + 1) || cb.number === wrap(ca.number - 1)) return 0.85;
    if (cb.number === wrap(ca.number + 2)) return 0.6;
  }
  return 0;
}

/** Devuelve los códigos Camelot que mezclan bien con el dado. */
export function compatibleKeys(code: string): string[] {
  const c = parseCamelot(code);
  if (!c) return [];
  const other = c.letter === 'A' ? 'B' : 'A';
  return [
    `${c.number}${c.letter}`,
    `${c.number}${other}`,
    `${wrap(c.number + 1)}${c.letter}`,
    `${wrap(c.number - 1)}${c.letter}`,
    `${wrap(c.number + 2)}${c.letter}`,
  ];
}
