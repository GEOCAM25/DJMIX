import { Eq3 } from './Eq3';
import type { AudioUnit, EqValues } from './types';

export interface DeckCallbacks {
  onEnded?: () => void;
  onLoad?: (duration: number) => void;
}

/**
 * Deck de audio LOCAL basado en AudioBufferSourceNode.
 *
 * Estructura de la cadena de un deck:
 *
 *   AudioBufferSourceNode ─▶ Eq3 (low/mid/high) ─▶ filterFx ─▶ output(Gain)
 *                                                                   │
 *                                                            (lo conecta el Mixer
 *                                                             a su canal/crossfader)
 *
 * Un AudioBufferSourceNode solo puede reproducirse UNA vez, así que en cada
 * play() se crea uno nuevo y se calcula la posición con relojes del contexto.
 *
 * El "tempo" se implementa como varispeed (playbackRate), igual que un
 * plato de vinilo: al subir el tempo, sube también el tono. Para desacoplar
 * tono y tempo (time-stretch real) se necesitaría un phase-vocoder/SoundTouch;
 * ver README > "Mejoras futuras".
 */
export class Deck implements AudioUnit {
  readonly input: AudioNode; // no se usa como entrada externa, pero cumple AudioUnit
  readonly output: GainNode;
  readonly eq: Eq3;

  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private readonly filter: BiquadFilterNode;

  private _playing = false;
  private _tempo = 0; // porcentaje -50..+50
  private startedAt = 0; // ctx.currentTime del último play
  private offsetAtStart = 0; // posición dentro del buffer al arrancar
  private mainCue = 0; // punto de cue principal (segundos)

  constructor(
    private readonly ctx: AudioContext,
    private readonly cb: DeckCallbacks = {},
  ) {
    this.eq = new Eq3(ctx);

    // Filtro pasa-alto/bajo por deck (el clásico "filter" de canal).
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'allpass'; // neutro por defecto
    this.filter.frequency.value = 20000;

    this.output = ctx.createGain();

    // Cadena: eq -> filter -> output
    this.eq.output.connect(this.filter);
    this.filter.connect(this.output);
    this.input = this.eq.input;
  }

  // ── Carga ──────────────────────────────────────────────────────────────
  load(buffer: AudioBuffer): void {
    this.stopSource();
    this.buffer = buffer;
    this.offsetAtStart = 0;
    this._playing = false;
    this.mainCue = 0;
    this.cb.onLoad?.(buffer.duration);
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** Buffer de audio actualmente cargado (para exportación de stems). */
  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  get playing(): boolean {
    return this._playing;
  }

  // ── Transporte ───────────────────────────────────────────────────────────
  play(): void {
    if (!this.buffer || this._playing) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.tempoRate;
    src.connect(this.eq.input);
    src.onended = () => {
      // Solo notificar si terminó de forma natural (no por un stop manual).
      if (this.source === src && this._playing) {
        this._playing = false;
        this.cb.onEnded?.();
      }
    };
    const startOffset = Math.min(this.offsetAtStart, this.buffer.duration);
    src.start(0, startOffset);
    this.source = src;
    this.startedAt = this.ctx.currentTime;
    this._playing = true;
  }

  pause(): void {
    if (!this._playing) return;
    this.offsetAtStart = this.position;
    this.stopSource();
    this._playing = false;
  }

  togglePlay(): void {
    this._playing ? this.pause() : this.play();
  }

  /** Salta a una posición absoluta (segundos) manteniendo el estado play/pausa. */
  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration));
    const wasPlaying = this._playing;
    if (wasPlaying) this.stopSource();
    this.offsetAtStart = clamped;
    this._playing = false;
    if (wasPlaying) this.play();
  }

  // ── Cue ──────────────────────────────────────────────────────────────────
  /** Guarda el punto de cue principal en la posición actual. */
  setCue(): number {
    this.mainCue = this.position;
    return this.mainCue;
  }

  /** Comportamiento CUE de mesa: si suena, vuelve al cue y pausa. */
  cue(): void {
    if (this._playing) {
      this.seek(this.mainCue);
      this.pause();
    } else {
      // En pausa: si estamos sobre el cue, hacemos "preview"; si no, fijamos cue.
      if (Math.abs(this.position - this.mainCue) < 0.05) {
        this.play();
      } else {
        this.setCue();
        this.seek(this.mainCue);
      }
    }
  }

  get cuePoint(): number {
    return this.mainCue;
  }

  // ── Tempo / Pitch ─────────────────────────────────────────────────────────
  /** Ajusta el tempo en porcentaje (-50..+50). Afecta al tono (varispeed). */
  setTempo(percent: number): void {
    this._tempo = Math.max(-50, Math.min(50, percent));
    if (this.source) {
      // Recalcular offset para no dar un salto al cambiar la velocidad.
      const pos = this.position;
      this.offsetAtStart = pos;
      this.startedAt = this.ctx.currentTime;
      this.source.playbackRate.setTargetAtTime(this.tempoRate, this.ctx.currentTime, 0.03);
    }
  }

  get tempo(): number {
    return this._tempo;
  }

  private get tempoRate(): number {
    return 1 + this._tempo / 100;
  }

  /** BPM efectivo dado un BPM original y el tempo actual. */
  effectiveBpm(originalBpm: number): number {
    return originalBpm * this.tempoRate;
  }

  // ── Filtro por canal ──────────────────────────────────────────────────────
  /**
   * Filtro combinado: valor -1..0 -> pasa-bajos, 0 neutro, 0..+1 -> pasa-altos.
   * Es el knob de "filter" central de muchas mesas de DJ.
   */
  setFilter(value: number): void {
    const t = this.ctx.currentTime;
    if (Math.abs(value) < 0.02) {
      this.filter.type = 'allpass';
      this.filter.frequency.setTargetAtTime(20000, t, 0.02);
      return;
    }
    if (value < 0) {
      this.filter.type = 'lowpass';
      // Mapeo exponencial de 200 Hz .. 20 kHz
      const freq = 20000 * Math.pow(200 / 20000, -value);
      this.filter.frequency.setTargetAtTime(freq, t, 0.02);
    } else {
      this.filter.type = 'highpass';
      const freq = 20 * Math.pow(6000 / 20, value);
      this.filter.frequency.setTargetAtTime(freq, t, 0.02);
    }
  }

  setEq(values: Partial<EqValues>): void {
    this.eq.set(values);
  }

  // ── Estado de reproducción ────────────────────────────────────────────────
  get position(): number {
    if (!this.buffer) return 0;
    if (!this._playing) return this.offsetAtStart;
    const elapsed = (this.ctx.currentTime - this.startedAt) * this.tempoRate;
    return Math.min(this.offsetAtStart + elapsed, this.buffer.duration);
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        /* ya detenido */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  dispose(): void {
    this.stopSource();
    this.output.disconnect();
    this.filter.disconnect();
  }
}
