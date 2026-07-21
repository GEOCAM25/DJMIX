import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// FFmpeg.wasm (multi-hilo) necesita SharedArrayBuffer, que a su vez exige
// que la página se sirva con "cross-origin isolation". Estas cabeceras lo
// habilitan tanto en `vite dev` como en `vite preview`.
//
//   COOP: same-origin      -> aísla el contexto de navegación
//   COEP: require-corp     -> todos los sub-recursos deben optar por CORS
//
// Nota: cuando despliegues en producción (Netlify, Vercel, Cloudflare Pages,
// GitHub Pages con un worker, etc.) debes replicar estas dos cabeceras.
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use((_req: unknown, res: any, next: () => void) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), crossOriginIsolation],
  // FFmpeg carga su núcleo (.wasm) en tiempo de ejecución; no lo empaquetamos.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
