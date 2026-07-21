import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { getStorageEstimate } from '../../storage/db';

/**
 * Ajustes: claves API (opcionales) y uso de almacenamiento local.
 * Las claves se guardan SOLO en el navegador del usuario (IndexedDB).
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const saveApiKeys = useStore((s) => s.saveApiKeys);
  const [ytKey, setYtKey] = useState(settings.youtubeApiKey);
  const [aiKey, setAiKey] = useState(settings.aiApiKey);
  const [usage, setUsage] = useState({ usage: 0, quota: 0 });

  useEffect(() => {
    void getStorageEstimate().then(setUsage);
  }, []);

  const save = async () => {
    await saveApiKeys(ytKey, aiKey);
    onClose();
  };

  const usedMb = (usage.usage / 1_048_576).toFixed(1);
  const quotaMb = (usage.quota / 1_048_576).toFixed(0);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel card" style={{ textAlign: 'left', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h3>Ajustes</h3>

        <label className="field">
          <span>YouTube Data API Key (opcional — habilita el buscador)</span>
          <input type="password" value={ytKey} onChange={(e) => setYtKey(e.target.value)} placeholder="AIza…" />
        </label>

        <label className="field">
          <span>Clave de IA (opcional — copiloto en lenguaje natural)</span>
          <input type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder="sk-…" />
        </label>

        <small className="hint">
          Sin claves, la app funciona igual: carga por URL de YouTube y copiloto con heurísticas
          locales (BPM, tonalidad, Camelot). Las claves nunca salen de tu dispositivo.
        </small>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Almacenamiento local usado: {usedMb} MB {usage.quota ? `de ~${quotaMb} MB` : ''}
          </div>
          {usage.quota > 0 && (
            <div className="meter" style={{ marginTop: 4 }}>
              <i style={{ width: `${Math.min(100, (usage.usage / usage.quota) * 100)}%` }} />
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
