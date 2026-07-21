import { useState } from 'react';
import { useStore } from '../../state/store';
import { FileDropzone } from './FileDropzone';
import { YouTubeSearch } from './YouTubeSearch';

type Tab = 'local' | 'youtube';

/**
 * Biblioteca del usuario: pestaña de archivos locales (con dropzone y lista
 * persistida en IndexedDB) y pestaña de YouTube (buscador + carga por URL).
 */
export function LibraryPanel() {
  const [tab, setTab] = useState<Tab>('local');
  const library = useStore((s) => s.library);
  const loadLocalTrackToDeck = useStore((s) => s.loadLocalTrackToDeck);
  const removeTrack = useStore((s) => s.removeTrack);

  return (
    <div className="panel">
      <h3>Biblioteca & Fuentes</h3>
      <div className="tabs">
        <button className={tab === 'local' ? 'on' : ''} onClick={() => setTab('local')}>
          Mis archivos
        </button>
        <button className={tab === 'youtube' ? 'on' : ''} onClick={() => setTab('youtube')}>
          YouTube
        </button>
      </div>

      {tab === 'local' ? (
        <>
          <FileDropzone />
          <div className="track-list">
            {library.length === 0 && <small className="hint">Aún no hay pistas. Importa audio o vídeo.</small>}
            {library.map((t) => (
              <div key={t.id} className="track-item">
                <div className="info">
                  <div className="name">{t.artist ? `${t.artist} – ${t.title}` : t.title}</div>
                  <div className="sub">
                    {t.bpm ? `${Math.round(t.bpm)} BPM` : '— BPM'} · {t.camelotKey ?? '—'} ·{' '}
                    {(t.size / 1_048_576).toFixed(1)} MB
                  </div>
                </div>
                <button className="mini-btn" onClick={() => loadLocalTrackToDeck('A', t.id)}>▶ A</button>
                <button className="mini-btn" onClick={() => loadLocalTrackToDeck('B', t.id)}>▶ B</button>
                <button className="mini-btn danger" onClick={() => removeTrack(t.id)} title="Eliminar">✕</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <YouTubeSearch />
      )}
    </div>
  );
}
