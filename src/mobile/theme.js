// KOG Worship Remote — design tokens.
//
// The remote has its own palette: the desktop chrome (src/lib/theme.js) is
// Space-grey, but a phone held at arm's length in a dark auditorium needs more
// contrast and a warmer, richer accent. These tokens are the ONLY colour
// source for src/mobile — screens read C/T instead of hardcoding hex values,
// so the whole remote can be retuned in one place.
//
// Legacy keys (elevated, border2, faint2, accLine …) are kept because
// MiniSlide / StageScreen / DrawScreen were written against them and take the
// theme object as a prop. New code should prefer the semantic T.* values.
export const C = {
  // Surfaces — deepest first.
  bg: '#0B0C0E',
  bgAlt: '#111318',
  panel: '#111318',
  sidebar: '#17191F',
  elevated: '#1B1E25',      // card
  elevated2: '#242832',     // elevated surface / pressed
  input: '#17191F',
  // Lines.
  border: 'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.09)',
  borderLight: 'rgba(255,255,255,0.05)',
  // Type.
  text: '#F5F5F5',
  text2: '#A1A5AE',
  muted: '#8A8F99',
  faint: '#6F7480',
  faint2: '#565B66',
  heading: '#FFC928',
  accLine: '#FFC928',
};

export const T = {
  ACCENT: '#FFC928',
  ACCENT_2: '#E6A817',
  ACCENT_MUTED: '#8F7025',
  ACCENT_SOFT: 'rgba(255,201,40,0.12)',
  ACCENT_SOFT_2: 'rgba(255,201,40,0.20)',
  ACCENT_LINE: 'rgba(255,201,40,0.34)',
  ON_ACCENT: '#191204',

  SUCCESS: '#22C55E',
  SUCCESS_SOFT: 'rgba(34,197,94,0.14)',
  SUCCESS_LINE: 'rgba(34,197,94,0.38)',
  ERROR: '#EF4444',
  ERROR_SOFT: 'rgba(239,68,68,0.12)',
  ERROR_LINE: 'rgba(239,68,68,0.36)',
  WARNING: '#F59E0B',
  WARNING_SOFT: 'rgba(245,158,11,0.14)',
  WARNING_LINE: 'rgba(245,158,11,0.38)',

  SHADOW: '0 10px 28px rgba(0,0,0,0.45)',
  SHADOW_SOFT: '0 6px 18px rgba(0,0,0,0.3)',
  ACCENT_GRAD: 'linear-gradient(180deg, #FFD451 0%, #FFC928 55%, #F2B912 100%)',
};

// 4-point rhythm. Sizes are CSS px.
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 30 };
export const R = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };

// Minimum comfortable touch target (Apple 44 / Material 48).
export const TOUCH = 48;

export const FONT = "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Shared text styles so headings never drift between screens.
export const TXT = {
  brand: { fontSize: 13.5, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase' },
  label: { fontSize: 10, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase', color: C.faint },
  screenTitle: { fontSize: 22, fontWeight: 900, letterSpacing: -0.3, color: C.text },
  title: { fontSize: 17, fontWeight: 800, letterSpacing: -0.1, color: C.text },
  body: { fontSize: 14, fontWeight: 600, color: C.text2 },
  meta: { fontSize: 11.5, fontWeight: 700, color: C.faint },
};
