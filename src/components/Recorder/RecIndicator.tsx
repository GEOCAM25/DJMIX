import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';

function fmt(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/**
 * Indicador GLOBAL de grabación, siempre visible en la barra superior mientras
 * se graba (audio del máster o vídeo de la sesión). Muestra un cronómetro en
 * vivo y un botón DETENER a mano, para que nunca haya que buscar cómo parar.
 */
export function RecIndicator() {
  const recording = useStore((s) => s.recording);
  const videoRecording = useStore((s) => s.videoRecording);
  const stopRecording = useStore((s) => s.stopRecording);
  const stopVideoExport = useStore((s) => s.stopVideoExport);
  const active = recording || videoRecording;

  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    startedAt.current = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed((performance.now() - startedAt.current) / 1000);
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const label = recording && videoRecording ? 'REC · audio + vídeo' : videoRecording ? 'REC · vídeo' : 'REC';

  const stopAll = () => {
    if (recording) void stopRecording('');
    if (videoRecording) void stopVideoExport();
  };

  return (
    <div className="rec-indicator" role="status" aria-live="polite">
      <span className="rec-dot" />
      <span className="rec-label">{label}</span>
      <span className="rec-time">{fmt(elapsed)}</span>
      <button className="rec-stop" onClick={stopAll} title="Detener grabación">
        ■ Detener
      </button>
    </div>
  );
}
