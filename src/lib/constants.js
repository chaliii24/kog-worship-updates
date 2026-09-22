export const formatCountdown = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export const TRANSITIONS = ['None', 'Fade', 'Slide Up', 'Slide Down', 'Slide Left', 'Slide Right', 'Zoom In', 'Zoom Out', 'Word Fade', 'Word Rise', 'Line Reveal', 'Type On', 'Character Cascade', 'Pulse', 'Shimmer', 'Blur In', 'Flip', 'Bounce', 'Drop', 'Sway', 'Split', 'Wipe Up', 'Spin', 'Neon'];

export const TRANSITION_KEYS = { 'None': 'none', 'Fade': 'fade', 'Slide Up': 'slide-up', 'Slide Down': 'slide-down', 'Slide Left': 'slide-left', 'Slide Right': 'slide-right', 'Zoom In': 'zoom-in', 'Zoom Out': 'zoom-out', 'Word Fade': 'word-fade', 'Word Rise': 'word-rise', 'Line Reveal': 'line-reveal', 'Type On': 'type-on', 'Character Cascade': 'char-cascade', 'Pulse': 'pulse', 'Shimmer': 'shimmer', 'Blur In': 'blur-in', 'Flip': 'flip', 'Bounce': 'bounce', 'Drop': 'drop', 'Sway': 'sway', 'Split': 'split', 'Wipe Up': 'wipe-up', 'Spin': 'spin', 'Neon': 'neon' };

export const SPEED_OPTIONS = [{ label: 'Very Fast', v: 0.15 }, { label: 'Fast', v: 0.3 }, { label: 'Medium', v: 0.5 }, { label: 'Slow', v: 1.0 }, { label: 'Very Slow', v: 1.5 }];

export const cssSpeed = (speed) => {
  const n = Number(speed);
  if (Number.isFinite(n) && n > 0) {
    return n < 100 ? `${Math.round(n * 1000)}ms` : `${Math.round(n)}ms`;
  }
  const s = String(speed || '400ms');
  return /ms$/.test(s) ? s : `${parseInt(s, 10) || 400}ms`;
};

// Same animation strings the projector / live-output preview use.
export const transitionAnimation = (trans, speed) => {
  const transitionSpeed = cssSpeed(speed);
  const msNum = parseInt(transitionSpeed) || 400;
  const map = {
    'fade': `fadeIn ${transitionSpeed} ease-in-out`,
    'slide-up': `slideUp ${transitionSpeed} ease-out`,
    'slide-down': `slideDown ${transitionSpeed} ease-out`,
    'slide-left': `slideLeft ${transitionSpeed} ease-out`,
    'slide-right': `slideRight ${transitionSpeed} ease-out`,
    'zoom-in': `zoomIn ${transitionSpeed} ease-out`,
    'zoom-out': `zoomOut ${transitionSpeed} ease-out`,
    'word-fade': `wordFade ${transitionSpeed} ease-in-out`,
    'word-rise': `wordRise ${transitionSpeed} ease-out`,
    'line-reveal': `lineReveal ${transitionSpeed} ease-out`,
    'type-on': `typeOn ${transitionSpeed} steps(${Math.max(4, Math.round(msNum / 40))})`,
    'char-cascade': `charCascade ${transitionSpeed} ease-out`,
    'pulse': `pulse ${transitionSpeed} ease-in-out`,
    'shimmer': `shimmer ${transitionSpeed} ease-in-out`,
    'blur-in': `blurIn ${transitionSpeed} ease-out`,
    'flip': `flipIn ${transitionSpeed} ease-out`,
    'bounce': `bounceIn ${transitionSpeed} cubic-bezier(.34,1.56,.64,1)`,
    'drop': `dropIn ${transitionSpeed} cubic-bezier(.34,1.56,.64,1)`,
    'sway': `swayIn ${transitionSpeed} ease-out`,
    'split': `splitIn ${transitionSpeed} ease-in-out`,
    'wipe-up': `wipeUp ${transitionSpeed} ease-out`,
    'spin': `spinIn ${transitionSpeed} ease-out`,
    'neon': `neonFlash ${transitionSpeed} linear`,
  };
  return (trans && trans !== 'none' && map[trans]) || '';
};

// Keyframes for the transitions above — inject once per window that animates
// lyrics (main app preview, editor hover preview, projector output).
export const TRANSITION_KEYFRAMES = `
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideLeft { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
@keyframes slideRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
@keyframes zoomIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
@keyframes zoomOut { from { opacity: 0; transform: scale(1.2); } to { opacity: 1; transform: scale(1); } }
@keyframes wordFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes wordRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lineReveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0% 0 0); } }
@keyframes typeOn { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0% 0 0); } }
@keyframes charCascade { 0% { opacity: 0; transform: translateY(8px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes blurIn { from { opacity: 0; filter: blur(12px); } to { opacity: 1; filter: blur(0); } }
@keyframes flipIn { from { opacity: 0; transform: perspective(700px) rotateX(85deg); } to { opacity: 1; transform: perspective(700px) rotateX(0); } }
@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.08); } 70% { transform: scale(0.94); } 100% { opacity: 1; transform: scale(1); } }
@keyframes dropIn { 0% { opacity: 0; transform: translateY(-70px); } 60% { opacity: 1; transform: translateY(10px); } 80% { transform: translateY(-4px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes swayIn { 0% { opacity: 0; transform: translateX(-36px) rotate(-3deg); } 50% { opacity: 1; transform: translateX(10px) rotate(2deg); } 100% { opacity: 1; transform: translateX(0) rotate(0); } }
@keyframes splitIn { 0% { opacity: 0; clip-path: inset(50% 0 50% 0); } 100% { opacity: 1; clip-path: inset(0 0 0 0); } }
@keyframes wipeUp { 0% { clip-path: inset(100% 0 0 0); } 100% { clip-path: inset(0 0 0 0); } }
@keyframes spinIn { 0% { opacity: 0; transform: rotate(-180deg) scale(0.5); } 100% { opacity: 1; transform: rotate(0) scale(1); } }
@keyframes neonFlash { 0% { opacity: 0; } 8% { opacity: 1; } 14% { opacity: 0.15; } 20% { opacity: 1; } 28% { opacity: 0.35; } 36% { opacity: 1; } 100% { opacity: 1; } }
`;

// Common Windows fonts used when queryLocalFonts() is unavailable/denied.
export const FALLBACK_SYSTEM_FONTS = [
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Calibri Light', 'Cambria', 'Candara',
  'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium',
  'Gabriola', 'Garamond', 'Georgia', 'Impact', 'Ink Free', 'Lucida Console', 'Lucida Sans Unicode',
  'Malgun Gothic', 'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft YaHei', 'Microsoft Sans Serif',
  'MS Gothic', 'MV Boli', 'Nirmala UI', 'Palatino Linotype', 'Roboto', 'Segoe UI', 'Segoe UI Light',
  'Segoe UI Semibold', 'Segoe UI Symbol', 'Sitka', 'Sylfaen', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Verdana', 'Yu Gothic'
];

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
