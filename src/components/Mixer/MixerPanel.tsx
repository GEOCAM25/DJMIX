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
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>🎧 Pre-escucha (Cue)</span>
        {cueActive && <span className="chip" style={{ color: 'var(--good)' }}>activa</span>}
      </div>

      {!cueSupported ? (
        <small className="hint" style={{ display: 'block', marginTop: 6 }}>
          Tu navegador no permite una salida de audio secundaria (setSinkId). Usa
          Chrome o Edge de escritorio para monitorear por audífonos.
        </small>
      ) : (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            <select
              value={cueDeviceId ?? ''}
              onChange={(e) => setCueDevice(e.target.value)}
              style={{ flex: 1 }}
              aria-label="Salida de audífonos"
            >
              <option value="">Salida por defecto (parlantes)</option>
              {cueDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
            <button className="mini-btn" onClick={() => void selectCueOutput()} title="Elegir salida con el diálogo del navegador">
              Elegir
            </button>
            <button className="mini-btn" onClick={() => void refreshCueDevices()} title="Actualizar lista de salidas">
              ⟳
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <Fader
              label={`Volumen audífonos ${Math.round(cueVolume * 100)}%`}
              value={cueVolume}
              min={0}
              max={1}
              onChange={setCueVolume}
            />
          </div>
          <small className="hint" style={{ display: 'block', marginTop: 4 }}>
            Activa el 🎧 en un Deck para escucharlo aquí, sin importar el crossfader.
          </small>
        </>
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

      <CueSection />
    </div>
  );
}
