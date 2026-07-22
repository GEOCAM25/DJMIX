/**
 * Secuenciador de pasos (drum machine de 16 pasos) con scheduling de "dos
 * relojes": un temporizador (setInterval) que mira ~100 ms hacia delante y
 * agenda los disparos en tiempos EXACTOS del AudioContext (src.start(time)).
 * Así el ritmo es preciso aunque el hilo principal se congestione.
 *
 * Es independiente del Sampler/Auto-Slicer: siempre toca su propio kit de
 * batería sintética, así que "cortar una pista en pads" no afecta al ritmo.
 */
export interface SeqRow {
  label: string;
  /** Índice del sonido dentro del kit (setKit). */
  bufferIndex: number;
  /** Estado de los 16 pasos (on/off). */
  steps: boolean[];
}

export function emptySteps(count = 16): boolean[] {
  return new Array(count).fill(false);
}

export class StepSequencer {
  readonly output: GainNode;
  private readonly ctx: AudioContext;
  private kit: AudioBuffer[] = [];
  private rows: SeqRow[] = [];

  private readonly stepCount = 16;
  private bpm = 120;
  private swing = 0; // 0..0.6 (retrasa los pasos impares para dar "groove")
  private accent = 0.85; // ganancia base de cada golpe

  private playing = false;
  private currentStep = 0;
  private nextNoteTime = 0;
  private readonly lookaheadMs = 25;
  private readonly scheduleAhead = 0.1; // s
  private timer: number | null = null;
  private onStep: ((step: number) => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.9;
  }

  /** Carga el kit de sonidos (AudioBuffers) que referencian las filas. */
  setKit(buffers: AudioBuffer[]): void {
    this.kit = buffers;
  }

  setRows(rows: SeqRow[]): void {
    this.rows = rows;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(220, bpm));
  }

  setSwing(swing: number): void {
    this.swing = Math.max(0, Math.min(0.6, swing));
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Duración de un paso (semicorchea = 1/4 de negra). */
  private secondsPerStep(): number {
    return 60 / this.bpm / 4;
  }

  start(onStep?: (step: number) => void): void {
    if (this.playing) return;
    this.onStep = onStep ?? null;
    this.playing = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.scheduler(), this.lookaheadMs);
  }

  stop(): void {
    this.playing = false;
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.currentStep = 0;
  }

  /** Agenda todos los pasos que caigan dentro de la ventana de anticipación. */
  private scheduler(): void {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advance();
    }
  }

  private advance(): void {
    this.nextNoteTime += this.secondsPerStep();
    this.currentStep = (this.currentStep + 1) % this.stepCount;
  }

  private scheduleStep(step: number, time: number): void {
    // Swing: retrasa los pasos impares una fracción del paso (sin desviar la
    // rejilla base, así el ritmo no acumula error).
    const swingOffset = step % 2 === 1 ? this.swing * this.secondsPerStep() : 0;
    const playTime = time + swingOffset;

    for (const row of this.rows) {
      if (!row.steps[step]) continue;
      const buffer = this.kit[row.bufferIndex];
      if (!buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      // Acento en los tiempos fuertes (paso 0, 4, 8, 12).
      gain.gain.value = this.accent * (step % 4 === 0 ? 1 : 0.82);
      src.connect(gain).connect(this.output);
      src.start(playTime);
      src.onended = () => gain.disconnect();
    }

    // Aviso a la UI para iluminar la columna activa, alineado al tiempo de audio.
    if (this.onStep) {
      const uiDelayMs = (playTime - this.ctx.currentTime) * 1000;
      const cb = this.onStep;
      window.setTimeout(() => cb(step), Math.max(0, uiDelayMs));
    }
  }

  setLevel(v: number): void {
    this.output.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.02);
  }
}
