export function getTheme(themeDark) {
  const ACCENT = themeDark ? '#3b82f6' : '#2563eb';
  const ACCENT_SOFT = 'rgba(59,130,246,0.12)';
  const ACCENT_SOFT_2 = 'rgba(59,130,246,0.18)';
  const C = {
    bg: themeDark ? '#050509' : '#e9ecf2',
    panel: themeDark ? '#0b0b10' : '#ffffff',
    elevated: themeDark ? '#12121a' : '#f6f8fb',
    elevated2: themeDark ? '#16161f' : '#eef1f6',
    input: themeDark ? '#12121a' : '#ffffff',
    border: themeDark ? '#1f1f30' : '#dfe3ea',
    border2: themeDark ? '#2b2b44' : '#c7cedb',
    borderLight: themeDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)',
    text: themeDark ? '#ffffff' : '#0f172a',
    text2: themeDark ? '#e5e7eb' : '#334155',
    muted: themeDark ? '#9ca3af' : '#5b6b81',
    faint: themeDark ? '#6b7280' : '#7c8798',
    faint2: themeDark ? '#4b5563' : '#93a0b5',
    heading: themeDark ? '#c7d2fe' : '#1d4ed8',
    accLine: themeDark ? '#818cf8' : '#4f46e5',
  };
  const PINK = ACCENT;
  const ACCENT_PINK = ACCENT;
  const PINK_SOFT = ACCENT_SOFT;
  const PINK_SOFT_2 = ACCENT_SOFT_2;
  const NEBULA = 'radial-gradient(130% 130% at 30% 20%, #1e3a8a 0%, #172554 50%, #0d1b3e 100%)';
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
