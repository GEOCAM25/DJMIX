import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { Knob } from '../ui/Knob';
import { createDrumSamples } from '../../audio/synthSamples';
import { AUDIO_STYLES } from '../../audio/Effects';
import type { SamplePad } from '../../audio/Sampler';

/**
 * Panel de efectos en vivo (Reverb, Echo, Filtro máster) + sampler de pads.
 * Los efectos actúan sobre el máster de Web Audio (decks locales + sampler).
 */
export function EffectsPanel() {
  const engine = useStore((s) => s.engine);
  const fx = useStore((s) => s.fx);
  const setReverb = useStore((s) => s.setReverb);
  const setEcho = useStore((s) => s.setEcho);
  const setMasterFilter = useStore((s) => s.setMasterFilter);
  const sidechain = useStore((s) => s.sidechain);
  const toggleSidechain = useStore((s) => s.toggleSidechain);
  const setSidechainAmount = useStore((s) => s.setSidechainAmount);
  const samplerLabels = useStore((s) => s.samplerLabels);
  const autoSlice = useStore((s) => s.autoSlice);
  const resetSampler = useStore((s) => s.resetSampler);
  const audioStyle = useStore((s) => s.audioStyle);
  const setAudioStyle = useStore((s) => s.setAudioStyle);
  const [pads, setPads] = useState<SamplePad[]>([]);

  // Cargar los samples sintéticos por defecto en el sampler una sola vez.
  useEffect(() => {
    if (!engine || pads.length) return;
    const samples = createDrumSamples(engine.ctx);
    samples.forEach((p) => engine.sampler.setPad(p));
    setPads(samples);
  }, [engine, pads.length]);

  const trigger = (id: string) => engine?.sampler.trigger(id);

  return (
    <div className="panel">
      <h3>Efectos & Sampler</h3>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 34, marginBottom: 14, flexWrap: 'wrap' }}>
        <Knob label="Reverb" value={fx.reverb} min={0} max={1} resetTo={0}
          onChange={setReverb} format={(v) => `${Math.round(v * 100)}%`} />
        <Knob label="Echo" value={fx.echo} min={0} max={1} resetTo={0}
          onChange={setEcho} format={(v) => `${Math.round(v * 100)}%`} />
        <Knob label="Filtro" value={fx.filter} min={-1} max={1} resetTo={0}
          onChange={setMasterFilter} format={(v) => (Math.abs(v) < 0.02 ? 'off' : v < 0 ? 'LP' : 'HP')} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>🎚 Estilo (color de género)</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {AUDIO_STYLES.find((st) => st.id === audioStyle)?.desc}
          </span>
        </div>
        <div className="style-picker">
          {AUDIO_STYLES.map((st) => (
            <button
              key={st.id}
              className={audioStyle === st.id ? 'active' : ''}
              onClick={() => setAudioStyle(st.id)}
              title={st.desc}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}
      >
        <div>
          <button className={sidechain.enabled ? 'active' : ''} onClick={toggleSidechain}>
            🧠 Smart EQ {sidechain.enabled ? 'ON' : 'OFF'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, maxWidth: 220 }}>
            Auto-ducking: baja los graves del deck secundario en cada kick del principal.
          </div>
        </div>
        <Knob
          label="Ducking"
          value={sidechain.amount}
          min={0}
          max={24}
          resetTo={14}
          onChange={setSidechainAmount}
          format={(v) => `${Math.round(v)}dB`}
        />
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {samplerLabels ? '🔪 Pads = cortes de la pista' : 'Sampler (batería)'}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button className="mini-btn" onClick={() => autoSlice('A')} title="Cortar el Deck A en 8 pads por transitorios">
            Cortar A
          </button>
          <button className="mini-btn" onClick={() => autoSlice('B')} title="Cortar el Deck B en 8 pads por transitorios">
            Cortar B
          </button>
          {samplerLabels && (
            <button className="mini-btn" onClick={resetSampler} title="Volver a la batería sintética">
              Batería
            </button>
          )}
        </div>
      </div>

      <div className="pad-grid">
        {pads.map((p, i) => (
          <button key={p.id} className="pad" onPointerDown={() => trigger(p.id)}>
            {samplerLabels ? samplerLabels[i] ?? '—' : p.label}
          </button>
        ))}
      </div>
      <small className="hint" style={{ display: 'block', marginTop: 8 }}>
        Dispara con clic o toca los pads. “Cortar A/B” trocea la pista cargada por sus
        golpes y la mapea a los pads para tocarla en vivo.
      </small>
    </div>
  );
}
