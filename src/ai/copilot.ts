import { camelotCompatibility, compatibleKeys } from '../analysis/camelot';
import type { TrackMeta } from '../storage/db';
import type { AIProvider } from './AIProvider';
import { RECO_SYSTEM, buildRecoPrompt, describeTrack } from './prompts';

/** Info mínima de un deck para el análisis del copiloto. */
export interface DeckInfo {
  bpm: number | null;
  camelotKey: string | null;
  energy: number | null;
}

export interface TransitionAdvice {
  /** Diferencia de BPM (b - a). */
  bpmDiff: number;
  /** % de tempo a aplicar al deck B para igualar al A (o viceversa). */
  syncPercentForB: number;
  /** Compatibilidad armónica 0..1. */
  keyCompatibility: number;
  keyLabel: string;
  /** Consejos de EQ para evitar saturación de frecuencias. */
  eqTips: string[];
  /** Tiempo de crossfade sugerido en segundos. */
  suggestedCrossfadeSec: number;
  /** Resumen legible. */
  summary: string;
}

export interface TrackSuggestion {
  title: string;
  reason: string;
  /** Texto de búsqueda para YouTube (si aplica). */
  query?: string;
  /** Id de pista local (si la sugerencia sale de la biblioteca). */
  trackId?: string;
}

/**
 * Auto-sync: porcentaje de tempo que hay que aplicar a `fromBpm` para que
 * coincida con `toBpm`. Ej. from=124, to=128 => +3.23 %.
 */
export function computeAutoSync(fromBpm: number, toBpm: number): number {
  if (!fromBpm || !toBpm) return 0;
  return (toBpm / fromBpm - 1) * 100;
}

/**
 * Analiza una transición A -> B con heurísticas DSP (sin IA):
 * beatmatching, compatibilidad armónica, progresión de energía y consejos EQ.
 */
export function analyzeTransition(a: DeckInfo, b: DeckInfo): TransitionAdvice {
  const bpmA = a.bpm ?? 0;
  const bpmB = b.bpm ?? 0;
  const bpmDiff = bpmB - bpmA;
  const syncPercentForB = bpmA && bpmB ? computeAutoSync(bpmB, bpmA) : 0;

  const keyCompatibility =
    a.camelotKey && b.camelotKey ? camelotCompatibility(a.camelotKey, b.camelotKey) : 0;

  let keyLabel: string;
  if (!a.camelotKey || !b.camelotKey) keyLabel = 'Tonalidad desconocida';
  else if (keyCompatibility >= 1) keyLabel = 'Misma tonalidad — mezcla perfecta';
  else if (keyCompatibility >= 0.9) keyLabel = 'Relativo mayor/menor — muy compatible';
  else if (keyCompatibility >= 0.85) keyLabel = 'Vecino en la rueda — compatible';
  else if (keyCompatibility >= 0.6) keyLabel = 'Subida de energía — compatible con cuidado';
  else keyLabel = 'Tonalidades no compatibles — usa filtros/EQ';

  const eqTips: string[] = [];
  eqTips.push('Baja el fader de graves (Low) del track entrante y súbelo al llegar el drop.');
  if ((a.energy ?? 0) > 0.6 && (b.energy ?? 0) > 0.6) {
    eqTips.push('Ambos tracks tienen mucha energía: alterna los graves para evitar saturación de bombos.');
  }
  if (keyCompatibility < 0.6 && a.camelotKey && b.camelotKey) {
    eqTips.push('Tonalidades poco compatibles: usa un filtro pasa-altos para suavizar el choque melódico.');
  }
  if (Math.abs(bpmDiff) > 6) {
    eqTips.push(`Diferencia de ${Math.abs(bpmDiff).toFixed(1)} BPM: aplica ${syncPercentForB.toFixed(1)}% de tempo al deck B antes de mezclar.`);
  }

  // Crossfade más largo cuanto más compatibles y parecidos en energía.
  const energyDelta = Math.abs((a.energy ?? 0.5) - (b.energy ?? 0.5));
  const suggestedCrossfadeSec = Math.round(8 + keyCompatibility * 12 - energyDelta * 6);

  const summary =
    `${keyLabel}. ` +
    (Math.abs(bpmDiff) < 0.5
      ? 'BPM ya igualados.'
      : `Ajusta ${syncPercentForB >= 0 ? '+' : ''}${syncPercentForB.toFixed(1)}% de tempo en B.`);

  return {
    bpmDiff,
    syncPercentForB,
    keyCompatibility,
    keyLabel,
    eqTips,
    suggestedCrossfadeSec: Math.max(4, suggestedCrossfadeSec),
    summary,
  };
}

/**
 * Ordena la biblioteca local por afinidad con la pista activa.
 * Puntuación = armonía Camelot (0.5) + cercanía de BPM (0.35) + energía (0.15).
 */
export function rankLibrary(active: TrackMeta, library: TrackMeta[]): TrackSuggestion[] {
  const scored = library
    .filter((t) => t.id !== active.id)
    .map((t) => {
      const key =
        active.camelotKey && t.camelotKey ? camelotCompatibility(active.camelotKey, t.camelotKey) : 0.3;
      const bpmClose =
        active.bpm && t.bpm ? Math.max(0, 1 - Math.abs(active.bpm - t.bpm) / 16) : 0.3;
      const energyClose =
        active.energy != null && t.energy != null ? 1 - Math.abs(active.energy - t.energy) : 0.5;
      const score = key * 0.5 + bpmClose * 0.35 + energyClose * 0.15;
      const reasons: string[] = [];
      if (key >= 0.85) reasons.push('armónicamente compatible');
      if (bpmClose >= 0.8) reasons.push('BPM muy cercano');
      if (energyClose >= 0.8) reasons.push('energía similar');
      const suggestion: TrackSuggestion = {
        trackId: t.id,
        title: t.artist ? `${t.artist} – ${t.title}` : t.title,
        reason: reasons.length ? reasons.join(', ') : 'opción de contraste',
      };
      return { score, suggestion };
    });
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, 8).map((s) => s.suggestion);
}

/**
 * Recomendación de tracks de YouTube. Con IA disponible pide sugerencias en
 * lenguaje natural; si no, genera consultas de búsqueda heurísticas basadas en
 * BPM y tonalidades Camelot compatibles.
 */
export async function recommendYouTube(
  active: TrackMeta,
  provider: AIProvider,
): Promise<TrackSuggestion[]> {
  const compat = active.camelotKey ? compatibleKeys(active.camelotKey) : [];

  if (provider.available) {
    try {
      const raw = await provider.chat(
        RECO_SYSTEM,
        [{ role: 'user', content: buildRecoPrompt(active, compat) }],
        { json: true },
      );
      const parsed = JSON.parse(extractJson(raw));
      if (Array.isArray(parsed.suggestions)) {
        return parsed.suggestions.slice(0, 8).map((s: TrackSuggestion) => ({
          title: s.title,
          reason: s.reason,
          query: s.query ?? s.title,
        }));
      }
    } catch {
      /* si falla la IA, caemos a heurísticas */
    }
  }

  // Fallback heurístico: consultas por BPM y compatibilidad armónica.
  const bpmLabel = active.bpm ? `${Math.round(active.bpm)} bpm` : '';
  return [
    { title: `Tracks en ${active.camelotKey ?? 'la misma tonalidad'}`, reason: 'misma tonalidad', query: `${describeTrack(active)} dj mix ${bpmLabel}` },
    { title: 'Mismo BPM, otra energía', reason: 'beatmatch directo', query: `${bpmLabel} remix` },
    ...compat.slice(1, 5).map((k) => ({
      title: `Compatibles ${k}`,
      reason: `tonalidad Camelot ${k}`,
      query: `${k} ${bpmLabel} track`,
    })),
  ];
}

/** Extrae el primer bloque JSON de una respuesta del LLM. */
function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : '{}';
}
