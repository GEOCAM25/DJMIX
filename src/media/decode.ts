import { extractAudioFromVideo, isVideoFile } from './ffmpeg';

/** Extensiones de audio que el navegador suele decodificar de forma nativa. */
const NATIVE_AUDIO = /\.(mp3|wav|flac|ogg|oga|m4a|aac|opus|weba)$/i;

export interface DecodedAudio {
  buffer: AudioBuffer;
  /** Nombre "limpio" para mostrar (sin extensión). */
  title: string;
  /** Blob del audio original/extraído, para persistir en IndexedDB. */
  sourceBlob: Blob;
}

/**
 * Convierte un File (audio o vídeo) en un AudioBuffer listo para el deck.
 *
 * Flujo:
 *   1. Si es vídeo (MP4/MOV/…), se extrae el audio con FFmpeg.wasm (local).
 *   2. Se decodifica el resultado con AudioContext.decodeAudioData.
 *
 * FLAC/WAV/OGG/MP3 los decodifica el navegador directamente. Algunos códecs
 * poco comunes también se derivan a FFmpeg como plan B.
 */
export async function decodeFileToAudio(
  ctx: BaseAudioContext,
  file: File,
  onProgress?: (ratio: number, stage: string) => void,
): Promise<DecodedAudio> {
  let audioBlob: Blob = file;
  const title = file.name.replace(/\.[^.]+$/, '');

  if (isVideoFile(file)) {
    onProgress?.(0, 'Extrayendo audio del vídeo…');
    audioBlob = await extractAudioFromVideo(file, (r) => onProgress?.(r, 'Extrayendo audio…'));
  } else if (!NATIVE_AUDIO.test(file.name) && !file.type.startsWith('audio/')) {
    // Tipo desconocido: intentar via FFmpeg como conversión de seguridad.
    onProgress?.(0, 'Convirtiendo audio…');
    audioBlob = await extractAudioFromVideo(file, (r) => onProgress?.(r, 'Convirtiendo…'));
  }

  onProgress?.(0.9, 'Decodificando…');
  const arrayBuffer = await audioBlob.arrayBuffer();
  // decodeAudioData consume el ArrayBuffer; pasamos una copia para poder
  // conservar el blob original de cara a IndexedDB.
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  onProgress?.(1, 'Listo');

  return { buffer, title, sourceBlob: audioBlob };
}
