/**
 * Copiloto Lírico — herramientas LOCALES para escribir letras ORIGINALES:
 *   - contador de sílabas (aproximado, español) para cuidar la métrica,
 *   - buscador de rimas por sufijo común sobre un banco de palabras,
 *   - generador de estructura (verso/estribillo/puente) con esquema de rima.
 *
 * Todo funciona sin conexión ni clave. La generación con IA es opcional y vive
 * en el panel (usa el proveedor del store con un prompt que exige originalidad).
 */

/** Quita acentos/diacríticos para comparar terminaciones de rima. */
function deaccent(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const VOWELS = 'aeiouáéíóúü';
const STRONG = 'aeoáéó';
const ACC_WEAK = 'íú';
const isVowel = (c: string): boolean => VOWELS.includes(c);

/** Sílabas de una palabra (aprox.): grupos de vocales con diptongo/hiato. */
function syllablesInWord(word: string): number {
  const w = word.toLowerCase();
  let syllables = 0;
  let i = 0;
  while (i < w.length) {
    if (!isVowel(w[i])) {
      i++;
      continue;
    }
    let group = '';
    while (i < w.length && isVowel(w[i])) {
      group += w[i];
      i++;
    }
    // Cada grupo de vocales es al menos 1 sílaba; sube en cada hiato.
    let count = 1;
    for (let k = 1; k < group.length; k++) {
      const a = group[k - 1];
      const b = group[k];
      const hiato = (STRONG.includes(a) && STRONG.includes(b)) || ACC_WEAK.includes(a) || ACC_WEAK.includes(b);
      if (hiato) count++;
    }
    syllables += count;
  }
  return Math.max(word.trim() ? 1 : 0, syllables);
}

/** Sílabas (gramaticales) de una línea = suma por palabra. */
export function countSyllables(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean);
  return words.reduce((acc, w) => acc + syllablesInWord(w.replace(/[^a-záéíóúüñ]/gi, '')), 0);
}

/** Banco de palabras evocadoras (por familias de terminación) para las rimas. */
export const RHYME_BANK: string[] = [
  // -on
  'corazon', 'cancion', 'pasion', 'razon', 'ilusion', 'emocion', 'rincon', 'adiccion', 'traicion', 'perdicion',
  // -ar
  'amar', 'soñar', 'volar', 'mirar', 'bailar', 'brillar', 'llorar', 'cantar', 'escapar', 'lograr', 'buscar', 'jurar',
  // -or
  'amor', 'dolor', 'calor', 'temblor', 'rumor', 'color', 'sudor', 'alrededor', 'temor', 'sabor',
  // -ida
  'vida', 'herida', 'partida', 'salida', 'guarida', 'medida', 'perdida', 'querida', 'caida', 'bebida',
  // -ado
  'pasado', 'soldado', 'estado', 'callado', 'cansado', 'amado', 'deseado', 'pecado', 'nublado', 'lado',
  // -ia
  'melodia', 'alegria', 'fantasia', 'poesia', 'todavia', 'agonia', 'compañia', 'dia', 'guia', 'mia',
  // -elo
  'cielo', 'vuelo', 'anhelo', 'consuelo', 'duelo', 'hielo', 'pañuelo', 'abuelo', 'recelo', 'desvelo',
  // -al
  'final', 'cristal', 'señal', 'umbral', 'ideal', 'fatal', 'especial', 'real', 'metal', 'mortal',
  // -ura
  'locura', 'ternura', 'dulzura', 'aventura', 'cordura', 'figura', 'altura', 'pintura', 'basura', 'lectura',
  // -eza
  'belleza', 'tristeza', 'certeza', 'pureza', 'firmeza', 'nobleza', 'cabeza', 'rareza', 'pobreza', 'grandeza',
  // -ento / -iento
  'viento', 'momento', 'lamento', 'tormento', 'aliento', 'sentimiento', 'pensamiento', 'cuento', 'intento', 'sediento',
  // -ana
  'mañana', 'ventana', 'manzana', 'campana', 'lejana', 'humana', 'hermana', 'gana', 'liviana', 'diana',
  // -uego
  'fuego', 'juego', 'luego', 'ruego', 'sosiego', 'ciego',
  // -anza
  'esperanza', 'confianza', 'mudanza', 'balanza', 'alianza', 'danza', 'añoranza', 'venganza',
  // -oche
  'noche', 'coche', 'broche', 'derroche', 'reproche',
  // -ena
  'pena', 'cadena', 'arena', 'condena', 'morena', 'llena', 'buena', 'serena', 'colmena', 'ajena',
  // -ista
  'artista', 'pista', 'conquista', 'vista', 'lista', 'egoista', 'optimista',
  // -eo
  'deseo', 'paseo', 'mareo', 'correo', 'trofeo', 'aleteo', 'coqueteo',
  // -az / -uz
  'paz', 'capaz', 'fugaz', 'disfraz', 'veraz', 'audaz', 'luz', 'cruz', 'andaluz', 'avestruz',
];

const shipShared = (a: string, b: string): number => {
  let i = a.length - 1;
  let j = b.length - 1;
  let n = 0;
  while (i >= 0 && j >= 0 && a[i] === b[j]) {
    n++;
    i--;
    j--;
  }
  return n;
};

/** Busca rimas (por sufijo común, ≥2 letras) del banco, mejores primero. */
export function findRhymes(word: string, max = 12): string[] {
  const w = deaccent(word.trim());
  if (w.length < 2) return [];
  return RHYME_BANK.map((x) => ({ x, n: shipShared(w, x) }))
    .filter((o) => o.n >= 2 && o.x !== w)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((o) => o.x);
}

/** Esqueleto de canción con el tema y un esquema de rima sugerido. */
export function structureTemplate(theme: string): string {
  const t = theme.trim() || 'tu tema';
  return [
    `# Canción sobre: ${t}`,
    `# Esquema de rima sugerido: ABAB en versos, AA en el estribillo.`,
    '',
    '[Intro]',
    '',
    '[Verso 1]',
    `— presenta la escena y el sentimiento sobre ${t} (A)`,
    '— desarrolla la imagen (B)',
    '— gira o profundiza (A)',
    '— cierra el verso (B)',
    '',
    '[Estribillo]',
    '— la idea principal, pegadiza (A)',
    '— refuerza la emoción (A)',
    '',
    '[Verso 2]',
    '— nueva escena o punto de vista (A)',
    '— (B)',
    '— (A)',
    '— (B)',
    '',
    '[Estribillo]',
    '',
    '[Puente]',
    '— cambio de tono: contraste o revelación',
    '',
    '[Estribillo]',
    '',
  ].join('\n');
}
