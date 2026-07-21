import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initPwa } from './pwa/pwa';
import './styles/global.css';

initPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
