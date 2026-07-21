import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * Extracción de audio desde vídeo — 100% en el navegador con FFmpeg.wasm.
 *
 * PRIVACIDAD: el binario WebAssembly se descarga una vez (y queda en caché),
 * pero TODO el procesamiento ocurre en la máquina del usuario. Los archivos de
 * vídeo/audio NUNCA se suben a ningún servidor.
 *
 * Usamos el core mono-hilo por máxima compatibilidad (no exige
 * SharedArrayBuffer). Si el sitio se sirve con cross-origin isolation
 * (ver vite.config.ts), puedes cambiar a "@ffmpeg/core-mt" para más velocidad.
 *
 * Para un despliegue totalmente offline, copia los ficheros del core a
 * /public/ffmpeg y ajusta CORE_BASE_URL a una ruta local.
 */
const CORE_VERSION = '0.12.6';
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

const VIDEO_EXT = /\.(mp4|mov|mkv|webm|avi|m4v|3gp|flv|wmv|mpg|mpeg|ts)$/i;

/** Heurística para decidir si un File es vídeo. */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
}

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/** Carga (perezosa y una sola vez) la instancia de FFmpeg.wasm. */
export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Extrae la pista de audio de un archivo de vídeo y la devuelve como MP3 Blob.
 *
 * @param file        Archivo de vídeo (MP4, MOV, MKV, WEBM…).
 * @param onProgress  Progreso 0..1.
 * @param bitrateKbps Bitrate del MP3 de salida (192 kbps por defecto).
 */
export async function extractAudioFromVideo(
  file: File,
  onProgress?: (ratio: number) => void,
  bitrateKbps = 192,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ffmpeg.on('progress', progressHandler);

  const inputName = 'input' + (file.name.match(/\.[^.]+$/)?.[0] ?? '.mp4');
  const outputName = 'output.mp3';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    // -vn: descartar vídeo · libmp3lame: encoder MP3 · -b:a: bitrate
    await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-acodec', 'libmp3lame',
      '-b:a', `${bitrateKbps}k`,
      outputName,
    ]);
    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    return new Blob([data as BlobPart], { type: 'audio/mpeg' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    // Limpiar el FS virtual para no acumular memoria entre extracciones.
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

/**
 * Convierte un Blob de audio (p. ej. la grabación webm/opus del máster) a MP3.
 * Útil para descargar los mixes en un formato universal.
 */
export async function toMp3(input: Blob, bitrateKbps = 256): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const inputName = 'rec-input';
  const outputName = 'rec-output.mp3';
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(input));
    await ffmpeg.exec(['-i', inputName, '-acodec', 'libmp3lame', '-b:a', `${bitrateKbps}k`, outputName]);
    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    return new Blob([data as BlobPart], { type: 'audio/mpeg' });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}
