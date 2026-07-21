/**
 * Motor de temas / skins dinámicos.
 *
 * Cada tema es un perfil JSON de variables CSS globales (las mismas que usa
 * toda la UI: --bg, --accent-a, etc.). Cambiar de tema solo reescribe esas
 * variables en :root, así que TODA la app se re-colorea al instante sin tocar
 * componentes. Se puede añadir un tema nuevo agregando un objeto a esta lista.
 */
export interface Theme {
  id: string;
  name: string;
  /** Variables CSS (con prefijo --) → valor. */
  vars: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: 'dark-pro',
    name: 'Oscuro Pro',
    vars: {
      '--bg': '#0b0e14',
      '--bg-panel': '#131824',
      '--bg-panel-2': '#1a2130',
      '--bg-elev': '#232c3f',
      '--border': '#2a3346',
      '--text': '#e6ebf5',
      '--text-dim': '#8a94a8',
      '--accent-a': '#22d3ee',
      '--accent-b': '#f472b6',
      '--accent': '#7c5cff',
      '--good': '#34d399',
      '--warn': '#fbbf24',
      '--bad': '#f87171',
    },
  },
  {
    id: 'anime',
    name: 'Estética Anime',
    vars: {
      '--bg': '#160726',
      '--bg-panel': '#221041',
      '--bg-panel-2': '#2b1550',
      '--bg-elev': '#3a1e66',
      '--border': '#4a2a7a',
      '--text': '#fdf4ff',
      '--text-dim': '#c4a5e8',
      '--accent-a': '#22e0ff',
      '--accent-b': '#ff5fa2',
      '--accent': '#b06bff',
      '--good': '#5df2b0',
      '--warn': '#ffd166',
      '--bad': '#ff6b8b',
    },
  },
  {
    id: 'mono',
    name: 'Blanco y Negro',
    vars: {
      '--bg': '#050505',
      '--bg-panel': '#111111',
      '--bg-panel-2': '#161616',
      '--bg-elev': '#222222',
      '--border': '#333333',
      '--text': '#f5f5f5',
      '--text-dim': '#9a9a9a',
      '--accent-a': '#e8e8e8',
      '--accent-b': '#a0a0a0',
      '--accent': '#cfcfcf',
      '--good': '#cccccc',
      '--warn': '#bdbdbd',
      '--bad': '#e0e0e0',
    },
  },
  {
    id: 'club',
    name: 'Club Neón',
    vars: {
      '--bg': '#05070d',
      '--bg-panel': '#0b1120',
      '--bg-panel-2': '#0f1830',
      '--bg-elev': '#16223f',
      '--border': '#1e2f52',
      '--text': '#eafff6',
      '--text-dim': '#6fb0a0',
      '--accent-a': '#00ffa3',
      '--accent-b': '#ff2bd6',
      '--accent': '#00d0ff',
      '--good': '#00ffa3',
      '--warn': '#ffe14d',
      '--bad': '#ff4d6d',
    },
  },
];

export const DEFAULT_THEME_ID = 'dark-pro';

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Aplica un tema escribiendo sus variables en :root. */
export function applyTheme(id: string): void {
  const theme = getTheme(id);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-theme', theme.id);
}
