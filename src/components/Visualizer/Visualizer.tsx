import { useEffect, useRef } from 'react';
import { useStore } from '../../state/store';

/**
 * Motor de visuales reactivos a pantalla completa. Lee el espectro del máster
 * (AnalyserNode del AudioEngine) y dibuja un espectro radial con un núcleo que
 * late con los graves y partículas que reaccionan a la energía de la mezcla.
 *
 * Se abre como overlay; no interfiere con el audio (solo lee datos).
 */
export function Visualizer({ onClose }: { onClose: () => void }) {
  const engine = useStore((s) => s.engine);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = engine?.analyser;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bins = analyser.frequencyBinCount;
    const freq = new Uint8Array(bins);
    let raf = 0;
    let angle = 0;

    // Partículas que empujan los graves hacia afuera.
    const particles = Array.from({ length: 90 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 60 + Math.random() * 200,
      speed: 0.2 + Math.random() * 0.8,
      size: 1 + Math.random() * 2.5,
    }));

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      analyser.getByteFrequencyData(freq);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;

      // Energía por banda (0..1).
      const band = (from: number, to: number) => {
        let sum = 0;
        for (let i = from; i < to; i++) sum += freq[i];
        return sum / ((to - from) * 255);
      };
      const bass = band(1, Math.floor(bins * 0.06));
      const mids = band(Math.floor(bins * 0.06), Math.floor(bins * 0.25));
      const highs = band(Math.floor(bins * 0.25), Math.floor(bins * 0.6));

      // Estela (motion blur) en vez de limpiar del todo.
      ctx.fillStyle = 'rgba(11, 14, 20, 0.28)';
      ctx.fillRect(0, 0, w, h);

      angle += 0.0015 + bass * 0.02;
      const baseR = Math.min(w, h) * 0.16;

      // Espectro radial.
      const bars = 128;
      ctx.lineWidth = 2;
      for (let i = 0; i < bars; i++) {
        const v = freq[Math.floor((i / bars) * bins * 0.7)] / 255;
        const a = angle + (i / bars) * Math.PI * 2;
        const len = baseR + v * Math.min(w, h) * 0.28;
        const hue = 190 + (i / bars) * 140; // cian → rosa
        ctx.strokeStyle = `hsla(${hue}, 90%, ${45 + v * 30}%, ${0.35 + v * 0.65})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * baseR, cy + Math.sin(a) * baseR);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
        // Espejo para simetría.
        const a2 = angle - (i / bars) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a2) * baseR, cy + Math.sin(a2) * baseR);
        ctx.lineTo(cx + Math.cos(a2) * len, cy + Math.sin(a2) * len);
        ctx.stroke();
      }

      // Núcleo pulsante con los graves.
      const coreR = baseR * (0.55 + bass * 0.9);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      grad.addColorStop(0, `rgba(124, 92, 255, ${0.5 + bass * 0.5})`);
      grad.addColorStop(0.6, `rgba(34, 211, 238, ${0.25 + mids * 0.4})`);
      grad.addColorStop(1, 'rgba(244, 114, 182, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Partículas.
      for (const p of particles) {
        p.r += (bass * 6 - 0.6) * p.speed;
        if (p.r > Math.max(w, h) * 0.6) p.r = baseR;
        if (p.r < baseR) p.r = baseR;
        p.a += 0.002 * p.speed;
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r;
        ctx.fillStyle = `rgba(255,255,255,${0.15 + highs * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [engine]);

  return (
    <div className="visualizer-overlay">
      <canvas ref={canvasRef} className="visualizer-canvas" />
      <button className="visualizer-close" onClick={onClose} title="Cerrar (Esc)">
        ✕ Cerrar visualizador
      </button>
    </div>
  );
}
