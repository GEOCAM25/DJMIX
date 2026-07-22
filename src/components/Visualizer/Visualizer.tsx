import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store';

/**
 * Visuales reactivos a pantalla completa. Lee el espectro del máster
 * (AnalyserNode) y dibuja un espectro radial simétrico, un núcleo que late con
 * los graves y partículas. Siempre tiene movimiento (aunque no suene nada) para
 * que nunca se vea "muerto".
 *
 * Se renderiza con portal a <body> para que NO le afecte la rotación del layout
 * en móvil (la app se rota por CSS para forzar horizontal); así ocupa toda la
 * pantalla y se dimensiona bien.
 */
export function Visualizer({ onClose }: { onClose: () => void }) {
  const engine = useStore((s) => s.engine);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const analyser = engine?.analyser ?? null;
    const bins = analyser ? analyser.frequencyBinCount : 1024;
    const freq = new Uint8Array(bins);
    let raf = 0;
    let t = 0;

    const particles = Array.from({ length: 120 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 60 + Math.random() * 220,
      speed: 0.2 + Math.random() * 0.9,
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
      t += 0.016;
      if (analyser) analyser.getByteFrequencyData(freq);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;

      const band = (from: number, to: number) => {
        let sum = 0;
        for (let i = from; i < to; i++) sum += freq[i];
        return sum / ((to - from) * 255);
      };
      const bass = band(1, Math.floor(bins * 0.06));
      const mids = band(Math.floor(bins * 0.06), Math.floor(bins * 0.25));
      const highs = band(Math.floor(bins * 0.25), Math.floor(bins * 0.6));
      const energy = bass + mids + highs;
      // Señal "de reposo" para que siempre haya movimiento aunque no suene nada.
      const idle = Math.max(0, 0.16 - energy);

      // Estela (motion blur).
      ctx.fillStyle = 'rgba(9, 12, 20, 0.26)';
      ctx.fillRect(0, 0, w, h);

      const baseR = Math.min(w, h) * 0.15;
      const angle = t * (0.12 + bass * 1.2);
      const bars = 132;
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      for (let i = 0; i < bars; i++) {
        const raw = analyser ? freq[Math.floor((i / bars) * bins * 0.7)] / 255 : 0;
        const shimmer = idle * (0.5 + 0.5 * Math.sin(t * 2 + i * 0.35));
        const v = Math.min(1, raw + shimmer);
        const a = angle + (i / bars) * Math.PI * 2;
        const len = baseR + v * Math.min(w, h) * 0.3;
        const hue = 190 + (i / bars) * 150; // cian → violeta → rosa
        ctx.strokeStyle = `hsla(${hue}, 92%, ${50 + v * 25}%, ${0.3 + v * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * baseR, cy + Math.sin(a) * baseR);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
        const a2 = angle - (i / bars) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a2) * baseR, cy + Math.sin(a2) * baseR);
        ctx.lineTo(cx + Math.cos(a2) * len, cy + Math.sin(a2) * len);
        ctx.stroke();
      }

      // Núcleo pulsante (siempre respira un poco).
      const pulse = bass + 0.12 + 0.06 * Math.sin(t * 1.6);
      const coreR = baseR * (0.5 + pulse * 0.9);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      grad.addColorStop(0, `rgba(124, 92, 255, ${0.55 + bass * 0.45})`);
      grad.addColorStop(0.55, `rgba(34, 211, 238, ${0.28 + mids * 0.4})`);
      grad.addColorStop(1, 'rgba(244, 114, 182, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Anillo brillante.
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + energy * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.stroke();

      // Partículas.
      for (const p of particles) {
        p.r += (bass * 6 - 0.5 + idle * 1.5) * p.speed;
        if (p.r > Math.max(w, h) * 0.62) p.r = baseR;
        if (p.r < baseR) p.r = baseR;
        p.a += 0.0025 * p.speed;
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r;
        ctx.fillStyle = `rgba(255,255,255,${0.12 + highs * 0.55 + idle * 0.25})`;
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

  return createPortal(
    <div className="visualizer-overlay">
      <canvas ref={canvasRef} className="visualizer-canvas" />
      <button className="visualizer-close" onClick={onClose} title="Cerrar (Esc)">
        ✕ Cerrar
      </button>
    </div>,
    document.body,
  );
}
