import { create } from 'zustand';
import { AudioEngine } from '../audio/AudioEngine';
import type { AudioOutputDevice } from '../audio/CueBus';
import type { DeckId, EngineType, EqValues } from '../audio/types';
import { decodeFileToAudio } from '../media/decode';
import { extractVideoId, searchYouTube } from '../media/youtube';
import { buildStemsZip, downloadBlob, type Stem } from '../media/exportProject';
import { detectBpm } from '../analysis/bpm';
import { detectKey } from '../analysis/key';
import { computeSmartWaveform } from '../analysis/smartWaveform';
import {
  saveTrack,
  listTracks,
  getTrackBlob,
  setTrackCues,
  deleteTrack as dbDeleteTrack,
} from '../storage/tracks';
import { saveMix, listMixes } from '../storage/mixes';
import { resolveAiKey, resolveYouTubeKey, setSetting, getSetting } from '../storage/settings';
import type { MixMeta, TrackMeta } from '../storage/db';
import { makeAIProvider, type AIProvider } from '../ai/AIProvider';
import { analyzeTransition, rankLibrary, recommendYouTube, type TransitionAdvice, type TrackSuggestion } from '../ai/copilot';

export interface DeckUIState {
  trackId: string | null;
  title: string;
  engine: EngineType;
  playing: boolean;
  position: number;
  duration: number;
  tempo: number;
  bpm: number | null;
  camelotKey: string | null;
  energy: number | null;
  cues: number[];
  peaks: Float32Array | null;
  /** Reparto de energía por columna (graves/medios/agudos) para el color. */
  waveBands: { low: Float32Array; mid: Float32Array; high: Float32Array } | null;
  youtubeId: string | null;
}

interface ChannelUIState {
  fader: number;
  eq: EqValues;
  filter: number;
}

interface Status {
  busy: boolean;
  message: string;
  progress: number;
}

const emptyDeck = (): DeckUIState => ({
  trackId: null,
  title: 'Vacío',
  engine: 'local',
  playing: false,
  position: 0,
  duration: 0,
  tempo: 0,
  bpm: null,
  camelotKey: null,
  energy: null,
  cues: [],
  peaks: null,
  waveBands: null,
  youtubeId: null,
});

const emptyChannel = (): ChannelUIState => ({ fader: 1, eq: { low: 0, mid: 0, high: 0 }, filter: 0 });

interface StoreState {
  engine: AudioEngine | null;
  ai: AIProvider;
  started: boolean;

  decks: Record<DeckId, DeckUIState>;
  channels: Record<DeckId, ChannelUIState>;
  crossfade: number;
  master: number;
  fx: { reverb: number; echo: number; filter: number };

  // Pre-escucha (Cue de audífonos)
  cueMonitor: Record<DeckId, boolean>;
  cueDevices: AudioOutputDevice[];
  cueDeviceId: string | null;
  cueVolume: number;
  cueSupported: boolean;

  // Auto-DJ (piloto automático)
  autoDj: {
    enabled: boolean;
    /** Cola de trackIds locales pendientes de reproducir. */
    queue: string[];
    /** Deck que suena actualmente bajo control del Auto-DJ. */
    currentDeck: DeckId;
    /** ¿Hay una transición automática en curso? */
    transitioning: boolean;
    /** Duración del crossfade automático en segundos. */
    crossfadeSeconds: number;
    /** Posición (s) del deck actual en la que se dispara la transición. */
    nextAt: number | null;
  };

  library: TrackMeta[];
  mixes: MixMeta[];
  recording: boolean;
  status: Status;

  copilot: {
    advice: TransitionAdvice | null;
    librarySuggestions: TrackSuggestion[];
    youtubeSuggestions: TrackSuggestion[];
    loading: boolean;
  };

  settings: { youtubeApiKey: string; aiApiKey: string };

  // ── Ciclo de vida ─────────────────────────────────────────────────────
  init: () => Promise<void>;

  // ── Importación / carga ───────────────────────────────────────────────
  importFiles: (files: File[]) => Promise<void>;
  loadLocalTrackToDeck: (deck: DeckId, trackId: string) => Promise<void>;
  loadYouTubeToDeck: (deck: DeckId, input: string, title?: string) => Promise<void>;
  loadYouTubeByQuery: (deck: DeckId, query: string) => Promise<void>;

  // ── Transporte ─────────────────────────────────────────────────────────
  togglePlay: (deck: DeckId) => void;
  cue: (deck: DeckId) => void;
  setTempo: (deck: DeckId, percent: number) => void;
  seek: (deck: DeckId, seconds: number) => void;
  addCue: (deck: DeckId) => void;
  jumpToCue: (deck: DeckId, index: number) => void;
  syncToOther: (deck: DeckId) => void;

  // ── Mezclador ────────────────────────────────────────────────────────────
  setCrossfade: (v: number) => void;
  setChannelFader: (deck: DeckId, v: number) => void;
  setEq: (deck: DeckId, band: keyof EqValues, db: number) => void;
  setChannelFilter: (deck: DeckId, v: number) => void;
  setMaster: (v: number) => void;

  // ── Pre-escucha (Cue de audífonos) ────────────────────────────────────────
  toggleCueMonitor: (deck: DeckId) => void;
  refreshCueDevices: () => Promise<void>;
  selectCueOutput: () => Promise<void>;
  setCueDevice: (deviceId: string) => Promise<void>;
  setCueVolume: (v: number) => void;

  // ── Auto-DJ (piloto automático) ────────────────────────────────────────────
  toggleAutoDj: () => Promise<void>;
  addToQueue: (trackId: string) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
  setAutoCrossfade: (seconds: number) => void;
  /** Ajusta el tempo de `deck` para igualar el BPM efectivo de `reference`. */
  beatmatch: (deck: DeckId, reference: DeckId) => void;
  /** Ejecuta la transición automática al siguiente tema (uso interno del tick). */
  autoDjTransition: () => void;

  // ── Efectos ────────────────────────────────────────────────────────────
  setReverb: (v: number) => void;
  setEcho: (v: number) => void;
  setMasterFilter: (v: number) => void;

  // ── Grabación ────────────────────────────────────────────────────────────
  startRecording: (mode: 'master' | 'tab') => Promise<void>;
  stopRecording: (name: string) => Promise<void>;
  refreshMixes: () => Promise<void>;
  /** Exporta los decks cargados como stems WAV + project.json en un .zip. */
  exportStems: () => Promise<void>;

  // ── Biblioteca ─────────────────────────────────────────────────────────
  refreshLibrary: () => Promise<void>;
  removeTrack: (id: string) => Promise<void>;

  // ── Copiloto ─────────────────────────────────────────────────────────────
  analyzeMix: () => void;
  fetchSuggestions: () => Promise<void>;

  // ── Ajustes ────────────────────────────────────────────────────────────
  saveApiKeys: (youtubeApiKey: string, aiApiKey: string) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  engine: null,
  ai: makeAIProvider(''),
  started: false,

  decks: { A: emptyDeck(), B: emptyDeck() },
  channels: { A: emptyChannel(), B: emptyChannel() },
  crossfade: 0,
  master: 0.85,
  fx: { reverb: 0, echo: 0, filter: 0 },

  cueMonitor: { A: false, B: false },
  cueDevices: [],
  cueDeviceId: null,
  cueVolume: 0.9,
  cueSupported: false,

  autoDj: {
    enabled: false,
    queue: [],
    currentDeck: 'A',
    transitioning: false,
    crossfadeSeconds: 8,
    nextAt: null,
  },

  library: [],
  mixes: [],
  recording: false,
  status: { busy: false, message: '', progress: 0 },

  copilot: { advice: null, librarySuggestions: [], youtubeSuggestions: [], loading: false },
  settings: { youtubeApiKey: '', aiApiKey: '' },

  async init() {
    if (get().started) return;
    const engine = new AudioEngine();
    await engine.resume();

    // Proveedor de IA a partir de las claves guardadas (o .env).
    const [aiKey, ytKey, model] = await Promise.all([
      resolveAiKey(),
      resolveYouTubeKey(),
      getSetting<string>('aiModel'),
    ]);

    set({
      engine,
      started: true,
      ai: makeAIProvider(aiKey, model ?? import.meta.env.VITE_AI_MODEL),
      settings: { youtubeApiKey: ytKey, aiApiKey: aiKey },
      cueSupported: engine.canRouteCue,
    });

    // ── Restaurar configuración de pre-escucha (audífonos) ─────────────────
    const [savedCueDevice, savedCueVol] = await Promise.all([
      getSetting<string>('cueDeviceId'),
      getSetting<number>('cueVolume'),
    ]);
    if (savedCueVol != null) {
      engine.setCueVolume(savedCueVol);
      set({ cueVolume: savedCueVol });
    }
    if (savedCueDevice && engine.canRouteCue) {
      try {
        await engine.setCueSinkId(savedCueDevice);
        set({ cueDeviceId: savedCueDevice });
      } catch {
        /* el dispositivo guardado ya no existe; se ignora */
      }
    }
    await get().refreshCueDevices();

    await Promise.all([get().refreshLibrary(), get().refreshMixes()]);

    // Bucle de actualización de posiciones (≈30 fps) para la UI.
    const tick = () => {
      const { engine: eng, decks } = get();
      if (!eng) return;
      const next = { ...decks };
      let changed = false;
      for (const id of ['A', 'B'] as DeckId[]) {
        const d = next[id];
        if (!d.trackId) continue;
        const isYt = eng.getEngine(id) === 'youtube';
        const pos = isYt ? eng.getYouTubeDeck(id).position : eng.getDeck(id).position;
        const playing = isYt ? eng.getYouTubeDeck(id).playing : eng.getDeck(id).playing;
        if (Math.abs(pos - d.position) > 0.03 || playing !== d.playing) {
          next[id] = { ...d, position: pos, playing };
          changed = true;
        }
      }
      if (changed) set({ decks: next });

      // Auto-DJ: dispara la transición cuando el deck actual llega a su umbral.
      const adj = get().autoDj;
      if (adj.enabled && !adj.transitioning && adj.nextAt != null) {
        const cur = next[adj.currentDeck];
        if (cur.duration > 0 && cur.position >= adj.nextAt) {
          get().autoDjTransition();
        }
      }

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  async importFiles(files) {
    const { engine } = get();
    if (!engine) return;
    for (const file of files) {
      try {
        set({ status: { busy: true, message: `Procesando ${file.name}…`, progress: 0 } });
        const decoded = await decodeFileToAudio(engine.ctx, file, (progress, stage) =>
          set({ status: { busy: true, message: stage, progress } }),
        );
        set({ status: { busy: true, message: 'Analizando BPM y tonalidad…', progress: 0.95 } });
        const [bpm, key] = await Promise.all([detectBpm(decoded.buffer), detectKey(decoded.buffer)]);
        await saveTrack({
          title: decoded.title,
          engine: 'local',
          format: file.type || file.name.split('.').pop(),
          bpm: bpm.bpm,
          camelotKey: key.camelot,
          energy: bpm.energy,
          duration: decoded.buffer.duration,
          blob: decoded.sourceBlob,
        });
      } catch (err) {
        set({ status: { busy: false, message: `Error con ${file.name}: ${(err as Error).message}`, progress: 0 } });
        continue;
      }
    }
    set({ status: { busy: false, message: 'Importación completada', progress: 1 } });
    await get().refreshLibrary();
  },

  async loadLocalTrackToDeck(deck, trackId) {
    const { engine, library } = get();
    if (!engine) return;
    const meta = library.find((t) => t.id === trackId);
    if (!meta) return;
    set({ status: { busy: true, message: `Cargando en Deck ${deck}…`, progress: 0.3 } });
    const blob = await getTrackBlob(trackId);
    if (!blob) {
      set({ status: { busy: false, message: 'No se encontró el audio', progress: 0 } });
      return;
    }
    const buffer = await engine.ctx.decodeAudioData(await blob.arrayBuffer());
    engine.setEngine(deck, 'local');
    engine.getDeck(deck).load(buffer);
    const wave = computeSmartWaveform(buffer);
    set((s) => ({
      status: { busy: false, message: '', progress: 1 },
      decks: {
        ...s.decks,
        [deck]: {
          ...emptyDeck(),
          trackId: meta.id,
          title: meta.artist ? `${meta.artist} – ${meta.title}` : meta.title,
          engine: 'local',
          duration: buffer.duration,
          bpm: meta.bpm,
          camelotKey: meta.camelotKey,
          energy: meta.energy,
          cues: meta.cues,
          peaks: wave.peaks,
          waveBands: { low: wave.low, mid: wave.mid, high: wave.high },
        },
      },
    }));
    get().analyzeMix();
  },

  async loadYouTubeToDeck(deck, input, title) {
    const { engine } = get();
    if (!engine) return;
    const videoId = extractVideoId(input);
    if (!videoId) {
      set({ status: { busy: false, message: 'URL/ID de YouTube no válido', progress: 0 } });
      return;
    }
    set({ status: { busy: true, message: `Preparando reproductor de YouTube…`, progress: 0.5 } });
    const yt = engine.getYouTubeDeck(deck);
    await yt.init();
    engine.setEngine(deck, 'youtube');
    yt.load(videoId);
    set((s) => ({
      status: { busy: false, message: '', progress: 1 },
      decks: {
        ...s.decks,
        [deck]: {
          ...emptyDeck(),
          trackId: `yt_${videoId}`,
          title: title ?? `YouTube ${videoId}`,
          engine: 'youtube',
          youtubeId: videoId,
        },
      },
    }));
  },

  async loadYouTubeByQuery(deck, query) {
    const { settings } = get();
    if (!settings.youtubeApiKey) {
      set({ status: { busy: false, message: 'Configura tu API key de YouTube para cargar por búsqueda', progress: 0 } });
      return;
    }
    try {
      const results = await searchYouTube(query, settings.youtubeApiKey, 1);
      if (results[0]) await get().loadYouTubeToDeck(deck, results[0].id, results[0].title);
    } catch (err) {
      set({ status: { busy: false, message: (err as Error).message, progress: 0 } });
    }
  },

  togglePlay(deck) {
    const { engine } = get();
    if (!engine) return;
    if (engine.getEngine(deck) === 'youtube') engine.getYouTubeDeck(deck).togglePlay();
    else engine.getDeck(deck).togglePlay();
  },

  cue(deck) {
    const { engine } = get();
    if (!engine) return;
    if (engine.getEngine(deck) === 'youtube') engine.getYouTubeDeck(deck).seek(0);
    else engine.getDeck(deck).cue();
  },

  setTempo(deck, percent) {
    const { engine } = get();
    if (!engine) return;
    if (engine.getEngine(deck) === 'youtube') engine.getYouTubeDeck(deck).setTempoPercent(percent);
    else engine.getDeck(deck).setTempo(percent);
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], tempo: percent } } }));
  },

  seek(deck, seconds) {
    const { engine } = get();
    if (!engine) return;
    if (engine.getEngine(deck) === 'youtube') engine.getYouTubeDeck(deck).seek(seconds);
    else engine.getDeck(deck).seek(seconds);
  },

  addCue(deck) {
    const { engine, decks } = get();
    if (!engine || engine.getEngine(deck) === 'youtube') return;
    const pos = engine.getDeck(deck).position;
    const cues = [...decks[deck].cues, pos].sort((a, b) => a - b);
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], cues } } }));
    const trackId = decks[deck].trackId;
    if (trackId) void setTrackCues(trackId, cues);
  },

  jumpToCue(deck, index) {
    const { engine, decks } = get();
    if (!engine) return;
    const cue = decks[deck].cues[index];
    if (cue == null) return;
    get().seek(deck, cue);
  },

  syncToOther(deck) {
    const { decks } = get();
    const other: DeckId = deck === 'A' ? 'B' : 'A';
    const target = decks[other].bpm;
    const mine = decks[deck].bpm;
    if (!target || !mine) return;
    const percent = (target / mine - 1) * 100;
    get().setTempo(deck, Math.max(-50, Math.min(50, percent)));
  },

  setCrossfade(v) {
    get().engine?.setCrossfade(v);
    set({ crossfade: v });
  },

  setChannelFader(deck, v) {
    get().engine?.setChannelFader(deck, v);
    set((s) => ({ channels: { ...s.channels, [deck]: { ...s.channels[deck], fader: v } } }));
  },

  setEq(deck, band, db) {
    get().engine?.setEq(deck, { [band]: db });
    set((s) => ({
      channels: { ...s.channels, [deck]: { ...s.channels[deck], eq: { ...s.channels[deck].eq, [band]: db } } },
    }));
  },

  setChannelFilter(deck, v) {
    get().engine?.setChannelFilter(deck, v);
    set((s) => ({ channels: { ...s.channels, [deck]: { ...s.channels[deck], filter: v } } }));
  },

  setMaster(v) {
    get().engine?.setMasterGain(v);
    set({ master: v });
  },

  // ── Pre-escucha (Cue de audífonos) ────────────────────────────────────────
  toggleCueMonitor(deck) {
    const { engine, cueMonitor } = get();
    if (!engine) return;
    if (engine.getEngine(deck) === 'youtube') {
      set({
        status: {
          busy: false,
          message: 'La pre-escucha no está disponible en decks de YouTube (audio cross-origin).',
          progress: 0,
        },
      });
      return;
    }
    const on = !cueMonitor[deck];
    engine.setCueMonitor(deck, on);
    set({ cueMonitor: { ...cueMonitor, [deck]: on } });
    if (on && !engine.cueSinkId && engine.canRouteCue) {
      set({
        status: {
          busy: false,
          message: 'Elige tu salida de audífonos en el Mezclador para escuchar el Cue.',
          progress: 0,
        },
      });
    }
  },

  async refreshCueDevices() {
    const { engine } = get();
    if (!engine) return;
    try {
      set({ cueDevices: await engine.getCueOutputs() });
    } catch {
      /* enumerateDevices puede fallar sin permisos; se ignora */
    }
  },

  async selectCueOutput() {
    const { engine } = get();
    if (!engine) return;
    try {
      const dev = await engine.selectCueOutput(); // selector nativo (si existe)
      if (dev) {
        await engine.setCueSinkId(dev.deviceId);
        await setSetting('cueDeviceId', dev.deviceId);
        set({ cueDeviceId: dev.deviceId });
      }
      await get().refreshCueDevices();
    } catch (err) {
      set({ status: { busy: false, message: (err as Error).message, progress: 0 } });
    }
  },

  async setCueDevice(deviceId) {
    const { engine } = get();
    if (!engine) return;
    try {
      await engine.setCueSinkId(deviceId);
      await setSetting('cueDeviceId', deviceId);
      set({ cueDeviceId: deviceId });
    } catch (err) {
      set({ status: { busy: false, message: (err as Error).message, progress: 0 } });
    }
  },

  setCueVolume(v) {
    get().engine?.setCueVolume(v);
    void setSetting('cueVolume', v);
    set({ cueVolume: v });
  },

  // ── Auto-DJ (piloto automático) ────────────────────────────────────────────
  beatmatch(deck, reference) {
    const { decks } = get();
    const refBpm = decks[reference].bpm;
    const myBpm = decks[deck].bpm;
    if (!refBpm || !myBpm) return;
    const refEffective = refBpm * (1 + decks[reference].tempo / 100);
    const percent = (refEffective / myBpm - 1) * 100;
    get().setTempo(deck, Math.max(-50, Math.min(50, percent)));
  },

  addToQueue(trackId) {
    set((s) => (s.autoDj.queue.includes(trackId) ? s : { autoDj: { ...s.autoDj, queue: [...s.autoDj.queue, trackId] } }));
  },
  removeFromQueue(trackId) {
    set((s) => ({ autoDj: { ...s.autoDj, queue: s.autoDj.queue.filter((id) => id !== trackId) } }));
  },
  clearQueue() {
    set((s) => ({ autoDj: { ...s.autoDj, queue: [] } }));
  },
  setAutoCrossfade(seconds) {
    set((s) => ({ autoDj: { ...s.autoDj, crossfadeSeconds: Math.max(2, Math.min(30, seconds)) } }));
  },

  async toggleAutoDj() {
    const { autoDj, engine, library, decks } = get();
    if (!engine) return;

    // Desactivar: soltar el control, dejar sonando lo que haya.
    if (autoDj.enabled) {
      set({ autoDj: { ...autoDj, enabled: false, transitioning: false, nextAt: null } });
      return;
    }

    // Construir la cola: la definida por el usuario o toda la biblioteca local.
    const localIds = library.filter((t) => t.engine === 'local').map((t) => t.id);
    let queue = autoDj.queue.filter((id) => localIds.includes(id));
    if (queue.length === 0) queue = localIds;
    if (queue.length === 0) {
      set({ status: { busy: false, message: 'Auto-DJ: importa pistas locales primero.', progress: 0 } });
      return;
    }

    // Deck actual: el que ya suene; si ninguno, el A.
    const currentDeck: DeckId = decks.A.playing ? 'A' : decks.B.playing ? 'B' : 'A';
    const otherDeck: DeckId = currentDeck === 'A' ? 'B' : 'A';
    let qi = 0;

    // Si el deck actual está vacío, cargar y reproducir la primera pista.
    if (!get().decks[currentDeck].trackId) {
      await get().loadLocalTrackToDeck(currentDeck, queue[qi++]);
      engine.armCrossfadeTo(currentDeck);
      if (!get().decks[currentDeck].playing) get().togglePlay(currentDeck);
    } else {
      engine.armCrossfadeTo(currentDeck);
    }

    // Precargar la siguiente pista en el otro deck y beatmatch.
    if (qi < queue.length && !get().decks[otherDeck].playing) {
      await get().loadLocalTrackToDeck(otherDeck, queue[qi++]);
      get().beatmatch(otherDeck, currentDeck);
    }

    const cur = get().decks[currentDeck];
    const cf = autoDj.crossfadeSeconds;
    const nextAt = Math.max(cur.position + 6, cur.duration - cf - 3);

    set({
      crossfade: currentDeck === 'B' ? 1 : -1,
      autoDj: {
        ...get().autoDj,
        enabled: true,
        queue: queue.slice(qi),
        currentDeck,
        transitioning: false,
        nextAt,
      },
    });
  },

  autoDjTransition() {
    const { engine, autoDj } = get();
    if (!engine || autoDj.transitioning) return;
    const from = autoDj.currentDeck;
    const to: DeckId = from === 'A' ? 'B' : 'A';

    // El deck entrante debe tener pista precargada; si no, no hay más mezcla.
    if (!get().decks[to].trackId) {
      set({ autoDj: { ...autoDj, enabled: false, nextAt: null } });
      return;
    }

    // Marcar transición (sincrónico) para que el tick no la vuelva a disparar.
    set({ autoDj: { ...autoDj, transitioning: true, nextAt: null } });

    // Beatmatch final, arrancar el entrante y lanzar el crossfade + bass swap.
    get().beatmatch(to, from);
    get().seek(to, 0);
    if (!get().decks[to].playing) get().togglePlay(to);
    const cf = get().autoDj.crossfadeSeconds;
    engine.beginAutoTransition(from, to, cf);

    // Al terminar el crossfade: cerrar, parar el saliente y preparar el siguiente.
    window.setTimeout(() => {
      const eng = get().engine;
      if (!eng) return;
      eng.finishAutoTransition(from, to);
      if (get().decks[from].playing) get().togglePlay(from); // pausar saliente

      void (async () => {
        const queue = get().autoDj.queue;
        const hasNext = queue.length > 0;
        if (hasNext) {
          await get().loadLocalTrackToDeck(from, queue[0]);
          get().beatmatch(from, to);
        }
        const toDeck = get().decks[to];
        const cfNow = get().autoDj.crossfadeSeconds;
        const nextAt = hasNext ? Math.max(toDeck.position + 6, toDeck.duration - cfNow - 3) : null;
        set((s) => ({
          crossfade: to === 'B' ? 1 : -1,
          autoDj: {
            ...s.autoDj,
            currentDeck: to,
            transitioning: false,
            queue: hasNext ? queue.slice(1) : [],
            nextAt,
            enabled: hasNext, // sin más pistas, el Auto-DJ se detiene solo
          },
        }));
      })();
    }, cf * 1000);
  },

  setReverb(v) {
    get().engine?.effects.setReverb(v);
    set((s) => ({ fx: { ...s.fx, reverb: v } }));
  },
  setEcho(v) {
    get().engine?.effects.setEcho(v);
    set((s) => ({ fx: { ...s.fx, echo: v } }));
  },
  setMasterFilter(v) {
    get().engine?.effects.setFilter(v);
    set((s) => ({ fx: { ...s.fx, filter: v } }));
  },

  async startRecording(mode) {
    const { engine } = get();
    if (!engine) return;
    try {
      await engine.recorder.start(mode);
      set({ recording: true, status: { busy: false, message: 'Grabando…', progress: 0 } });
    } catch (err) {
      set({ status: { busy: false, message: `No se pudo grabar: ${(err as Error).message}`, progress: 0 } });
    }
  },

  async stopRecording(name) {
    const { engine } = get();
    if (!engine) return;
    const result = await engine.recorder.stop();
    await saveMix(name || `Mix ${new Date().toLocaleString()}`, result.blob, result.mimeType, result.durationMs);
    set({ recording: false, status: { busy: false, message: 'Mix guardado', progress: 1 } });
    await get().refreshMixes();
  },

  async refreshMixes() {
    set({ mixes: await listMixes() });
  },

  async exportStems() {
    const { engine, decks, channels, crossfade, master, fx } = get();
    if (!engine) return;

    const stems: Stem[] = [];
    for (const id of ['A', 'B'] as DeckId[]) {
      const buffer = engine.getDeckBuffer(id);
      if (buffer) stems.push({ name: `Deck_${id}_${decks[id].title}`, buffer });
    }
    if (stems.length === 0) {
      set({ status: { busy: false, message: 'Carga pistas en los decks para exportar stems.', progress: 0 } });
      return;
    }

    set({ status: { busy: true, message: 'Generando ZIP de stems…', progress: 0.4 } });
    const project = {
      app: 'DJMIX',
      version: 1,
      exportedAt: new Date().toISOString(),
      decks: (['A', 'B'] as DeckId[]).map((id) => ({
        deck: id,
        title: decks[id].title,
        bpm: decks[id].bpm,
        camelotKey: decks[id].camelotKey,
        tempo: decks[id].tempo,
        cues: decks[id].cues,
        duration: decks[id].duration,
      })),
      mixer: { crossfade, master, channels },
      fx,
    };

    try {
      const blob = await buildStemsZip(stems, project);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadBlob(blob, `djmix-project-${stamp}.zip`);
      set({ status: { busy: false, message: `ZIP exportado (${stems.length} stems)`, progress: 1 } });
    } catch (err) {
      set({ status: { busy: false, message: `Error al exportar: ${(err as Error).message}`, progress: 0 } });
    }
  },

  async refreshLibrary() {
    set({ library: await listTracks() });
  },

  async removeTrack(id) {
    await dbDeleteTrack(id);
    await get().refreshLibrary();
  },

  analyzeMix() {
    const { decks } = get();
    const advice = analyzeTransition(
      { bpm: decks.A.bpm, camelotKey: decks.A.camelotKey, energy: decks.A.energy },
      { bpm: decks.B.bpm, camelotKey: decks.B.camelotKey, energy: decks.B.energy },
    );
    set((s) => ({ copilot: { ...s.copilot, advice } }));
  },

  async fetchSuggestions() {
    const { decks, library, ai } = get();
    // Usa como "pista activa" el deck que esté sonando (o el A por defecto).
    const activeDeck: DeckId = decks.B.playing && !decks.A.playing ? 'B' : 'A';
    const activeId = decks[activeDeck].trackId;
    const active = library.find((t) => t.id === activeId);
    if (!active) {
      set((s) => ({ copilot: { ...s.copilot, librarySuggestions: [], youtubeSuggestions: [] } }));
      return;
    }
    set((s) => ({ copilot: { ...s.copilot, loading: true } }));
    const librarySuggestions = rankLibrary(active, library);
    let youtubeSuggestions: TrackSuggestion[] = [];
    try {
      youtubeSuggestions = await recommendYouTube(active, ai);
    } catch {
      /* ignora fallos de red/IA */
    }
    set((s) => ({ copilot: { ...s.copilot, librarySuggestions, youtubeSuggestions, loading: false } }));
  },

  async saveApiKeys(youtubeApiKey, aiApiKey) {
    await Promise.all([setSetting('youtubeApiKey', youtubeApiKey), setSetting('aiApiKey', aiApiKey)]);
    const model = (await getSetting<string>('aiModel')) ?? import.meta.env.VITE_AI_MODEL;
    set({ ai: makeAIProvider(aiApiKey, model), settings: { youtubeApiKey, aiApiKey } });
  },
}));
