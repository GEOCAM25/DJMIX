import { useStore } from '../../state/store';
import type { DeckId } from '../../audio/types';

/**
 * Panel del Piloto Automático (Auto-DJ). Enciende/apaga la mezcla automática,
 * elige la duración del crossfade y gestiona la cola de reproducción.
 *
 * El algoritmo (en el store): carga la siguiente pista, hace beatmatch
 * automático (iguala BPMs), arranca el deck entrante y ejecuta un crossfade
 * lineal con "bass swap" (rampas lineales del Web Audio API) para transiciones
 * naturales sin saturación de graves.
 */
export function AutoDjPanel() {
  const autoDj = useStore((s) => s.autoDj);
  const decks = useStore((s) => s.decks);
  const library = useStore((s) => s.library);
  const toggleAutoDj = useStore((s) => s.toggleAutoDj);
  const setAutoCrossfade = useStore((s) => s.setAutoCrossfade);
  const removeFromQueue = useStore((s) => s.removeFromQueue);
  const clearQueue = useStore((s) => s.clearQueue);

  const titleOf = (id: string): string => {
    const t = library.find((x) => x.id === id);
    return t ? (t.artist ? `${t.artist} – ${t.title}` : t.title) : id;
  };

  const other: DeckId = autoDj.currentDeck === 'A' ? 'B' : 'A';
  const nowPlaying = decks[autoDj.currentDeck].trackId ? decks[autoDj.currentDeck].title : '—';
  const upNext = decks[other].trackId
    ? decks[other].title
    : autoDj.queue[0]
      ? titleOf(autoDj.queue[0])
      : '—';

  return (
    <div className="panel">
      <h3>Piloto Automático · Auto-DJ</h3>

      <div className="row">
        <button
          className={autoDj.enabled ? 'active' : 'primary'}
          onClick={() => void toggleAutoDj()}
          style={{ flex: 1 }}
        >
          {autoDj.enabled ? '■ Detener Auto-DJ' : '▶ Iniciar Auto-DJ'}
        </button>
        <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)', gap: 6 }}>
          Crossfade
          <select
            value={autoDj.crossfadeSeconds}
            onChange={(e) => setAutoCrossfade(parseInt(e.target.value, 10))}
            style={{ width: 'auto' }}
            aria-label="Duración del crossfade automático"
          >
            {[4, 8, 12, 16, 20].map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="advice" style={{ marginTop: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            {autoDj.enabled
              ? autoDj.transitioning
                ? '🎚️ Mezclando…'
                : `▶ Sonando Deck ${autoDj.currentDeck}`
              : 'Detenido'}
          </span>
          {autoDj.enabled && (
            <span className="chip" style={{ color: 'var(--good)' }}>
              AUTO
            </span>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-dim)' }}>
          Sonando: <b style={{ color: 'var(--text)' }}>{nowPlaying}</b>
          <br />
          Siguiente: <b style={{ color: 'var(--text)' }}>{upNext}</b>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Cola ({autoDj.queue.length})</span>
        {autoDj.queue.length > 0 && (
          <button className="mini-btn" onClick={clearQueue}>
            Vaciar
          </button>
        )}
      </div>

      <div className="track-list">
        {autoDj.queue.length === 0 && (
          <small className="hint">
            Cola vacía: al iniciar se usará toda tu biblioteca local. Usa “+ Cola” en la
            biblioteca para armar tu set en orden.
          </small>
        )}
        {autoDj.queue.map((id, i) => (
          <div key={`${id}-${i}`} className="track-item">
            <span className="chip">{i + 1}</span>
            <div className="info">
              <div className="name">{titleOf(id)}</div>
            </div>
            <button className="mini-btn danger" onClick={() => removeFromQueue(id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <small className="hint" style={{ display: 'block', marginTop: 8 }}>
        Beatmatch automático + crossfade con “bass swap” (baja el grave saliente y sube el
        entrante) mediante rampas lineales del Web Audio API.
      </small>
    </div>
  );
}
