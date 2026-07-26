/**
 * Entrada de micrófono para voz en vivo sobre la mezcla.
 *
 * Cadena: mic → pasa-altos (quita retumbe) → compresor → (dry + reverb + delay)
 *         → salida (volumen) → máster.
 *
 * La voz entra al máster, así que se OYE y se GRABA (audio y vídeo). Usa
 * audífonos para evitar realimentación acústica al monitorearte por altavoces.
 */
/** Curva de saturación suave (tanh) para el efecto "teléfono/radio". */
function makeShaperCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

function makeImpulse(ctx: BaseAudioContext, seconds = 1.8, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export type VoiceEffect = 'none' | 'deep' | 'high' | 'robot' | 'phone' | 'choir';

export class MicInput {
  readonly output: GainNode;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private readonly hp: BiquadFilterNode;
  private readonly comp: DynamicsCompressorNode;
  /** Analizador de la voz (post-compresor) para el auto-ducking del "animador". */
  private readonly monitor: AnalyserNode;
  private readonly dry: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbGain: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly echoGain: GainNode;
  private readonly preFx: GainNode;
  private _enabled = false;

  // ── Efectos de voz (Grave/Agudo/Robot/Teléfono/Coro) ──────────────────────
  // Ramales en paralelo entre preFx y `voiced`; cada preset mezcla sus ganancias.
  private readonly voiced: GainNode; // salida del bloque de efectos de voz
  private readonly fxDry: GainNode; // voz sin efecto
  private readonly pitchGain: GainNode; // envío al pitch-shifter (Grave/Agudo/Coro)
  private readonly ringMul: GainNode; // ring-mod (Robot)
  private readonly carrier: OscillatorNode; // portadora del ring-mod
  private readonly carrierGain: GainNode; // enciende/apaga el ring-mod
  private readonly phoneBP: BiquadFilterNode; // banda de teléfono
  private readonly phoneShaper: WaveShaperNode; // grano/distorsión de teléfono
  private readonly phoneGain: GainNode;
  private pitchNode: AudioWorkletNode | null = null;
  private pitchLoaded = false;
  private voiceEffect: VoiceEffect = 'none';

  // Auto-Tune (AudioWorklet) — se inserta entre el compresor y el FX.
  private autotune: AudioWorkletNode | null = null;
  private autotuneLoaded = false;
  private wantAutotune = false;
  private strengthVal = 0.9;
  private speedVal = 0.5; // velocidad de retune (0 lento · 1 instantáneo)
  private keyVal = 0; // 0..11 (Do..Si)
  private scaleVal = 0; // 0 cromática · 1 mayor · 2 menor

  constructor(private readonly ctx: AudioContext) {
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 90;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.15;

    // Analizador de nivel de voz para el auto-ducking (talkover del animador).
    // Toma la señal tras el compresor; es un ramal aparte que no altera el FX.
    this.monitor = ctx.createAnalyser();
    this.monitor.fftSize = 512;
    this.monitor.smoothingTimeConstant = 0.4;
    this.comp.connect(this.monitor);

    this.preFx = ctx.createGain();
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0;

    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.28;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.3;
    this.echoGain = ctx.createGain();
    this.echoGain.gain.value = 0;

    this.output = ctx.createGain();
    this.output.gain.value = 0.9;

    // ── Bloque de EFECTOS DE VOZ (preFx → ramales → voiced) ─────────────────
    this.voiced = ctx.createGain();
    this.fxDry = ctx.createGain();
    this.fxDry.gain.value = 1; // por defecto: voz sin efecto

    this.pitchGain = ctx.createGain();
    this.pitchGain.gain.value = 0; // el pitch-shifter se conecta en loadPitchShift()

    // Ring-mod (Robot): preFx → ringMul → voiced; la portadora modula ringMul.gain.
    this.ringMul = ctx.createGain();
    this.ringMul.gain.value = 0;
    this.carrier = ctx.createOscillator();
    this.carrier.type = 'sine';
    this.carrier.frequency.value = 52;
    this.carrierGain = ctx.createGain();
    this.carrierGain.gain.value = 0; // apagado hasta elegir Robot
    this.carrier.connect(this.carrierGain).connect(this.ringMul.gain);
    this.carrier.start();

    // Teléfono: banda estrecha + leve distorsión.
    this.phoneBP = ctx.createBiquadFilter();
    this.phoneBP.type = 'bandpass';
    this.phoneBP.frequency.value = 1400;
    this.phoneBP.Q.value = 1.2;
    this.phoneShaper = ctx.createWaveShaper();
    this.phoneShaper.curve = makeShaperCurve(4);
    this.phoneGain = ctx.createGain();
    this.phoneGain.gain.value = 0;

    // Ruteo del FX (la fuente del mic se conecta en enable()).
    this.hp.connect(this.comp).connect(this.preFx);
    // preFx → ramales de efectos de voz → voiced
    this.preFx.connect(this.fxDry).connect(this.voiced);
    this.preFx.connect(this.ringMul).connect(this.voiced);
    this.preFx.connect(this.phoneBP).connect(this.phoneShaper).connect(this.phoneGain).connect(this.voiced);
    // voiced → dry + reverb + delay → salida
    this.voiced.connect(this.dry).connect(this.output);
    this.voiced.connect(this.reverb).connect(this.reverbGain).connect(this.output);
    this.voiced.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.echoGain).connect(this.output);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Nivel RMS (0..1) de la voz tras el compresor. Lo usa el auto-ducking del
   * "animador" para bajar la música cuando la persona habla y subirla al callar.
   */
  getVoiceLevel(): number {
    if (!this._enabled) return 0;
    const data = new Uint8Array(this.monitor.fftSize);
    this.monitor.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  async enable(): Promise<void> {
    if (this._enabled) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.hp);
    this._enabled = true;
    await this.loadAutotune(); // best-effort; la voz funciona aunque falle
    await this.loadPitchShift(); // best-effort; sin él, los efectos de tono no aplican
  }

  /** Carga el pitch-shifter para los efectos Grave/Agudo/Coro. */
  private async loadPitchShift(): Promise<void> {
    if (this.pitchLoaded) return;
    try {
      await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pitchshift-worklet.js`);
      const node = new AudioWorkletNode(this.ctx, 'pitchshift-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.preFx.connect(node);
      node.connect(this.pitchGain);
      this.pitchNode = node;
      this.pitchLoaded = true;
      // Reaplica el efecto elegido por si se seleccionó antes de cargar.
      this.setVoiceEffect(this.voiceEffect);
    } catch {
      this.pitchNode = null;
    }
  }

  private setPitchRatio(ratio: number): void {
    if (this.pitchNode) this.pitchNode.parameters.get('pitch')!.value = ratio;
  }

  /**
   * Selecciona un efecto de voz. Mezcla las ganancias de los ramales en paralelo
   * (seco / pitch / ring-mod / teléfono) para no reconectar el grafo en caliente.
   */
  setVoiceEffect(effect: VoiceEffect): void {
    this.voiceEffect = effect;
    const t = this.ctx.currentTime;
    const ramp = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.02);
    // Estado neutro.
    ramp(this.fxDry, 1);
    ramp(this.pitchGain, 0);
    ramp(this.carrierGain, 0);
    ramp(this.phoneGain, 0);

    switch (effect) {
      case 'deep': // voz grave (−6 semitonos aprox.)
        ramp(this.fxDry, 0);
        this.setPitchRatio(0.7);
        ramp(this.pitchGain, 1);
        break;
      case 'high': // voz aguda / ardilla (+6 semitonos aprox.)
        ramp(this.fxDry, 0);
        this.setPitchRatio(1.5);
        ramp(this.pitchGain, 1);
        break;
      case 'robot': // ring-mod metálico
        ramp(this.fxDry, 0.28);
        ramp(this.carrierGain, 1);
        break;
      case 'phone': // banda estrecha + saturación
        ramp(this.fxDry, 0);
        ramp(this.phoneGain, 1);
        break;
      case 'choir': // armonía: voz + una quinta arriba
        ramp(this.fxDry, 1);
        this.setPitchRatio(1.4983);
        ramp(this.pitchGain, 0.55);
        break;
      case 'none':
      default:
        break;
    }
  }

  get currentVoiceEffect(): VoiceEffect {
    return this.voiceEffect;
  }

  /** Carga el worklet de Auto-Tune y lo inserta entre el compresor y el FX. */
  private async loadAutotune(): Promise<void> {
    if (this.autotuneLoaded) return;
    try {
      await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}autotune-worklet.js`);
      const node = new AudioWorkletNode(this.ctx, 'autotune-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      // Insertar: comp → autotune → preFx (comp estaba conectado directo a preFx).
      this.comp.disconnect(this.preFx);
      this.comp.connect(node);
      node.connect(this.preFx);
      this.autotune = node;
      this.autotuneLoaded = true;
      this.applyAutotuneParams();
    } catch {
      // Sin worklet: la cadena comp → preFx queda intacta y la voz suena igual.
      this.autotune = null;
    }
  }

  private applyAutotuneParams(): void {
    if (!this.autotune) return;
    this.autotune.parameters.get('enabled')!.value = this.wantAutotune ? 1 : 0;
    this.autotune.parameters.get('strength')!.value = this.strengthVal;
    this.autotune.parameters.get('speed')!.value = this.speedVal;
    this.autotune.parameters.get('key')!.value = this.keyVal;
    this.autotune.parameters.get('scale')!.value = this.scaleVal;
  }

  setAutotune(on: boolean): void {
    this.wantAutotune = on;
    if (this.autotune) this.autotune.parameters.get('enabled')!.value = on ? 1 : 0;
  }

  setAutotuneStrength(v: number): void {
    this.strengthVal = Math.max(0, Math.min(1, v));
    if (this.autotune) this.autotune.parameters.get('strength')!.value = this.strengthVal;
  }

  /** Velocidad de retune (0 lento/natural · 1 instantáneo/duro). */
  setAutotuneSpeed(v: number): void {
    this.speedVal = Math.max(0, Math.min(1, v));
    if (this.autotune) this.autotune.parameters.get('speed')!.value = this.speedVal;
  }

  /** Fija la escala (0 cromática · 1 mayor · 2 menor) y su tónica (0..11). */
  setAutotuneScale(scale: number, key: number): void {
    this.scaleVal = Math.max(0, Math.min(2, Math.round(scale)));
    this.keyVal = ((Math.round(key) % 12) + 12) % 12;
    if (this.autotune) {
      this.autotune.parameters.get('scale')!.value = this.scaleVal;
      this.autotune.parameters.get('key')!.value = this.keyVal;
    }
  }

  /** ¿El navegador soporta AudioWorklet (para Auto-Tune)? */
  get autotuneSupported(): boolean {
    return typeof AudioWorkletNode !== 'undefined' && !!this.ctx.audioWorklet;
  }

  disable(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this._enabled = false;
  }

  setVolume(v: number): void {
    this.output.gain.setTargetAtTime(Math.max(0, Math.min(1.5, v)), this.ctx.currentTime, 0.02);
  }
  setReverb(wet: number): void {
    this.reverbGain.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), this.ctx.currentTime, 0.03);
  }
  setEcho(wet: number): void {
    this.echoGain.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), this.ctx.currentTime, 0.03);
  }
}
