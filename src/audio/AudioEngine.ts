import { Deck } from './Deck';
import { YouTubeDeck } from './YouTubeDeck';
import { MasterEffects } from './Effects';
import { Sampler } from './Sampler';
import { StepSequencer } from './StepSequencer';
import { LoopStation } from './LoopStation';
import { LightEngine } from '../lights/LightEngine';
import { createDrumSamples } from './synthSamples';
import { Recorder } from './Recorder';
import { CueBus, listAudioOutputs, promptSelectOutput, type AudioOutputDevice } from './CueBus';
import { Sidechain } from './Sidechain';
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
  /** Analizador post-fader del canal para el vúmetro. */
  meter: AnalyserNode;
}

/** Nivel RMS (0..1) a partir de un AnalyserNode (dominio del tiempo). */
function levelFromAnalyser(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / data.length) * 2.6);
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
  readonly sequencer: StepSequencer;
  readonly loops: LoopStation;
  readonly lights: LightEngine;
  readonly recorder: Recorder;
  readonly analyser: AnalyserNode;
  readonly cueBus: CueBus;
  readonly sidechain: Sidechain;

  private readonly masterGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly recordDest: MediaStreamAudioDestinationNode;
  private readonly channels: Record<DeckId, Channel>;
  private _crossfade = 0; // -1 (A) .. +1 (B)
  private autoTransitioning = false; // el Auto-DJ controla el crossfader

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

    // ── Secuenciador de pasos (drum machine) ───────────────────────────────
    // Kit propio (batería sintética) para que sea independiente del sampler.
    this.sequencer = new StepSequencer(this.ctx);
    this.sequencer.setKit(createDrumSamples(this.ctx).map((p) => p.buffer));
    this.sequencer.output.connect(this.effects.input);

    // ── Estación de Live Looping ───────────────────────────────────────────
    // Captura la mezcla ANTES de sumar los loops (effects.output, pre-máster),
    // y devuelve los loops al máster para oírlos y grabarlos.
    this.loops = new LoopStation(this.ctx);
    this.effects.output.connect(this.loops.captureInput);
    this.loops.output.connect(this.masterGain);

    // ── Luces reactivas (leen el analizador del máster) ────────────────────
    this.lights = new LightEngine(this.analyser);

    // ── Canales / decks ───────────────────────────────────────────────────
    this.channels = {
      A: this.makeChannel('A'),
      B: this.makeChannel('B'),
    };
    this.applyCrossfade();

    // ── Smart EQ / Sidechain (auto-ducking de graves) ──────────────────────
    this.sidechain = new Sidechain({
      getDeck: (id) => this.channels[id].deck,
      isLocalPlaying: (id) => this.channels[id].engine === 'local' && this.channels[id].deck.playing,
      channelGainValue: (id) => this.channelGainValue(id),
    });
  }

  /** Ganancia efectiva actual de un canal (curva de crossfade × fader). */
  private channelGainValue(id: DeckId): number {
    const x = (this._crossfade + 1) / 2;
    const g = id === 'A' ? Math.cos((x * Math.PI) / 2) : Math.sin((x * Math.PI) / 2);
    return g * this.channels[id].fader;
  }

  // ── Smart EQ / Sidechain ───────────────────────────────────────────────────
  setSidechain(on: boolean): void {
    this.sidechain.setEnabled(on);
  }

  setSidechainAmount(db: number): void {
    this.sidechain.setAmount(db);
  }

  /** Ducking de graves actual de un deck en dB (0 = sin ducking). */
  getSidechainDuck(id: DeckId): number {
    return this.channels[id].deck.sidechainLowDb;
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

    // Vúmetro: analizador post-fader (refleja lo que el canal envía al máster).
    const meter = this.ctx.createAnalyser();
    meter.fftSize = 256;
    gain.connect(meter);

    const yt = new YouTubeDeck(`yt-deck-${id}`);
    return { deck, yt, engine: 'local', gain, fader: 1, cueGain, cueOn: false, meter };
  }

  /** Nivel RMS (0..1) del canal, para el vúmetro. */
  getChannelLevel(id: DeckId): number {
    return levelFromAnalyser(this.channels[id].meter);
  }

  /** Nivel RMS (0..1) del máster, para el vúmetro. */
  getMasterLevel(): number {
    return levelFromAnalyser(this.analyser);
  }

  /** Stream de audio del máster (para grabar vídeo de la sesión). */
  get masterStream(): MediaStream {
    return this.recordDest.stream;
  }

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  getDeck(id: DeckId): Deck {
    return this.channels[id].deck;
  }

  /** Buffer cargado en un deck local (para exportar stems). */
  getDeckBuffer(id: DeckId): AudioBuffer | null {
    return this.channels[id].deck.getBuffer();
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
    // Durante una transición automática, el Auto-DJ agenda rampas sobre los
    // gains; ignoramos el crossfader manual para no pisar la automatización.
    if (this.autoTransitioning) return;
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

  // ── Automatización de mezcla (Auto-DJ) ─────────────────────────────────────
  get isAutoTransitioning(): boolean {
    return this.autoTransitioning;
  }

  /** Coloca el crossfader instantáneamente 100% sobre un deck (sin rampa). */
  armCrossfadeTo(id: DeckId): void {
    this._crossfade = id === 'B' ? 1 : -1;
    this.autoTransitioning = false;
    this.applyCrossfade();
  }

  /**
   * Transición automática A↔B de duración `duration` s con:
   *  - crossfade LINEAL (linearRampToValueAtTime) entre los gains de canal;
   *  - "bass swap": el grave del saliente baja a kill mientras el del entrante
   *    sube desde kill, evitando el choque de bombos/bajos.
   * El deck entrante debe empezar a sonar justo antes de llamar a este método.
   */
  beginAutoTransition(from: DeckId, to: DeckId, duration: number): void {
    const t0 = this.ctx.currentTime;
    const chFrom = this.channels[from];
    const chTo = this.channels[to];
    this.autoTransitioning = true;

    // Crossfade lineal de ganancias de canal.
    const rampGain = (param: AudioParam, target: number) => {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(param.value, t0);
      param.linearRampToValueAtTime(target, t0 + duration);
    };
    rampGain(chFrom.gain.gain, 0);
    rampGain(chTo.gain.gain, chTo.fader);

    // Bass swap: entrante arranca con el grave cortado y lo recupera.
    chTo.deck.eq.setBandNow('low', -26);
    chFrom.deck.eq.rampBand('low', -26, t0, duration);
    chTo.deck.eq.rampBand('low', 0, t0, duration);
  }

  /** Cierra la transición: fija el estado final y restaura el EQ del saliente. */
  finishAutoTransition(from: DeckId, to: DeckId): void {
    this.autoTransitioning = false;
    this._crossfade = to === 'B' ? 1 : -1;
    // El grave del saliente se ramó a kill; lo dejamos neutro para su próximo uso.
    this.channels[from].deck.eq.setBandNow('low', 0);
    this.channels[from].deck.setEq({ low: 0 });
    this.applyCrossfade();
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
