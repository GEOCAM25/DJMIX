/**
 * Grabador de sesión en VÍDEO: dibuja una visualización con marca (espectro +
 * forma de onda + títulos/BPM de los decks) en un canvas y la combina con el
 * audio del máster para producir un .webm descargable.
 *
 * El vídeo del canvas se toma con captureStream(); el audio, del máster de Web
 * Audio (no incluye YouTube, cross-origin — igual que el grabador de audio).
 */
export interface VideoMeta {
  titleA: string;
  titleB: string;
  bpmA: number | null;
  bpmB: number | null;
}

export interface VideoResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

function pickVideoMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export class SessionVideoRecorder {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private raf = 0;
  private startTime = 0;
  private logo: HTMLImageElement | null = null;
  private phase = 0;

  constructor(
    private readonly analyser: AnalyserNode,
    private readonly masterStream: MediaStream,
    private readonly getMeta: () => VideoMeta,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('No se pudo crear el canvas de vídeo.');
    this.g = g;
  }

  get recording(): boolean {
    return this.recorder != null;
  }

  /** ¿El navegador puede grabar vídeo del canvas? */
  static get supported(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function'
    );
  }

  start(logoSrc?: string): void {
    if (this.recorder) return;
    if (logoSrc) {
      const img = new Image();
      img.onload = () => (this.logo = img);
      img.src = logoSrc;
    }

    // Primer fotograma para que el stream arranque con contenido.
    this.drawFrame();
    const canvasStream = this.canvas.captureStream(30);
    const audioTracks = this.masterStream.getAudioTracks();
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    const mimeType = pickVideoMime();
    this.recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.startTime = performance.now();

    const loop = () => {
      this.drawFrame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  async stop(): Promise<VideoResult> {
    if (!this.recorder) throw new Error('No hay grabación de vídeo en curso.');
    cancelAnimationFrame(this.raf);
    const rec = this.recorder;
    const result = await new Promise<VideoResult>((resolve) => {
      rec.onstop = () => {
        const mimeType = rec.mimeType || 'video/webm';
        resolve({
          blob: new Blob(this.chunks, { type: mimeType }),
          mimeType,
          durationMs: performance.now() - this.startTime,
        });
      };
      rec.stop();
    });
    this.recorder = null;
    return result;
  }

  // ── Dibujo del fotograma ──────────────────────────────────────────────────
  private drawFrame(): void {
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.phase += 0.01;

    // Fondo con degradado.
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(1, '#161c2c');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const bins = this.analyser.frequencyBinCount;
    const freq = new Uint8Array(bins);
    const wave = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteFrequencyData(freq);
    this.analyser.getByteTimeDomainData(wave);

    // Espectro (barras) en la mitad inferior.
    const bars = 96;
    const step = Math.floor(bins / bars);
    const barW = W / bars;
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += freq[i * step + j];
      const v = sum / step / 255;
      const h = Math.pow(v, 0.9) * (H * 0.5);
      const x = i * barW;
      const grad = g.createLinearGradient(0, H - h, 0, H);
      grad.addColorStop(0, '#22d3ee');
      grad.addColorStop(1, '#a78bfa');
      g.fillStyle = grad;
      g.fillRect(x + 1, H - h, barW - 2, h);
    }

    // Forma de onda (línea) centrada.
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    for (let i = 0; i < wave.length; i++) {
      const x = (i / wave.length) * W;
      const y = H * 0.32 + ((wave[i] - 128) / 128) * (H * 0.16);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();

    // Marca.
    if (this.logo) g.drawImage(this.logo, 40, 34, 56, 56);
    g.fillStyle = '#e6ebf5';
    g.font = '700 40px system-ui, sans-serif';
    g.fillText('BEAT DJ', this.logo ? 110 : 40, 74);

    // Títulos/BPM de los decks.
    const meta = this.getMeta();
    g.font = '600 24px system-ui, sans-serif';
    g.fillStyle = '#22d3ee';
    g.fillText(`A · ${trunc(meta.titleA)}${meta.bpmA ? `  ${Math.round(meta.bpmA)} BPM` : ''}`, 40, H - 40);
    const bText = `B · ${trunc(meta.titleB)}${meta.bpmB ? `  ${Math.round(meta.bpmB)} BPM` : ''}`;
    g.fillStyle = '#a78bfa';
    g.textAlign = 'right';
    g.fillText(bText, W - 40, H - 40);
    g.textAlign = 'left';
  }
}

function trunc(s: string, max = 34): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
