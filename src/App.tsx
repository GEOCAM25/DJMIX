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
import { useInstallPrompt } from './pwa/pwa';

/** Detecta pantallas de teléfono para activar el layout con pestañas. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

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
  const [deckTab, setDeckTab] = useState<'A' | 'mix' | 'B'>('mix');
  const isMobile = useIsMobile();
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
            onClick={() => void init()}
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
          BEAT <span>DJ</span>{' '}
          <span className="tag tag-full">local-first · sin registro</span>
          <span className="tag tag-mini" title="Local-first · privado · sin registro">
            🔒
          </span>
        </div>
        <div className="status-bar">
          <span className={`dot${recording ? ' rec' : ''}`} />
          {recording ? 'Grabando sesión…' : status.message || 'Listo'}
          {canInstall && (
            <button className="mini-btn primary" style={{ marginLeft: 10 }} onClick={() => void install()} title="Instalar app">
              ⬇<span className="btn-label"> Instalar app</span>
            </button>
          )}
          <button className="mini-btn" style={{ marginLeft: 10 }} onClick={() => setShowVisualizer(true)} title="Visualizador">
            ✦<span className="btn-label"> Visualizador</span>
          </button>
          <button className="mini-btn" style={{ marginLeft: 6 }} onClick={() => setShowSettings(true)} title="Ajustes">
            ⚙<span className="btn-label"> Ajustes</span>
          </button>
        </div>
      </div>

      {isMobile ? (
        <>
          {/* Consola por pestañas en teléfono: un panel a ancho completo por vez.
              Los tres se mantienen montados (display) para no romper el reproductor
              de YouTube ni el audio al cambiar de pestaña. */}
          <div className="mtabs">
            <button className={deckTab === 'A' ? 'on' : ''} onClick={() => setDeckTab('A')}>
              Deck A
            </button>
            <button className={deckTab === 'mix' ? 'on' : ''} onClick={() => setDeckTab('mix')}>
              Mezcla
            </button>
            <button className={deckTab === 'B' ? 'on' : ''} onClick={() => setDeckTab('B')}>
              Deck B
            </button>
          </div>
          <div style={{ display: deckTab === 'A' ? 'block' : 'none' }}>
            <DeckPanel id="A" />
          </div>
          <div style={{ display: deckTab === 'mix' ? 'block' : 'none' }}>
            <MixerPanel />
          </div>
          <div style={{ display: deckTab === 'B' ? 'block' : 'none' }}>
            <DeckPanel id="B" />
          </div>

          <EffectsPanel />
          <AutoDjPanel />
          <CopilotPanel />
          <RecorderPanel />
          <LibraryPanel />
        </>
      ) : (
        <>
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
        </>
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showVisualizer && <Visualizer onClose={() => setShowVisualizer(false)} />}

      <footer style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, padding: '8px 0 20px' }}>
        BEAT DJ — Creado por Ricardo Soto
      </footer>
    </div>
  );
}
