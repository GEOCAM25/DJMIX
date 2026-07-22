import { useStore } from '../../state/store';

/**
 * Estación de Live Looping (looper multipista): graba la mezcla en bucles de
 * longitud exacta (compases × BPM) y los reproduce en repetición. Cada slot es
 * una pista independiente; todas suenan a la vez.
 */
const BAR_OPTIONS = [1, 2, 4, 8];

export function LoopStationPanel() {
  const loops = useStore((s) => s.loops);
  const loopRecord = useStore((s) => s.loopRecord);
  const loopTogglePlay = useStore((s) => s.loopTogglePlay);
  const loopClear = useStore((s) => s.loopClear);
  const loopStopAll = useStore((s) => s.loopStopAll);
  const setLoopBars = useStore((s) => s.setLoopBars);
  const setLoopBpm = useStore((s) => s.setLoopBpm);
  const loopSyncToDeck = useStore((s) => s.loopSyncToDeck);

  const secs = (loops.bars * 4 * 60) / loops.bpm;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Live Looping</h3>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <button className="mini-btn" onClick={() => loopSyncToDeck('A')} title="Igualar BPM al Deck A">Sync A</button>
          <button className="mini-btn" onClick={() => loopSyncToDeck('B')} title="Igualar BPM al Deck B">Sync B</button>
          <button className="mini-btn" onClick={loopStopAll} title="Detener todos los loops">■ Todo</button>
        </div>
      </div>

      <div className="row" style={{ gap: 16, alignItems: 'center', margin: '10px 0' }}>
        <div className="bpm-stepper">
          <button className="mini-btn" onClick={() => setLoopBpm(loops.bpm - 1)} aria-label="Bajar BPM">−</button>
          <div className="bpm-value">
            <strong>{loops.bpm}</strong>
            <span>BPM</span>
          </div>
          <button className="mini-btn" onClick={() => setLoopBpm(loops.bpm + 1)} aria-label="Subir BPM">+</button>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Compases</div>
          <div className="row" style={{ gap: 4 }}>
            {BAR_OPTIONS.map((b) => (
              <button key={b} className={`mini-btn${loops.bars === b ? ' active' : ''}`} onClick={() => setLoopBars(b)}>
                {b}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loop ≈ {secs.toFixed(1)} s</div>
      </div>

      <div className="loop-grid">
        {loops.slots.map((s, i) => (
          <div key={i} className={`loop-slot${s.recording ? ' rec' : s.playing ? ' playing' : s.hasAudio ? ' has' : ''}`}>
            <div className="loop-slot-num">{i + 1}</div>
            {s.recording ? (
              <div className="loop-slot-state">● Grabando…</div>
            ) : s.hasAudio ? (
              <div className="row" style={{ gap: 6 }}>
                <button className="mini-btn" onClick={() => loopTogglePlay(i)}>{s.playing ? '❚❚' : '▶'}</button>
                <button className="mini-btn danger" onClick={() => loopClear(i)} title="Vaciar loop">✕</button>
              </div>
            ) : (
              <button className="mini-btn" onClick={() => loopRecord(i)} title="Grabar un loop en este slot">
                ● Grabar
              </button>
            )}
          </div>
        ))}
      </div>
      <small className="hint" style={{ display: 'block', marginTop: 8 }}>
        Cada slot graba la mezcla durante {loops.bars} compás(es) y la repite. Graba varios para
        montar capas. Ajusta BPM/compases al tempo de tu mezcla (o usa Sync).
      </small>
    </div>
  );
}
