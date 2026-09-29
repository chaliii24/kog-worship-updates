export function getTheme(themeDark) {
  const ACCENT = themeDark ? '#8b5cf6' : '#7c3aed';
  const ACCENT_SOFT = 'rgba(139,92,246,0.12)';
  const ACCENT_SOFT_2 = 'rgba(139,92,246,0.18)';
  const C = {
    bg: themeDark ? '#090a0f' : '#e9ecf2',
    panel: themeDark ? '#13151e' : '#ffffff',
    elevated: themeDark ? '#171a25' : '#f6f8fb',
    elevated2: themeDark ? '#1c1f2c' : '#eef1f6',
    input: themeDark ? '#171a25' : '#ffffff',
    border: themeDark ? '#191d28' : '#dfe3ea',
    border2: themeDark ? '#222636' : '#c7cedb',
    borderLight: themeDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)',
    text: themeDark ? '#e2e8f0' : '#0f172a',
    text2: themeDark ? '#cbd5e1' : '#334155',
    muted: themeDark ? '#64748b' : '#5b6b81',
    faint: themeDark ? '#475569' : '#7c8798',
    faint2: themeDark ? '#334155' : '#93a0b5',
    heading: themeDark ? '#ddd6fe' : '#6d28d9',
    accLine: themeDark ? '#a78bfa' : '#7c3aed',
  };
  const PINK = ACCENT;
  const ACCENT_PINK = ACCENT;
  const PINK_SOFT = ACCENT_SOFT;
  const PINK_SOFT_2 = ACCENT_SOFT_2;
  const NEBULA = 'radial-gradient(130% 130% at 30% 20%, #4c1d95 0%, #2e1065 50%, #150b34 100%)';
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
