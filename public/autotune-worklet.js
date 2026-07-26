/**
 * Auto-Tune (corrección de tono) para la voz en vivo. AudioWorkletProcessor
 * autocontenido (sin imports): detecta el tono por autocorrelación, lo ajusta a
 * la nota más cercana de la ESCALA elegida (cromática / mayor / menor en el tono
 * seleccionado) y desplaza el tono en tiempo real con un pitch-shifter granular
 * de 2 granos (ventanas Hann que suman 1).
 *
 * Params:
 *   enabled  (0/1)    — pasa la voz seca si está en 0.
 *   strength (0..1)   — cuánta corrección aplicar (1 = pega del todo a la nota).
 *   speed    (0..1)   — velocidad de retune: 0 = lento/natural, 1 = instantáneo
 *                       (efecto duro/robótico tipo T-Pain).
 *   key      (0..11)  — tónica de la escala (0 = Do … 11 = Si).
 *   scale    (0/1/2)  — 0 cromática · 1 mayor · 2 menor natural.
 */
class AutotuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'strength', defaultValue: 0.9, minValue: 0, maxValue: 1 },
      { name: 'speed', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'key', defaultValue: 0, minValue: 0, maxValue: 11 },
      { name: 'scale', defaultValue: 0, minValue: 0, maxValue: 2 },
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
    this.glide = 0.0025; // suavizado del ratio por muestra (se ajusta con strength)

    // Detección de tono
    this.winLen = 1024;
    this.minLag = Math.floor(this.sr / 1000); // ~1 kHz máx
    this.maxLag = Math.floor(this.sr / 80); // ~80 Hz mín
    this.x = new Float32Array(this.winLen);
    this.corr = new Float32Array(this.maxLag + 2);
    this.detectCounter = 0;
    this.detectInterval = 1536; // ~32 ms @48k: más responsivo que 2048

    // Grados de cada escala (clases de altura 0..11 respecto a la tónica).
    // [cromática (todas), mayor, menor natural]
    this.scaleDegrees = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      [0, 2, 4, 5, 7, 9, 11],
      [0, 2, 3, 5, 7, 8, 10],
    ];
    this.lastConfidentRatio = 1; // se conserva en pasajes poco tonales
  }

  /** MIDI más cercano a `midiFloat` que pertenezca a la escala (tónica `key`). */
  snapToScale(midiFloat, key, scaleIdx) {
    const degrees = this.scaleDegrees[scaleIdx] || this.scaleDegrees[0];
    if (degrees.length === 12) return Math.round(midiFloat); // cromática
    let best = Math.round(midiFloat);
    let bestDist = Infinity;
    const from = Math.floor(midiFloat) - 2;
    const to = Math.ceil(midiFloat) + 2;
    for (let m = from; m <= to; m++) {
      const pc = (((m - key) % 12) + 12) % 12;
      let inScale = false;
      for (let d = 0; d < degrees.length; d++) {
        if (degrees[d] === pc) {
          inScale = true;
          break;
        }
      }
      if (!inScale) continue;
      const dist = Math.abs(m - midiFloat);
      if (dist < bestDist) {
        bestDist = dist;
        best = m;
      }
    }
    return best;
  }

  sampleAt(pos) {
    let p = pos % this.bufSize;
    if (p < 0) p += this.bufSize;
    const i0 = Math.floor(p);
    const i1 = (i0 + 1) & this.mask;
    const frac = p - i0;
    return this.buf[i0] * (1 - frac) + this.buf[i1] * frac;
  }

  detect(strength, key, scaleIdx) {
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
      this.lastConfidentRatio = 1;
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

    // Confianza baja (consonante/ruido): mantener la última corrección tonal en
    // lugar de saltar de golpe a "sin corregir" (evita clics y desafinaciones).
    if (bestLag < 1 || best < 0.25) {
      this.targetRatio = this.lastConfidentRatio;
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
    // Nota objetivo: la más cercana DENTRO de la escala elegida.
    const midiFloat = 69 + 12 * Math.log2(freq / 440);
    const targetMidi = this.snapToScale(midiFloat, key | 0, scaleIdx | 0);
    const targetFreq = 440 * Math.pow(2, (targetMidi - 69) / 12);
    let r = targetFreq / freq;
    r = Math.max(0.7, Math.min(1.4, r)); // corrige solo desviaciones moderadas
    const ratio = 1 + (r - 1) * strength;
    this.targetRatio = ratio;
    if (best > 0.45) this.lastConfidentRatio = ratio; // memoria solo si es fiable
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
    const speed = params.speed[params.speed.length - 1];
    const key = params.key[params.key.length - 1];
    const scaleIdx = params.scale[params.scale.length - 1];
    const grain = this.grain;
    const half = grain / 2;
    const TWO_PI = Math.PI * 2;

    // Velocidad de retune independiente de la intensidad: 0 = glide lento/natural,
    // 1 = casi instantáneo (agarre duro/robótico tipo T-Pain).
    this.glide = 0.0012 + speed * speed * 0.05;

    for (let i = 0; i < input.length; i++) {
      this.buf[this.writeIndex] = input[i];

      if (++this.detectCounter >= this.detectInterval) {
        this.detectCounter = 0;
        if (enabled) this.detect(strength, key, scaleIdx);
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
