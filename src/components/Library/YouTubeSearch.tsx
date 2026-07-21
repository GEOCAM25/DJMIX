import { useState } from 'react';
import { useStore } from '../../state/store';
import { searchYouTube, extractVideoId, type YouTubeSearchResult } from '../../media/youtube';

/**
 * Buscador de YouTube + carga por URL/ID.
 * - Con API key => buscador completo (YouTube Data API v3, cuota gratis).
 * - Sin API key => se puede pegar una URL/ID y cargarla directamente.
 * La reproducción respeta la sesión del usuario (sin anuncios si tiene Premium).
 */
export function YouTubeSearch() {
  const youtubeApiKey = useStore((s) => s.settings.youtubeApiKey);
  const loadYouTubeToDeck = useStore((s) => s.loadYouTubeToDeck);
  const [query, setQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doSearch = async () => {
    setError('');
    if (!youtubeApiKey) {
      setError('Añade tu API key de YouTube en Ajustes para buscar, o pega una URL abajo.');
      return;
    }
    try {
      setLoading(true);
      setResults(await searchYouTube(query, youtubeApiKey));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadUrl = (deck: 'A' | 'B') => {
    if (!extractVideoId(urlInput)) {
      setError('URL/ID de YouTube no válido.');
      return;
    }
    void loadYouTubeToDeck(deck, urlInput);
  };

  return (
    <div>
      <div className="row">
        <input
          type="search"
          placeholder="Buscar en YouTube…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button className="primary" onClick={doSearch} disabled={loading}>
          {loading ? '…' : 'Buscar'}
        </button>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <input
          type="text"
          placeholder="…o pega una URL/ID de YouTube"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
        />
        <button className="mini-btn" onClick={() => loadUrl('A')} disabled={!urlInput}>▶ A</button>
        <button className="mini-btn" onClick={() => loadUrl('B')} disabled={!urlInput}>▶ B</button>
      </div>

      {error && <small className="hint" style={{ color: 'var(--warn)', display: 'block', marginTop: 8 }}>{error}</small>}

      <div className="track-list">
        {results.map((r) => (
          <div key={r.id} className="track-item">
            {r.thumbnail && <img src={r.thumbnail} alt="" width={48} height={36} style={{ borderRadius: 4, objectFit: 'cover' }} />}
            <div className="info">
              <div className="name">{r.title}</div>
              <div className="sub">{r.channel}</div>
            </div>
            <button className="mini-btn" onClick={() => loadYouTubeToDeck('A', r.id, r.title)}>▶ A</button>
            <button className="mini-btn" onClick={() => loadYouTubeToDeck('B', r.id, r.title)}>▶ B</button>
          </div>
        ))}
      </div>
    </div>
  );
}
