import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { DeckPanel } from './components/Deck/DeckPanel';
import { MixerPanel } from './components/Mixer/MixerPanel';
import { EffectsPanel } from './components/Effects/EffectsPanel';
import { LibraryPanel } from './components/Library/LibraryPanel';
import { RecorderPanel } from './components/Recorder/RecorderPanel';
import { CopilotPanel } from './components/Copilot/CopilotPanel';
import { AutoDjPanel } from './components/AutoDj/AutoDjPanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { Visualizer } from './components/Visualizer/Visualizer';
import { useInstallPrompt, lockLandscape } from './pwa/pwa';

/**
 * Layout principal del estudio DJMIX.
 *
 * El overlay de inicio cumple dos funciones:
 *  1. Cumplir la política de autoplay: el AudioContext solo arranca tras un
 *     gesto del usuario (el botón "Entrar al estudio").
 *  2. Inicializar el motor de audio, IndexedDB y el proveedor de IA.
 */
export function App() {
  const started = useStore((s) => s.started);
  const init = useStore((s) => s.init);
  const recording = useStore((s) => s.recording);
  const status = useStore((s) => s.status);
  const [showSettings, setShowSettings] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const { available: canInstall, install } = useInstallPrompt();

  // Cerrar el visualizador con Esc.
  useEffect(() => {
    if (!showVisualizer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowVisualizer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showVisualizer]);

  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

  if (!started) {
    return (
      <div className="overlay">
        <div className="panel card">
          <img src={logoSrc} alt="BEAT DJ" className="overlay-logo" />
          <h1>
            BEAT <span style={{ background: 'linear-gradient(90deg,var(--accent-a),var(--accent-b))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>DJ</span>
          </h1>
          <p style={{ color: 'var(--text-dim)' }}>
            Estudio de mezcla DJ · 100% gratis, privado y local. Mezcla YouTube y tus
            archivos, graba tus sets y deja que el copiloto de IA te asista.
          </p>
          <button
            className="primary"
            style={{ fontSize: 16, padding: '12px 22px', marginTop: 8 }}
            onClick={() => {
              void lockLandscape();
              void init();
            }}
          >
            ▶ Entrar al estudio
          </button>
          <p style={{ marginTop: 14 }}>
            <small className="hint">
              Nada se sube a ningún servidor. Todo se procesa y guarda en tu navegador.
            </small>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <img src={logoSrc} alt="" className="brand-logo" />
          BEAT <span>DJ</span> <span className="tag">local-first · sin registro</span>
        </div>
        <div className="status-bar">
          <span className={`dot${recording ? ' rec' : ''}`} />
          {recording ? 'Grabando sesión…' : status.message || 'Listo'}
          {canInstall && (
            <button className="mini-btn primary" style={{ marginLeft: 10 }} onClick={() => void install()}>
              ⬇ Instalar app
            </button>
          )}
          <button className="mini-btn" style={{ marginLeft: 10 }} onClick={() => setShowVisualizer(true)}>
            ✦ Visualizador
          </button>
          <button className="mini-btn" style={{ marginLeft: 6 }} onClick={() => setShowSettings(true)}>
            ⚙ Ajustes
          </button>
        </div>
      </div>

      <div className="decks-row main-decks">
        <DeckPanel id="A" />
        <MixerPanel />
        <DeckPanel id="B" />
      </div>

      <div className="row-2col">
        <EffectsPanel />
        <CopilotPanel />
      </div>

      <div className="row-2col">
        <AutoDjPanel />
        <RecorderPanel />
      </div>

      <LibraryPanel />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showVisualizer && <Visualizer onClose={() => setShowVisualizer(false)} />}

      <footer style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, padding: '8px 0 20px' }}>
        BEAT DJ · Web Audio API · FFmpeg.wasm · IndexedDB — hecho para mezclar libremente.
      </footer>
    </div>
  );
}
