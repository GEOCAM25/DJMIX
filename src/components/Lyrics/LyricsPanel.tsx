import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { countSyllables, findRhymes, structureTemplate } from '../../lyrics/lyrics';

/**
 * Copiloto Lírico: ayuda a escribir letras ORIGINALES. Herramientas locales
 * (estructura, rimas, sílabas) sin clave; generación con IA opcional (si el
 * usuario configuró su clave), siempre con letras originales.
 */
export function LyricsPanel() {
  const ai = useStore((s) => s.ai);

  const [theme, setTheme] = useState('');
  const [mood, setMood] = useState('');
  const [text, setText] = useState('');
  const [rhymeWord, setRhymeWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const rhymes = useMemo(() => findRhymes(rhymeWord), [rhymeWord]);

  // Sílabas por línea (ignora encabezados [..] y líneas vacías).
  const meter = useMemo(() => {
    return text
      .split('\n')
      .map((line) => ({ line, syl: line.trim() && !line.trim().startsWith('[') && !line.trim().startsWith('#') ? countSyllables(line) : null }))
      .filter((r) => r.syl != null)
      .slice(0, 40);
  }, [text]);

  const insertStructure = () => setText((t) => (t ? `${t}\n\n${structureTemplate(theme)}` : structureTemplate(theme)));
  const appendWord = (w: string) => setText((t) => (t ? `${t} ${w}` : w));

  const generateAI = async () => {
    if (!ai.available) return;
    setLoading(true);
    setAiError('');
    try {
      const system =
        'Eres un coescritor de canciones. Escribe letras 100% ORIGINALES en español. ' +
        'NUNCA copies ni reproduzcas letras de canciones existentes protegidas por derechos de autor; ' +
        'si se te pide una canción conocida, crea una letra ORIGINAL inspirada en el tema. ' +
        'Devuelve solo la letra, con secciones [Verso], [Estribillo], [Puente].';
      const user = `Escribe una letra original en español sobre: ${theme || 'lo que sugiera la música'}.` +
        `${mood ? ` Tono/ánimo: ${mood}.` : ''} Estructura: verso, estribillo, verso, estribillo, puente, estribillo. Cuida la rima y la métrica.`;
      const out = await ai.chat(system, [{ role: 'user', content: user }]);
      setText((t) => (t ? `${t}\n\n${out.trim()}` : out.trim()));
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `letra-${(theme || 'beatdj').replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  };

  return (
    <div className="panel">
      <h3>Copiloto Lírico</h3>
      <small className="hint" style={{ display: 'block', marginBottom: 8 }}>
        Escribe letras <strong>originales</strong>: estructura, rimas y sílabas — sin conexión. La
        generación con IA es opcional (usa tu clave) y siempre produce letra original.
      </small>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Tema (ej. una noche de verano)" value={theme} onChange={(e) => setTheme(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <input type="text" placeholder="Ánimo (opcional)" value={mood} onChange={(e) => setMood(e.target.value)} style={{ width: 150 }} />
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="mini-btn" onClick={insertStructure}>🧱 Estructura</button>
        <button className="mini-btn" onClick={generateAI} disabled={!ai.available || loading} title={ai.available ? 'Genera una letra original con tu clave de IA' : 'Configura tu clave de IA en Ajustes para generar'}>
          {loading ? '✨ Generando…' : '✨ Generar con IA'}
        </button>
        <button className="mini-btn" onClick={download} disabled={!text}>⬇ .txt</button>
        <button className="mini-btn" onClick={() => setText('')} disabled={!text}>Limpiar</button>
      </div>
      {!ai.available && (
        <small className="hint" style={{ display: 'block', marginTop: 4 }}>
          (Sin clave de IA funciona todo lo local: estructura, rimas y métrica.)
        </small>
      )}
      {aiError && <small className="hint" style={{ display: 'block', marginTop: 4, color: 'var(--warn)' }}>{aiError}</small>}

      <textarea
        className="lyrics-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Tu letra aquí… Pulsa 🧱 Estructura para empezar con un esqueleto."
        rows={10}
      />

      <div className="lyrics-tools">
        <div className="lyrics-rhymes">
          <div className="row" style={{ gap: 6 }}>
            <input type="text" placeholder="Rimas para…" value={rhymeWord} onChange={(e) => setRhymeWord(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="rhyme-chips">
            {rhymeWord.trim().length >= 2 && rhymes.length === 0 && <small className="hint">Sin rimas en el banco. Prueba otra terminación.</small>}
            {rhymes.map((r) => (
              <button key={r} className="rhyme-chip" onClick={() => appendWord(r)} title="Añadir a la letra">{r}</button>
            ))}
          </div>
        </div>

        <div className="lyrics-meter">
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Sílabas por línea</div>
          {meter.length === 0 ? (
            <small className="hint">Escribe versos para ver su métrica.</small>
          ) : (
            <div className="meter-list">
              {meter.map((m, i) => (
                <div key={i} className="meter-row">
                  <span className="meter-count">{m.syl}</span>
                  <span className="meter-text">{m.line.trim()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
