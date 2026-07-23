import { useCallback } from 'react';
import { useStore } from '../../state/store';
import type { DeckId } from '../../audio/types';
import { Knob } from '../ui/Knob';
import { Fader } from '../ui/Fader';
import { VuMeter } from '../ui/VuMeter';

/** Acentos de color por banda de EQ, para identificarlas de un vistazo. */
const BAND = {
  high: '#22d3ee', // agudos → cian
  mid: '#34d399', // medios → verde esmeralda
  low: '#fb923c', // graves → naranja
  filter: '#c084fc', // filtro → violeta/magenta
} as const;

function ChannelStrip({ id }: { id: DeckId }) {
  const channel = useStore((s) => s.channels[id]);
  const deckEngine = useStore((s) => s.decks[id].engine);
  const engine = useStore((s) => s.engine);
  const setEq = useStore((s) => s.setEq);
  const setChannelFilter = useStore((s) => s.setChannelFilter);
  const setChannelFader = useStore((s) => s.setChannelFader);
  const disabled = deckEngine === 'youtube';

  const getLevel = useCallback(() => engine?.getChannelLevel(id) ?? 0, [engine, id]);

  return (
    <div style={{ opacity: disabled ? 0.45 : 1 }}>
      <div style={{ textAlign: 'center', fontWeight: 700, color: id === 'A' ? 'var(--accent-a)' : 'var(--accent-b)' }}>
        Canal {id}
      </div>
      {disabled && <small className="hint" style={{ display: 'block', textAlign: 'center' }}>EQ/filtro no aplican a YouTube</small>}
      <div style={{ marginTop: 6 }}>
        <div className="eq-grid">
          <Knob label="High" accent={BAND.high} value={channel.eq.high} min={-26} max={6} resetTo={0}
            onChange={(v) => setEq(id, 'high', v)} format={(v) => `${v.toFixed(0)}dB`} />
          <Knob label="Mid" accent={BAND.mid} value={channel.eq.mid} min={-26} max={6} resetTo={0}
            onChange={(v) => setEq(id, 'mid', v)} format={(v) => `${v.toFixed(0)}dB`} />
          <Knob label="Low" accent={BAND.low} value={channel.eq.low} min={-26} max={6} resetTo={0}
            onChange={(v) => setEq(id, 'low', v)} format={(v) => `${v.toFixed(0)}dB`} />
          <Knob label="Filter" accent={BAND.filter} value={channel.filter} min={-1} max={1} resetTo={0}
            onChange={(v) => setChannelFilter(id, v)} format={(v) => (Math.abs(v) < 0.02 ? 'off' : v < 0 ? 'LP' : 'HP')} />
        </div>
        <div className="meter-col" style={{ justifyContent: 'center', marginTop: 8 }}>
          <Fader label="Vol" vertical value={channel.fader} min={0} max={1}
            onChange={(v) => setChannelFader(id, v)} />
          <VuMeter getLevel={getLevel} height={104} />
        </div>
      </div>
    </div>
  );
}

/**
 * Sección de PRE-ESCUCHA (Cue de audífonos): elige la salida secundaria y su
 * volumen. La activación por deck vive en el botón 🎧 de cada Deck.
 */
function CueSection() {
  const cueSupported = useStore((s) => s.cueSupported);
  const cueDevices = useStore((s) => s.cueDevices);
  const cueDeviceId = useStore((s) => s.cueDeviceId);
  const cueVolume = useStore((s) => s.cueVolume);
  const cueActive = useStore((s) => s.cueMonitor.A || s.cueMonitor.B);
  const selectCueOutput = useStore((s) => s.selectCueOutput);
  const setCueDevice = useStore((s) => s.setCueDevice);
  const setCueVolume = useStore((s) => s.setCueVolume);
  const refreshCueDevices = useStore((s) => s.refreshCueDevices);

  return (
    <div className="cue-section" style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🎧 Pre-escucha (Cue)</span>
        {cueActive && <span className="chip" style={{ color: 'var(--good)' }}>activa</span>}
      </div>

      {!cueSupported ? (
        <small className="hint" style={{ display: 'block', marginTop: 4 }}>
          Salida de audífonos (setSinkId) no disponible. Usa Chrome/Edge de escritorio.
        </small>
      ) : (
        <div className="row" style={{ marginTop: 6, gap: 6, alignItems: 'center' }}>
          <select
            value={cueDeviceId ?? ''}
            onChange={(e) => setCueDevice(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
            aria-label="Salida de audífonos"
          >
            <option value="">Parlantes</option>
            {cueDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
          <button className="mini-btn" onClick={() => void selectCueOutput()} title="Elegir salida de audífonos">🎧</button>
          <button className="mini-btn" onClick={() => void refreshCueDevices()} title="Actualizar salidas">⟳</button>
          <input
            type="range" min={0} max={1} step={0.01} value={cueVolume}
            onChange={(e) => setCueVolume(parseFloat(e.target.value))}
            aria-label={`Volumen audífonos ${Math.round(cueVolume * 100)}%`}
            style={{ flex: 1, minWidth: 60 }}
          />
        </div>
      )}
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
  const engine = useStore((s) => s.engine);
  const masterLevel = useCallback(() => engine?.getMasterLevel() ?? 0, [engine]);

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
        <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Fader label={`Máster ${Math.round(master * 100)}%`} value={master} min={0} max={1.2}
              onChange={setMaster} />
          </div>
          <VuMeter getLevel={masterLevel} height={54} />
        </div>
      </div>

      <CueSection />
    </div>
  );
}
