import { whenYouTubeApiReady } from '../media/youtube';

export interface YouTubeDeckCallbacks {
  onReady?: (duration: number) => void;
  onStateChange?: (playing: boolean) => void;
  onEnded?: () => void;
}

/**
 * Deck respaldado por el reproductor oficial de YouTube (IFrame Player API).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ IMPORTANTE — barrera cross-origin:                                        │
 * │ El audio del iframe de YouTube NO se puede capturar ni enrutar por Web    │
 * │ Audio API (política de origen cruzado). Por eso este deck NO tiene EQ,    │
 * │ efectos ni entra en la grabación del máster de Web Audio. El "mezclado"   │
 * │ con este deck se hace por VOLUMEN (setVolume) para el crossfader.         │
 * │                                                                           │
 * │ A cambio, al usar el reproductor oficial se respeta la sesión del         │
 * │ usuario: si tiene YouTube Premium, la reproducción es SIN ANUNCIOS.       │
 * │ Ver README para la estrategia completa (incl. grabar con getDisplayMedia).│
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export class YouTubeDeck {
  private player: YT.Player | null = null;
  private ready = false;
  private _playing = false;

  constructor(
    private readonly elementId: string,
    private readonly cb: YouTubeDeckCallbacks = {},
  ) {}

  /** Crea el reproductor sobre el elemento indicado. Idempotente. */
  async init(): Promise<void> {
    if (this.player) return;
    await whenYouTubeApiReady();
    await new Promise<void>((resolve) => {
      this.player = new YT.Player(this.elementId, {
        height: '100%',
        width: '100%',
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this.ready = true;
            resolve();
          },
          onStateChange: (e) => this.handleStateChange(e),
        },
      });
    });
  }

  private handleStateChange(e: YT.OnStateChangeEvent): void {
    const S = YT.PlayerState;
    if (e.data === S.PLAYING) {
      this._playing = true;
      this.cb.onStateChange?.(true);
      this.cb.onReady?.(this.duration);
    } else if (e.data === S.PAUSED) {
      this._playing = false;
      this.cb.onStateChange?.(false);
    } else if (e.data === S.ENDED) {
      this._playing = false;
      this.cb.onStateChange?.(false);
      this.cb.onEnded?.();
    }
  }

  /** Carga un vídeo por su ID (sin reproducir automáticamente). */
  load(videoId: string): void {
    if (!this.ready || !this.player) return;
    this.player.cueVideoById(videoId);
  }

  play(): void {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  togglePlay(): void {
    this._playing ? this.pause() : this.play();
  }

  seek(seconds: number): void {
    this.player?.seekTo(Math.max(0, seconds), true);
  }

  /**
   * Volumen 0..1 (para el crossfader). YouTube trabaja en 0..100.
   * Este es el único punto de "mezcla" posible para un deck de YouTube.
   */
  setVolume(gain0to1: number): void {
    this.player?.setVolume(Math.round(Math.max(0, Math.min(1, gain0to1)) * 100));
  }

  /**
   * Tempo limitado: YouTube solo admite un conjunto discreto de velocidades
   * (típicamente 0.25, 0.5, 1, 1.5, 2). Elegimos la más cercana admitida.
   * No sirve para beatmatching fino; ver README para la explicación.
   */
  setTempoPercent(percent: number): void {
    if (!this.player) return;
    const desired = 1 + percent / 100;
    const allowed = this.player.getAvailablePlaybackRates?.() ?? [1];
    const nearest = allowed.reduce((a, b) =>
      Math.abs(b - desired) < Math.abs(a - desired) ? b : a,
    );
    this.player.setPlaybackRate(nearest);
  }

  get playing(): boolean {
    return this._playing;
  }

  get position(): number {
    return this.player?.getCurrentTime?.() ?? 0;
  }

  get duration(): number {
    return this.player?.getDuration?.() ?? 0;
  }

  dispose(): void {
    this.player?.destroy();
    this.player = null;
    this.ready = false;
  }
}
