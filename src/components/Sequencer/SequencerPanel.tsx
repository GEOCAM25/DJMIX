import { useStore } from '../../state/store';
import { Knob } from '../ui/Knob';

/**
 * Secuenciador de pasos (drum machine de 16 pasos). Programa un ritmo tocando
 * las celdas; suena sincronizado por el reloj de audio y se puede igualar al
 * BPM de un deck para acompañar la mezcla. El patrón se guarda en el navegador.
 */
export function SequencerPanel() {
  const seq = useStore((s) => s.sequencer);
  const toggle = useStore((s) => s.seqToggleStep);
  const play = useStore((s) => s.seqPlay);
  const stop = useStore((s) => s.seqStop);
  const setBpm = useStore((s) => s.setSeqBpm);
  const setSwing = useStore((s) => s.setSeqSwing);
  const clear = useStore((s) => s.seqClear);
  const syncToDeck = useStore((s) => s.seqSyncToDeck);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Secuenciador</h3>
        <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={seq.playing ? 'primary' : ''}
            onClick={() => (seq.playing ? stop() : play())}
            style={{ minWidth: 92 }}
          >
            {seq.playing ? '⏹ Detener' : '▶ Tocar'}
          </button>
          <button className="mini-btn" onClick={() => syncToDeck('A')} title="Igualar BPM al Deck A">
            Sync A
          </button>
          <button className="mini-btn" onClick={() => syncToDeck('B')} title="Igualar BPM al Deck B">
            Sync B
          </button>
          <button className="mini-btn" onClick={clear} title="Vaciar todos los pasos">
            Limpiar
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 16, alignItems: 'center', margin: '10px 0 6px' }}>
        <div className="bpm-stepper">
          <button className="mini-btn" onClick={() => setBpm(seq.bpm - 1)} aria-label="Bajar BPM">
            −
          </button>
          <div className="bpm-value">
            <strong>{seq.bpm}</strong>
            <span>BPM</span>
          </div>
          <button className="mini-btn" onClick={() => setBpm(seq.bpm + 1)} aria-label="Subir BPM">
            +
          </button>
        </div>
        <Knob
          label="Swing"
          value={seq.swing}
          min={0}
          max={0.6}
          resetTo={0}
          onChange={setSwing}
          format={(v) => `${Math.round((v / 0.6) * 100)}%`}
        />
      </div>

      <div className="seq-grid-scroll">
        <div className="seq-grid">
          {seq.rows.map((row, r) => (
            <div className="seq-row" key={row.label}>
              <span className="seq-label">{row.label}</span>
              {row.steps.map((on, c) => (
                <button
                  key={c}
                  className={[
                    'seq-cell',
                    on ? 'on' : '',
                    c % 4 === 0 ? 'beat' : '',
                    seq.playing && seq.step === c ? 'playing' : '',
                  ].join(' ')}
                  onClick={() => toggle(r, c)}
                  aria-label={`${row.label} paso ${c + 1}`}
                  aria-pressed={on}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <small className="hint" style={{ display: 'block', marginTop: 8 }}>
        Toca las celdas para crear tu ritmo. “Sync A/B” iguala el tempo al deck para acompañar la
        mezcla. El patrón queda guardado en tu navegador.
      </small>
    </div>
  );
}
