import { useStore } from '../../state/store';
import type { DeckId } from '../../audio/types';
import { Knob } from '../ui/Knob';
import { Fader } from '../ui/Fader';

function ChannelStrip({ id }: { id: DeckId }) {
  const channel = useStore((s) => s.channels[id]);
  const engine = useStore((s) => s.decks[id].engine);
  const setEq = useStore((s) => s.setEq);
  const setChannelFilter = useStore((s) => s.setChannelFilter);
  const setChannelFader = useStore((s) => s.setChannelFader);
  const color = id === 'A' ? 'a' : 'b';
  const disabled = engine === 'youtube';

  return (
    <div style={{ opacity: disabled ? 0.45 : 1 }}>
      <div style={{ textAlign: 'center', fontWeight: 700, color: id === 'A' ? 'var(--accent-a)' : 'var(--accent-b)' }}>
        Canal {id}
      </div>
      {disabled && <small className="hint" style={{ display: 'block', textAlign: 'center' }}>EQ/filtro no aplican a YouTube</small>}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <Knob label="High" color={color} value={channel.eq.high} min={-26} max={6} resetTo={0}
          onChange={(v) => setEq(id, 'high', v)} format={(v) => `${v.toFixed(0)}dB`} />
        <Knob label="Mid" color={color} value={channel.eq.mid} min={-26} max={6} resetTo={0}
          onChange={(v) => setEq(id, 'mid', v)} format={(v) => `${v.toFixed(0)}dB`} />
        <Knob label="Low" color={color} value={channel.eq.low} min={-26} max={6} resetTo={0}
          onChange={(v) => setEq(id, 'low', v)} format={(v) => `${v.toFixed(0)}dB`} />
        <Knob label="Filter" color={color} value={channel.filter} min={-1} max={1} resetTo={0}
          onChange={(v) => setChannelFilter(id, v)} format={(v) => (Math.abs(v) < 0.02 ? 'off' : v < 0 ? 'LP' : 'HP')} />
        <Fader label="Volumen" vertical value={channel.fader} min={0} max={1}
          onChange={(v) => setChannelFader(id, v)} />
      </div>
    </div>
  );
}

/**
 * Mesa central: dos channel strips con EQ de 3 bandas + filtro + fader,
 * el crossfader A/B (curva de igual potencia) y el volumen máster.
 */
export function MixerPanel() {
  const crossfade = useStore((s) => s.crossfade);
  const setCrossfade = useStore((s) => s.setCrossfade);
  const master = useStore((s) => s.master);
  const setMaster = useStore((s) => s.setMaster);

  return (
    <div className="panel">
      <h3>Mezclador</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ChannelStrip id="A" />
        <ChannelStrip id="B" />
      </div>

      <div className="crossfader-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--accent-a)' }}>A</span>
          <span>Crossfader</span>
          <span style={{ color: 'var(--accent-b)' }}>B</span>
        </div>
        <input
          className="crossfader"
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={crossfade}
          onChange={(e) => setCrossfade(parseFloat(e.target.value))}
          aria-label="Crossfader"
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <Fader label={`Máster ${Math.round(master * 100)}%`} value={master} min={0} max={1.2}
          onChange={setMaster} />
      </div>
    </div>
  );
}
