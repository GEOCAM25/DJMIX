import { Deck } from './Deck';
import { YouTubeDeck } from './YouTubeDeck';
import { MasterEffects } from './Effects';
import { Sampler } from './Sampler';
import { Recorder } from './Recorder';
import { CueBus, listAudioOutputs, promptSelectOutput, type AudioOutputDevice } from './CueBus';
import type { DeckId, EngineType, EqValues } from './types';

interface Channel {
  deck: Deck;
  yt: YouTubeDeck;
  engine: EngineType;
  /** Nodo de ganancia del deck LOCAL (fader de línea × crossfader). */
  gain: GainNode;
  /** Fader de línea del canal (0..1). */
  fader: number;
  /** Envío de pre-escucha (PFL) hacia el bus de audífonos. */
  cueGain: GainNode;
  /** ¿Este deck está en pre-escucha? */
  cueOn: boolean;
}

/**
 * Motor central de audio. Construye y posee todo el grafo de Web Audio:
 *
 *   Deck A (local) ─▶ gainA ─┐
 *   Deck B (local) ─▶ gainB ─┼─▶ MasterEffects ─▶ masterGain ─▶ limiter ─┬─▶ destination (altavoces)
 *   Sampler ───────────────  ┘                                            └─▶ recordDest ─▶ Recorder
 *
 * Los decks de YouTube no pasan por el grafo (cross-origin): su "mezcla" se
 * hace ajustando el volumen del iframe con el mismo cálculo del crossfader.
 *
 * Toda la clase es agnóstica de React; la UI la maneja a través del store.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly effects: MasterEffects;
  readonly sampler: Sampler;
  readonly recorder: Recorder;
  readonly analyser: AnalyserNode;
  readonly cueBus: CueBus;

  private readonly masterGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly recordDest: MediaStreamAudioDestinationNode;
  private readonly channels: Record<DeckId, Channel>;
  private _crossfade = 0; // -1 (A) .. +1 (B)

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });

    // ── Cadena de máster ────────────────────────────────────────────────
    this.effects = new MasterEffects(this.ctx);
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    // Limitador "brickwall" para evitar clipping al sumar decks + sampler.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.recordDest = this.ctx.createMediaStreamDestination();

    this.effects.output.connect(this.masterGain);
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.limiter.connect(this.recordDest);

    this.recorder = new Recorder(this.recordDest.stream);

    // ── Bus de pre-escucha (audífonos) ─────────────────────────────────────
    // Segunda salida independiente del máster/crossfader (ver CueBus).
    this.cueBus = new CueBus(this.ctx);

    // ── Sampler ──────────────────────────────────────────────────────────
    this.sampler = new Sampler(this.ctx);
    this.sampler.output.connect(this.effects.input);

    // ── Canales / decks ───────────────────────────────────────────────────
    this.channels = {
      A: this.makeChannel('A'),
      B: this.makeChannel('B'),
    };
    this.applyCrossfade();
  }

  private makeChannel(id: DeckId): Channel {
    const gain = this.ctx.createGain();
    gain.connect(this.effects.input);
    const deck = new Deck(this.ctx);
    deck.output.connect(gain);

    // Envío de pre-escucha: toma la señal del deck ANTES del crossfader/fader
    // (PFL) y la manda al bus de audífonos. Empieza en silencio (cue apagado).
    const cueGain = this.ctx.createGain();
    cueGain.gain.value = 0;
    deck.output.connect(cueGain);
    cueGain.connect(this.cueBus.input);

    const yt = new YouTubeDeck(`yt-deck-${id}`);
    return { deck, yt, engine: 'local', gain, fader: 1, cueGain, cueOn: false };
  }

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  getDeck(id: DeckId): Deck {
    return this.channels[id].deck;
  }

  getYouTubeDeck(id: DeckId): YouTubeDeck {
    return this.channels[id].yt;
  }

  getEngine(id: DeckId): EngineType {
    return this.channels[id].engine;
  }

  /** Cambia el motor activo de un canal (local ↔ youtube). */
  setEngine(id: DeckId, engine: EngineType): void {
    this.channels[id].engine = engine;
    this.applyCrossfade(); // reaplica ganancias al motor correcto
  }

  // ── Mezclador ────────────────────────────────────────────────────────────
  /** Crossfader: -1 = solo A, 0 = centro, +1 = solo B. */
  setCrossfade(value: number): void {
    this._crossfade = Math.max(-1, Math.min(1, value));
    this.applyCrossfade();
  }

  get crossfade(): number {
    return this._crossfade;
  }

  /** Fader de línea de un canal (0..1). */
  setChannelFader(id: DeckId, value: number): void {
    this.channels[id].fader = Math.max(0, Math.min(1, value));
    this.applyCrossfade();
  }

  /**
   * Curva de crossfade de igual potencia. Calcula la ganancia efectiva de
   * cada canal y la aplica al motor activo (GainNode local o volumen de YT).
   */
  private applyCrossfade(): void {
    const x = (this._crossfade + 1) / 2; // 0..1
    const gA = Math.cos((x * Math.PI) / 2) * this.channels.A.fader;
    const gB = Math.sin((x * Math.PI) / 2) * this.channels.B.fader;
    this.applyChannelGain('A', gA);
    this.applyChannelGain('B', gB);
  }

  private applyChannelGain(id: DeckId, gain: number): void {
    const ch = this.channels[id];
    if (ch.engine === 'local') {
      ch.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.015);
      ch.yt.setVolume(0);
    } else {
      ch.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
      ch.yt.setVolume(gain);
    }
  }

  setMasterGain(value: number): void {
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.2, value)), this.ctx.currentTime, 0.02);
  }

  setEq(id: DeckId, values: Partial<EqValues>): void {
    // El EQ solo aplica a decks locales (Web Audio).
    this.channels[id].deck.setEq(values);
  }

  setChannelFilter(id: DeckId, value: number): void {
    this.channels[id].deck.setFilter(value);
  }

  // ── Pre-escucha / Cue de audífonos (PFL) ──────────────────────────────────
  /** ¿El navegador permite enrutar la pre-escucha a otra salida (setSinkId)? */
  get canRouteCue(): boolean {
    return this.cueBus.canRouteOutput;
  }

  /**
   * Activa/desactiva la pre-escucha de un deck. Es independiente del crossfader:
   * el deck puede monitorearse aunque el crossfader esté al lado contrario.
   * Solo aplica a decks locales (YouTube es cross-origin).
   */
  setCueMonitor(id: DeckId, on: boolean): void {
    const ch = this.channels[id];
    if (ch.engine === 'youtube') return; // sin señal en el grafo de Web Audio
    ch.cueOn = on;
    ch.cueGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
    const active = (this.channels.A.cueOn ? 1 : 0) + (this.channels.B.cueOn ? 1 : 0);
    this.cueBus.notifyActive(active);
  }

  isCueOn(id: DeckId): boolean {
    return this.channels[id].cueOn;
  }

  /** Nivel de los audífonos (independiente del máster). */
  setCueVolume(v: number): void {
    this.cueBus.setVolume(v);
  }

  /** Rutea la pre-escucha a un dispositivo de salida (deviceId). */
  async setCueSinkId(deviceId: string): Promise<void> {
    await this.cueBus.setSinkId(deviceId);
  }

  get cueSinkId(): string {
    return this.cueBus.sinkId;
  }

  /** Enumera las salidas de audio disponibles. */
  getCueOutputs(): Promise<AudioOutputDevice[]> {
    return listAudioOutputs();
  }

  /** Abre el selector nativo de salida (si el navegador lo soporta). */
  selectCueOutput(): Promise<AudioOutputDevice | null> {
    return promptSelectOutput();
  }

  dispose(): void {
    this.channels.A.deck.dispose();
    this.channels.B.deck.dispose();
    this.channels.A.yt.dispose();
    this.channels.B.yt.dispose();
    this.cueBus.dispose();
    void this.ctx.close();
  }
}
