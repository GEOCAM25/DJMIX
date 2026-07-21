import { create } from 'zustand';
import { AudioEngine } from '../audio/AudioEngine';
import type { DeckId, EngineType, EqValues } from '../audio/types';
import { decodeFileToAudio } from '../media/decode';
import { extractVideoId, searchYouTube } from '../media/youtube';
import { detectBpm } from '../analysis/bpm';
import { detectKey } from '../analysis/key';
import { extractPeaks } from '../analysis/waveform';
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

  // ── Efectos ────────────────────────────────────────────────────────────
  setReverb: (v: number) => void;
  setEcho: (v: number) => void;
  setMasterFilter: (v: number) => void;

  // ── Grabación ────────────────────────────────────────────────────────────
  startRecording: (mode: 'master' | 'tab') => Promise<void>;
  stopRecording: (name: string) => Promise<void>;
  refreshMixes: () => Promise<void>;

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
    });

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
          peaks: extractPeaks(buffer),
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
