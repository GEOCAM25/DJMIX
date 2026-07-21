import { useStore } from '../../state/store';

/**
 * "Copiloto DJ": análisis de la transición A↔B (BPM/armonía/EQ), auto-sync y
 * recomendaciones de tracks (biblioteca local + YouTube). Funciona con
 * heurísticas DSP sin IA; si hay clave de IA, mejora las sugerencias.
 */
export function CopilotPanel() {
  const advice = useStore((s) => s.copilot.advice);
  const librarySuggestions = useStore((s) => s.copilot.librarySuggestions);
  const youtubeSuggestions = useStore((s) => s.copilot.youtubeSuggestions);
  const loading = useStore((s) => s.copilot.loading);
  const analyzeMix = useStore((s) => s.analyzeMix);
  const fetchSuggestions = useStore((s) => s.fetchSuggestions);
  const loadLocalTrackToDeck = useStore((s) => s.loadLocalTrackToDeck);
  const loadYouTubeByQuery = useStore((s) => s.loadYouTubeByQuery);
  const youtubeApiKey = useStore((s) => s.settings.youtubeApiKey);

  return (
    <div className="panel">
      <h3>Copiloto DJ (IA)</h3>
      <div className="row" style={{ marginBottom: 10 }}>
        <button onClick={analyzeMix}>Analizar transición A↔B</button>
        <button className="primary" onClick={fetchSuggestions} disabled={loading}>
          {loading ? 'Buscando…' : 'Recomendar tracks'}
        </button>
      </div>

      {advice && (
        <div className="advice">
          <strong>{advice.summary}</strong>
          <div style={{ margin: '6px 0' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Compatibilidad armónica: {Math.round(advice.keyCompatibility * 100)}% · Crossfade sugerido: ~{advice.suggestedCrossfadeSec}s
            </div>
            <div className="meter" style={{ marginTop: 4 }}>
              <i style={{ width: `${Math.round(advice.keyCompatibility * 100)}%` }} />
            </div>
          </div>
          <ul>
            {advice.eqTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {librarySuggestions.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>De tu biblioteca</h3>
          <div className="track-list">
            {librarySuggestions.map((s) => (
              <div key={s.trackId} className="track-item">
                <div className="info">
                  <div className="name">{s.title}</div>
                  <div className="sub">{s.reason}</div>
                </div>
                <button className="mini-btn" onClick={() => s.trackId && loadLocalTrackToDeck('B', s.trackId)}>
                  ▶ B
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {youtubeSuggestions.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Desde YouTube</h3>
          <div className="track-list">
            {youtubeSuggestions.map((s, i) => (
              <div key={i} className="track-item">
                <div className="info">
                  <div className="name">{s.title}</div>
                  <div className="sub">{s.reason}</div>
                </div>
                <a
                  className="mini-btn"
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(s.query ?? s.title)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  Buscar
                </a>
                {youtubeApiKey && (
                  <button className="mini-btn" onClick={() => loadYouTubeByQuery('B', s.query ?? s.title)}>
                    ▶ B
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
