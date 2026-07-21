import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { getSetting } from '../../storage/settings';

/**
 * Sección de Respaldo (Bring Your Own Cloud): exporta/importa toda la
 * configuración local como JSON y, opcionalmente, la guarda en el Google Drive
 * privado del usuario (sin backend de DJMIX).
 */
export function BackupSection() {
  const downloadBackup = useStore((s) => s.downloadBackup);
  const restoreBackup = useStore((s) => s.restoreBackup);
  const connectGoogleDrive = useStore((s) => s.connectGoogleDrive);
  const backupToDrive = useStore((s) => s.backupToDrive);
  const restoreFromDrive = useStore((s) => s.restoreFromDrive);
  const driveToken = useStore((s) => s.driveToken);
  const driveFiles = useStore((s) => s.driveFiles);

  const [includeAudio, setIncludeAudio] = useState(false);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [clientId, setClientId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getSetting<string>('googleClientId').then((v) => v && setClientId(v));
  }, []);

  const onRestoreFile = (file: File | undefined) => {
    if (file) void restoreBackup(file, mode);
  };

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>Respaldo & Nube</h3>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button className="primary" onClick={() => void downloadBackup(includeAudio)}>
          ⬇ Descargar respaldo (.json)
        </button>
        <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)', gap: 6 }}>
          <input type="checkbox" checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} />
          incluir audio (más pesado)
        </label>
      </div>

      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => fileRef.current?.click()}>⬆ Restaurar desde archivo…</button>
        <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)', gap: 6 }}>
          modo
          <select value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')} style={{ width: 'auto' }}>
            <option value="merge">combinar</option>
            <option value="replace">reemplazar</option>
          </select>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onRestoreFile(e.target.files?.[0])}
        />
      </div>

      <small className="hint" style={{ display: 'block', marginTop: 6 }}>
        El respaldo incluye pistas (con sus cues), mixes, sesiones y ajustes. Todo local; nada
        pasa por un servidor de DJMIX.
      </small>

      {/* Google Drive (BYOC) */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
          Google Drive (tu nube privada — opcional)
        </div>
        <input
          type="text"
          placeholder="Google OAuth Client ID (…apps.googleusercontent.com)"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => void connectGoogleDrive(clientId)} disabled={!clientId}>
            {driveToken ? '✓ Reconectar' : 'Conectar Google Drive'}
          </button>
          <button className="primary" onClick={() => void backupToDrive()} disabled={!driveToken}>
            Guardar en Drive
          </button>
        </div>

        {driveToken && (
          <div className="track-list" style={{ maxHeight: 160 }}>
            {driveFiles.length === 0 && <small className="hint">Aún no hay respaldos en tu Drive.</small>}
            {driveFiles.map((f) => (
              <div key={f.id} className="track-item">
                <div className="info">
                  <div className="name">{f.name}</div>
                  {f.modifiedTime && (
                    <div className="sub">{new Date(f.modifiedTime).toLocaleString()}</div>
                  )}
                </div>
                <button className="mini-btn" onClick={() => void restoreFromDrive(f.id)}>
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}

        <small className="hint" style={{ display: 'block', marginTop: 6 }}>
          Necesitas un Client ID propio de Google Cloud (API de Drive + scope drive.appdata, con
          este origen autorizado). DJMIX no ve tus datos: van a la carpeta privada de tu Drive.
        </small>
      </div>
    </div>
  );
}
