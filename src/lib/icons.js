// Prism Slate icon theme: every function-kind of icon gets its own fixed hue,
// so the same function looks the same on every surface (dock, rows, headers).
// Mono keeps the old behavior (icons follow the UI theme).
//
// Kinds are FUNCTIONS, not pictures: the Scripture tab, Bible rows and Bible
// settings all resolve to 'scripture' and share one hue — that sharing IS the
// feature ("the same function looks the same everywhere").

export const ICON_HUES = {
  shows: '#7dd3fc', // sky
  presentation: '#fbbf24', // amber
  media: '#60a5fa', // blue
  audio: '#34d399', // emerald
  countdown: '#fb923c', // orange
  scripture: '#facc15', // yellow
  outputs: '#22d3ee', // cyan
  stage: '#818cf8', // indigo
  remote: '#2dd4bf', // teal
  settings: '#94a3b8', // slate
  application: '#94a3b8', // slate (same function as settings)
  appearance: '#e879f9', // fuchsia
  display: '#22d3ee', // cyan (same function as outputs)
  templates: '#f472b6', // pink
  bibles: '#facc15', // yellow (same function as scripture)
  data: '#a3e635', // lime
  song: '#a78bfa', // violet
  medley: '#e879f9', // fuchsia
  update: '#4ade80', // green
  log: '#cbd5e1', // pale slate
};

// Dock iconId → function kind.
export const DOCK_KIND = {
  'list-video': 'shows',
  'presentation': 'presentation',
  'film': 'media',
  'music': 'audio',
  'book-open': 'scripture',
  'monitor': 'outputs',
  'timer': 'countdown',
  'file-text': 'log',
  'settings': 'settings',
};

// Service-row item_type → function kind.
export const ROW_KIND = {
  song: 'song',
  medley: 'medley',
  media: 'media',
  presentation: 'presentation',
};

// Hue for a kind under the given theme; falls back to the theme's muted
// (mono behavior, and unknown kinds, never throw).
export function iconHue(kind, C) {
  const fallback = (C && C.muted) || '#8b8b9e';
  return ICON_HUES[kind] || fallback;
}

export function loadIconTheme() {
  try {
    return localStorage.getItem('kog-icon-theme') || 'prism';
  } catch {
    return 'prism';
  }
}

export function saveIconTheme(v) {
  try {
    localStorage.setItem('kog-icon-theme', v === 'mono' ? 'mono' : 'prism');
  } catch {}
}
