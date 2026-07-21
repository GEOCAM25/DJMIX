export {};

declare global {
  interface Window {
    /** Callback global que invoca la IFrame Player API de YouTube al cargar. */
    onYouTubeIframeAPIReady?: () => void;
  }
}
