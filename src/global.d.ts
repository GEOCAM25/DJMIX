export {};

declare global {
  interface Window {
    /** Callback global que invoca la IFrame Player API de YouTube al cargar. */
    onYouTubeIframeAPIReady?: () => void;
  }

  /** Evento (no estándar en lib.dom) para instalar la PWA. */
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }

  /**
   * Tipos mínimos de Web Bluetooth (no vienen en lib.dom). Solo lo que usa el
   * driver de luces BLE: pedir dispositivo, conectar GATT y escribir el color.
   */
  interface BluetoothRemoteGATTCharacteristic {
    writeValue(value: BufferSource): Promise<void>;
    writeValueWithoutResponse(value: BufferSource): Promise<void>;
  }
  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: number | string): Promise<BluetoothRemoteGATTCharacteristic>;
  }
  interface BluetoothRemoteGATTServer {
    readonly connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: number | string): Promise<BluetoothRemoteGATTService>;
  }
  interface BluetoothDevice {
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
  }
  interface RequestDeviceOptions {
    filters?: Array<{ services?: Array<number | string>; name?: string; namePrefix?: string }>;
    optionalServices?: Array<number | string>;
    acceptAllDevices?: boolean;
  }
  interface Bluetooth {
    requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    getAvailability(): Promise<boolean>;
  }
  interface Navigator {
    readonly bluetooth: Bluetooth;
  }
}
