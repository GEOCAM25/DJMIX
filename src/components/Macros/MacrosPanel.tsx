import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { MACRO_ACTIONS, macroActionLabel, type MacroStep } from '../../macros/macros';

/**
 * Creador de Macros no-code: encadena acciones del estudio con tiempos y las
 * reproduce con un clic (transiciones o "escenas" en vivo). Se guardan en el
 * navegador.
 */
export function MacrosPanel() {
  const macros = useStore((s) => s.macros);
  const runningMacro = useStore((s) => s.runningMacro);
  const addMacro = useStore((s) => s.addMacro);
  const removeMacro = useStore((s) => s.removeMacro);
  const runMacro = useStore((s) => s.runMacro);
  const stopMacro = useStore((s) => s.stopMacro);

  const [name, setName] = useState('');
  const [steps, setSteps] = useState<MacroStep[]>([]);
  const [action, setAction] = useState(MACRO_ACTIONS[0].id);
  const [delayMs, setDelayMs] = useState(500);

  // Acciones agrupadas para el <select>.
  const groups = useMemo(() => {
    const map = new Map<string, typeof MACRO_ACTIONS>();
    for (const a of MACRO_ACTIONS) {
      const arr = map.get(a.group) ?? [];
      arr.push(a);
      map.set(a.group, arr);
    }
    return [...map.entries()];
  }, []);

  const addStep = () => setSteps((prev) => [...prev, { action, delayMs: Math.max(0, delayMs) }]);
  const create = () => {
    addMacro(name, steps);
    setName('');
    setSteps([]);
  };

  return (
    <div className="panel">
      <h3>Macros</h3>
      <small className="hint" style={{ display: 'block', marginBottom: 10 }}>
        Encadena acciones con tiempos y dispáralas con un clic (p. ej. una transición completa).
      </small>

      <div className="crate-builder">
        <input
          type="text"
          placeholder="Nombre de la macro (ej. Drop con eco)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 'auto' }}>
            {groups.map(([group, actions]) => (
              <optgroup key={group} label={group}>
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <label className="row" style={{ gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
            tras
            <input className="num" type="number" min={0} max={10000} step={100} value={delayMs} onChange={(e) => setDelayMs(+e.target.value)} />
            ms
          </label>
          <button className="mini-btn" onClick={addStep}>＋ paso</button>
        </div>

        {steps.length > 0 && (
          <ol className="macro-steps">
            {steps.map((st, i) => (
              <li key={i}>
                <span>{st.delayMs > 0 ? `+${st.delayMs}ms · ` : ''}{macroActionLabel(st.action)}</span>
                <button onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))} aria-label="Quitar paso">×</button>
              </li>
            ))}
          </ol>
        )}

        <button className="primary" style={{ marginTop: 10 }} onClick={create} disabled={steps.length === 0}>
          Guardar macro
        </button>
      </div>

      <div className="crate-list">
        {macros.length === 0 && (
          <small className="hint" style={{ display: 'block', marginTop: 10 }}>
            Aún no hay macros. Crea una encadenando pasos arriba.
          </small>
        )}
        {macros.map((m) => (
          <div key={m.id} className="crate-item">
            <div className="info">
              <div className="name">{m.name} <span className="count">· {m.steps.length} pasos</span></div>
              <div className="rules">
                {m.steps.map((st, j) => (
                  <span key={j} className="rule-chip small">{macroActionLabel(st.action)}</span>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {runningMacro === m.id ? (
                <button className="mini-btn danger" onClick={stopMacro}>■</button>
              ) : (
                <button className="mini-btn" onClick={() => void runMacro(m.id)} title="Reproducir la macro">▶</button>
              )}
              <button className="mini-btn" onClick={() => removeMacro(m.id)} title="Eliminar macro">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
