import { useStore } from '../../state/store';
import { Fader } from '../ui/Fader';
import { PROGRESSIONS, type SongInstrument } from '../../audio/SongEngine';

const KEYS = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const INSTRUMENTS: Array<{ id: SongInstrument; label: string }> = [
  { id: 'pads', label: 'Pads' },
  { id: 'piano', label: 'Piano' },
  { id: 'pluck', label: 'Pluck' },
  { id: 'synth', label: 'Synth' },
];

/**
 * Estudio de Creación: arma la base de una canción (acordes + bajo + arpegio +
 * batería) eligiendo tono, escala, progresión, instrumento y tempo. Suena y se
 * graba con el resto de la mezcla; y como comparte tono con el Auto-Tune, puedes
 * cantar encima (pestaña Voz/MC) y tu voz queda afinada con la música.
 */
export function CreatorPanel() {
  const song = useStore((s) => s.song);
  const songStep = useStore((s) => s.songStep);
  const songToggle = useStore((s) => s.songToggle);
  const setSongKey = useStore((s) => s.setSongKey);
  const setSongScale = useStore((s) => s.setSongScale);
  const setSongTempo = useStore((s) => s.setSongTempo);
  const setSongProgression = useStore((s) => s.setSongProgression);
  const setSongInstrument = useStore((s) => s.setSongInstrument);
  const toggleSongLayer = useStore((s) => s.toggleSongLayer);
  const setSongVolume = useStore((s) => s.setSongVolume);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🎵 Estudio de Creación</h3>
        <button className={song.playing ? 'active' : 'primary'} onClick={() => void songToggle()}>
          {song.playing ? '■ Detener' : '▶ Crear / Tocar'}
        </button>
      </div>

      {/* Indicador de compás (16 pasos). */}
      <div className="song-steps" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            className={`song-step${songStep === i ? ' on' : ''}${i % 4 === 0 ? ' beat' : ''}`}
          />
        ))}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field mic-field">
          <span>Tono</span>
          <select value={song.key} onChange={(e) => setSongKey(Number(e.target.value))}>
            {KEYS.map((k, i) => (
              <option key={k} value={i}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field mic-field">
          <span>Escala</span>
          <select value={song.scaleMinor ? 'min' : 'maj'} onChange={(e) => setSongScale(e.target.value === 'min')}>
            <option value="maj">Mayor</option>
            <option value="min">Menor</option>
          </select>
        </label>
        <label className="field mic-field" style={{ flex: 1, minWidth: 150 }}>
          <span>Progresión de acordes</span>
          <select value={song.progression} onChange={(e) => setSongProgression(e.target.value)}>
            {PROGRESSIONS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mic-section">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Instrumento</strong>
          <div className="preset-row" style={{ flex: 1, marginLeft: 10 }}>
            {INSTRUMENTS.map((it) => (
              <button
                key={it.id}
                className={`preset-btn${song.instrument === it.id ? ' on' : ''}`}
                onClick={() => setSongInstrument(it.id)}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className={`chip-toggle${song.bass ? ' on' : ''}`} onClick={() => toggleSongLayer('bass')}>
            🎸 Bajo {song.bass ? 'ON' : 'OFF'}
          </button>
          <button className={`chip-toggle${song.arp ? ' on' : ''}`} onClick={() => toggleSongLayer('arp')}>
            ✨ Arpegio {song.arp ? 'ON' : 'OFF'}
          </button>
          <button className={`chip-toggle${song.drums ? ' on' : ''}`} onClick={() => toggleSongLayer('drums')}>
            🥁 Batería {song.drums ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 14, marginTop: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Fader label={`Tempo ${song.tempo} BPM`} value={song.tempo} min={60} max={180} step={1} onChange={setSongTempo} />
        </div>
        <div style={{ flex: 1 }}>
          <Fader label={`Volumen ${Math.round(song.volume * 100)}%`} value={song.volume} min={0} max={1.2} onChange={setSongVolume} />
        </div>
      </div>

      <small className="hint" style={{ display: 'block', marginTop: 10 }}>
        La base suena y se graba con la mezcla. Para cantar encima ve a <strong>Voz/MC</strong>,
        activa el micrófono y el Auto-Tune: tu voz se afina al mismo tono. Graba todo desde
        <strong> Grabar</strong>.
      </small>
    </div>
  );
}
