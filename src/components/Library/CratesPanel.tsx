import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import {
  crateMatches,
  describeRule,
  isValidCamelot,
  allCamelotCodes,
  type CrateRule,
} from '../../library/crates';

type RuleType = CrateRule['type'];

/**
 * Panel de Smart Crates: crea carpetas inteligentes por reglas (BPM, energía,
 * clave compatible, título, fuente) que agrupan la biblioteca en vivo y pueden
 * enviarse a la cola del Auto-DJ.
 */
export function CratesPanel() {
  const library = useStore((s) => s.library);
  const crates = useStore((s) => s.crates);
  const decks = useStore((s) => s.decks);
  const addCrate = useStore((s) => s.addCrate);
  const removeCrate = useStore((s) => s.removeCrate);
  const sendCrateToQueue = useStore((s) => s.sendCrateToQueue);

  const [name, setName] = useState('');
  const [rules, setRules] = useState<CrateRule[]>([]);
  const [ruleType, setRuleType] = useState<RuleType>('bpm');
  const [bpmMin, setBpmMin] = useState(120);
  const [bpmMax, setBpmMax] = useState(128);
  const [energyPct, setEnergyPct] = useState(60);
  const [keyCode, setKeyCode] = useState('8A');
  const [titleText, setTitleText] = useState('');
  const [sourceEngine, setSourceEngine] = useState<'local' | 'youtube'>('local');

  const counts = useMemo(
    () => crates.map((c) => crateMatches(c, library).length),
    [crates, library],
  );

  const buildRule = (): CrateRule | null => {
    switch (ruleType) {
      case 'bpm': {
        const min = Math.min(bpmMin, bpmMax);
        const max = Math.max(bpmMin, bpmMax);
        return { type: 'bpm', min, max };
      }
      case 'energy':
        return { type: 'energy', min: Math.max(0, Math.min(1, energyPct / 100)) };
      case 'key':
        return isValidCamelot(keyCode) ? { type: 'key', camelot: keyCode.toUpperCase() } : null;
      case 'title':
        return titleText.trim() ? { type: 'title', text: titleText.trim() } : null;
      case 'source':
        return { type: 'source', engine: sourceEngine };
    }
  };

  const addRule = () => {
    const r = buildRule();
    if (r) setRules((prev) => [...prev, r]);
  };

  const createCrate = () => {
    addCrate(name, rules);
    setName('');
    setRules([]);
  };

  return (
    <div className="panel">
      <h3>Smart Crates</h3>
      <small className="hint" style={{ display: 'block', marginBottom: 10 }}>
        Carpetas por reglas (se combinan con Y). Agrupan tu biblioteca automáticamente.
      </small>

      {/* Constructor de reglas */}
      <div className="crate-builder">
        <input
          type="text"
          placeholder="Nombre del crate (ej. House 120–128)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <select value={ruleType} onChange={(e) => setRuleType(e.target.value as RuleType)} style={{ width: 'auto' }}>
            <option value="bpm">BPM</option>
            <option value="energy">Energía</option>
            <option value="key">Clave compatible</option>
            <option value="title">Título</option>
            <option value="source">Fuente</option>
          </select>

          {ruleType === 'bpm' && (
            <>
              <input className="num" type="number" value={bpmMin} min={40} max={220} onChange={(e) => setBpmMin(+e.target.value)} aria-label="BPM mínimo" />
              <span style={{ color: 'var(--text-dim)' }}>–</span>
              <input className="num" type="number" value={bpmMax} min={40} max={220} onChange={(e) => setBpmMax(+e.target.value)} aria-label="BPM máximo" />
            </>
          )}
          {ruleType === 'energy' && (
            <label className="row" style={{ gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
              ≥
              <input type="range" min={0} max={100} value={energyPct} onChange={(e) => setEnergyPct(+e.target.value)} style={{ width: 110 }} />
              {energyPct}%
            </label>
          )}
          {ruleType === 'key' && (
            <>
              <select value={keyCode} onChange={(e) => setKeyCode(e.target.value)} style={{ width: 'auto' }} aria-label="Clave Camelot">
                {allCamelotCodes().map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {(['A', 'B'] as const).map((d) =>
                decks[d].camelotKey ? (
                  <button key={d} className="mini-btn" onClick={() => setKeyCode(decks[d].camelotKey as string)} title={`Usar la clave del Deck ${d}`}>
                    Deck {d}: {decks[d].camelotKey}
                  </button>
                ) : null,
              )}
            </>
          )}
          {ruleType === 'title' && (
            <input type="text" placeholder="contiene…" value={titleText} onChange={(e) => setTitleText(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          )}
          {ruleType === 'source' && (
            <select value={sourceEngine} onChange={(e) => setSourceEngine(e.target.value as 'local' | 'youtube')} style={{ width: 'auto' }}>
              <option value="local">Locales</option>
              <option value="youtube">YouTube</option>
            </select>
          )}

          <button className="mini-btn" onClick={addRule}>＋ regla</button>
        </div>

        {rules.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {rules.map((r, i) => (
              <span key={i} className="rule-chip">
                {describeRule(r)}
                <button onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))} aria-label="Quitar regla">×</button>
              </span>
            ))}
          </div>
        )}

        <button className="primary" style={{ marginTop: 10 }} onClick={createCrate} disabled={rules.length === 0}>
          Crear crate
        </button>
      </div>

      {/* Lista de crates */}
      <div className="crate-list">
        {crates.length === 0 && (
          <small className="hint" style={{ display: 'block', marginTop: 10 }}>
            Aún no hay crates. Crea uno con las reglas de arriba.
          </small>
        )}
        {crates.map((c, i) => (
          <div key={c.id} className="crate-item">
            <div className="info">
              <div className="name">
                {c.name} <span className="count">· {counts[i]} pistas</span>
              </div>
              <div className="rules">
                {c.rules.map((r, j) => (
                  <span key={j} className="rule-chip small">{describeRule(r)}</span>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="mini-btn" onClick={() => sendCrateToQueue(c.id)} title="Enviar sus pistas locales a la cola del Auto-DJ" disabled={counts[i] === 0}>
                ▶ Auto-DJ
              </button>
              <button className="mini-btn" onClick={() => removeCrate(c.id)} title="Eliminar crate">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
