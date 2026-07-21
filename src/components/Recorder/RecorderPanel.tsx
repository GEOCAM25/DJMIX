import { useState } from 'react';
import { useStore } from '../../state/store';
import { getMixUrl, deleteMix } from '../../storage/mixes';
import { toMp3 } from '../../media/ffmpeg';
import { getMixBlob } from '../../storage/mixes';

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/**
 * Grabación de la sesión y gestión de mixes guardados (todo local).
 * - Modo "Máster": graba la salida de Web Audio (decks locales + sampler + FX).
 * - Modo "Pestaña": captura TODO el audio de la pestaña, incluido YouTube.
 */
export function RecorderPanel() {
  const recording = useStore((s) => s.recording);
  const startRecording = useStore((s) => s.startRecording);
  const stopRecording = useStore((s) => s.stopRecording);
  const mixes = useStore((s) => s.mixes);
  const refreshMixes = useStore((s) => s.refreshMixes);
  const exportStems = useStore((s) => s.exportStems);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'master' | 'tab'>('master');
  const [busyId, setBusyId] = useState<string | null>(null);

  const play = async (id: string) => {
    const url = await getMixUrl(id);
    if (url) new Audio(url).play();
  };

  const download = async (id: string, mixName: string, mimeType: string) => {
    const url = await getMixUrl(id);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mixName}.${mimeType.includes('mp4') ? 'm4a' : 'webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const downloadMp3 = async (id: string, mixName: string) => {
    setBusyId(id);
    try {
      const blob = await getMixBlob(id);
      if (!blob) return;
      const mp3 = await toMp3(blob);
      const url = URL.createObjectURL(mp3);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mixName}.mp3`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    await deleteMix(id);
    await refreshMixes();
  };

  return (
    <div className="panel">
      <h3>Grabación de Mixes</h3>
      <div className="row">
        <input type="text" placeholder="Nombre del mix…" value={name} onChange={(e) => setName(e.target.value)} />
        {!recording ? (
          <button className="primary" onClick={() => startRecording(mode)}>● Grabar</button>
        ) : (
          <button className="danger" onClick={() => stopRecording(name)}>■ Detener</button>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <input type="radio" checked={mode === 'master'} onChange={() => setMode('master')} /> Máster (Web Audio)
        </label>
        <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <input type="radio" checked={mode === 'tab'} onChange={() => setMode('tab')} /> Pestaña (incluye YouTube)
        </label>
      </div>
      <small className="hint" style={{ display: 'block', marginTop: 6 }}>
        El modo "Pestaña" pedirá compartir la pestaña con audio para capturar también YouTube.
      </small>

      <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Exportar proyecto (multi-pista)</span>
          <button className="mini-btn" onClick={() => void exportStems()}>
            ⬇ Stems (.zip)
          </button>
        </div>
        <small className="hint" style={{ display: 'block', marginTop: 4 }}>
          Genera un .zip con cada deck cargado como WAV + un project.json (BPM, tonalidad,
          cues y estado de la mezcla). Todo local.
        </small>
      </div>

      <div className="track-list">
        {mixes.length === 0 && <small className="hint">Todavía no has grabado ningún mix.</small>}
        {mixes.map((m) => (
          <div key={m.id} className="track-item">
            <div className="info">
              <div className="name">{m.name}</div>
              <div className="sub">{fmtDur(m.durationMs)} · {(m.size / 1_048_576).toFixed(1)} MB</div>
            </div>
            <button className="mini-btn" onClick={() => play(m.id)}>▶</button>
            <button className="mini-btn" onClick={() => download(m.id, m.name, m.mimeType)}>⬇</button>
            <button className="mini-btn" disabled={busyId === m.id} onClick={() => downloadMp3(m.id, m.name)}>
              {busyId === m.id ? '…' : 'MP3'}
            </button>
            <button className="mini-btn danger" onClick={() => remove(m.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
