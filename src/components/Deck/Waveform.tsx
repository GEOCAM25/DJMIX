import { useEffect, useRef } from 'react';

interface WaveformProps {
  peaks: Float32Array | null;
  position: number;
  duration: number;
  cues: number[];
  color: string;
  onSeek: (seconds: number) => void;
}

/**
 * Dibuja la forma de onda (peaks precalculados), la posición de reproducción
 * y los hot cues. Click sobre el canvas => seek a esa posición.
 */
export function Waveform({ peaks, position, duration, cues, color, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    if (!peaks || peaks.length === 0) {
      ctx.fillStyle = '#1a2233';
      ctx.fillRect(0, mid - 1, w, 2);
      return;
    }

    const progress = duration > 0 ? position / duration : 0;
    const playX = progress * w;

    // Barras de la forma de onda (tocado vs. pendiente).
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * peaks.length);
      const amp = peaks[idx] * (h * 0.46);
      ctx.fillStyle = x <= playX ? color : '#38455f';
      ctx.fillRect(x, mid - amp, 1, amp * 2);
    }

    // Hot cues.
    ctx.fillStyle = '#fbbf24';
    for (const cue of cues) {
      const cx = (cue / duration) * w;
      ctx.fillRect(cx - 1, 0, 2, h);
    }

    // Playhead.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(playX - 1, 0, 2, h);
  }, [peaks, position, duration, cues, color]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * duration);
  };

  return <canvas ref={canvasRef} className="waveform" onClick={handleClick} />;
}
