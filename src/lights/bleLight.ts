/**
 * Driver Web Bluetooth para bombillas RGB genéricas (protocolo tipo
 * ELK-BLEDOM / Triones, muy común en tiras y bombillas baratas).
 *
 * Servicio 0xFFD5, característica de escritura 0xFFD9; el color se envía con el
 * paquete [0x56, R, G, B, 0x00, 0xF0, 0xAA]. Es "best-effort": si el navegador
 * no soporta Web Bluetooth o el dispositivo usa otro protocolo, se informa y la
 * app sigue funcionando con el preview en pantalla.
 */
const SERVICE = 0xffd5;
const CHARACTERISTIC = 0xffd9;

export function bluetoothLightSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export class BleLight {
  private constructor(
    private readonly device: BluetoothDevice,
    private readonly characteristic: BluetoothRemoteGATTCharacteristic,
  ) {}

  get name(): string {
    return this.device.name || 'Luz BLE';
  }

  get connected(): boolean {
    return this.device.gatt?.connected ?? false;
  }

  /** Abre el selector del navegador y conecta con la bombilla. */
  static async connect(): Promise<BleLight> {
    if (!bluetoothLightSupported()) {
      throw new Error('Este navegador no soporta Web Bluetooth (usa Chrome/Edge de escritorio o Android).');
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }],
      optionalServices: [SERVICE],
    });
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE);
    const characteristic = await service.getCharacteristic(CHARACTERISTIC);
    return new BleLight(device, characteristic);
  }

  /** Envía un color RGB (0..255) a la bombilla. */
  async setColor(r: number, g: number, b: number): Promise<void> {
    if (!this.connected) return;
    const packet = new Uint8Array([0x56, r & 0xff, g & 0xff, b & 0xff, 0x00, 0xf0, 0xaa]);
    try {
      await this.characteristic.writeValueWithoutResponse(packet);
    } catch {
      /* algunos dispositivos solo aceptan writeValue */
      try {
        await this.characteristic.writeValue(packet);
      } catch {
        /* fallo de escritura; se ignora este fotograma */
      }
    }
  }

  disconnect(): void {
    try {
      this.device.gatt?.disconnect();
    } catch {
      /* noop */
    }
  }
}
