# 🎧 DJMIX — Estudio de Mezcla DJ (web, gratis, privado)

Aplicación web de DJ profesional **100% gratuita**, **sin registro** y **local-first**.
Mezcla música de **YouTube** con **tus archivos locales**, extrae audio de vídeos en el
navegador, graba tus sets y recibe asistencia de un **copiloto de IA**. Nada se sube a
ningún servidor: todo el procesamiento y el almacenamiento ocurre en tu dispositivo.

> Stack: **React + TypeScript + Vite · Web Audio API · FFmpeg.wasm · IndexedDB · YouTube IFrame API · IA opcional (Claude)**

---

## 1. Arquitectura técnica recomendada

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  UI (React)                                    │
│   Decks · Mezclador · Efectos/Sampler · Biblioteca · Grabador · Copiloto IA    │
└───────────────┬───────────────────────────────────────────────┬───────────────┘
                │ (zustand store: único puente UI ⇄ audio)       │
        ┌───────▼────────┐                               ┌────────▼─────────┐
        │  AudioEngine    │   Web Audio API graph         │  Copiloto (IA)   │
        │  Decks/Mixer/FX │◀── análisis (BPM, key, wave) ─│  DSP + LLM opc.  │
        └───────┬────────┘                               └──────────────────┘
     ┌──────────┼───────────────┬───────────────┐
     ▼          ▼               ▼               ▼
 Deck local   YouTubeDeck    Sampler        Recorder
 (AudioBuffer)(IFrame API)  (synth pads)   (MediaRecorder)
     │                                          │
     ▼                                          ▼
 FFmpeg.wasm (vídeo→audio)              IndexedDB (idb)
 decodeAudioData                        tracks · mixes · sessions · settings
```

### Stack y por qué

| Capa | Tecnología | Motivo |
|------|-----------|--------|
| UI | **React 18 + TypeScript** | Componentes modulares, tipado fuerte para el grafo de audio. |
| Build | **Vite** | Dev server rápido; configura las cabeceras COOP/COEP para FFmpeg.wasm. |
| Estado | **Zustand** | Store mínimo y sin boilerplate; único puente entre React y el motor de audio (que es imperativo). |
| Audio | **Web Audio API** | EQ, crossfader, efectos, análisis y grabación con latencia baja. |
| Vídeo→Audio | **FFmpeg.wasm** | Extracción/*transcoding* local (MP4/MOV → MP3), sin backend. |
| YouTube | **IFrame Player API** | Reproduce con la sesión oficial del usuario (respeta Premium: sin anuncios). |
| Persistencia | **IndexedDB** (`idb`) | Guarda blobs de audio y mixes en disco, no en RAM. |
| IA | **Claude API (opcional)** | Recomendaciones en lenguaje natural; el copiloto también funciona 100% offline. |

**Principio de diseño:** el `AudioEngine` (carpeta `src/audio`) es **agnóstico de React**.
Toda la lógica de sonido vive ahí como clases puras; la UI solo lee estado y llama
acciones del store. Esto mantiene el código testeable y desacoplado.

---

## 2. Manejo de vídeo y YouTube

### 2.1 Reproducción de YouTube respetando Premium (sin anuncios)

La música de YouTube se reproduce **siempre dentro del reproductor oficial** (IFrame
Player API), que corre bajo `youtube.com` con **las cookies y la sesión del usuario**.
Si esa sesión tiene **YouTube Premium**, YouTube sirve el contenido **sin anuncios de
forma nativa**. No "esquivamos" publicidad: **delegamos** la reproducción al reproductor
oficial, que respeta la suscripción. → `src/media/youtube.ts`, `src/audio/YouTubeDeck.ts`.

> ⚠️ **La barrera cross-origin (importante y honesto).**
> El audio de un iframe de YouTube es de **origen cruzado**: el navegador **no permite**
> capturarlo ni enrutarlo por el grafo de Web Audio. Consecuencias de diseño:
> - Un deck de YouTube **no** puede pasar por EQ/filtros/efectos de Web Audio.
> - Su "mezcla" se hace por **volumen** (`player.setVolume`), que es lo que usa el crossfader.
> - Su tempo está **limitado** a las velocidades que YouTube permite (0.25/0.5/1/1.5/2),
>   por lo que el beatmatching fino no es posible en YouTube (sí en pistas locales).
> - **La grabación del máster de Web Audio no incluye YouTube.** Para grabar mixes que
>   combinen YouTube + locales, DJMIX ofrece el **modo "Pestaña"** (`getDisplayMedia`
>   con *compartir audio*), que captura todo el audio de la pestaña. → `src/audio/Recorder.ts`.

**Resumen práctico:** para control total (EQ, efectos, beatmatch, grabación limpia),
usa pistas **locales**. YouTube es ideal como fuente/descubrimiento y para sets donde
el control por volumen es suficiente.

### 2.2 Extracción de audio desde vídeo (Video → Audio) en el navegador

Cuando el usuario sube un vídeo (MP4/MOV/MKV/WEBM…), DJMIX lo procesa **localmente** con
**FFmpeg.wasm**: descarta el vídeo (`-vn`) y transcodifica la pista de audio a MP3
(`libmp3lame`). El MP3 resultante se decodifica a `AudioBuffer` y queda listo para mezclar.

```ts
// src/media/ffmpeg.ts (resumen)
await ffmpeg.writeFile('input.mp4', await fetchFile(file));
await ffmpeg.exec(['-i', 'input.mp4', '-vn', '-acodec', 'libmp3lame', '-b:a', '192k', 'out.mp3']);
const data = await ffmpeg.readFile('out.mp3');          // Uint8Array
const blob = new Blob([data], { type: 'audio/mpeg' });  // → decodeAudioData → AudioBuffer
```

- **Privacidad:** el binario WebAssembly se descarga una vez (y se cachea), pero **el
  archivo del usuario nunca sale del dispositivo**.
- **Cross-origin isolation:** `vite.config.ts` añade las cabeceras `COOP: same-origin` y
  `COEP: require-corp` (necesarias para `SharedArrayBuffer`). **Replícalas en producción.**
- Formatos de audio comunes (MP3/WAV/FLAC/OGG) los decodifica el navegador directamente;
  FFmpeg solo entra para vídeo o códecs poco habituales. → `src/media/decode.ts`.

---

## 3. Estructura de datos local (IndexedDB)

Definida con `idb` en `src/storage/db.ts`. La clave anti-saturación de memoria es
**separar los metadatos ligeros de los blobs pesados**, para que listar la biblioteca
o el historial no cargue el audio en RAM.

| Store | Clave | Contenido | Peso |
|-------|-------|-----------|------|
| `tracks` | `id` | Metadatos de pista: título, `engine`, `bpm`, `camelotKey`, `energy`, `duration`, `cues[]`, `size` | ligero |
| `trackBlobs` | `id` | Blob de audio (original o extraído) — **se carga bajo demanda** | pesado |
| `mixes` | `id` | Metadatos del mix grabado: nombre, `mimeType`, `durationMs`, `size` | ligero |
| `mixBlobs` | `id` | Blob del mix grabado | pesado |
| `sessions` | `id` | Snapshot del estado del estudio (asignación de decks, EQ, crossfader…) | ligero |
| `settings` | `key` | Preferencias y **claves API del usuario** (nunca salen del navegador) | ligero |

Índices `by-createdAt` para orden cronológico. Helpers:
`getStorageEstimate()` avisa del uso vs. cuota del dispositivo; `newId()` genera ids
ordenables en el tiempo. Repositorios: `src/storage/{tracks,mixes,settings}.ts`.

```
Importar audio/vídeo ─▶ decode/FFmpeg ─▶ detectBpm + detectKey ─▶ saveTrack()
                                                                     │
Biblioteca (solo metadatos) ◀── listTracks() ──────────────────────┘
   │ click "▶ A"
   ▼ getTrackBlob(id) → decodeAudioData → Deck A
```

---

## 4. Código base modular

```
src/
├── audio/            # Motor de audio (Web Audio API), agnóstico de React
│   ├── AudioEngine.ts    # Grafo máster: decks + mixer + FX + limiter + grabación
│   ├── Deck.ts           # Deck local (AudioBufferSourceNode): play/cue/tempo/seek
│   ├── YouTubeDeck.ts    # Deck YouTube (IFrame API): play/seek/volumen/tempo limitado
│   ├── Eq3.ts            # EQ de 3 bandas (low/mid/high) tipo mesa DJ
│   ├── Effects.ts        # FX máster: filtro, reverb (convolver), echo (delay+feedback)
│   ├── Sampler.ts        # Pads polifónicos
│   ├── synthSamples.ts   # Samples de batería/FX sintéticos (sin archivos externos)
│   ├── Recorder.ts       # MediaRecorder (modo máster o pestaña con getDisplayMedia)
│   └── types.ts
├── media/            # Fuentes y procesamiento
│   ├── ffmpeg.ts         # Vídeo→audio (FFmpeg.wasm) + conversión a MP3
│   ├── decode.ts         # File → AudioBuffer (audio nativo o vía FFmpeg)
│   └── youtube.ts        # IFrame API ready · parseo de IDs · búsqueda Data API v3
├── analysis/         # DSP para el copiloto
│   ├── bpm.ts            # Detección de BPM + energía (offline render + picos)
│   ├── key.ts            # Tonalidad (chroma Goertzel + Krumhansl-Schmuckler)
│   ├── camelot.ts        # Rueda de Camelot y compatibilidad armónica
│   └── waveform.ts       # Peaks para la forma de onda
├── ai/               # Copiloto DJ
│   ├── AIProvider.ts     # Abstracción (Claude vía navegador) o modo nulo (offline)
│   ├── copilot.ts        # Auto-sync, análisis de transición, ranking, recomendaciones
│   └── prompts.ts
├── storage/          # IndexedDB (idb)
│   ├── db.ts · tracks.ts · mixes.ts · settings.ts
├── state/
│   └── store.ts          # Zustand: puente UI ⇄ AudioEngine + acciones
├── components/       # UI React (Deck, Mixer, Effects, Library, Recorder, Copilot, Settings, ui/)
├── App.tsx · main.tsx · styles/global.css
```

### Puntos destacables del motor de audio

- **Grafo máster** (`AudioEngine`): `decks → crossfader → MasterEffects → masterGain →
  limiter → destino`, con una derivación a `MediaStreamAudioDestinationNode` para grabar.
- **Crossfader de igual potencia:** curva `cos/sin` que aplica la ganancia al motor
  correcto (GainNode local **o** volumen del iframe de YouTube).
- **EQ "kill":** cada banda atenúa hasta −26 dB para cortes limpios.
- **Grabación:** `MediaRecorder` sobre el máster (webm/opus); descarga directa o
  conversión opcional a **MP3** con FFmpeg.

### El copiloto DJ (con y sin IA)

- **Sin clave de IA (por defecto, 100% offline):** análisis DSP local — `detectBpm`,
  `detectKey` (→ Camelot), `analyzeTransition` (beatmatch, compatibilidad armónica,
  progresión de energía, **consejos de EQ para evitar saturación de frecuencias**),
  `computeAutoSync` (% de tempo para igualar BPM) y `rankLibrary` (recomienda de tu
  biblioteca por armonía + BPM + energía).
- **Con clave de IA (opcional):** `recommendYouTube` pide sugerencias de tracks reales
  en lenguaje natural y genera consultas de búsqueda óptimas para YouTube.

---

## 5. Cómo ejecutar

```bash
npm install
npm run dev       # http://localhost:5173  (COOP/COEP ya configuradas)
npm run build     # tsc --noEmit && vite build  → dist/
npm run preview   # sirve dist/ con las cabeceras correctas
```

**Producción:** sirve `dist/` con estas dos cabeceras (imprescindibles para FFmpeg.wasm):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Claves API (todas opcionales)

La app funciona sin ninguna clave. Para funciones extra, el usuario las introduce en
**Ajustes** (se guardan solo en su navegador) o vía `.env` para despliegues demo
(ver `.env.example`):

- `VITE_YOUTUBE_API_KEY` → habilita el **buscador** de YouTube (sin ella, se carga por URL/ID).
- `VITE_AI_API_KEY` (+ `VITE_AI_MODEL`) → copiloto en **lenguaje natural** (sin ella, hay heurísticas DSP).

---

## 6. Privacidad y modelo gratis

- **Sin registro, sin muros de pago, sin base de datos central.** No existe backend de DJMIX.
- Mixes, pistas, cues, historial y ajustes viven **solo** en IndexedDB del navegador.
- Las claves API que introduzca el usuario **nunca** se envían a un servidor de DJMIX
  (solo, si acaso, a la API del proveedor que el propio usuario elija).
- El procesamiento de vídeo/audio es **local** (FFmpeg.wasm + Web Audio API).

---

## 7. Limitaciones honestas y mejoras futuras

| Tema | Estado actual | Mejora futura |
|------|---------------|---------------|
| Tempo/pitch | Varispeed (tempo y tono acoplados, como el vinilo) | Time-stretch independiente (SoundTouch/phase-vocoder en AudioWorklet) |
| EQ/FX en YouTube | No disponible (cross-origin) | — (limitación de plataforma; usar pistas locales) |
| Beatmatch YouTube | Velocidades discretas | — (limitación de la IFrame API) |
| Detección BPM/key | Heurística ligera en el cliente | Modelos más precisos (esencia/essentia.js) en Web Worker |
| Análisis pesado | En el hilo principal | Mover `detectBpm`/`detectKey`/FFmpeg a Web Workers |
| Búsqueda YouTube | Requiere Data API key (cuota gratis) | Proxy propio opcional para búsquedas sin key |

---

Hecho para mezclar libremente. **Web Audio API · FFmpeg.wasm · IndexedDB.**
