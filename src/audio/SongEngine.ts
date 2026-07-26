/**
 * Motor de creación musical (acompañamiento). Genera una base de canción con
 * cuatro capas sintéticas —ACORDES, BAJO, ARPEGIO y BATERÍA— a partir de un tono,
 * una escala (mayor/menor), una progresión y un tempo. Todo es Web Audio puro
 * (osciladores + envolventes), sin muestras externas.
 *
 * Se agenda con el patrón de "dos relojes" (setInterval que mira hacia delante y
 * agenda en tiempos exactos del AudioContext), igual que el secuenciador, para
 * que el ritmo sea preciso. La salida entra a la mezcla, así que se OYE y se
 * GRABA; y como comparte tono/escala con el Auto-Tune, la voz queda afinada con
 * la música.
 */

export type SongInstrument = 'pads' | 'piano' | 'pluck' | 'synth';

export interface Progression {
  id: string;
  name: string;
  /** Grados de la escala (0 = I … 6 = vii), un acorde por compás. */
  degrees: number[];
}

/** Progresiones típicas (grados 0-based dentro de la escala elegida). */
export const PROGRESSIONS: Progression[] = [
  { id: 'pop', name: 'Pop (I–V–vi–IV)', degrees: [0, 4, 5, 3] },
  { id: 'balada', name: 'Balada (I–vi–IV–V)', degrees: [0, 5, 3, 4] },
  { id: 'emotiva', name: 'Emotiva (vi–IV–I–V)', degrees: [5, 3, 0, 4] },
  { id: 'urbano', name: 'Urbano (i–VI–III–VII)', degrees: [0, 5, 2, 6] },
  { id: 'jazz', name: 'Jazz (ii–V–I–I)', degrees: [1, 4, 0, 0] },
  { id: 'andina', name: 'Épica (I–IV–V–IV)', degrees: [0, 3, 4, 3] },
];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

interface VoiceOpts {
  types: Array<{ type: OscillatorType; detune?: number; gain?: number }>;
  attack: number;
  /** Duración de la nota (s). El release va implícito en la caída exponencial. */
  filter: number;
  peak: number;
  sustain: boolean;
}

const INSTRUMENTS: Record<SongInstrument, Omit<VoiceOpts, 'peak'>> = {
  pads: { types: [{ type: 'sawtooth', detune: -6 }, { type: 'sawtooth', detune: 7 }], attack: 0.28, filter: 1500, sustain: true },
  piano: { types: [{ type: 'triangle' }, { type: 'sine', gain: 0.5, detune: 12 }], attack: 0.005, filter: 3200, sustain: false },
  pluck: { types: [{ type: 'sawtooth' }], attack: 0.004, filter: 2200, sustain: false },
  synth: { types: [{ type: 'square', gain: 0.7 }], attack: 0.01, filter: 2600, sustain: false },
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class SongEngine {
  readonly output: GainNode;
  private readonly ctx: AudioContext;

  private readonly chordsGain: GainNode;
  private readonly bassGain: GainNode;
  private readonly arpGain: GainNode;
  private readonly drumsGain: GainNode;
  private readonly noise: AudioBuffer;

  // Parámetros musicales
  private key = 0; // 0..11 (Do..Si)
  private scaleMinor = false; // false = mayor, true = menor
  private tempo = 100;
  private progression: Progression = PROGRESSIONS[0];
  private instrument: SongInstrument = 'pads';
  private bassOn = true;
  private arpOn = false;
  private drumsOn = true;

  // Scheduler
  private playing = false;
  private step = 0; // paso absoluto (16 por compás)
  private nextNoteTime = 0;
  private readonly lookaheadMs = 25;
  private readonly scheduleAhead = 0.12;
  private timer: number | null = null;
  private onStep: ((barStep: number, bar: number) => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.9;

    this.chordsGain = ctx.createGain();
    this.chordsGain.gain.value = 0.5;
    this.bassGain = ctx.createGain();
    this.bassGain.gain.value = 0.55;
    this.arpGain = ctx.createGain();
    this.arpGain.gain.value = 0.3;
    this.drumsGain = ctx.createGain();
    this.drumsGain.gain.value = 0.7;
    this.chordsGain.connect(this.output);
    this.bassGain.connect(this.output);
    this.arpGain.connect(this.output);
    this.drumsGain.connect(this.output);

    // Ruido blanco reutilizable para la batería (caja / charles).
    const len = Math.floor(ctx.sampleRate * 0.4);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // ── Parámetros ─────────────────────────────────────────────────────────────
  setKey(key: number): void {
    this.key = ((Math.round(key) % 12) + 12) % 12;
  }
  setScaleMinor(minor: boolean): void {
    this.scaleMinor = minor;
  }
  setTempo(bpm: number): void {
    this.tempo = Math.max(60, Math.min(180, Math.round(bpm)));
  }
  setProgression(id: string): void {
    this.progression = PROGRESSIONS.find((p) => p.id === id) ?? this.progression;
  }
  setInstrument(inst: SongInstrument): void {
    this.instrument = inst;
  }
  setBass(on: boolean): void {
    this.bassOn = on;
  }
  setArp(on: boolean): void {
    this.arpOn = on;
  }
  setDrums(on: boolean): void {
    this.drumsOn = on;
  }
  setVolume(v: number): void {
    this.output.gain.setTargetAtTime(Math.max(0, Math.min(1.2, v)), this.ctx.currentTime, 0.02);
  }
  setLayer(layer: 'chords' | 'bass' | 'arp' | 'drums', v: number): void {
    const g = { chords: this.chordsGain, bass: this.bassGain, arp: this.arpGain, drums: this.drumsGain }[layer];
    g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.02);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  // ── Transporte ───────────────────────────────────────────────────────────────
  start(onStep?: (barStep: number, bar: number) => void): void {
    if (this.playing) return;
    this.onStep = onStep ?? null;
    this.playing = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.scheduler(), this.lookaheadMs);
  }

  stop(): void {
    this.playing = false;
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.step = 0;
  }

  private secondsPerStep(): number {
    return 60 / this.tempo / 4; // semicorchea
  }

  private scheduler(): void {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this.secondsPerStep();
      this.step++;
    }
  }

  // ── Teoría: acorde (triada) de un grado dentro de la escala ─────────────────
  private chordMidis(degree: number): number[] {
    const scale = this.scaleMinor ? MINOR : MAJOR;
    const rootMidi = 60 + this.key; // Do4 = 60
    const tones: number[] = [];
    for (const add of [0, 2, 4]) {
      const idx = degree + add;
      const octave = Math.floor(idx / 7);
      tones.push(rootMidi + scale[((idx % 7) + 7) % 7] + octave * 12);
    }
    return tones;
  }

  private scheduleStep(absStep: number, time: number): void {
    const barStep = absStep % 16;
    const bar = Math.floor(absStep / 16);
    const degree = this.progression.degrees[bar % this.progression.degrees.length];
    const chord = this.chordMidis(degree);
    const stepDur = this.secondsPerStep();
    const barDur = stepDur * 16;

    // ACORDES: al inicio del compás, sostenidos todo el compás.
    if (barStep === 0) {
      for (const m of chord) this.playChordTone(m, time, barDur * 0.98);
    }

    // BAJO: raíz del acorde dos octavas abajo, en los tiempos 1 y 3.
    if (this.bassOn && (barStep === 0 || barStep === 8)) {
      this.playBass(chord[0] - 24, time, stepDur * 7);
    }

    // ARPEGIO: recorre las notas del acorde en corcheas.
    if (this.arpOn && barStep % 2 === 0) {
      const note = chord[(barStep / 2) % 3] + 12;
      this.playChordTone(note, time, stepDur * 1.6, this.arpGain, true);
    }

    // BATERÍA sintética.
    if (this.drumsOn) {
      if (barStep === 0 || barStep === 8 || barStep === 10) this.playKick(time);
      if (barStep === 4 || barStep === 12) this.playSnare(time);
      if (barStep % 2 === 0) this.playHat(time, barStep % 4 === 0 ? 0.5 : 0.32);
    }

    if (this.onStep) {
      const cb = this.onStep;
      const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
      window.setTimeout(() => cb(barStep, bar), delay);
    }
  }

  // ── Voces ────────────────────────────────────────────────────────────────────
  private playChordTone(midi: number, time: number, dur: number, dest?: GainNode, forcePluck = false): void {
    const preset = INSTRUMENTS[this.instrument];
    const sustain = forcePluck ? false : preset.sustain;
    const freq = midiToFreq(midi);
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = preset.filter;
    filter.Q.value = 0.6;
    filter.connect(g).connect(dest ?? this.chordsGain);

    const peak = 0.34;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + preset.attack);
    if (sustain) {
      g.gain.setValueAtTime(peak, time + Math.max(preset.attack, dur - 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    }

    const stopAt = time + dur + 0.05;
    for (const t of preset.types) {
      const o = this.ctx.createOscillator();
      o.type = t.type;
      o.frequency.value = freq;
      o.detune.value = t.detune ?? 0;
      if (t.gain != null) {
        const vg = this.ctx.createGain();
        vg.gain.value = t.gain;
        o.connect(vg).connect(filter);
      } else {
        o.connect(filter);
      }
      o.start(time);
      o.stop(stopAt);
      o.onended = () => o.disconnect();
    }
    g.gain.setValueAtTime(g.gain.value, stopAt);
    window.setTimeout(() => g.disconnect(), Math.max(0, (stopAt - this.ctx.currentTime) * 1000) + 60);
  }

  private playBass(midi: number, time: number, dur: number): void {
    const freq = midiToFreq(midi);
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.connect(g).connect(this.bassGain);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq;
    o.connect(filter);
    o2.connect(filter);
    const stopAt = time + dur + 0.05;
    o.start(time); o.stop(stopAt);
    o2.start(time); o2.stop(stopAt);
    o.onended = () => { o.disconnect(); o2.disconnect(); g.disconnect(); };
  }

  private playKick(time: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(48, time + 0.12);
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    o.connect(g).connect(this.drumsGain);
    o.start(time); o.stop(time + 0.22);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  private playSnare(time: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    src.connect(bp).connect(g).connect(this.drumsGain);
    // Cuerpo tonal.
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 180;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.3, time);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    o.connect(og).connect(this.drumsGain);
    src.start(time); src.stop(time + 0.2);
    o.start(time); o.stop(time + 0.12);
    src.onended = () => { src.disconnect(); bp.disconnect(); g.disconnect(); };
    o.onended = () => { o.disconnect(); og.disconnect(); };
  }

  private playHat(time: number, gain: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * 0.4, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(hp).connect(g).connect(this.drumsGain);
    src.start(time); src.stop(time + 0.06);
    src.onended = () => { src.disconnect(); hp.disconnect(); g.disconnect(); };
  }
}
