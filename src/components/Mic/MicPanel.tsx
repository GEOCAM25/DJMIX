import { useStore } from '../../state/store';
import { Knob } from '../ui/Knob';
import { Fader } from '../ui/Fader';

/**
 * Voz en vivo: activa el micrófono y cántale/háblale a tu mezcla con reverb y
 * eco. La voz entra al máster, así que se oye y se graba (audio y vídeo).
 */
export function MicPanel() {
  const mic = useStore((s) => s.mic);
  const toggleMic = useStore((s) => s.toggleMic);
  const setMicVolume = useStore((s) => s.setMicVolume);
  const setMicReverb = useStore((s) => s.setMicReverb);
  const setMicEcho = useStore((s) => s.setMicEcho);
  const toggleAutotune = useStore((s) => s.toggleAutotune);
  const setAutotuneStrength = useStore((s) => s.setAutotuneStrength);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Voz en vivo</h3>
        <button className={mic.enabled ? 'active' : 'primary'} onClick={() => void toggleMic()}>
          {mic.enabled ? '🎤 Activa' : '🎤 Activar micrófono'}
        </button>
      </div>

      <div style={{ opacity: mic.enabled ? 1 : 0.5, marginTop: 12 }}>
        <Fader label={`Volumen voz ${Math.round(mic.volume * 100)}%`} value={mic.volume} min={0} max={1.5} onChange={setMicVolume} />
        <div className="row" style={{ justifyContent: 'space-around', marginTop: 12 }}>
          <Knob label="Reverb" value={mic.reverb} min={0} max={1} resetTo={0.2}
            onChange={setMicReverb} format={(v) => `${Math.round(v * 100)}%`} />
          <Knob label="Echo" value={mic.echo} min={0} max={1} resetTo={0}
            onChange={setMicEcho} format={(v) => `${Math.round(v * 100)}%`} />
        </div>

        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}
        >
          <div>
            <button className={mic.autotune ? 'active' : ''} onClick={toggleAutotune}>
              🎶 Auto-Tune {mic.autotune ? 'ON' : 'OFF'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, maxWidth: 220 }}>
              Afina la voz a la nota más cercana (cromática) en tiempo real.
            </div>
          </div>
          <Knob label="Intensidad" value={mic.autotuneStrength} min={0} max={1} resetTo={0.9}
            onChange={setAutotuneStrength} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </div>

      <small className="hint" style={{ display: 'block', marginTop: 10 }}>
        Usa audífonos para evitar acoples (realimentación). El navegador pedirá permiso del micrófono
        la primera vez. Nada sale de tu dispositivo.
      </small>
    </div>
  );
}
