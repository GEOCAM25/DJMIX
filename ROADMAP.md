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
- [x] **Exportación multi-pista a ZIP** (stems WAV con JSZip + project.json)
- [x] **Live Looping Station** (4 pistas, captura por compases sample-accurate, loops multipista)
- [x] **Control de luces inteligentes**: rig reactivo en pantalla + bombilla RGB por Web Bluetooth (ELK-BLEDOM genérico)

## ⏳ DJ-Pro (pendiente)
- [x] Smart EQ / Sidechain (auto-ducking de graves del deck secundario según el kick del principal)
- [x] Controladores MIDI (Web MIDI API + mapeo CC/nota con **MIDI Learn**, persistente)
- [x] Jog wheels (plato): nudge/pitch-bend al reproducir + scratch/scrub en pausa (`playbackRate`)
- [x] Exportación de sesión en **vídeo** (visualización con marca + máster → WebM)

## ⏳ Herramientas creativas (pendiente)
- [x] Smart Crates (carpetas inteligentes por reglas: BPM/energía/clave/título/fuente → Auto-DJ)
- [x] Secuenciador de pasos (drum machine 16 pasos, scheduling de audio, swing, Sync a deck)
- [ ] Sesiones P2P (WebRTC DataChannels)

## ⏳ Estudio Ultra-Premium (pendiente)
- [x] **Voz en vivo** (micrófono → máster: se oye y se graba en audio/vídeo)
- [x] Efectos vocales (pasa-altos + compresor + reverb/delay en tiempo real)
- [x] **Auto-Tune** de la voz (AudioWorklet: detección de tono + pitch-shift granular).
      Ahora con **escala musical** (cromática / mayor / menor + tónica) y velocidad
      de retune según la intensidad (natural ↔ robótico tipo T-Pain).
- [x] **Micrófono de ANIMADOR (talkover)**: mientras suena la música, la persona
      habla por el micrófono y la música se **agacha sola** (auto-ducking) y vuelve
      a subir al callar. Bus de música separado del máster (la voz nunca se agacha);
      nivel de "música de fondo al hablar" y volumen de voz ajustables.
- [ ] Línea de tiempo para alinear voz + música
- [ ] **Vocal Remover / stems** con ONNX Runtime Web (cliente, sin servidor)
- [x] **Time-stretching / Key Lock** (cambia el BPM sin alterar el tono; pitch-shifter que compensa el varispeed)
- [x] Onboarding con tour guiado (spotlight propio, sin dependencias; reabrible desde Ajustes)

## ⏳ Transmisión y Respaldo
- [x] Respaldo en la nube (export/import de IndexedDB a JSON; Google Drive appDataFolder vía OAuth2 cliente, sin backend)
- [ ] Radio Web (WebCodecs para codificar el máster + WebSocket a Icecast/Node; botón ON AIR)
- [ ] Modo V-Tuber / Avatar DJ (MediaPipe Face Mesh; avatar en canvas reactivo al máster)

## ⏳ Automatización, Macros y Control Remoto
- [x] Motor de temas/skins dinámicos (variables CSS + selector: Oscuro Pro, Anime, B/N, Club Neón)
- [x] Creador de Macros no-code (encadena acciones con tiempos, reproduce/aborta, guardadas en IndexedDB)
- [x] Auto-Slicer de samples (detección de transitorios → 8 slices → pads del sampler)
- [ ] Companion App / control remoto (WebRTC/WebSocket para tablet/celular)

## ⏳ IA Avanzada (coproductor)
- [x] Smart Cues (análisis de energía → cue points automáticos al cargar la pista)
- [x] AI Mood Tagger (Web Worker: energía/brillo/dinámica → tags de ánimo → IndexedDB, regla de Smart Crates)
- [x] Copiloto Lírico (letras ORIGINALES: rimas, sílabas y estructura local + generación IA opcional)
- [x] Audio Style Transfer (filtros de género por DSP: Lo-Fi, Club, Ambient)

## ✅ Reproducción & almacenamiento
- [x] Media Session (controles del sistema / segundo plano best-effort) + reanudar el
      AudioContext al volver a la app
- [x] **Sonar en SILENCIO/VIBRAR (iOS)**: sesión de audio "playback" (Safari 16.4+) +
      respaldo con `<audio>` silencioso en bucle, para que el secuenciador/sampler/efectos
      suenen aunque el interruptor de timbre esté en silencio
- [x] Tope de **50 pistas** locales (FIFO: borra las más antiguas) + contador X/50
- [x] Auto-DJ con **efectos** en la transición (echo + reverb) para mezclas más fluidas

## ⏳ Rendimiento
- [~] Web Workers: Mood Tagger ya corre en un worker; falta mover BPM/key/FFmpeg

## ✅ UX móvil
- [x] **v2 — Consola de DJ (tablero) siempre HORIZONTAL**: decks + mesa + FX juntos como
      un controlador real, con un "rack" de pestañas debajo para el resto de módulos.
      En teléfonos en vertical la app se **rota por CSS** para presentarse en horizontal
      automáticamente (sin mensajes de "gira el teléfono"). Mezclador compacto (EQ 2×2,
      pre-escucha en una fila) y sampler en tira de 8 pads.
- [x] Layout de teléfono por **pestañas** (Deck A / Mezcla / Deck B) a ancho completo,
      100% del ancho (sin scroll horizontal), paneles apilados y menos espacios muertos
- [x] Controles táctiles grandes (perillas/faders ≥44px) con `touch-action: none`
      (sin conflicto con el scroll)
- [x] Vúmetros LED (Canal A/B/Máster) reactivos al AnalyserNode; EQ con color por
      banda (HIGH cian · MID verde · LOW naranja · FILTER violeta); header compacto
      en móvil; pulso al BPM en Play/Hot Cue + vibración (haptics)
- [x] **v3 — Controles táctiles y pulido**: perillas giratorias → **faders verticales**
      (toca/arrastra arriba/abajo, sin ambigüedad de dirección); EQ como banco de 4 faders.
      Header con más aire y brillo. Visualizador **con portal a body** (no le afecta la
      rotación en móvil) y con animación de reposo (nunca se ve muerto). Ajustes también
      con portal para funcionar en el móvil rotado.
- [x] **v4 — Horizontal blindado + densidad de controlador**:
      · La app **jamás se ve en vertical**: manifiesto PWA `orientation: landscape`,
        `screen.orientation.lock` (Android/PWA) y rotación por CSS de respaldo que ahora
        **cubre toda la pantalla sin franjas negras** y rota también los overlays
        (visualizador/ajustes). Corregido el bug de posicionamiento (`inset:auto`).
      · **Consola compacta** para teléfono en horizontal (poca altura): forma de onda,
        vúmetros, faders y paneles condensados → decks + mesa visibles casi sin scroll,
        como un controlador real.
      · **Indicador GLOBAL de grabación** en la barra superior (cronómetro + botón
        Detener siempre a mano, para audio y vídeo).
- [ ] Más pulido visual (jog wheels, skins, animaciones) — continuo

## ⏳ Marca, empaquetado y v2
- [x] Logo de marca del usuario (barra, pantalla de inicio e iconos PWA)
- [ ] APK descargable (TWA/Bubblewrap) que **auto-actualiza** desde la web publicada
- [ ] Repaso final: verificar que TODO quedó implementado correctamente
- [ ] Reparar errores encontrados en el repaso
- [ ] v2 mejorada (pulido de UX/rendimiento sobre la base completa)
