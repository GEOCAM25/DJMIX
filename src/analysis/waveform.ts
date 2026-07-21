/**
 * Extracción de picos para dibujar la forma de onda del deck.
 * Reduce millones de muestras a unos cientos de "bins" (máximo por bloque),
 * lo que hace el render en canvas barato y evita saturar memoria/CPU.
 */
export function extractPeaks(buffer: AudioBuffer, bins = 1000): Float32Array {
  const data = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / bins));
  const peaks = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    const start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(data[start + j] || 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  // Normalizar para aprovechar todo el alto del canvas.
  const globalMax = peaks.reduce((m, v) => Math.max(m, v), 1e-6);
  for (let i = 0; i < bins; i++) peaks[i] /= globalMax;
  return peaks;
}
