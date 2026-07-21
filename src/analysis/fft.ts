/**
 * FFT radix-2 iterativa (in-place). Entrada real de longitud potencia de 2.
 * Devuelve las magnitudes del espectro (mitad útil por simetría).
 * Reutilizable por las ondas inteligentes y otros análisis DSP.
 */
export function fftMagnitudes(input: Float32Array): Float32Array {
  const n = input.length;
  const re = Float32Array.from(input);
  const im = new Float32Array(n);

  // Permutación por inversión de bits.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Mariposas.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k;
        const b = a + (len >> 1);
        const tr = cwr * re[b] - cwi * im[b];
        const ti = cwr * im[b] + cwi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
      }
    }
  }

  const mag = new Float32Array(n >> 1);
  for (let i = 0; i < n >> 1; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}
