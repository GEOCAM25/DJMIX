/**
 * Soporte de controladores MIDI (Web MIDI API).
 *
 * Escucha los mensajes Control Change (CC) y Note On/Off de cualquier
 * controlador conectado por USB y los entrega normalizados (valor 0..1). El
 * mapeo CC→acción y el "MIDI Learn" viven en el store, para poder controlar
 * crossfader, pitch, play/pausa, EQ, etc. en tiempo real.
 */
export interface MidiMessage {
  kind: 'cc' | 'note';
  control: number; // nº de CC o de nota
  value: number; // 0..1
  channel: number; // 0..15
}

/** Parsea 3 bytes MIDI a un mensaje normalizado (función pura, testeable). */
export function parseMidiMessage(data: Uint8Array | number[]): MidiMessage | null {
  if (!data || data.length < 2) return null;
  const status = data[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const d1 = data[1];
  const d2 = data.length > 2 ? data[2] : 0;
  if (type === 0xb0) return { kind: 'cc', control: d1, value: d2 / 127, channel };
  if (type === 0x90) return { kind: 'note', control: d1, value: d2 / 127, channel }; // note on
  if (type === 0x80) return { kind: 'note', control: d1, value: 0, channel }; // note off
  return null;
}

export class MidiController {
  private access: MIDIAccess | null = null;
  private onMessage: (m: MidiMessage) => void = () => {};
  private onInputs: (names: string[]) => void = () => {};
  inputs: string[] = [];

  get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  /**
   * Solicita acceso MIDI y se suscribe a todas las entradas.
   * @param onMessage callback por cada mensaje CC/nota (valor 0..1).
   * @param onInputs  callback con la lista de nombres de entradas (hot-plug).
   */
  async init(onMessage: (m: MidiMessage) => void, onInputs?: (names: string[]) => void): Promise<boolean> {
    if (!this.supported || !navigator.requestMIDIAccess) return false;
    this.onMessage = onMessage;
    if (onInputs) this.onInputs = onInputs;
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.attachAll();
    this.access.onstatechange = () => this.attachAll();
    return true;
  }

  private attachAll(): void {
    if (!this.access) return;
    const names: string[] = [];
    this.access.inputs.forEach((input) => {
      names.push(input.name || 'MIDI');
      input.onmidimessage = (e: MIDIMessageEvent) => {
        if (!e.data) return; // lib.dom tipa data como nullable
        const msg = parseMidiMessage(e.data);
        if (msg) this.onMessage(msg);
      };
    });
    this.inputs = names;
    this.onInputs(names);
  }

  dispose(): void {
    if (this.access) this.access.inputs.forEach((i) => (i.onmidimessage = null));
    this.access = null;
  }
}
