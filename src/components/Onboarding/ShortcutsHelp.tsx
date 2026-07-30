import { createPortal } from 'react-dom';
import { SHORTCUTS } from '../../ui/shortcuts';

/**
 * Ayuda de atajos de teclado (se abre con "?" o desde la barra superior).
 * Va con portal a body para superponerse a todo el tablero.
 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="panel card shortcuts-card" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>⌨️ Atajos de teclado</h3>
          <button className="mini-btn" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-grid">
          {SHORTCUTS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h4>{group.title}</h4>
              {group.items.map((it) => (
                <div key={it.keys} className="shortcut-row">
                  <span className="shortcut-keys">
                    {it.keys.split(' · ').map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                  <span className="shortcut-action">{it.action}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <small className="hint" style={{ display: 'block', marginTop: 10 }}>
          Los atajos se desactivan mientras escribes en un campo de texto.
        </small>
      </div>
    </div>,
    document.body,
  );
}
