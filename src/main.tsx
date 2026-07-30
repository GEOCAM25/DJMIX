import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initPwa } from './pwa/pwa';
import { initDisplayMode } from './ui/orientation';
import { useStore } from './state/store';
import { renderSongToBuffer } from './audio/SongEngine';
import './styles/global.css';

initPwa();
// Decide el modo (compacto / rotar) según el LADO CORTO físico, no la orientación:
// así el diseño horizontal es idéntico con el teléfono en horizontal o en vertical.
initDisplayMode();

// Gancho de depuración (solo con ?debug en la URL): expone el store para pruebas
// automatizadas y power-users. Sin el parámetro no se toca el objeto window.
if (typeof location !== 'undefined' && location.search.includes('debug')) {
  (window as unknown as { beatdj?: unknown }).beatdj = {
    store: useStore,
    song: { renderSongToBuffer },
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
