import { useEffect, useRef } from 'react';

interface VuMeterProps {
  /** Devuelve el nivel actual 0..1. Debe ser estable (useCallback). */
  getLevel: () => number;
  /** Alto del medidor en px. */
  height?: number;
  /** Nº de segmentos LED. */
  segments?: number;
}

/**
 * Vúmetro LED vertical dibujado en canvas con su propio bucle de animación
 * (no re-renderiza React). Verde abajo, amarillo en el medio y rojo arriba.
 * Ataque rápido y caída lenta, como un medidor real.
 */
export function VuMeter({ getLevel, height = 130, segments = 14 }: VuMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let smooth = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const level = Math.max(0, Math.min(1, getLevel()));
      // Ataque rápido, caída lenta.
      smooth = level > smooth ? level : smooth * 0.86 + level * 0.14;
      const lit = Math.round(smooth * segments);

      const gap = 2;
      const segH = (h - gap * (segments - 1)) / segments;
      for (let i = 0; i < segments; i++) {
        const frac = i / segments; // 0 = abajo, 1 = arriba
        const on = i < lit;
        let color: string;
        if (frac > 0.85) color = on ? '#f87171' : '#3a1a1f';
        else if (frac > 0.6) color = on ? '#fbbf24' : '#3a2f1a';
        else color = on ? '#34d399' : '#153026';
        ctx.fillStyle = color;
        const y = (segments - 1 - i) * (segH + gap);
        ctx.fillRect(0, y, w, segH);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getLevel, segments]);

  return <canvas ref={canvasRef} className="vumeter" style={{ height }} aria-hidden="true" />;
}
