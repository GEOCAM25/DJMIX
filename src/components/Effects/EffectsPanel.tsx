import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { Knob } from '../ui/Knob';
import { createDrumSamples } from '../../audio/synthSamples';
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

      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 14 }}>
        <Knob label="Reverb" value={fx.reverb} min={0} max={1} resetTo={0}
          onChange={setReverb} format={(v) => `${Math.round(v * 100)}%`} />
        <Knob label="Echo" value={fx.echo} min={0} max={1} resetTo={0}
          onChange={setEcho} format={(v) => `${Math.round(v * 100)}%`} />
        <Knob label="Filtro" value={fx.filter} min={-1} max={1} resetTo={0}
          onChange={setMasterFilter} format={(v) => (Math.abs(v) < 0.02 ? 'off' : v < 0 ? 'LP' : 'HP')} />
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

      <div className="pad-grid">
        {pads.map((p) => (
          <button key={p.id} className="pad" onPointerDown={() => trigger(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <small className="hint" style={{ display: 'block', marginTop: 8 }}>
        Los samples son sintéticos (sin archivos externos). Dispara con clic o toca los pads.
      </small>
    </div>
  );
}
