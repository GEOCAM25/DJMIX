/**
 * Locutor IA (texto a voz) con la Web Speech API del navegador (speechSynthesis).
 * Usa las voces del sistema/navegador: es 100% local y gratis, sin servidor.
 *
 * Nota técnica: speechSynthesis reproduce directamente por la salida del
 * dispositivo y NO se puede enrutar por Web Audio, así que estos efectos de voz
 * del micrófono no se le aplican. Para GRABAR lo que dice, usa el modo "Pestaña"
 * de la grabación (captura todo el audio de la pestaña, incluida esta voz).
 */

export interface SpeakOptions {
  voiceName?: string;
  rate?: number; // 0.1..2 (velocidad)
  pitch?: number; // 0..2 (tono)
  volume?: number; // 0..1
  onend?: () => void;
  onerror?: () => void;
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** Voces disponibles (puede llegar vacío hasta que el navegador las cargue). */
export function getVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** Suscribe a la carga asíncrona de voces; devuelve la función para desuscribir. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!ttsSupported()) return () => {};
  const synth = window.speechSynthesis;
  const handler = () => cb();
  synth.addEventListener('voiceschanged', handler);
  return () => synth.removeEventListener('voiceschanged', handler);
}

/** Dice un texto con la voz y ajustes indicados. Cancela lo que estuviera diciendo. */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!ttsSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (opts.voiceName) {
    const v = getVoices().find((x) => x.name === opts.voiceName);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
  }
  u.rate = Math.max(0.1, Math.min(2, opts.rate ?? 1));
  u.pitch = Math.max(0, Math.min(2, opts.pitch ?? 1));
  u.volume = Math.max(0, Math.min(1, opts.volume ?? 1));
  if (opts.onend) u.onend = opts.onend;
  if (opts.onerror) u.onerror = opts.onerror;
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
