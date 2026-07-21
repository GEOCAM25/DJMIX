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

    this.output = ctx.createGain();

    // Ruteo
    this.input = this.filter;
    this.filter.connect(this.dry).connect(this.output);

    this.filter.connect(this.reverb).connect(this.reverbGain).connect(this.output);

    this.filter.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay); // lazo de realimentación
    this.delay.connect(this.echoGain).connect(this.output);
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
