import type { AudioUnit } from './types';

/**
 * Genera una respuesta al impulso sintética (decaimiento exponencial de ruido)
 * para el ConvolverNode del reverb. Evita tener que descargar un .wav de IR.
 */
function makeImpulseResponse(ctx: BaseAudioContext, seconds = 2.4, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/** Curva de saturación suave (soft-clip) para el WaveShaper del "estilo". */
function makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 60;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * Presets de "Audio Style Transfer" por DSP (sin ML): colorean el máster para
 * emular la estética de un género. Cada preset ajusta un lowpass, shelves de
 * graves/agudos, un pico de presencia, saturación y una ganancia de make-up.
 */
export interface StyleParams {
  lp: number; // corte del pasa-bajos (Hz); 20000 = prácticamente sin filtrar
  lpQ: number;
  low: { freq: number; gain: number }; // low shelf
  peak: { freq: number; gain: number; q: number };
  high: { freq: number; gain: number }; // high shelf
  drive: number; // saturación 0..1 (0 = sin WaveShaper)
  makeup: number; // ganancia de compensación
}

export const AUDIO_STYLES: Array<{ id: string; label: string; desc: string }> = [
  { id: 'off', label: 'Normal', desc: 'Sin coloración' },
  { id: 'lofi', label: 'Lo-Fi', desc: 'Cálido, filtrado y saturado' },
  { id: 'club', label: 'Club', desc: 'Graves + presencia, con pegada' },
  { id: 'ambient', label: 'Ambient', desc: 'Suave, filtrado y distante' },
];

const STYLE_PARAMS: Record<string, StyleParams> = {
  off: { lp: 20000, lpQ: 0.7, low: { freq: 120, gain: 0 }, peak: { freq: 1000, gain: 0, q: 1 }, high: { freq: 9000, gain: 0 }, drive: 0, makeup: 1 },
  lofi: { lp: 3200, lpQ: 0.9, low: { freq: 200, gain: 2 }, peak: { freq: 900, gain: 2, q: 1 }, high: { freq: 8000, gain: -9 }, drive: 0.28, makeup: 0.98 },
  club: { lp: 20000, lpQ: 0.7, low: { freq: 90, gain: 6 }, peak: { freq: 3200, gain: 3, q: 1.2 }, high: { freq: 12000, gain: 2 }, drive: 0.18, makeup: 1.0 },
  ambient: { lp: 6500, lpQ: 0.7, low: { freq: 120, gain: -2 }, peak: { freq: 500, gain: 1, q: 1 }, high: { freq: 9000, gain: -5 }, drive: 0, makeup: 1.05 },
};

/**
 * Unidad de efectos del MÁSTER (efectos "en vivo"):
 *
 *   input ─▶ filter(biquad) ─┬─▶ dryGain ───────────────┐
 *                            ├─▶ reverb ─▶ reverbGain ──┤─▶ output
 *                            └─▶ delay  ─▶ echoGain ────┘
 *                                   ▲        │
 *                                   └ feedback ┘
 *
 *  - filter: barrido pasa-altos/bajos global (knob -1..+1).
 *  - reverb: mezcla wet 0..1.
 *  - echo:   delay con realimentación, mezcla wet 0..1.
 *
 * Todos son "insert" sobre el máster, así que afectan a la mezcla completa
 * (decks locales + sampler). Los efectos NO llegan al audio de YouTube.
 */
export class MasterEffects implements AudioUnit {
  readonly input: BiquadFilterNode;
  readonly output: GainNode;

  private readonly filter: BiquadFilterNode;
  private readonly dry: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbGain: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly echoGain: GainNode;

  // ── Etapa de "estilo" (Audio Style Transfer por DSP) ──────────────────────
  private readonly mix: GainNode;
  private readonly styleLP: BiquadFilterNode;
  private readonly styleLow: BiquadFilterNode;
  private readonly stylePeak: BiquadFilterNode;
  private readonly styleHigh: BiquadFilterNode;
  private readonly styleShaper: WaveShaperNode;
  private readonly styleMakeup: GainNode;
  private _style = 'off';

  constructor(private readonly ctx: BaseAudioContext) {
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'allpass';
    this.filter.frequency.value = 20000;

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulseResponse(ctx);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0;

    this.delay = ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.375; // ~1/8 de nota a 120 BPM
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.35;
    this.echoGain = ctx.createGain();
    this.echoGain.gain.value = 0;

    // Nodos de la etapa de estilo (neutros por defecto).
    this.mix = ctx.createGain();
    this.styleLP = ctx.createBiquadFilter();
    this.styleLP.type = 'lowpass';
    this.styleLP.frequency.value = 20000;
    this.styleLow = ctx.createBiquadFilter();
    this.styleLow.type = 'lowshelf';
    this.stylePeak = ctx.createBiquadFilter();
    this.stylePeak.type = 'peaking';
    this.styleHigh = ctx.createBiquadFilter();
    this.styleHigh.type = 'highshelf';
    this.styleShaper = ctx.createWaveShaper();
    this.styleShaper.curve = null; // identidad (sin saturación)
    this.styleMakeup = ctx.createGain();
    this.styleMakeup.gain.value = 1;

    this.output = ctx.createGain();

    // Ruteo: input → filtro global → (dry / reverb / echo) → mix → estilo → output
    this.input = this.filter;
    this.filter.connect(this.dry).connect(this.mix);
    this.filter.connect(this.reverb).connect(this.reverbGain).connect(this.mix);
    this.filter.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay); // lazo de realimentación
    this.delay.connect(this.echoGain).connect(this.mix);

    // El lowpass va DESPUÉS del shaper para domar también los armónicos que
    // añade la saturación (Lo-Fi/Ambient quedan realmente oscuros).
    this.mix
      .connect(this.styleLow)
      .connect(this.stylePeak)
      .connect(this.styleHigh)
      .connect(this.styleShaper)
      .connect(this.styleLP)
      .connect(this.styleMakeup)
      .connect(this.output);
  }

  /** Aplica un preset de estilo (Audio Style Transfer por DSP). */
  setStyle(id: string): void {
    const p = STYLE_PARAMS[id] ?? STYLE_PARAMS.off;
    this._style = STYLE_PARAMS[id] ? id : 'off';
    const t = this.ctx.currentTime;
    const ramp = (param: AudioParam, value: number) => param.setTargetAtTime(value, t, 0.05);
    ramp(this.styleLP.frequency, p.lp);
    this.styleLP.Q.setTargetAtTime(p.lpQ, t, 0.05);
    ramp(this.styleLow.frequency, p.low.freq);
    ramp(this.styleLow.gain, p.low.gain);
    ramp(this.stylePeak.frequency, p.peak.freq);
    ramp(this.stylePeak.gain, p.peak.gain);
    this.stylePeak.Q.setTargetAtTime(p.peak.q, t, 0.05);
    ramp(this.styleHigh.frequency, p.high.freq);
    ramp(this.styleHigh.gain, p.high.gain);
    ramp(this.styleMakeup.gain, p.makeup);
    this.styleShaper.curve = p.drive > 0 ? makeSaturationCurve(p.drive) : null;
  }

  get style(): string {
    return this._style;
  }

  /** Filtro global: -1 pasa-bajos extremo, 0 neutro, +1 pasa-altos extremo. */
  setFilter(value: number): void {
    const t = this.ctx.currentTime;
    if (Math.abs(value) < 0.02) {
      this.filter.type = 'allpass';
      this.filter.frequency.setTargetAtTime(20000, t, 0.02);
    } else if (value < 0) {
      this.filter.type = 'lowpass';
      this.filter.frequency.setTargetAtTime(20000 * Math.pow(150 / 20000, -value), t, 0.02);
    } else {
      this.filter.type = 'highpass';
      this.filter.frequency.setTargetAtTime(20 * Math.pow(8000 / 20, value), t, 0.02);
    }
  }

  setReverb(wet: number): void {
    this.reverbGain.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), this.ctx.currentTime, 0.03);
  }

  setEcho(wet: number): void {
    this.echoGain.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), this.ctx.currentTime, 0.03);
  }

  /** Ajusta el tiempo de delay del echo (segundos), ej. sincronizado al BPM. */
  setEchoTime(seconds: number): void {
    this.delay.delayTime.setTargetAtTime(Math.max(0.01, seconds), this.ctx.currentTime, 0.02);
  }
}
