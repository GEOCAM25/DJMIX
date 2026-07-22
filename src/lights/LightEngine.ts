/**
 * Motor de luces reactivas: traduce el espectro del máster a un color y un brillo
 * para las "luces" (preview en pantalla y, opcionalmente, una bombilla BLE).
 *
 *   graves  → rojo      (energía del kick)
 *   medios  → verde
 *   agudos  → azul
 *   brillo  → energía global, con "flash" en cada golpe de graves.
 *
 * Es sin estado salvo el suavizado del flash; se muestrea por fotograma (como el
 * vúmetro), sin bucle propio.
 */
export interface LightSample {
  r: number; // 0..255 (tono a brillo pleno)
  g: number;
  b: number;
  brightness: number; // 0..1
}

export class LightEngine {
  private prevBass = 0;
  private flash = 0;

  constructor(private readonly analyser: AnalyserNode) {}

  /** Calcula el color/brillo actual a partir del espectro del máster. */
  sample(): LightSample {
    const freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(freq);

    // Pico por banda (no promedio): así el componente más fuerte de cada banda
    // define su color, sin que las bandas anchas (agudos) queden diluidas.
    const peak = (from: number, to: number): number => {
      let m = 0;
      const a = Math.max(0, from);
      const b = Math.min(freq.length, to);
      for (let i = a; i < b; i++) if (freq[i] > m) m = freq[i];
      return m / 255;
    };

    // Bandas aproximadas (a 44.1 kHz, ~21.5 Hz por bin).
    const bass = peak(1, 9); // ~20–190 Hz
    const mid = peak(9, 93); // ~190–2000 Hz
    const high = peak(93, 372); // ~2–8 kHz

    // Color por dominancia de banda (saturado: la banda más fuerte a tope).
    const max = Math.max(bass, mid, high) || 1e-6;
    const r = bass / max;
    const g = mid / max;
    const b = high / max;

    // Flash en cada golpe de graves (kick).
    if (bass > this.prevBass * 1.4 && bass > 0.28) this.flash = 1;
    this.flash *= 0.82;
    this.prevBass = bass;

    const energyBrightness = Math.min(1, max * 1.1);
    const brightness = Math.max(energyBrightness, this.flash);

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
      brightness,
    };
  }
}
