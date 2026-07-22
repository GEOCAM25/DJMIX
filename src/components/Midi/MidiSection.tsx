import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { MIDI_TARGETS, describeControl, type MidiTarget } from '../../midi/mappings';

/**
 * Sección MIDI (Web MIDI API): activa el acceso, muestra los controladores
 * conectados y permite mapear cada control físico a una acción con "MIDI Learn".
 *
 * Para aprender: pulsa "Aprender" junto a una acción y luego mueve la perilla /
 * pulsa el botón del controlador. El mapeo se guarda en el navegador.
 */
export function MidiSection() {
  const midi = useStore((s) => s.midi);
  const initMidi = useStore((s) => s.initMidi);
  const startMidiLearn = useStore((s) => s.startMidiLearn);
  const cancelMidiLearn = useStore((s) => s.cancelMidiLearn);
  const clearMidiMapping = useStore((s) => s.clearMidiMapping);

  // Invierte el diccionario (controlKey→target) a (target→controlKey) para pintar.
  const byTarget = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, target] of Object.entries(midi.mappings)) out[target] = key;
    return out;
  }, [midi.mappings]);

  // Agrupa los destinos por sección para la lista.
  const groups = useMemo(() => {
    const map = new Map<string, MidiTarget[]>();
    for (const t of MIDI_TARGETS) {
      const arr = map.get(t.group) ?? [];
      arr.push(t);
      map.set(t.group, arr);
    }
    return [...map.entries()];
  }, []);

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>Controlador MIDI</h3>

      {!midi.supported ? (
        <small className="hint">
          Tu navegador no soporta Web MIDI. Usa Chrome o Edge de escritorio para conectar
          un controlador DJ/MIDI por USB.
        </small>
      ) : !midi.enabled ? (
        <>
          <button className="primary" onClick={() => void initMidi()}>
            🎛 Activar MIDI
          </button>
          <small className="hint" style={{ display: 'block', marginTop: 6 }}>
            Conecta tu controlador por USB y pulsa activar. El navegador pedirá permiso una vez.
          </small>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
            {midi.inputs.length
              ? `Conectado: ${midi.inputs.join(', ')}`
              : 'MIDI activo — conecta un controlador por USB.'}
          </div>
          {midi.learning && (
            <div
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elev)', padding: '6px 10px', borderRadius: 8, marginBottom: 8 }}
            >
              <span style={{ fontSize: 12, color: 'var(--accent-a)' }}>
                Aprendiendo… mueve un control del controlador.
              </span>
              <button className="mini-btn" onClick={cancelMidiLearn}>
                Cancelar
              </button>
            </div>
          )}

          {groups.map(([group, targets]) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-dim)', margin: '6px 0 4px' }}>
                {group}
              </div>
              {targets.map((t) => {
                const mapped = byTarget[t.id];
                const learning = midi.learning === t.id;
                return (
                  <div
                    key={t.id}
                    className="row"
                    style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '3px 0' }}
                  >
                    <span style={{ fontSize: 13 }}>{t.label}</span>
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: mapped ? 'var(--good)' : 'var(--text-dim)', minWidth: 96, textAlign: 'right' }}>
                        {mapped ? describeControl(mapped) : 'sin asignar'}
                      </span>
                      <button
                        className={`mini-btn${learning ? ' active' : ''}`}
                        onClick={() => (learning ? cancelMidiLearn() : startMidiLearn(t.id))}
                      >
                        {learning ? 'Esperando…' : 'Aprender'}
                      </button>
                      {mapped && (
                        <button className="mini-btn" title="Quitar asignación" onClick={() => clearMidiMapping(t.id)}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <small className="hint" style={{ display: 'block', marginTop: 4 }}>
            Los faders/perillas se mapean como rango (0–100%); Play/Cue/Sync como botón. Las
            asignaciones se guardan en tu navegador.
          </small>
        </>
      )}
    </div>
  );
}
