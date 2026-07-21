/**
 * Bus de PRE-ESCUCHA (PFL / "Cue" de audífonos).
 *
 * Permite monitorear uno o varios decks por una SALIDA DE AUDIO SECUNDARIA
 * (audífonos), de forma INDEPENDIENTE del crossfader y del máster: mientras la
 * mezcla final sale por los parlantes (ctx.destination), el DJ escucha en los
 * audífonos el deck que quiere preparar.
 *
 *   deck.output ─▶ cueGain (por deck) ─▶ CueBus.input ─▶ MediaStreamDestination
 *                                                              │ .stream
 *                                                        <audio> element
 *                                                              │ setSinkId(audífonos)
 *                                                              ▼  salida secundaria
 *
 * ¿Por qué un <audio> con setSinkId y no AudioContext.setSinkId()?
 *   - AudioContext.setSinkId() movería TODO el máster a otra salida.
 *   - HTMLMediaElement.setSinkId() abre una SEGUNDA salida simultánea sin tocar
 *     la principal. Es la técnica compatible y estándar para pre-cueing en web.
 *
 * Limitación: solo decks LOCALES (Web Audio). El audio de YouTube es
 * cross-origin y no puede enrutarse por este bus.
 */

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

/** HTMLMediaElement con la API de "Audio Output Devices" (setSinkId). */
type MediaElementWithSink = HTMLMediaElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
  sinkId?: string;
};

export class CueBus {
  /** Entrada del bus: aquí conectan los cueGain de cada canal. */
  readonly input: GainNode;

  private readonly dest: MediaStreamAudioDestinationNode;
  private readonly el: MediaElementWithSink;
  private activeCount = 0;
  private _sinkId = '';

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain();
    this.dest = ctx.createMediaStreamDestination();
    this.input.connect(this.dest);

    // Elemento de audio "oculto" que reproduce el stream de cue por la salida
    // secundaria. No se adjunta al DOM; setSinkId funciona igualmente.
    this.el = new Audio() as MediaElementWithSink;
    this.el.srcObject = this.dest.stream;
    this.el.autoplay = false;
    this.el.volume = 0.9;
  }

  /** ¿El navegador permite elegir la salida de audio del elemento? */
  get canRouteOutput(): boolean {
    return typeof this.el.setSinkId === 'function';
  }

  get sinkId(): string {
    return this._sinkId;
  }

  /** Rutea la pre-escucha a un dispositivo concreto (deviceId de audífonos). */
  async setSinkId(deviceId: string): Promise<void> {
    if (typeof this.el.setSinkId !== 'function') {
      throw new Error('Este navegador no permite elegir la salida de audio (setSinkId).');
    }
    await this.el.setSinkId(deviceId);
    this._sinkId = deviceId;
  }

  /** Nivel de los audífonos (0..1), independiente del máster. */
  setVolume(v: number): void {
    this.el.volume = Math.max(0, Math.min(1, v));
  }

  get volume(): number {
    return this.el.volume;
  }

  /**
   * Notifica cuántos decks están en pre-escucha. Arranca o pausa el elemento
   * de audio (no tiene sentido reproducir un stream cuando nadie escucha).
   */
  notifyActive(count: number): void {
    this.activeCount = count;
    if (count > 0) {
      void this.el.play().catch(() => {
        /* la política de autoplay ya se cumplió al arrancar el motor */
      });
    } else {
      this.el.pause();
    }
  }

  get activeDecks(): number {
    return this.activeCount;
  }

  dispose(): void {
    this.el.pause();
    this.el.srcObject = null;
    this.input.disconnect();
  }
}

/** Lista los dispositivos de salida de audio disponibles. */
export async function listAudioOutputs(): Promise<AudioOutputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audiooutput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Salida ${i + 1}` }));
}

/**
 * Selector NATIVO de salida (Chrome/Edge: navigator.mediaDevices.selectAudioOutput).
 * Devuelve el dispositivo elegido —e implica permiso para rutear a él—, o null
 * si el navegador no ofrece este diálogo (entonces se usa el <select> manual).
 */
export async function promptSelectOutput(): Promise<AudioOutputDevice | null> {
  const md = navigator.mediaDevices as MediaDevices & {
    selectAudioOutput?: () => Promise<MediaDeviceInfo>;
  };
  if (typeof md.selectAudioOutput !== 'function') return null;
  const info = await md.selectAudioOutput();
  return { deviceId: info.deviceId, label: info.label || 'Audífonos' };
}
