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
}
