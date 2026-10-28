// KOG Worship — chrome theme tokens.
//
// Space-grey surfaces (#1C1C1E → #48484A) with a vibrant golden-yellow
// accent. These values MUST stay in step with the --ui-* tokens in
// src/index.css: components style themselves from this object with inline
// styles and from the CSS variable with classes, so if the two drift the app
// renders half grey, half blue-grey. The accent is deliberately used
// sparingly (active nav, selected slide, primary action, focus). Green is
// reserved for live/connected state; red for destructive actions and errors.
// Slide/projector content does not use these tokens.
export function getTheme(themeDark) {
  const ACCENT = themeDark ? '#FFB800' : '#A86F00';
  const ACCENT_SOFT = themeDark ? 'rgba(255,184,0,0.12)' : 'rgba(168,111,0,0.12)';
  const ACCENT_SOFT_2 = themeDark ? 'rgba(255,184,0,0.20)' : 'rgba(168,111,0,0.18)';
  const C = themeDark ? {
    bg: '#1C1C1E',
    sidebar: '#2C2C2E',
    panel: '#2C2C2E',
    elevated: '#3A3A3C',
    elevated2: '#48484A',
    input: '#2C2C2E',
    border: '#38383A',
    border2: '#38383A',
    borderLight: 'rgba(255,255,255,0.07)',
    text: '#F1F2F3',
    text2: '#A1A8B3',
    muted: '#737D8B',
    faint: '#737D8B',
    faint2: '#5C6270',
    heading: '#FFC72C',
    accLine: '#FFB800',
  } : {
    bg: '#EEF0F2',
    sidebar: '#F7F8F9',
    panel: '#FFFFFF',
    elevated: '#F7F8F9',
    elevated2: '#EDEFF2',
    input: '#FFFFFF',
    border: '#E1E4E8',
    border2: '#CFD5DC',
    borderLight: 'rgba(15,23,42,0.08)',
    text: '#161A1F',
    text2: '#3E4651',
    muted: '#6B7480',
    faint: '#8A929C',
    faint2: '#A6ADB7',
    heading: '#A86F00',
    accLine: '#A86F00',
  };
  // PINK is the historical "on air" channel used by the existing previews and
  // tiles. It now carries the success/live green — never the brand accent.
  const PINK = themeDark ? '#36C982' : '#1F8A57';
  const ACCENT_PINK = ACCENT;
  const PINK_SOFT = themeDark ? 'rgba(54,201,130,0.14)' : 'rgba(31,138,87,0.12)';
  const PINK_SOFT_2 = themeDark ? 'rgba(54,201,130,0.22)' : 'rgba(31,138,87,0.18)';
  const NEBULA = themeDark
    ? 'radial-gradient(130% 130% at 30% 20%, #3A3A3C 0%, #2C2C2E 55%, #1C1C1E 100%)'
    : 'radial-gradient(130% 130% at 30% 20%, #F3EFE7 0%, #E8E2D7 55%, #DCD5C8 100%)';
  const PINK2 = PINK;
  const ACCENCY = ACCENT;
  return {
    ACCENT,
    ACCENT_SOFT,
    ACCENT_SOFT_2,
    C,
    PINK,
    ACCENT_PINK,
    PINK_SOFT,
    PINK_SOFT_2,
    NEBULA,
    PINK2,
    ACCENCY,
  };
}
