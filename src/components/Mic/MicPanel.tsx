import { useStore } from '../../state/store';
import { Knob } from '../ui/Knob';
import { Fader } from '../ui/Fader';

const KEYS = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const SCALES = ['Cromática', 'Mayor', 'Menor'];

/**
 * Voz en vivo + micrófono de ANIMADOR (MC).
 *
 * - Voz en vivo: micrófono con compresor, reverb, eco y Auto-Tune (con escala).
 * - Animador: mientras suena la música, la persona habla por el micrófono y la
 *   música se agacha automáticamente (auto-ducking); se ajusta el nivel de fondo
 *   y el de la voz. La voz entra al máster, así que se oye y se graba.
 */
export function MicPanel() {
  const mic = useStore((s) => s.mic);
  const toggleMic = useStore((s) => s.toggleMic);
  const setMicVolume = useStore((s) => s.setMicVolume);
  const setMicReverb = useStore((s) => s.setMicReverb);
  const setMicEcho = useStore((s) => s.setMicEcho);
  const toggleAutotune = useStore((s) => s.toggleAutotune);
  const setAutotuneStrength = useStore((s) => s.setAutotuneStrength);
  const setAutotuneSpeed = useStore((s) => s.setAutotuneSpeed);
  const setAutotuneKey = useStore((s) => s.setAutotuneKey);
  const setAutotuneScale = useStore((s) => s.setAutotuneScale);
  const setAutotunePreset = useStore((s) => s.setAutotunePreset);
  const toggleTalkover = useStore((s) => s.toggleTalkover);
  const setDuckLevel = useStore((s) => s.setDuckLevel);
  const setVoiceEffect = useStore((s) => s.setVoiceEffect);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Voz &amp; Animador</h3>
        <button className={mic.enabled ? 'active' : 'primary'} onClick={() => void toggleMic()}>
          {mic.enabled ? '🎤 Micrófono activo' : '🎤 Activar micrófono'}
        </button>
      </div>

      <div style={{ opacity: mic.enabled ? 1 : 0.5, marginTop: 12 }}>
        <Fader
          label={`Volumen voz ${Math.round(mic.volume * 100)}%`}
          value={mic.volume}
          min={0}
          max={1.5}
          onChange={setMicVolume}
        />
        <div className="row" style={{ justifyContent: 'space-around', marginTop: 12 }}>
          <Knob label="Reverb" value={mic.reverb} min={0} max={1} resetTo={0.2}
            onChange={setMicReverb} format={(v) => `${Math.round(v * 100)}%`} />
          <Knob label="Echo" value={mic.echo} min={0} max={1} resetTo={0}
            onChange={setMicEcho} format={(v) => `${Math.round(v * 100)}%`} />
        </div>

        {/* ── Efectos de voz ───────────────────────────────────────────────── */}
        <div className="mic-section">
          <strong style={{ fontSize: 13 }}>🎭 Efectos de voz</strong>
          <div className="mic-help">Transforma tu voz en tiempo real (se oye y se graba).</div>
          <div className="preset-row" style={{ marginTop: 8 }}>
            {[
              { id: 'none', label: 'Ninguno' },
              { id: 'deep', label: '🐻 Grave' },
              { id: 'high', label: '🐿️ Agudo' },
              { id: 'robot', label: '🤖 Robot' },
              { id: 'phone', label: '📞 Teléfono' },
              { id: 'choir', label: '🎼 Coro' },
            ].map((e) => (
              <button
                key={e.id}
                className={`preset-btn${mic.voiceEffect === e.id ? ' on' : ''}`}
                onClick={() => setVoiceEffect(e.id as typeof mic.voiceEffect)}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Animador (talkover con auto-ducking) ─────────────────────────── */}
        <div className="mic-section">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: 13 }}>🎙️ Modo animador</strong>
              <div className="mic-help">
                La música baja sola cuando hablas y sube al callar (talkover).
              </div>
            </div>
            <button className={mic.talkover ? 'active' : ''} onClick={toggleTalkover}>
              {mic.talkover ? 'ON' : 'OFF'}
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <Fader
              label={`Música de fondo al hablar ${Math.round(mic.duckLevel * 100)}%`}
              value={mic.duckLevel}
              min={0}
              max={1}
              onChange={setDuckLevel}
            />
          </div>
        </div>

        {/* ── Auto-Tune (afinación a escala) ───────────────────────────────── */}
        <div className="mic-section">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: 13 }}>🎶 Auto-Tune</strong>
              <div className="mic-help">Afina la voz a la escala elegida en tiempo real.</div>
            </div>
            <button className={mic.autotune ? 'active' : ''} onClick={toggleAutotune}>
              {mic.autotune ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Presets rápidos tipo estudio profesional. */}
          <div className="preset-row" style={{ marginTop: 10 }}>
            {[
              { id: 'natural', label: 'Natural' },
              { id: 'pop', label: 'Pop' },
              { id: 'hard', label: 'Dura' },
              { id: 'robot', label: 'Robot' },
            ].map((p) => (
              <button
                key={p.id}
                className="preset-btn"
                onClick={() => setAutotunePreset(p.id as 'natural' | 'pop' | 'hard' | 'robot')}
                title={`Preset ${p.label}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field mic-field">
              <span>Escala</span>
              <select value={mic.autotuneScale} onChange={(e) => setAutotuneScale(Number(e.target.value))}>
                {SCALES.map((s, i) => (
                  <option key={s} value={i}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field mic-field">
              <span>Tono</span>
              <select
                value={mic.autotuneKey}
                onChange={(e) => setAutotuneKey(Number(e.target.value))}
                disabled={mic.autotuneScale === 0}
                title={mic.autotuneScale === 0 ? 'La escala cromática usa las 12 notas' : 'Tónica de la escala'}
              >
                {KEYS.map((k, i) => (
                  <option key={k} value={i}>{k}</option>
                ))}
              </select>
            </label>
            <Knob label="Intensidad" value={mic.autotuneStrength} min={0} max={1} resetTo={0.9}
              onChange={setAutotuneStrength} format={(v) => `${Math.round(v * 100)}%`} />
            <Knob label="Velocidad" value={mic.autotuneSpeed} min={0} max={1} resetTo={0.5}
              onChange={setAutotuneSpeed} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </div>
      </div>

      <small className="hint" style={{ display: 'block', marginTop: 10 }}>
        Usa audífonos para evitar acoples (realimentación). El navegador pedirá permiso del micrófono
        la primera vez. Nada sale de tu dispositivo.
      </small>
    </div>
  );
}
