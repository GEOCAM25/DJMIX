import type { AudioUnit, EqValues } from './types';

/**
 * Ecualizador de 3 bandas (Low / Mid / High) al estilo de una mesa de DJ.
 *
 * Se construye con tres BiquadFilterNode en serie:
 *   - low:  lowshelf  @ 320 Hz
 *   - mid:  peaking    @ 1 kHz (Q ancho)
 *   - high: highshelf @ 3.2 kHz
 *
 * Cada banda permite atenuar hasta "kill" (-26 dB, prácticamente silencio)
 * y realzar hasta +6 dB. La atenuación total simula el "EQ kill" clásico.
 */
export class Eq3 implements AudioUnit {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;
  private readonly low: BiquadFilterNode;
  private readonly mid: BiquadFilterNode;
  private readonly high: BiquadFilterNode;

  constructor(private readonly ctx: BaseAudioContext) {
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 320;

    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.7;

    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 3200;

    // Cadena en serie: low -> mid -> high
    this.low.connect(this.mid);
    this.mid.connect(this.high);

    this.input = this.low;
    this.output = this.high;
  }

  /** Aplica los valores de EQ (en dB) con una pequeña rampa anti-clic. */
  set(values: Partial<EqValues>): void {
    const t = this.ctx.currentTime;
    const ramp = 0.02;
    if (values.low !== undefined) this.low.gain.setTargetAtTime(values.low, t, ramp);
    if (values.mid !== undefined) this.mid.gain.setTargetAtTime(values.mid, t, ramp);
    if (values.high !== undefined) this.high.gain.setTargetAtTime(values.high, t, ramp);
  }

  get values(): EqValues {
    return { low: this.low.gain.value, mid: this.mid.gain.value, high: this.high.gain.value };
  }
}
