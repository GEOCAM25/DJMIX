/**
 * Pitch-shifter granular genérico (estéreo) para el "Key Lock" de los decks.
 * Desplaza el tono por un factor `pitch` (ratio) SIN cambiar la duración, con
 * dos granos solapados (ventanas Hann que suman 1). Cuando pitch = 1 es casi
 * transparente (paso con un pequeño retardo).
 *
 * Uso en Key Lock: el deck reproduce a varispeed (rate = tempo). Poniendo
 * pitch = 1/rate, el tono resultante vuelve al original y el tempo se mantiene.
 */
class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.sr = sampleRate;
    this.bufSize = 16384;
    this.mask = this.bufSize - 1;
    this.grain = Math.floor(this.sr * 0.03); // ~30 ms
    this.channels = [];
  }

  ensureChannels(n) {
    while (this.channels.length < n) {
      this.channels.push({ buf: new Float32Array(this.bufSize), writeIndex: 0, phase: 0 });
    }
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const nCh = output.length;
    this.ensureChannels(nCh);

    const ratio = params.pitch[0];
    const grain = this.grain;
    const half = grain / 2;
    const TWO_PI = Math.PI * 2;
    const transparent = Math.abs(ratio - 1) < 1e-4;

    for (let ch = 0; ch < nCh; ch++) {
      const inCh = input && input[ch] ? input[ch] : null;
      const outCh = output[ch];
      const state = this.channels[ch];
      const buf = state.buf;
      const len = outCh.length;

      for (let i = 0; i < len; i++) {
        const s = inCh ? inCh[i] : 0;
        buf[state.writeIndex] = s;

        if (transparent) {
          outCh[i] = s;
        } else {
          state.phase += ratio - 1;
          while (state.phase >= grain) state.phase -= grain;
          while (state.phase < 0) state.phase += grain;
          const d1 = state.phase;
          let d2 = state.phase + half;
          if (d2 >= grain) d2 -= grain;
          const w1 = 0.5 - 0.5 * Math.cos((TWO_PI * d1) / grain);
          const w2 = 0.5 - 0.5 * Math.cos((TWO_PI * d2) / grain);
          outCh[i] = this.sampleAt(buf, state.writeIndex - grain + d1) * w1 + this.sampleAt(buf, state.writeIndex - grain + d2) * w2;
        }

        state.writeIndex = (state.writeIndex + 1) & this.mask;
      }
    }
    return true;
  }

  sampleAt(buf, pos) {
    let p = pos % this.bufSize;
    if (p < 0) p += this.bufSize;
    const i0 = Math.floor(p);
    const i1 = (i0 + 1) & this.mask;
    const frac = p - i0;
    return buf[i0] * (1 - frac) + buf[i1] * frac;
  }
}

registerProcessor('pitchshift-processor', PitchShiftProcessor);
