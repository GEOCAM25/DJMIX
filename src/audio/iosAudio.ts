/**
 * Hace que el audio suene aunque el teléfono esté en SILENCIO/VIBRAR.
 *
 * En iOS, por defecto el Web Audio (AudioContext) respeta el interruptor de
 * silencio del timbre, así que el secuenciador, el sampler y los efectos no se
 * oyen si el móvil está en vibrar. Se corrige declarando la sesión de audio como
 * "playback" (contenido multimedia que debe ignorar el interruptor de silencio):
 *
 *   1) Web Audio Session API (Safari 16.4+): navigator.audioSession.type =
 *      'playback'.
 *   2) Respaldo universal: reproducir un <audio> silencioso en bucle (gesto del
 *      usuario) que mantiene la sesión de iOS en modo "playback".
 *
 * En Android/escritorio no hace daño (el audio ya suena en cualquier modo).
 */

interface AudioSessionLike {
  type: string;
}

let silentEl: HTMLAudioElement | null = null;
let configured = false;

function getAudioSession(): AudioSessionLike | undefined {
  return (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;
}

/** Genera un data-URI WAV de 1 s de silencio (mono, 8 kHz) para el respaldo. */
function makeSilentWavDataUri(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1 segundo
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * bytesPerSample, true);
  dv.setUint16(32, bytesPerSample, true);
  dv.setUint16(34, 16, true); // bits por muestra
  writeStr(36, 'data');
  dv.setUint32(40, dataSize, true);
  // Las muestras quedan en 0 (silencio).
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

/**
 * Debe llamarse dentro del gesto del usuario (al entrar al estudio). Configura la
 * sesión de audio para que suene en silencio/vibrar.
 */
export function enablePlaybackAudio(): void {
  const session = getAudioSession();
  if (session) {
    try {
      session.type = 'playback';
    } catch {
      /* algunos navegadores no permiten asignarlo */
    }
  }

  try {
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.setAttribute('playsinline', '');
      (silentEl as HTMLAudioElement & { webkitPlaysInline?: boolean }).webkitPlaysInline = true;
      silentEl.loop = true;
      silentEl.preload = 'auto';
      silentEl.src = makeSilentWavDataUri();
      silentEl.volume = 0.02;
      silentEl.hidden = true;
      // iOS reconoce mejor la sesión de medios si el elemento está en el DOM.
      document.body.appendChild(silentEl);
    }
    void silentEl.play().catch(() => {});
  } catch {
    /* ignora: el modo playback ya se intentó con la API de sesión */
  }
  configured = true;
}

/** Re-afirma el modo playback al volver a la app (iOS puede reiniciar la sesión). */
export function reassertPlaybackAudio(): void {
  if (!configured) return;
  const session = getAudioSession();
  if (session) {
    try {
      session.type = 'playback';
    } catch {
      /* noop */
    }
  }
  if (silentEl && silentEl.paused) void silentEl.play().catch(() => {});
}
