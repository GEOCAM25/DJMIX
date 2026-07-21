# 🗺️ DJMIX — Roadmap de construcción

Estado de las características solicitadas. Se construye por lotes; cada lote se
verifica (typecheck + build + prueba headless) **antes** de subir, y el push
actualiza el link en vivo (GitHub Pages) automáticamente.

> **Link en vivo:** `https://geocam25.github.io/DJMIX/`
> (requiere activar Pages una sola vez — ver README §5.1).

## ✅ Base (Fase 1)
- [x] Decks A/B (play, cue, hot-cues, pitch/tempo, seek, sync)
- [x] Mezclador: crossfader (igual potencia), EQ 3 bandas, filtros, ganancia, máster
- [x] Efectos en vivo (reverb, echo, filtro máster) + sampler (samples sintéticos)
- [x] Grabación de mixes (máster Web Audio o pestaña con getDisplayMedia)
- [x] Fuentes: YouTube (IFrame API, respeta Premium) + archivos locales (MP3/WAV/FLAC)
- [x] Vídeo→audio local con FFmpeg.wasm
- [x] Local-first: IndexedDB (metadatos y blobs separados), 100% privado
- [x] Copiloto IA: BPM, tonalidad (Camelot), auto-sync, consejos EQ, recomendaciones

## ✅ Fase 2 (rendimiento + publicación)
- [x] **Pre-cueing** (monitoreo por audífonos con `setSinkId`, independiente del crossfader)
- [x] **Ondas inteligentes** (coloreadas por frecuencia: graves/medios/agudos)
- [x] **Visualizador reactivo** a pantalla completa (AnalyserNode)
- [x] **PWA instalable** (manifest + Service Worker offline) para móvil y escritorio
- [x] **Despliegue automático** en GitHub Pages (workflow CI)

## ✅ Fase Final — en progreso
- [x] **Auto-DJ (Piloto Automático)**: beatmatch + crossfade lineal con “bass swap”
- [ ] **Live Looping Station** (4 canales, grabación por compases, loops sincronizados)
- [ ] **Control de luces inteligentes** (Web Bluetooth / HTTP; Philips Hue + genérico)
- [ ] **Exportación multi-pista a ZIP** (stems WAV con JSZip)

## ⏳ DJ-Pro (pendiente)
- [ ] Controladores MIDI (Web MIDI API + mapeo CC)
- [ ] Smart EQ / sidechain (auto-ducking de graves con `DynamicsCompressorNode`)
- [ ] Scratch realista (jog wheels, manipulación de `playbackRate`)
- [ ] Exportación de sesión en **vídeo** (canvas + máster → WebM)

## ⏳ Herramientas creativas (pendiente)
- [ ] Smart Crates (carpetas inteligentes por reglas en IndexedDB)
- [ ] Secuenciador de pasos (drum machine 16 pasos sincronizada al reloj)
- [ ] Sesiones P2P (WebRTC DataChannels)

## ⏳ Estudio Ultra-Premium (pendiente)
- [ ] Grabación vocal en vivo + **Auto-Tune** (AudioWorklet, baja latencia)
- [ ] Efectos vocales premium (reverb/delay/compresión en tiempo real)
- [ ] Línea de tiempo para alinear voz + música
- [ ] **Vocal Remover / stems** con ONNX Runtime Web (cliente, sin servidor)
- [ ] **Time-stretching** (cambiar BPM sin alterar el tono)
- [ ] Onboarding con tour guiado (react-joyride / intro.js)

## ⏳ Rendimiento
- [ ] Mover procesamiento pesado (BPM/key/FFmpeg/ONNX) a **Web Workers**
