import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { DeckPanel } from './components/Deck/DeckPanel';
import { MixerPanel } from './components/Mixer/MixerPanel';
import { EffectsPanel } from './components/Effects/EffectsPanel';
import { SequencerPanel } from './components/Sequencer/SequencerPanel';
import { LoopStationPanel } from './components/Loops/LoopStationPanel';
import { LightsPanel } from './components/Lights/LightsPanel';
import { MicPanel } from './components/Mic/MicPanel';
import { CreatorPanel } from './components/Creator/CreatorPanel';
import { LibraryPanel } from './components/Library/LibraryPanel';
import { CratesPanel } from './components/Library/CratesPanel';
import { MacrosPanel } from './components/Macros/MacrosPanel';
import { LyricsPanel } from './components/Lyrics/LyricsPanel';
import { RecorderPanel } from './components/Recorder/RecorderPanel';
import { RecIndicator } from './components/Recorder/RecIndicator';
import { CopilotPanel } from './components/Copilot/CopilotPanel';
import { AutoDjPanel } from './components/AutoDj/AutoDjPanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { Visualizer } from './components/Visualizer/Visualizer';
import { OnboardingTour } from './components/Onboarding/OnboardingTour';
import { RotateGate } from './components/Onboarding/RotateGate';
import { useInstallPrompt } from './pwa/pwa';

/** Pestañas del "rack" inferior (todo lo que no es la consola principal). */
const RACK_TABS: Array<{ id: string; label: string }> = [
  { id: 'lib', label: '📚 Biblioteca' },
  { id: 'create', label: '🎵 Crear' },
  { id: 'seq', label: '🥁 Ritmo' },
  { id: 'loop', label: '🔁 Loops' },
  { id: 'auto', label: '🤖 Auto-DJ' },
  { id: 'crates', label: '📦 Crates' },
  { id: 'mic', label: '🎤 Voz/MC' },
  { id: 'lights', label: '💡 Luces' },
  { id: 'rec', label: '🎬 Grabar' },
  { id: 'copilot', label: '🧠 Copiloto' },
  { id: 'macros', label: '⚙️ Macros' },
  { id: 'lyrics', label: '✍️ Letras' },
];

function RackPanel({ id }: { id: string }) {
  switch (id) {
    case 'lib':
      return <LibraryPanel />;
    case 'create':
      return <CreatorPanel />;
    case 'seq':
      return <SequencerPanel />;
    case 'loop':
      return <LoopStationPanel />;
    case 'auto':
      return <AutoDjPanel />;
    case 'crates':
      return <CratesPanel />;
    case 'mic':
      return <MicPanel />;
    case 'lights':
      return <LightsPanel />;
    case 'rec':
      return <RecorderPanel />;
    case 'copilot':
      return <CopilotPanel />;
    case 'macros':
      return <MacrosPanel />;
    case 'lyrics':
      return <LyricsPanel />;
    default:
      return null;
  }
}

/**
 * Layout principal de BEAT DJ — "tablero" de DJ, siempre en horizontal.
 *
 * Estructura tipo consola real:
 *   - CONSOLA (siempre visible): Deck A · Mezclador · Deck B + tira de FX/Sampler.
 *   - RACK (pestañas): biblioteca, ritmo, loops, Auto-DJ, voz, luces, etc.
 *
 * En teléfonos en vertical, la app se rota por CSS para presentarse en
 * horizontal automáticamente (sin mensajes de "gira el teléfono").
 */
export function App() {
  const started = useStore((s) => s.started);
  const init = useStore((s) => s.init);
  const recording = useStore((s) => s.recording);
  const status = useStore((s) => s.status);
  const [showSettings, setShowSettings] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [rackTab, setRackTab] = useState('lib');
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
        <RotateGate />
        <div className="panel card">
          <img src={logoSrc} alt="BEAT DJ" className="overlay-logo" />
          <h1>
            BEAT <span style={{ background: 'linear-gradient(90deg,var(--accent-a),var(--accent-b))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>DJ</span>
          </h1>
          <p style={{ color: 'var(--text-dim)' }}>
            Estudio de DJ y creación musical · 100% gratis, privado y local. Mezcla
            YouTube y tus archivos, <strong>crea canciones</strong>, canta con
            <strong> Auto-Tune</strong>, anima con el micrófono y graba tus sets.
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
              Úsala en horizontal 📱↔️ · Nada se sube a ningún servidor: todo en tu navegador.
            </small>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app board">
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
          <RecIndicator />
          <span className={`dot${recording ? ' rec' : ''}`} />
          <span className="status-msg">{status.message || 'Listo'}</span>
          {canInstall && (
            <button className="mini-btn primary" style={{ marginLeft: 10 }} onClick={() => void install()} title="Instalar app">
              ⬇<span className="btn-label"> Instalar</span>
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

      {/* CONSOLA: decks + mezclador + FX, siempre visible como un controlador. */}
      <div className="console">
        <div className="console-decks">
          <DeckPanel id="A" />
          <MixerPanel />
          <DeckPanel id="B" />
        </div>
        <EffectsPanel />
      </div>

      {/* RACK inferior con pestañas para el resto de módulos. */}
      <div className="rack">
        <div className="rack-tabs">
          {RACK_TABS.map((t) => (
            <button key={t.id} className={rackTab === t.id ? 'on' : ''} onClick={() => setRackTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="rack-body">
          <RackPanel id={rackTab} />
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showVisualizer && <Visualizer onClose={() => setShowVisualizer(false)} />}
      <OnboardingTour />
      <RotateGate />

      <footer className="board-footer">BEAT DJ — Creado por Ricardo Soto</footer>
    </div>
  );
}
