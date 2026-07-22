/**
 * Estación de Live Looping: graba la mezcla del máster en bucles de una longitud
 * exacta (compases × BPM) y los reproduce en repetición. Cada slot es una pista
 * de loop independiente; todas suenan a la vez (looper multipista).
 *
 * La captura se toma ANTES de sumar los loops (para no re-grabar los loops que
 * ya suenan), así cada pista queda limpia. Los loops se reproducen de vuelta al
 * máster, por lo que sí entran en las grabaciones de audio/vídeo.
 */
export interface LoopSlotState {
  hasAudio: boolean;
  playing: boolean;
  recording: boolean;
}

interface Slot {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  playing: boolean;
}

interface Recording {
  slot: number;
  targetFrames: number;
  frames: number;
  chunksL: Float32Array[];
  chunksR: Float32Array[];
}

export class LoopStation {
  readonly captureInput: ScriptProcessorNode;
  readonly output: GainNode;
  private readonly slots: Slot[];
  private recording: Recording | null = null;
  private bpm = 120;
  private bars = 4;
  private onUpdate: () => void = () => {};

  constructor(
    private readonly ctx: AudioContext,
    slotCount = 4,
  ) {
    this.output = ctx.createGain();

    // Tap de captura: pasa la señal sin alterarla; solo la acumula al grabar.
    // Un ScriptProcessor necesita estar conectado a un destino para procesar.
    this.captureInput = ctx.createScriptProcessor(4096, 2, 2);
    this.captureInput.onaudioprocess = this.process;
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.captureInput.connect(sink);
    sink.connect(ctx.destination);

    this.slots = Array.from({ length: slotCount }, () => ({
      buffer: null,
      source: null,
      gain: ctx.createGain(),
      playing: false,
    }));
    this.slots.forEach((s) => s.gain.connect(this.output));
  }

  setOnUpdate(cb: () => void): void {
    this.onUpdate = cb;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(220, bpm));
  }

  setBars(bars: number): void {
    this.bars = Math.max(1, Math.min(8, Math.round(bars)));
  }

  get bpmValue(): number {
    return this.bpm;
  }
  get barsValue(): number {
    return this.bars;
  }

  /** Nº de muestras de un loop = compases × 4 negras × (60/BPM) × sampleRate. */
  private get loopFrames(): number {
    return Math.max(1, Math.round(this.bars * 4 * (60 / this.bpm) * this.ctx.sampleRate));
  }

  /** Empieza a grabar en un slot (captura exactamente un loop y para sola). */
  armRecord(slot: number): void {
    if (slot < 0 || slot >= this.slots.length) return;
    // Si ya se grababa otro slot, se descarta esa toma.
    this.recording = { slot, targetFrames: this.loopFrames, frames: 0, chunksL: [], chunksR: [] };
    this.onUpdate();
  }

  private readonly process = (e: AudioProcessingEvent): void => {
    const rec = this.recording;
    if (!rec) return;
    const input = e.inputBuffer;
    const chL = input.getChannelData(0);
    const chR = input.numberOfChannels > 1 ? input.getChannelData(1) : chL;
    const remaining = rec.targetFrames - rec.frames;
    const take = Math.min(chL.length, remaining);
    rec.chunksL.push(chL.slice(0, take));
    rec.chunksR.push(chR.slice(0, take));
    rec.frames += take;
    if (rec.frames >= rec.targetFrames) this.finalize();
  };

  private finalize(): void {
    const rec = this.recording;
    if (!rec) return;
    this.recording = null;
    const buffer = this.ctx.createBuffer(2, rec.targetFrames, this.ctx.sampleRate);
    const outL = buffer.getChannelData(0);
    const outR = buffer.getChannelData(1);
    let off = 0;
    for (let i = 0; i < rec.chunksL.length; i++) {
      outL.set(rec.chunksL[i], off);
      outR.set(rec.chunksR[i], off);
      off += rec.chunksL[i].length;
    }
    this.slots[rec.slot].buffer = buffer;
    this.startSlot(rec.slot);
    this.onUpdate();
  }

  private startSlot(index: number): void {
    const slot = this.slots[index];
    if (!slot.buffer) return;
    this.stopSlotSource(slot);
    const src = this.ctx.createBufferSource();
    src.buffer = slot.buffer;
    src.loop = true;
    src.connect(slot.gain);
    src.start();
    slot.source = src;
    slot.playing = true;
  }

  private stopSlotSource(slot: Slot): void {
    if (slot.source) {
      try {
        slot.source.stop();
      } catch {
        /* ya detenido */
      }
      slot.source.disconnect();
      slot.source = null;
    }
    slot.playing = false;
  }

  togglePlay(index: number): void {
    const slot = this.slots[index];
    if (!slot || !slot.buffer) return;
    if (slot.playing) this.stopSlotSource(slot);
    else this.startSlot(index);
    this.onUpdate();
  }

  clear(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    if (this.recording?.slot === index) this.recording = null;
    this.stopSlotSource(slot);
    slot.buffer = null;
    this.onUpdate();
  }

  stopAll(): void {
    this.slots.forEach((s) => this.stopSlotSource(s));
    this.onUpdate();
  }

  getStates(): LoopSlotState[] {
    return this.slots.map((s, i) => ({
      hasAudio: !!s.buffer,
      playing: s.playing,
      recording: this.recording?.slot === i,
    }));
  }
}
