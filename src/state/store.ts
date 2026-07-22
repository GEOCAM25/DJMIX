import { create } from 'zustand';
import { AudioEngine } from '../audio/AudioEngine';
import type { AudioOutputDevice } from '../audio/CueBus';
import type { DeckId, EngineType, EqValues } from '../audio/types';
import { decodeFileToAudio } from '../media/decode';
import { extractVideoId, searchYouTube } from '../media/youtube';
import { buildStemsZip, downloadBlob, type Stem } from '../media/exportProject';
import { SessionVideoRecorder } from '../media/SessionVideoRecorder';
import { setupMediaSession, updateMediaSession } from '../media/mediaSession';
import { exportBackupBlob, exportBackup, parseBackupFile, importBackup } from '../storage/backup';
import { connectDrive, driveUpload, driveList, driveDownload, type DriveFile } from '../cloud/googleDrive';
import { applyTheme, DEFAULT_THEME_ID } from '../theme/themes';
import { detectBpm } from '../analysis/bpm';
import { detectKey } from '../analysis/key';
import { computeSmartWaveform } from '../analysis/smartWaveform';
import { detectSmartCues } from '../analysis/smartCues';
import { analyzeMood } from '../analysis/moodClient';
import { sliceBuffer } from '../analysis/slicer';
import { createDrumSamples } from '../audio/synthSamples';
import { MidiController, type MidiMessage } from '../midi/MidiController';
import { applyMidiTarget, controlKey, MIDI_TARGETS } from '../midi/mappings';
import { emptySteps, type SeqRow } from '../audio/StepSequencer';
import type { LoopSlotState } from '../audio/LoopStation';
import { crateMatches, type CrateRule, type SmartCrate } from '../library/crates';
import { runMacro, type Macro, type MacroStep } from '../macros/macros';
import { BleLight, bluetoothLightSupported } from '../lights/bleLight';
import {
  saveTrack,
  listTracks,
  getTrackBlob,
  setTrackCues,
  setTrackMoods,
  deleteTrack as dbDeleteTrack,
  enforceTrackLimit,
  TRACK_LIMIT,
} from '../storage/tracks';
import { saveMix, listMixes } from '../storage/mixes';
import { resolveAiKey, resolveYouTubeKey, setSetting, getSetting } from '../storage/settings';
import type { MixMeta, TrackMeta } from '../storage/db';
import { makeAIProvider, type AIProvider } from '../ai/AIProvider';
import { analyzeTransition, rankLibrary, recommendYouTube, type TransitionAdvice, type TrackSuggestion } from '../ai/copilot';

/**
 * Controlador MIDI vivo (fuera del estado reactivo: es una clase con callbacks).
 * midiLastValue guarda el último valor por control para detectar el flanco de
 * subida de los botones (play/cue/sync) y no dispararlos dos veces.
 */
let midiController: MidiController | null = null;
const midiLastValue = new Map<string, number>();

/** Grabador de vídeo de la sesión (fuera del estado reactivo). */
let videoRec: SessionVideoRecorder | null = null;

/** Macro en reproducción (id) para poder abortarla desde runtime. */
let runningMacroId: string | null = null;

/** Bombilla BLE conectada (fuera del estado reactivo) + throttle de envío. */
let bleLight: BleLight | null = null;
let lastLightSend = 0;

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
  /** ¿El Smart EQ está atenuando los graves de este deck ahora mismo? */
  ducking: boolean;
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
  ducking: false,
});

const emptyChannel = (): ChannelUIState => ({ fader: 1, eq: { low: 0, mid: 0, high: 0 }, filter: 0 });

/** Patrón inicial del secuenciador: un groove house básico (no vacío). */
const defaultSeqRows = (): SeqRow[] => {
  const on = (indices: number[]): boolean[] => {
    const s = emptySteps(16);
    indices.forEach((i) => (s[i] = true));
    return s;
  };
  return [
    { label: 'Kick', bufferIndex: 0, steps: on([0, 4, 8, 12]) },
    { label: 'Clap', bufferIndex: 3, steps: on([4, 12]) },
    { label: 'Snare', bufferIndex: 1, steps: on([]) },
    { label: 'HiHat', bufferIndex: 2, steps: on([2, 6, 10, 14]) },
    { label: 'Tom', bufferIndex: 4, steps: on([]) },
    { label: 'Bass', bufferIndex: 6, steps: on([0, 8]) },
  ];
};

interface StoreState {
  engine: AudioEngine | null;
  ai: AIProvider;
  started: boolean;

  decks: Record<DeckId, DeckUIState>;
  channels: Record<DeckId, ChannelUIState>;
  crossfade: number;
  master: number;
  fx: { reverb: number; echo: number; filter: number };
  /** Preset de "estilo" DSP del máster (off/lofi/club/ambient). */
  audioStyle: string;
  sidechain: { enabled: boolean; amount: number };
  /** Etiquetas de los pads del sampler (null = batería por defecto). */
  samplerLabels: string[] | null;

  // Controladores MIDI (Web MIDI API + mapeo CC/nota con MIDI Learn)
  midi: {
    supported: boolean;
    enabled: boolean;
    inputs: string[];
    /** Destino que está "aprendiendo" ahora mismo (o null). */
    learning: string | null;
    /** Diccionario controlKey → id de destino. */
    mappings: Record<string, string>;
  };

  // Secuenciador de pasos (drum machine de 16 pasos)
  sequencer: {
    playing: boolean;
    bpm: number;
    swing: number;
    /** Columna que suena ahora (para iluminar), -1 = detenido. */
    step: number;
    rows: SeqRow[];
  };

  // Estación de Live Looping (looper multipista)
  loops: {
    bpm: number;
    bars: number;
    slots: LoopSlotState[];
  };

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
  /** Smart Crates: carpetas inteligentes por reglas sobre la biblioteca. */
  crates: SmartCrate[];
  /** Macros no-code (cadenas de acciones con tiempos). */
  macros: Macro[];
  /** id de la macro que se está reproduciendo (o null). */
  runningMacro: string | null;
  /** Luces reactivas: preview encendido + estado de la bombilla BLE. */
  lights: { on: boolean; btSupported: boolean; btConnected: boolean; btName: string };
  recording: boolean;
  /** ¿Se está grabando vídeo de la sesión? */
  videoRecording: boolean;
  status: Status;

  copilot: {
    advice: TransitionAdvice | null;
    librarySuggestions: TrackSuggestion[];
    youtubeSuggestions: TrackSuggestion[];
    loading: boolean;
  };

  settings: { youtubeApiKey: string; aiApiKey: string };

  // Google Drive (respaldo en la nube del usuario)
  driveToken: string | null;
  driveFiles: DriveFile[];

  // Tema / skin activo
  theme: string;

  /** ¿Mostrar el tour de bienvenida? */
  showTour: boolean;

  // ── Ciclo de vida ─────────────────────────────────────────────────────
  init: () => Promise<void>;
  setTheme: (id: string) => void;
  /** Abre/cierra el tour; al cerrarlo marca la app como "onboarded". */
  setShowTour: (v: boolean) => void;

  // ── Importación / carga ───────────────────────────────────────────────
  importFiles: (files: File[]) => Promise<void>;
  loadLocalTrackToDeck: (deck: DeckId, trackId: string) => Promise<void>;
  loadYouTubeToDeck: (deck: DeckId, input: string, title?: string) => Promise<void>;
  loadYouTubeByQuery: (deck: DeckId, query: string) => Promise<void>;

  // ── Transporte ─────────────────────────────────────────────────────────
  /** Sincroniza los metadatos/estado con la Media Session del sistema. */
  syncMediaSession: () => void;
  togglePlay: (deck: DeckId) => void;
  cue: (deck: DeckId) => void;
  setTempo: (deck: DeckId, percent: number) => void;
  seek: (deck: DeckId, seconds: number) => void;
  addCue: (deck: DeckId) => void;
  jumpToCue: (deck: DeckId, index: number) => void;
  syncToOther: (deck: DeckId) => void;

  // ── Jog wheel (nudge / scratch de plato) ────────────────────────────────
  /** Pitch-bend temporal del jog (nudge) mientras suena. bend 0 = soltar. */
  deckNudge: (deck: DeckId, bend: number) => void;
  /** Scrub (buscar) moviendo el plato en pausa. */
  deckScrub: (deck: DeckId, deltaSeconds: number) => void;

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
  /** Aplica un preset de estilo DSP (Audio Style Transfer). */
  setAudioStyle: (id: string) => void;

  // ── Smart EQ / Sidechain ────────────────────────────────────────────────
  toggleSidechain: () => void;
  setSidechainAmount: (db: number) => void;

  // ── Auto-Slicer (cortar una pista en pads) ──────────────────────────────
  autoSlice: (deck: DeckId) => void;
  resetSampler: () => void;

  // ── MIDI (Web MIDI API) ──────────────────────────────────────────────────
  /** Solicita acceso MIDI y engancha el controlador (acción del usuario). */
  initMidi: () => Promise<void>;
  /** Empieza a "aprender": el próximo control físico se asigna a `targetId`. */
  startMidiLearn: (targetId: string) => void;
  cancelMidiLearn: () => void;
  /** Borra el mapeo asociado a un destino. */
  clearMidiMapping: (targetId: string) => void;

  // ── Secuenciador de pasos (drum machine) ────────────────────────────────
  seqToggleStep: (row: number, step: number) => void;
  seqPlay: () => void;
  seqStop: () => void;
  setSeqBpm: (bpm: number) => void;
  setSeqSwing: (swing: number) => void;
  seqClear: () => void;
  /** Iguala el BPM del secuenciador al BPM efectivo de un deck. */
  seqSyncToDeck: (deck: DeckId) => void;

  // ── Live Looping ──────────────────────────────────────────────────────────
  loopRecord: (slot: number) => void;
  loopTogglePlay: (slot: number) => void;
  loopClear: (slot: number) => void;
  loopStopAll: () => void;
  setLoopBars: (bars: number) => void;
  setLoopBpm: (bpm: number) => void;
  loopSyncToDeck: (deck: DeckId) => void;

  // ── Grabación ────────────────────────────────────────────────────────────
  startRecording: (mode: 'master' | 'tab') => Promise<void>;
  stopRecording: (name: string) => Promise<void>;
  refreshMixes: () => Promise<void>;
  /** Exporta los decks cargados como stems WAV + project.json en un .zip. */
  exportStems: () => Promise<void>;
  /** Graba la sesión en vídeo (visualización + audio del máster) → .webm. */
  startVideoExport: () => Promise<void>;
  stopVideoExport: () => Promise<void>;

  // ── Biblioteca ─────────────────────────────────────────────────────────
  refreshLibrary: () => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
  /** Calcula etiquetas de ánimo para las pistas locales que aún no las tienen. */
  analyzeMoods: () => Promise<void>;

  // ── Smart Crates ─────────────────────────────────────────────────────────
  addCrate: (name: string, rules: CrateRule[]) => void;
  removeCrate: (id: string) => void;
  /** Envía las pistas locales de un crate a la cola del Auto-DJ. */
  sendCrateToQueue: (id: string) => void;

  // ── Macros no-code ────────────────────────────────────────────────────────
  addMacro: (name: string, steps: MacroStep[]) => void;
  removeMacro: (id: string) => void;
  runMacro: (id: string) => Promise<void>;
  stopMacro: () => void;
  /** Dispara un pad del sampler (usado por el runtime de macros). */
  triggerSample: (padId: string) => void;

  // ── Luces inteligentes ────────────────────────────────────────────────────
  toggleLights: () => void;
  connectBluetoothLight: () => Promise<void>;
  disconnectBluetoothLight: () => void;
  /** Envía un color a la bombilla BLE (con throttle); no-op si no hay luz. */
  pushLightColor: (r: number, g: number, b: number) => void;

  // ── Respaldo (Bring Your Own Cloud) ────────────────────────────────────────
  downloadBackup: (includeBlobs: boolean) => Promise<void>;
  restoreBackup: (file: File, mode: 'merge' | 'replace') => Promise<void>;
  connectGoogleDrive: (clientId: string) => Promise<void>;
  backupToDrive: () => Promise<void>;
  listDriveBackups: () => Promise<void>;
  restoreFromDrive: (fileId: string) => Promise<void>;

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
  audioStyle: 'off',
  sidechain: { enabled: false, amount: 14 },
  samplerLabels: null,
  midi: {
    supported: typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function',
    enabled: false,
    inputs: [],
    learning: null,
    mappings: {},
  },
  sequencer: { playing: false, bpm: 120, swing: 0, step: -1, rows: defaultSeqRows() },
  loops: {
    bpm: 120,
    bars: 4,
    slots: [
      { hasAudio: false, playing: false, recording: false },
      { hasAudio: false, playing: false, recording: false },
      { hasAudio: false, playing: false, recording: false },
      { hasAudio: false, playing: false, recording: false },
    ],
  },

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
  crates: [],
  macros: [],
  runningMacro: null,
  lights: {
    on: true,
    btSupported: bluetoothLightSupported(),
    btConnected: false,
    btName: '',
  },
  recording: false,
  videoRecording: false,
  status: { busy: false, message: '', progress: 0 },

  copilot: { advice: null, librarySuggestions: [], youtubeSuggestions: [], loading: false },
  settings: { youtubeApiKey: '', aiApiKey: '' },
  driveToken: null,
  driveFiles: [],
  theme: DEFAULT_THEME_ID,
  showTour: false,

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

    // ── Restaurar tema/skin ────────────────────────────────────────────────
    const savedTheme = await getSetting<string>('theme');
    if (savedTheme) {
      applyTheme(savedTheme);
      set({ theme: savedTheme });
    }

    // ── Restaurar mapeos MIDI guardados (no abre acceso hasta que el usuario
    //     pulse "Activar MIDI"; solo recupera las asignaciones). ─────────────
    const savedMidi = await getSetting<Record<string, string>>('midiMappings');
    if (savedMidi && typeof savedMidi === 'object') {
      set((s) => ({ midi: { ...s.midi, mappings: savedMidi } }));
    }

    // ── Restaurar patrón del secuenciador (o dejar el groove por defecto) ───
    const savedSeq = await getSetting<{ bpm: number; swing: number; rows: SeqRow[] }>('seqPattern');
    if (savedSeq && Array.isArray(savedSeq.rows) && savedSeq.rows.length) {
      engine.sequencer.setBpm(savedSeq.bpm ?? 120);
      engine.sequencer.setSwing(savedSeq.swing ?? 0);
      engine.sequencer.setRows(savedSeq.rows);
      set((s) => ({
        sequencer: { ...s.sequencer, bpm: savedSeq.bpm ?? 120, swing: savedSeq.swing ?? 0, rows: savedSeq.rows },
      }));
    } else {
      engine.sequencer.setRows(get().sequencer.rows);
    }

    // ── Restaurar estilo DSP del máster ────────────────────────────────────
    const savedStyle = await getSetting<string>('audioStyle');
    if (savedStyle) {
      engine.effects.setStyle(savedStyle);
      set({ audioStyle: savedStyle });
    }

    // ── Restaurar Smart Crates ─────────────────────────────────────────────
    const savedCrates = await getSetting<SmartCrate[]>('smartCrates');
    if (Array.isArray(savedCrates)) set({ crates: savedCrates });

    // ── Restaurar Macros ───────────────────────────────────────────────────
    const savedMacros = await getSetting<Macro[]>('macros');
    if (Array.isArray(savedMacros)) set({ macros: savedMacros });

    // ── Live Looping: reflejar el estado de los slots en la UI ─────────────
    engine.loops.setBpm(get().loops.bpm);
    engine.loops.setBars(get().loops.bars);
    engine.loops.setOnUpdate(() =>
      set((s) => ({ loops: { ...s.loops, slots: engine.loops.getStates() } })),
    );

    // ── Tour de bienvenida en el primer arranque ───────────────────────────
    const onboarded = await getSetting<boolean>('onboarded');
    if (!onboarded) set({ showTour: true });

    await Promise.all([get().refreshLibrary(), get().refreshMixes()]);

    // ── Media Session (controles del sistema / segundo plano) ──────────────
    setupMediaSession({
      onPlay: () => {
        const { decks } = get();
        const id: DeckId = decks.A.trackId ? 'A' : 'B';
        if (!decks[id].playing) get().togglePlay(id);
      },
      onPause: () => {
        const { decks } = get();
        (['A', 'B'] as DeckId[]).forEach((id) => decks[id].playing && get().togglePlay(id));
      },
      onNext: () => {
        if (get().autoDj.enabled) get().autoDjTransition();
      },
      onPrevious: () => {
        const { decks } = get();
        const id: DeckId = decks.A.playing ? 'A' : 'B';
        get().seek(id, 0);
      },
    });
    // Reanudar el contexto de audio al volver a la app (política de background).
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void engine.resume();
    });

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
        const ducking = eng.getSidechainDuck(id) < -1.5;
        if (Math.abs(pos - d.position) > 0.03 || playing !== d.playing || ducking !== d.ducking) {
          next[id] = { ...d, position: pos, playing, ducking };
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

  setTheme(id) {
    applyTheme(id);
    void setSetting('theme', id);
    set({ theme: id });
  },

  setShowTour(v) {
    set({ showTour: v });
    if (!v) void setSetting('onboarded', true);
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
        // Mood Tagger en Web Worker (no bloquea la UI).
        const moodTags = await analyzeMood(decoded.buffer, bpm.bpm);
        await saveTrack({
          title: decoded.title,
          engine: 'local',
          format: file.type || file.name.split('.').pop(),
          bpm: bpm.bpm,
          camelotKey: key.camelot,
          energy: bpm.energy,
          duration: decoded.buffer.duration,
          moodTags,
          blob: decoded.sourceBlob,
        });
      } catch (err) {
        set({ status: { busy: false, message: `Error con ${file.name}: ${(err as Error).message}`, progress: 0 } });
        continue;
      }
    }
    // Respeta el tope de pistas locales (borra las más antiguas si se supera).
    const pruned = await enforceTrackLimit(TRACK_LIMIT);
    const doneMsg = pruned > 0
      ? `Importación completada · tope de ${TRACK_LIMIT} pistas (se quitaron ${pruned} antiguas)`
      : 'Importación completada';
    set({ status: { busy: false, message: doneMsg, progress: 1 } });
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

    // Smart Cues: si la pista no tiene cues guardados, se detectan solos.
    let cues = meta.cues;
    if (!cues || cues.length === 0) {
      cues = detectSmartCues(buffer);
      if (cues.length > 0) void setTrackCues(meta.id, cues);
    }
    // El cue principal (◆ Cue) salta al primer Smart Cue (típicamente la intro).
    if (cues.length > 0) engine.getDeck(deck).setMainCue(cues[0]);

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
          cues,
          peaks: wave.peaks,
          waveBands: { low: wave.low, mid: wave.mid, high: wave.high },
        },
      },
    }));
    get().analyzeMix();
    get().syncMediaSession();
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

  syncMediaSession() {
    const { decks } = get();
    const id: DeckId = decks.A.playing ? 'A' : decks.B.playing ? 'B' : decks.A.trackId ? 'A' : 'B';
    updateMediaSession({ title: decks[id].title, playing: decks.A.playing || decks.B.playing });
  },

  togglePlay(deck) {
    const { engine } = get();
    if (!engine) return;
    if (engine.getEngine(deck) === 'youtube') engine.getYouTubeDeck(deck).togglePlay();
    else engine.getDeck(deck).togglePlay();
    // Reflejar el nuevo estado en los controles del sistema.
    setTimeout(() => get().syncMediaSession(), 0);
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

  // ── Jog wheel (nudge / scratch de plato) ────────────────────────────────
  deckNudge(deck, bend) {
    const { engine } = get();
    if (!engine || engine.getEngine(deck) === 'youtube') return;
    engine.getDeck(deck).setBend(bend);
  },

  deckScrub(deck, deltaSeconds) {
    const { engine } = get();
    if (!engine || engine.getEngine(deck) === 'youtube') return;
    const d = engine.getDeck(deck);
    d.scrub(deltaSeconds);
    // Reflejar la nueva posición de inmediato (el tick la confirmará luego).
    set((s) => ({ decks: { ...s.decks, [deck]: { ...s.decks[deck], position: d.position } } }));
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
    // Efecto de transición: sube el echo/reverb durante el crossfade para que
    // la mezcla suene fluida aunque cambie el género.
    engine.effects.setEcho(Math.max(get().fx.echo, 0.32));
    engine.effects.setReverb(Math.max(get().fx.reverb, 0.18));

    // Al terminar el crossfade: cerrar, parar el saliente y preparar el siguiente.
    window.setTimeout(() => {
      const eng = get().engine;
      if (!eng) return;
      eng.finishAutoTransition(from, to);
      // Restaurar los FX a lo que tenía el usuario antes de la transición.
      eng.effects.setEcho(get().fx.echo);
      eng.effects.setReverb(get().fx.reverb);
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
  setAudioStyle(id) {
    get().engine?.effects.setStyle(id);
    void setSetting('audioStyle', id);
    set({ audioStyle: id });
  },

  toggleSidechain() {
    const { engine, sidechain } = get();
    if (!engine) return;
    const enabled = !sidechain.enabled;
    engine.setSidechain(enabled);
    set({ sidechain: { ...sidechain, enabled } });
  },
  setSidechainAmount(db) {
    get().engine?.setSidechainAmount(db);
    set((s) => ({ sidechain: { ...s.sidechain, amount: db } }));
  },

  autoSlice(deck) {
    const { engine } = get();
    if (!engine) return;
    const buffer = engine.getDeckBuffer(deck);
    if (!buffer) {
      set({ status: { busy: false, message: `Carga una pista en el Deck ${deck} para cortarla.`, progress: 0 } });
      return;
    }
    const slices = sliceBuffer(engine.ctx, buffer, 8);
    if (slices.length === 0) {
      set({ status: { busy: false, message: 'No se detectaron cortes en la pista.', progress: 0 } });
      return;
    }
    slices.forEach((s, i) =>
      engine.sampler.setPad({ id: `pad-${i}`, label: s.label, buffer: s.buffer, gain: 0.9, loop: false }),
    );
    // Rellenar los pads restantes (si hubo <8 cortes) con silencio inofensivo.
    const labels: string[] = slices.map((s) => s.label);
    for (let i = slices.length; i < 8; i++) labels.push('—');
    set({
      samplerLabels: labels,
      status: { busy: false, message: `Deck ${deck} cortado en ${slices.length} pads.`, progress: 1 },
    });
  },

  resetSampler() {
    const { engine } = get();
    if (engine) {
      createDrumSamples(engine.ctx).forEach((p) => engine.sampler.setPad(p));
    }
    set({ samplerLabels: null });
  },

  // ── MIDI (Web MIDI API) ──────────────────────────────────────────────────
  async initMidi() {
    const midi = get().midi;
    if (!midi.supported) {
      set({
        status: {
          busy: false,
          message: 'Tu navegador no soporta Web MIDI. Usa Chrome/Edge de escritorio.',
          progress: 0,
        },
      });
      return;
    }
    if (midiController) {
      set({ midi: { ...get().midi, enabled: true } });
      return;
    }
    const controller = new MidiController();

    // Handler de cada mensaje entrante: aprende o aplica el mapeo.
    const handleMidi = (msg: MidiMessage) => {
      const key = controlKey(msg.kind, msg.channel, msg.control);
      const current = get().midi;

      // MIDI Learn: asigna este control físico al destino en aprendizaje.
      if (current.learning) {
        const mappings: Record<string, string> = {};
        // Conserva los demás mapeos salvo los que apunten a este destino o
        // usen este mismo control (para reasignar limpio).
        for (const [k, v] of Object.entries(current.mappings)) {
          if (v === current.learning || k === key) continue;
          mappings[k] = v;
        }
        mappings[key] = current.learning;
        void setSetting('midiMappings', mappings);
        set({ midi: { ...get().midi, mappings, learning: null } });
        return;
      }

      const targetId = current.mappings[key];
      if (!targetId) return;
      const target = MIDI_TARGETS.find((t) => t.id === targetId);
      if (!target) return;

      if (target.kind === 'button') {
        // Botones: dispara solo en el flanco de subida (evita doble disparo con
        // el note-off o con un CD que manda 127 y luego 0).
        const prev = midiLastValue.get(key) ?? 0;
        midiLastValue.set(key, msg.value);
        if (prev < 0.5 && msg.value >= 0.5) applyMidiTarget(targetId, 1, get());
      } else {
        midiLastValue.set(key, msg.value);
        applyMidiTarget(targetId, msg.value, get());
      }
    };

    try {
      const ok = await controller.init(handleMidi, (inputs) =>
        set((s) => ({ midi: { ...s.midi, inputs } })),
      );
      if (!ok) {
        set({ status: { busy: false, message: 'No se pudo activar MIDI.', progress: 0 } });
        return;
      }
      midiController = controller;
      set({
        midi: { ...get().midi, enabled: true, inputs: controller.inputs },
        status: {
          busy: false,
          message: controller.inputs.length
            ? `MIDI activo: ${controller.inputs.join(', ')}`
            : 'MIDI activo (conecta un controlador).',
          progress: 1,
        },
      });
    } catch (err) {
      set({ status: { busy: false, message: `MIDI: ${(err as Error).message}`, progress: 0 } });
    }
  },

  startMidiLearn(targetId) {
    set((s) => ({ midi: { ...s.midi, learning: targetId } }));
  },

  cancelMidiLearn() {
    set((s) => ({ midi: { ...s.midi, learning: null } }));
  },

  clearMidiMapping(targetId) {
    const mappings: Record<string, string> = {};
    for (const [k, v] of Object.entries(get().midi.mappings)) {
      if (v !== targetId) mappings[k] = v;
    }
    void setSetting('midiMappings', mappings);
    set((s) => ({ midi: { ...s.midi, mappings } }));
  },

  // ── Secuenciador de pasos (drum machine) ────────────────────────────────
  seqToggleStep(row, step) {
    const rows = get().sequencer.rows.map((r, i) =>
      i === row ? { ...r, steps: r.steps.map((v, j) => (j === step ? !v : v)) } : r,
    );
    get().engine?.sequencer.setRows(rows);
    set((s) => ({ sequencer: { ...s.sequencer, rows } }));
    void setSetting('seqPattern', { bpm: get().sequencer.bpm, swing: get().sequencer.swing, rows });
  },

  seqPlay() {
    const { engine, sequencer } = get();
    if (!engine) return;
    engine.sequencer.setRows(sequencer.rows);
    engine.sequencer.setBpm(sequencer.bpm);
    engine.sequencer.setSwing(sequencer.swing);
    void engine.resume();
    engine.sequencer.start((step) => set((s) => ({ sequencer: { ...s.sequencer, step } })));
    set((s) => ({ sequencer: { ...s.sequencer, playing: true } }));
  },

  seqStop() {
    get().engine?.sequencer.stop();
    set((s) => ({ sequencer: { ...s.sequencer, playing: false, step: -1 } }));
  },

  setSeqBpm(bpm) {
    const clamped = Math.max(40, Math.min(220, Math.round(bpm)));
    get().engine?.sequencer.setBpm(clamped);
    set((s) => ({ sequencer: { ...s.sequencer, bpm: clamped } }));
    void setSetting('seqPattern', { bpm: clamped, swing: get().sequencer.swing, rows: get().sequencer.rows });
  },

  setSeqSwing(swing) {
    const clamped = Math.max(0, Math.min(0.6, swing));
    get().engine?.sequencer.setSwing(clamped);
    set((s) => ({ sequencer: { ...s.sequencer, swing: clamped } }));
    void setSetting('seqPattern', { bpm: get().sequencer.bpm, swing: clamped, rows: get().sequencer.rows });
  },

  seqClear() {
    const rows = get().sequencer.rows.map((r) => ({ ...r, steps: emptySteps(16) }));
    get().engine?.sequencer.setRows(rows);
    set((s) => ({ sequencer: { ...s.sequencer, rows } }));
    void setSetting('seqPattern', { bpm: get().sequencer.bpm, swing: get().sequencer.swing, rows });
  },

  seqSyncToDeck(deck) {
    const d = get().decks[deck];
    if (!d.bpm) {
      set({ status: { busy: false, message: `El Deck ${deck} no tiene BPM analizado.`, progress: 0 } });
      return;
    }
    const eff = Math.round(d.bpm * (1 + d.tempo / 100));
    get().setSeqBpm(eff);
  },

  // ── Live Looping ──────────────────────────────────────────────────────────
  loopRecord(slot) {
    const { engine } = get();
    if (!engine) return;
    void engine.resume();
    engine.loops.armRecord(slot);
  },
  loopTogglePlay(slot) {
    get().engine?.loops.togglePlay(slot);
  },
  loopClear(slot) {
    get().engine?.loops.clear(slot);
  },
  loopStopAll() {
    get().engine?.loops.stopAll();
  },
  setLoopBars(bars) {
    const b = Math.max(1, Math.min(8, Math.round(bars)));
    get().engine?.loops.setBars(b);
    set((s) => ({ loops: { ...s.loops, bars: b } }));
  },
  setLoopBpm(bpm) {
    const b = Math.max(40, Math.min(220, Math.round(bpm)));
    get().engine?.loops.setBpm(b);
    set((s) => ({ loops: { ...s.loops, bpm: b } }));
  },
  loopSyncToDeck(deck) {
    const dk = get().decks[deck];
    if (!dk.bpm) {
      set({ status: { busy: false, message: `El Deck ${deck} no tiene BPM analizado.`, progress: 0 } });
      return;
    }
    get().setLoopBpm(Math.round(dk.bpm * (1 + dk.tempo / 100)));
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
      downloadBlob(blob, `beat-dj-project-${stamp}.zip`);
      set({ status: { busy: false, message: `ZIP exportado (${stems.length} stems)`, progress: 1 } });
    } catch (err) {
      set({ status: { busy: false, message: `Error al exportar: ${(err as Error).message}`, progress: 0 } });
    }
  },

  async startVideoExport() {
    const { engine } = get();
    if (!engine || videoRec) return;
    if (!SessionVideoRecorder.supported) {
      set({ status: { busy: false, message: 'Tu navegador no permite grabar vídeo del canvas.', progress: 0 } });
      return;
    }
    await engine.resume();
    videoRec = new SessionVideoRecorder(engine.analyser, engine.masterStream, () => {
      const d = get().decks;
      return { titleA: d.A.title, titleB: d.B.title, bpmA: d.A.bpm, bpmB: d.B.bpm };
    });
    try {
      videoRec.start(`${import.meta.env.BASE_URL}logo.png`);
      set({ videoRecording: true, status: { busy: false, message: 'Grabando vídeo de la sesión…', progress: 0 } });
    } catch (err) {
      videoRec = null;
      set({ status: { busy: false, message: `No se pudo grabar vídeo: ${(err as Error).message}`, progress: 0 } });
    }
  },

  async stopVideoExport() {
    if (!videoRec) return;
    try {
      const result = await videoRec.stop();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadBlob(result.blob, `beat-dj-video-${stamp}.webm`);
      set({
        videoRecording: false,
        status: { busy: false, message: `Vídeo exportado (${Math.round(result.durationMs / 1000)}s)`, progress: 1 },
      });
    } catch (err) {
      set({ videoRecording: false, status: { busy: false, message: `Error al exportar vídeo: ${(err as Error).message}`, progress: 0 } });
    } finally {
      videoRec = null;
    }
  },

  async refreshLibrary() {
    set({ library: await listTracks() });
  },

  async removeTrack(id) {
    await dbDeleteTrack(id);
    await get().refreshLibrary();
  },

  async analyzeMoods() {
    const { engine, library } = get();
    if (!engine) return;
    const pending = library.filter((t) => t.engine === 'local' && (!t.moodTags || t.moodTags.length === 0));
    if (pending.length === 0) {
      set({ status: { busy: false, message: 'Todas las pistas locales ya tienen ánimo.', progress: 1 } });
      return;
    }
    for (let i = 0; i < pending.length; i++) {
      const track = pending[i];
      set({ status: { busy: true, message: `Analizando ánimo ${i + 1}/${pending.length}…`, progress: i / pending.length } });
      try {
        const blob = await getTrackBlob(track.id);
        if (!blob) continue;
        const buffer = await engine.ctx.decodeAudioData(await blob.arrayBuffer());
        const tags = await analyzeMood(buffer, track.bpm);
        await setTrackMoods(track.id, tags);
      } catch {
        /* pista corrupta o no decodificable; se omite */
      }
    }
    await get().refreshLibrary();
    set({ status: { busy: false, message: `Ánimo analizado en ${pending.length} pistas.`, progress: 1 } });
  },

  // ── Smart Crates ─────────────────────────────────────────────────────────
  addCrate(name, rules) {
    if (rules.length === 0) {
      set({ status: { busy: false, message: 'Añade al menos una regla al crate.', progress: 0 } });
      return;
    }
    const crate: SmartCrate = { id: `crate_${Date.now()}`, name: name.trim() || 'Crate', rules };
    const crates = [...get().crates, crate];
    void setSetting('smartCrates', crates);
    set({ crates });
  },

  removeCrate(id) {
    const crates = get().crates.filter((c) => c.id !== id);
    void setSetting('smartCrates', crates);
    set({ crates });
  },

  sendCrateToQueue(id) {
    const crate = get().crates.find((c) => c.id === id);
    if (!crate) return;
    const ids = crateMatches(crate, get().library)
      .filter((t) => t.engine === 'local')
      .map((t) => t.id);
    if (ids.length === 0) {
      set({ status: { busy: false, message: `"${crate.name}" no tiene pistas locales.`, progress: 0 } });
      return;
    }
    set((s) => ({
      autoDj: { ...s.autoDj, queue: [...new Set([...s.autoDj.queue, ...ids])] },
      status: { busy: false, message: `${ids.length} pistas de "${crate.name}" → cola Auto-DJ`, progress: 1 },
    }));
  },

  // ── Macros no-code ────────────────────────────────────────────────────────
  triggerSample(padId) {
    get().engine?.sampler.trigger(padId);
  },

  // ── Luces inteligentes ────────────────────────────────────────────────────
  toggleLights() {
    const on = !get().lights.on;
    set((s) => ({ lights: { ...s.lights, on } }));
    if (!on && bleLight) void bleLight.setColor(0, 0, 0); // apagar la bombilla
  },

  async connectBluetoothLight() {
    if (!bluetoothLightSupported()) {
      set({ status: { busy: false, message: 'Web Bluetooth no disponible en este navegador.', progress: 0 } });
      return;
    }
    try {
      bleLight = await BleLight.connect();
      set((s) => ({
        lights: { ...s.lights, btConnected: true, btName: bleLight?.name ?? 'Luz BLE' },
        status: { busy: false, message: `Luz conectada: ${bleLight?.name ?? 'BLE'}`, progress: 1 },
      }));
    } catch (err) {
      set({ status: { busy: false, message: `No se pudo conectar la luz: ${(err as Error).message}`, progress: 0 } });
    }
  },

  disconnectBluetoothLight() {
    if (bleLight) {
      void bleLight.setColor(0, 0, 0);
      bleLight.disconnect();
      bleLight = null;
    }
    set((s) => ({ lights: { ...s.lights, btConnected: false, btName: '' } }));
  },

  pushLightColor(r, g, b) {
    if (!bleLight) return;
    const now = performance.now();
    if (now - lastLightSend < 90) return; // ~11 fps hacia la bombilla
    lastLightSend = now;
    void bleLight.setColor(r, g, b);
  },

  addMacro(name, steps) {
    if (steps.length === 0) {
      set({ status: { busy: false, message: 'Añade al menos un paso a la macro.', progress: 0 } });
      return;
    }
    const macro: Macro = { id: `macro_${Date.now()}`, name: name.trim() || 'Macro', steps };
    const macros = [...get().macros, macro];
    void setSetting('macros', macros);
    set({ macros });
  },

  removeMacro(id) {
    const macros = get().macros.filter((m) => m.id !== id);
    void setSetting('macros', macros);
    if (runningMacroId === id) runningMacroId = null;
    set({ macros, runningMacro: get().runningMacro === id ? null : get().runningMacro });
  },

  async runMacro(id) {
    const macro = get().macros.find((m) => m.id === id);
    if (!macro) return;
    void get().engine?.resume();
    runningMacroId = id;
    set({ runningMacro: id });
    await runMacro(macro, get(), () => runningMacroId !== id);
    if (runningMacroId === id) {
      runningMacroId = null;
      set({ runningMacro: null });
    }
  },

  stopMacro() {
    runningMacroId = null;
    set({ runningMacro: null });
  },

  // ── Respaldo (Bring Your Own Cloud) ────────────────────────────────────────
  async downloadBackup(includeBlobs) {
    set({ status: { busy: true, message: 'Generando respaldo…', progress: 0.4 } });
    try {
      const blob = await exportBackupBlob(includeBlobs);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadBlob(blob, `beat-dj-backup-${stamp}.json`);
      set({ status: { busy: false, message: 'Respaldo descargado', progress: 1 } });
    } catch (err) {
      set({ status: { busy: false, message: `Error al respaldar: ${(err as Error).message}`, progress: 0 } });
    }
  },

  async restoreBackup(file, mode) {
    set({ status: { busy: true, message: 'Restaurando respaldo…', progress: 0.4 } });
    try {
      const envelope = await parseBackupFile(file);
      const result = await importBackup(envelope, mode);
      await Promise.all([get().refreshLibrary(), get().refreshMixes()]);
      const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
      set({ status: { busy: false, message: `Restaurados ${total} registros (${mode})`, progress: 1 } });
    } catch (err) {
      set({ status: { busy: false, message: `Error al restaurar: ${(err as Error).message}`, progress: 0 } });
    }
  },

  async connectGoogleDrive(clientId) {
    try {
      await setSetting('googleClientId', clientId);
      const token = await connectDrive(clientId);
      set({ driveToken: token, status: { busy: false, message: 'Google Drive conectado', progress: 1 } });
      await get().listDriveBackups();
    } catch (err) {
      set({ status: { busy: false, message: (err as Error).message, progress: 0 } });
    }
  },

  async backupToDrive() {
    const { driveToken } = get();
    if (!driveToken) {
      set({ status: { busy: false, message: 'Conecta Google Drive primero.', progress: 0 } });
      return;
    }
    set({ status: { busy: true, message: 'Subiendo respaldo a Drive…', progress: 0.5 } });
    try {
      const envelope = await exportBackup(false);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      await driveUpload(driveToken, `beat-dj-backup-${stamp}.json`, JSON.stringify(envelope));
      set({ status: { busy: false, message: 'Respaldo guardado en tu Google Drive', progress: 1 } });
      await get().listDriveBackups();
    } catch (err) {
      set({ status: { busy: false, message: `Error en Drive: ${(err as Error).message}`, progress: 0 } });
    }
  },

  async listDriveBackups() {
    const { driveToken } = get();
    if (!driveToken) return;
    try {
      set({ driveFiles: await driveList(driveToken) });
    } catch (err) {
      set({ status: { busy: false, message: (err as Error).message, progress: 0 } });
    }
  },

  async restoreFromDrive(fileId) {
    const { driveToken } = get();
    if (!driveToken) return;
    set({ status: { busy: true, message: 'Descargando de Drive…', progress: 0.4 } });
    try {
      const text = await driveDownload(driveToken, fileId);
      const envelope = JSON.parse(text);
      const result = await importBackup(envelope, 'merge');
      await Promise.all([get().refreshLibrary(), get().refreshMixes()]);
      const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
      set({ status: { busy: false, message: `Restaurados ${total} registros desde Drive`, progress: 1 } });
    } catch (err) {
      set({ status: { busy: false, message: `Error al restaurar de Drive: ${(err as Error).message}`, progress: 0 } });
    }
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
