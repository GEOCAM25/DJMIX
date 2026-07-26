import { useEffect, useMemo, useState } from 'react';
import { Fader } from '../ui/Fader';
import { ttsSupported, getVoices, onVoicesChanged, speak, stopSpeaking } from '../../audio/tts';

/** Frases rápidas típicas de un DJ/animador. */
const QUICK = [
  '¡Manos arriba!',
  '¡Que se prenda la fiesta!',
  'DJ en la casa, ¡vamos!',
  'Un aplauso para todos',
  '¡Otra vez!',
  'Bienvenidos al show',
];

/**
 * Locutor IA (texto a voz): escribe un texto y el navegador lo dice con una voz
 * del sistema. 100% local y gratis. Ideal para intros, shoutouts y anuncios.
 */
export function TtsPanel() {
  const supported = ttsSupported();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState('');
  const [text, setText] = useState('¡Bienvenidos a la fiesta! Que comience el show.');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const refresh = () => setVoices(getVoices());
    refresh();
    const off = onVoicesChanged(refresh);
    return off;
  }, [supported]);

  // Ordena las voces en español primero (más útil para el usuario).
  const sortedVoices = useMemo(() => {
    return [...voices].sort((a, b) => {
      const sa = a.lang.toLowerCase().startsWith('es') ? 0 : 1;
      const sb = b.lang.toLowerCase().startsWith('es') ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name);
    });
  }, [voices]);

  // Elige por defecto la primera voz en español (o la primera disponible).
  useEffect(() => {
    if (!voiceName && sortedVoices.length) setVoiceName(sortedVoices[0].name);
  }, [sortedVoices, voiceName]);

  const say = (t: string) => {
    setSpeaking(true);
    speak(t, {
      voiceName,
      rate,
      pitch,
      onend: () => setSpeaking(false),
      onerror: () => setSpeaking(false),
    });
  };
  const stop = () => {
    stopSpeaking();
    setSpeaking(false);
  };

  if (!supported) {
    return (
      <div className="panel">
        <h3>🗣️ Locutor IA (texto a voz)</h3>
        <small className="hint">
          Tu navegador no permite la síntesis de voz (Web Speech API). Prueba con Chrome,
          Edge o Safari actualizados.
        </small>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🗣️ Locutor IA (texto a voz)</h3>
        {!speaking ? (
          <button className="primary" onClick={() => say(text)}>▶ Decir</button>
        ) : (
          <button className="danger" onClick={stop}>■ Detener</button>
        )}
      </div>

      <textarea
        className="tts-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe lo que quieres que diga…"
        rows={3}
      />

      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field mic-field" style={{ flex: 1, minWidth: 160 }}>
          <span>Voz {sortedVoices.length ? `(${sortedVoices.length})` : ''}</span>
          <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
            {sortedVoices.length === 0 && <option value="">Cargando voces…</option>}
            {sortedVoices.map((v) => (
              <option key={v.name} value={v.name}>{v.name} · {v.lang}</option>
            ))}
          </select>
        </label>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Fader label={`Velocidad ${rate.toFixed(1)}×`} value={rate} min={0.5} max={1.8} step={0.1} onChange={setRate} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Fader label={`Tono ${pitch.toFixed(1)}`} value={pitch} min={0} max={2} step={0.1} onChange={setPitch} />
        </div>
      </div>

      <div className="mic-section">
        <strong style={{ fontSize: 13 }}>Frases rápidas</strong>
        <div className="preset-row" style={{ marginTop: 8 }}>
          {QUICK.map((q) => (
            <button key={q} className="preset-btn" onClick={() => { setText(q); say(q); }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      <small className="hint" style={{ display: 'block', marginTop: 10 }}>
        Suena por los altavoces al instante. Para <strong>grabarlo</strong>, usa el modo
        <strong> Pestaña</strong> en Grabar (captura todo el audio de la pestaña). Las voces
        dependen de tu dispositivo/navegador.
      </small>
    </div>
  );
}
