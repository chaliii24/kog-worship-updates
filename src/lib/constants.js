export const formatCountdown = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export const TRANSITIONS = ['None', 'Fade', 'Slide Up', 'Slide Down', 'Slide Left', 'Slide Right', 'Zoom In', 'Zoom Out', 'Word Fade', 'Word Rise', 'Line Reveal', 'Type On', 'Character Cascade', 'Pulse', 'Shimmer', 'Blur In'];

export const TRANSITION_KEYS = { 'None': 'none', 'Fade': 'fade', 'Slide Up': 'slide-up', 'Slide Down': 'slide-down', 'Slide Left': 'slide-left', 'Slide Right': 'slide-right', 'Zoom In': 'zoom-in', 'Zoom Out': 'zoom-out', 'Word Fade': 'word-fade', 'Word Rise': 'word-rise', 'Line Reveal': 'line-reveal', 'Type On': 'type-on', 'Character Cascade': 'char-cascade', 'Pulse': 'pulse', 'Shimmer': 'shimmer', 'Blur In': 'blur-in' };

export const SPEED_OPTIONS = [{ label: 'Very Fast', v: 0.15 }, { label: 'Fast', v: 0.3 }, { label: 'Medium', v: 0.5 }, { label: 'Slow', v: 1.0 }, { label: 'Very Slow', v: 1.5 }];

export const FONT_OPTIONS = [
  { label: 'Geist Sans (Default)', value: '"Geist Variable", "Geist", system-ui, sans-serif' },
  { label: 'Montserrat (Modern)', value: '"Montserrat", system-ui, sans-serif' },
  { label: 'Poppins (Modern)', value: '"Poppins", system-ui, sans-serif' },
  { label: 'Plus Jakarta Sans', value: '"Plus Jakarta Sans", system-ui, sans-serif' },
  { label: 'Barlow (Condensed)', value: '"Barlow", system-ui, sans-serif' },
  { label: 'Nunito Sans', value: '"Nunito Sans", system-ui, sans-serif' },
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Georgia (Serif)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times (Serif)', value: '"Times New Roman", serif' },
  { label: 'Courier (Mono)', value: '"Courier New", monospace' },
  { label: 'Trebuchet', value: '"Trebuchet MS", sans-serif' },
];
