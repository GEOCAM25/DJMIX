import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initPwa } from './pwa/pwa';
import { useStore } from './state/store';
import './styles/global.css';

initPwa();

// Gancho de depuración (solo con ?debug en la URL): expone el store para pruebas
// automatizadas y power-users. Sin el parámetro no se toca el objeto window.
if (typeof location !== 'undefined' && location.search.includes('debug')) {
  (window as unknown as { beatdj?: unknown }).beatdj = { store: useStore };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
