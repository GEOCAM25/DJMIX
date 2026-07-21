import { useRef, useState } from 'react';
import { useStore } from '../../state/store';

/**
 * Zona de arrastre / selección de archivos. Acepta audio (MP3, WAV, FLAC…) y
 * vídeo (MP4, MOV…). Los vídeos se procesan con FFmpeg.wasm para extraer audio.
 * Todo ocurre localmente (privacidad total).
 */
export function FileDropzone() {
  const importFiles = useStore((s) => s.importFiles);
  const status = useStore((s) => s.status);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void importFiles(Array.from(list));
  };

  return (
    <div
      className={`dropzone${drag ? ' drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*,.flac,.wav,.mp3,.m4a,.ogg,.mp4,.mov,.mkv,.webm"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div style={{ fontSize: 26 }}>🎵</div>
      <div>Arrastra audio o vídeo aquí, o haz clic para elegir</div>
      <small className="hint">MP3 · WAV · FLAC · MP4 · MOV — se procesa en tu dispositivo</small>
      {status.busy && (
        <div style={{ marginTop: 10 }}>
          <div className="meter">
            <i style={{ width: `${Math.round(status.progress * 100)}%` }} />
          </div>
          <small className="hint">{status.message}</small>
        </div>
      )}
    </div>
  );
}
