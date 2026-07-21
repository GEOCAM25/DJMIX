import type { SamplePad } from './Sampler';

/**
 * Genera samples de batería/FX SINTÉTICOS directamente en AudioBuffers.
 *
 * Así el sampler funciona sin descargar ningún archivo (100% offline y libre
 * de derechos). El usuario puede además cargar sus propios samples en los pads.
 */
function noise(data: Float32Array, decay: number) {
  const sr = 44100;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay);
  }
}

export function createDrumSamples(ctx: BaseAudioContext): SamplePad[] {
  const sr = ctx.sampleRate;
  const mk = (seconds: number) => ctx.createBuffer(1, Math.floor(sr * seconds), sr);

  // Kick: seno con caída de tono + envolvente rápida.
  const kick = mk(0.5);
  {
    const d = kick.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const f = 40 + 120 * Math.exp(-t * 30);
      phase += (2 * Math.PI * f) / sr;
      d[i] = Math.sin(phase) * Math.exp(-t * 8);
    }
  }

  // Snare: ruido + tono medio.
  const snare = mk(0.35);
  {
    const d = snare.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = ((Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 180 * t) * 0.3) * Math.exp(-t * 18);
    }
  }

  // HiHat: ruido muy corto y agudo.
  const hat = mk(0.12);
  {
    const d = hat.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 90);
    }
  }

  // Clap: tres ráfagas de ruido.
  const clap = mk(0.3);
  {
    const d = clap.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const burst = Math.exp(-((t - 0.0) ** 2) * 4000) + Math.exp(-((t - 0.02) ** 2) * 4000) + Math.exp(-((t - 0.04) ** 2) * 3000);
      d[i] = (Math.random() * 2 - 1) * burst * Math.exp(-t * 6);
    }
  }

  // Tom.
  const tom = mk(0.4);
  {
    const d = tom.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const f = 90 + 60 * Math.exp(-t * 12);
      phase += (2 * Math.PI * f) / sr;
      d[i] = Math.sin(phase) * Math.exp(-t * 9);
    }
  }

  // Cymbal / crash: ruido con cola larga.
  const cymbal = mk(1.2);
  noise(cymbal.getChannelData(0), 3);

  // Bass stab.
  const bass = mk(0.4);
  {
    const d = bass.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.sin(2 * Math.PI * 55 * t) + 0.4 * Math.sin(2 * Math.PI * 110 * t)) * Math.exp(-t * 6);
    }
  }

  // Riser / FX: barrido ascendente de ruido.
  const riser = mk(1.0);
  {
    const d = riser.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.min(1, t) * 0.6;
    }
  }

  const defs: Array<[string, AudioBuffer]> = [
    ['Kick', kick], ['Snare', snare], ['HiHat', hat], ['Clap', clap],
    ['Tom', tom], ['Crash', cymbal], ['Bass', bass], ['Riser', riser],
  ];
  return defs.map(([label, buffer], i) => ({
    id: `pad-${i}`,
    label,
    buffer,
    gain: 0.9,
    loop: false,
  }));
}
