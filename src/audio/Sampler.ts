export interface SamplePad {
  id: string;
  label: string;
  buffer: AudioBuffer;
  /** Ganancia individual del pad (0..1). */
  gain: number;
  /** Si true, el pad se repite hasta que se dispara de nuevo o se para. */
  loop: boolean;
}

/**
 * Sampler de pads: dispara samples cortos (baterías, vocales, FX) mezclándolos
 * en el máster. Cada disparo crea su propio AudioBufferSourceNode (polifónico).
 *
 * La salida (output) se conecta al máster junto al crossfader.
 */
export class Sampler {
  readonly output: GainNode;
  private readonly pads = new Map<string, SamplePad>();
  private readonly active = new Map<string, AudioBufferSourceNode>();

  constructor(private readonly ctx: AudioContext) {
    this.output = ctx.createGain();
    this.output.gain.value = 0.9;
  }

  /** Registra o reemplaza un pad. */
  setPad(pad: SamplePad): void {
    this.pads.set(pad.id, pad);
  }

  getPads(): SamplePad[] {
    return [...this.pads.values()];
  }

  /** Dispara un pad. Reinicia el sample si ya sonaba. */
  trigger(id: string): void {
    const pad = this.pads.get(id);
    if (!pad) return;
    this.stop(id);

    const src = this.ctx.createBufferSource();
    src.buffer = pad.buffer;
    src.loop = pad.loop;

    const gain = this.ctx.createGain();
    gain.gain.value = pad.gain;

    src.connect(gain).connect(this.output);
    src.onended = () => {
      if (this.active.get(id) === src) this.active.delete(id);
      gain.disconnect();
    };
    src.start();
    this.active.set(id, src);
  }

  /** Detiene un pad en reproducción (útil para loops). */
  stop(id: string): void {
    const src = this.active.get(id);
    if (src) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* noop */
      }
      src.disconnect();
      this.active.delete(id);
    }
  }

  stopAll(): void {
    for (const id of [...this.active.keys()]) this.stop(id);
  }

  setMasterGain(value: number): void {
    this.output.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }
}
