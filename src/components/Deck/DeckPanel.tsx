import type { CSSProperties } from 'react';
import { useStore } from '../../state/store';
import type { DeckId } from '../../audio/types';
import { Fader } from '../ui/Fader';
import { Waveform } from './Waveform';
import { JogWheel } from './JogWheel';
import { haptic } from '../../util/haptics';

interface DeckPanelProps {
  id: DeckId;
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Panel de un Deck (A o B): forma de onda, transporte (Play/Cue/Sync),
 * fader de pitch/tempo y contenedor del reproductor de YouTube.
 *
 * Importante: el <div id="yt-deck-A/B"> SIEMPRE está en el DOM (aunque oculto)
 * porque la IFrame API de YouTube necesita el elemento para montar el iframe.
 */
export function DeckPanel({ id }: DeckPanelProps) {
  const deck = useStore((s) => s.decks[id]);
  const togglePlay = useStore((s) => s.togglePlay);
  const cue = useStore((s) => s.cue);
  const cueMonitor = useStore((s) => s.cueMonitor[id]);
  const toggleCueMonitor = useStore((s) => s.toggleCueMonitor);
  const setTempo = useStore((s) => s.setTempo);
  const seek = useStore((s) => s.seek);
  const addCue = useStore((s) => s.addCue);
  const jumpToCue = useStore((s) => s.jumpToCue);
  const syncToOther = useStore((s) => s.syncToOther);
  const toggleKeyLock = useStore((s) => s.toggleKeyLock);

  const color = id === 'A' ? 'var(--accent-a)' : 'var(--accent-b)';
  const isYoutube = deck.engine === 'youtube';
  const effectiveBpm = deck.bpm ? (deck.bpm * (1 + deck.tempo / 100)).toFixed(1) : '—';

  // Pulso al ritmo del BPM: duración de un beat mientras la pista suena.
  const beatSec = deck.bpm && deck.playing ? 60 / (deck.bpm * (1 + deck.tempo / 100)) : 0;
  const pulseClass = beatSec ? ' pulsing' : '';
  const pulseStyle = beatSec ? ({ ['--beat']: `${beatSec.toFixed(3)}s` } as CSSProperties) : undefined;

  return (
    <div className={`panel deck deck-${id}`}>
      <div className="deck-head">
        <div className="deck-title" style={{ color }}>
          {id} · {deck.title}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={`cue-btn${cueMonitor ? ' active' : ''}`}
            onClick={() => toggleCueMonitor(id)}
            disabled={isYoutube}
            aria-pressed={cueMonitor}
            title={
              isYoutube
                ? 'Pre-escucha no disponible en YouTube (audio cross-origin)'
                : 'Pre-escucha por audífonos (PFL) — independiente del crossfader'
            }
          >
            🎧
          </button>
          <div className="chip">{isYoutube ? 'YouTube' : 'Local'}</div>
        </div>
      </div>

      <div className="deck-meta">
        <span className="chip">BPM {effectiveBpm}</span>
        <span className="chip">Tono {deck.camelotKey ?? '—'}</span>
        <span className="chip">Pitch {deck.tempo >= 0 ? '+' : ''}{deck.tempo.toFixed(1)}%</span>
        {deck.ducking && (
          <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
            SC ⬇ bass
          </span>
        )}
      </div>

      {/* Reproductor de YouTube (oculto si el deck es local) */}
      <div className={`yt-frame${isYoutube ? '' : ' hidden'}`}>
        <div id={`yt-deck-${id}`} />
      </div>

      {!isYoutube && (
        <Waveform
          peaks={deck.peaks}
          position={deck.position}
          duration={deck.duration}
          cues={deck.cues}
          color={color}
          bands={deck.waveBands}
          onSeek={(sec) => seek(id, sec)}
        />
      )}

      <div className="time">
        {formatTime(deck.position)} / {formatTime(deck.duration)}
      </div>

      <div className="transport">
        <button onClick={() => { haptic(); cue(id); }} title="Cue">
          ◆ Cue
        </button>
        <button
          className={(deck.playing ? 'active' : 'primary') + pulseClass}
          style={pulseStyle}
          onClick={() => { haptic(); togglePlay(id); }}
        >
          {deck.playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button onClick={() => { haptic(); syncToOther(id); }} disabled={!deck.bpm} title="Igualar BPM al otro deck">
          ⟲ Sync
        </button>
      </div>

      {!isYoutube && (
        <div className="transport">
          <button className="mini-btn" onClick={() => { haptic(); addCue(id); }}>
            + Hot Cue
          </button>
          {deck.cues.slice(0, 4).map((_, i) => (
            <button
              key={i}
              className={`mini-btn${pulseClass}`}
              style={pulseStyle}
              onClick={() => { haptic(); jumpToCue(id, i); }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {!isYoutube && (
        <div className="deck-jog-row">
          <JogWheel id={id} />
          <div className="deck-tempo">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Tempo {deck.tempo >= 0 ? '+' : ''}{deck.tempo.toFixed(1)}%
              </span>
              <button
                className={`mini-btn${deck.keyLock ? ' active' : ''}`}
                onClick={() => { haptic(); void toggleKeyLock(id); }}
                title="Key Lock: cambia el tempo sin alterar el tono"
              >
                {deck.keyLock ? '🔒 Key' : 'Key Lock'}
              </button>
            </div>
            <Fader
              label=""
              value={deck.tempo}
              min={-8}
              max={8}
              step={0.1}
              onChange={(v) => setTempo(id, v)}
            />
          </div>
        </div>
      )}

      {isYoutube && (
        <div style={{ marginTop: 12 }}>
          <Fader
            label={`Tempo ${deck.tempo >= 0 ? '+' : ''}${deck.tempo.toFixed(1)}%`}
            value={deck.tempo}
            min={-8}
            max={8}
            step={0.1}
            onChange={(v) => setTempo(id, v)}
          />
        </div>
      )}
    </div>
  );
}
