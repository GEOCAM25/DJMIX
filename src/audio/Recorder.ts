export type RecorderMode = 'master' | 'tab';

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/** Elige el mejor contenedor/códec de grabación soportado por el navegador. */
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

/**
 * Grabador de la sesión en tiempo real.
 *
 * Dos modos:
 *  - 'master': graba SOLO la salida de Web Audio (decks locales + sampler +
 *    efectos). Es limpio y sin latencia extra, pero NO incluye el audio de
 *    YouTube (cross-origin, ver YouTubeDeck).
 *  - 'tab':    usa getDisplayMedia({ audio: true }) para capturar TODO el
 *    audio de la pestaña, incluido YouTube. Requiere que el usuario comparta
 *    la pestaña y marque "compartir audio". Es la vía para grabar mixes que
 *    combinan YouTube + locales.
 *
 * El resultado se entrega como Blob (webm/opus por defecto). La conversión a
 * MP3 es opcional vía FFmpeg.wasm (ver media/ffmpeg.ts > toMp3()).
 */
export class Recorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startTime = 0;
  private tabStream: MediaStream | null = null;
  private _state: 'idle' | 'recording' | 'paused' = 'idle';

  constructor(private readonly masterStream: MediaStream) {}

  get state(): 'idle' | 'recording' | 'paused' {
    return this._state;
  }

  async start(mode: RecorderMode = 'master', timesliceMs = 1000): Promise<void> {
    if (this._state !== 'idle') return;

    let stream: MediaStream;
    if (mode === 'tab') {
      // Captura de pestaña: el usuario debe habilitar "compartir audio".
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const audioTracks = display.getAudioTracks();
      if (audioTracks.length === 0) {
        display.getTracks().forEach((t) => t.stop());
        throw new Error(
          'No se capturó audio de la pestaña. Marca la casilla "Compartir audio de la pestaña".',
        );
      }
      // Nos quedamos solo con el audio y descartamos el vídeo.
      display.getVideoTracks().forEach((t) => t.stop());
      stream = new MediaStream(audioTracks);
      this.tabStream = display;
    } else {
      stream = this.masterStream;
    }

    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(timesliceMs);
    this.startTime = performance.now();
    this._state = 'recording';
  }

  pause(): void {
    if (this._state === 'recording') {
      this.recorder?.pause();
      this._state = 'paused';
    }
  }

  resume(): void {
    if (this._state === 'paused') {
      this.recorder?.resume();
      this._state = 'recording';
    }
  }

  async stop(): Promise<RecordingResult> {
    if (!this.recorder || this._state === 'idle') {
      throw new Error('No hay grabación en curso.');
    }
    const rec = this.recorder;
    const result = await new Promise<RecordingResult>((resolve) => {
      rec.onstop = () => {
        const mimeType = rec.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        resolve({ blob, mimeType, durationMs: performance.now() - this.startTime });
      };
      rec.stop();
    });

    // Liberar la captura de pestaña si se usó.
    this.tabStream?.getTracks().forEach((t) => t.stop());
    this.tabStream = null;
    this.recorder = null;
    this._state = 'idle';
    return result;
  }
}
