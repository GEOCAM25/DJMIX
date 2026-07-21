import JSZip from 'jszip';
import { encodeWav } from './wav';

/**
 * Exportación multi-pista (stems) a un único archivo .zip.
 *
 * Cada "stem" (por ahora, cada deck cargado; a futuro también loops y voz) se
 * codifica a WAV y se empaqueta junto con un `project.json` que describe la
 * sesión (metadatos, mezcla, cues). Todo ocurre en el navegador: el ZIP se
 * genera en memoria y se descarga al dispositivo, sin servidor.
 */
export interface Stem {
  name: string;
  buffer: AudioBuffer;
}

export async function buildStemsZip(stems: Stem[], project: unknown): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const stem of stems) {
    let base = sanitize(stem.name) || 'stem';
    // Evitar nombres duplicados dentro del ZIP.
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}_${n++}`;
    used.add(name);
    zip.file(`${name}.wav`, encodeWav(stem.buffer));
  }
  zip.file('project.json', JSON.stringify(project, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/** Descarga un Blob con un nombre de archivo dado. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

function sanitize(name: string): string {
  return name
    .replace(/[^\w\d\-\s.]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}
