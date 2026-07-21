import type { TrackMeta } from '../storage/db';

/** Descripción compacta de una pista para el contexto del LLM. */
export function describeTrack(t: Pick<TrackMeta, 'title' | 'artist' | 'bpm' | 'camelotKey' | 'energy'>): string {
  const parts = [t.artist ? `${t.artist} – ${t.title}` : t.title];
  if (t.bpm) parts.push(`${Math.round(t.bpm)} BPM`);
  if (t.camelotKey) parts.push(`tonalidad ${t.camelotKey}`);
  if (t.energy != null) parts.push(`energía ${Math.round(t.energy * 10)}/10`);
  return parts.join(', ');
}

export const RECO_SYSTEM = `Eres un copiloto experto de DJ. Tu trabajo es sugerir canciones que
encajen para mezclar a continuación, teniendo en cuenta BPM cercano, compatibilidad
armónica (rueda de Camelot) y una progresión de energía coherente. Conoces géneros
electrónicos y comerciales. Sé conciso y práctico.`;

/** Construye el prompt de recomendación de tracks de YouTube. */
export function buildRecoPrompt(
  active: Pick<TrackMeta, 'title' | 'artist' | 'bpm' | 'camelotKey' | 'energy'>,
  compatibleCamelot: string[],
): string {
  return [
    `Pista sonando ahora: ${describeTrack(active)}.`,
    `Tonalidades Camelot compatibles: ${compatibleCamelot.join(', ')}.`,
    `Sugiere 6 canciones reales para mezclar después. Para cada una da:`,
    `"title" (artista y título), "reason" (por qué encaja: BPM/armonía/energía),`,
    `y "query" (texto de búsqueda óptimo para encontrarla en YouTube).`,
    `Devuelve un JSON: { "suggestions": [ { "title", "reason", "query" } ] }.`,
  ].join('\n');
}
