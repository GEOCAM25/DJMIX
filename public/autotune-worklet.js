/**
 * Auto-Tune (corrección de tono) para la voz en vivo. AudioWorkletProcessor
 * autocontenido (sin imports): detecta el tono por autocorrelación, lo ajusta a
 * la nota más cercana de la escala cromática y desplaza el tono en tiempo real
 * con un pitch-shifter granular de 2 granos (ventanas Hann que suman 1).
 *
 * Params:
 *   enabled  (0/1)   — pasa la voz seca si está en 0.
 *   strength (0..1)  — cuánta corrección aplicar (1 = "duro" tipo T-Pain).
 */
class AutotuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'strength', defaultValue: 0.9, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    this.sr = sampleRate;
    this.bufSize = 16384;
    this.mask = this.bufSize - 1;
    this.buf = new Float32Array(this.bufSize);
    this.writeIndex = 0;

    this.grain = Math.floor(this.sr * 0.03); // ~30 ms
    this.phase = 0;
    this.ratio = 1;
    this.targetRatio = 1;
    this.glide = 0.0025; // suavizado del ratio por muestra

    // Detección de tono
    this.winLen = 1024;
    this.minLag = Math.floor(this.sr / 1000); // ~1 kHz máx
    this.maxLag = Math.floor(this.sr / 80); // ~80 Hz mín
    this.x = new Float32Array(this.winLen);
    this.corr = new Float32Array(this.maxLag + 2);
    this.detectCounter = 0;
    this.detectInterval = 2048;
  }

  sampleAt(pos) {
    let p = pos % this.bufSize;
    if (p < 0) p += this.bufSize;
    const i0 = Math.floor(p);
    const i1 = (i0 + 1) & this.mask;
    const frac = p - i0;
    return this.buf[i0] * (1 - frac) + this.buf[i1] * frac;
  }

  detect(strength) {
    const { winLen, minLag, maxLag, x, corr, buf, mask, writeIndex, sr } = this;
    // Copiar la última ventana y quitar la media (DC).
    let mean = 0;
    for (let k = 0; k < winLen; k++) {
      const v = buf[(writeIndex - winLen + k) & mask];
      x[k] = v;
      mean += v;
    }
    mean /= winLen;
    let e0 = 0;
    for (let k = 0; k < winLen; k++) {
      x[k] -= mean;
      e0 += x[k] * x[k];
    }
    if (e0 < 1e-4) {
      this.targetRatio = 1; // silencio → no corregir
      return;
    }

    let best = 0;
    let bestLag = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0;
      const n = winLen - lag;
      for (let k = 0; k < n; k++) c += x[k] * x[k + lag];
      corr[lag] = c;
      const val = c / e0;
      if (val > best) {
        best = val;
        bestLag = lag;
      }
    }

    if (bestLag < 1 || best < 0.3) {
      this.targetRatio = 1;
      return;
    }

    // Interpolación parabólica para un lag sub-muestra (tono preciso).
    let lagInterp = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const y1 = corr[bestLag - 1];
      const y2 = corr[bestLag];
      const y3 = corr[bestLag + 1];
      const denom = y1 - 2 * y2 + y3;
      if (Math.abs(denom) > 1e-9) lagInterp = bestLag + (0.5 * (y1 - y3)) / denom;
    }

    const freq = sr / lagInterp;
    // Nota más cercana (cromática).
    const midi = 69 + 12 * Math.log2(freq / 440);
    const target = 440 * Math.pow(2, (Math.round(midi) - 69) / 12);
    let r = target / freq;
    r = Math.max(0.7, Math.min(1.4, r)); // corrige solo desviaciones moderadas
    this.targetRatio = 1 + (r - 1) * strength;
  }

  process(inputs, outputs, params) {
    const input = inputs[0][0];
    const output = outputs[0][0];
    if (!output) return true;
    if (!input) {
      output.fill(0);
      return true;
    }

    const enabled = params.enabled[params.enabled.length - 1] > 0.5;
    const strength = params.strength[params.strength.length - 1];
    const grain = this.grain;
    const half = grain / 2;
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < input.length; i++) {
      this.buf[this.writeIndex] = input[i];

      if (++this.detectCounter >= this.detectInterval) {
        this.detectCounter = 0;
        if (enabled) this.detect(strength);
        else this.targetRatio = 1;
      }

      if (enabled) {
        this.phase += this.ratio - 1;
        while (this.phase >= grain) this.phase -= grain;
        while (this.phase < 0) this.phase += grain;
        const d1 = this.phase;
        let d2 = this.phase + half;
        if (d2 >= grain) d2 -= grain;
        const w1 = 0.5 - 0.5 * Math.cos((TWO_PI * d1) / grain);
        const w2 = 0.5 - 0.5 * Math.cos((TWO_PI * d2) / grain);
        const p1 = this.writeIndex - grain + d1;
        const p2 = this.writeIndex - grain + d2;
        output[i] = this.sampleAt(p1) * w1 + this.sampleAt(p2) * w2;
      } else {
        output[i] = input[i];
      }

      this.ratio += (this.targetRatio - this.ratio) * this.glide;
      this.writeIndex = (this.writeIndex + 1) & this.mask;
    }
    return true;
  }
}

registerProcessor('autotune-processor', AutotuneProcessor);
