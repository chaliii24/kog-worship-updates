export const formatCountdown = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export const TRANSITIONS = ['Hard Cut', 'None', 'Fade', 'Crossfade', 'Slide Up', 'Slide Down', 'Slide Left', 'Slide Right', 'Zoom In', 'Zoom Out', 'Word Fade', 'Word Rise', 'Line Reveal', 'Type On', 'Character Cascade', 'Pulse', 'Shimmer', 'Blur In', 'Flip', 'Bounce', 'Drop', 'Sway', 'Split', 'Wipe Up', 'Spin', 'Neon', 'Glitch', 'Distortion', 'Zoom Blur', 'Whip Pan'];

export const TRANSITION_KEYS = { 'Hard Cut': 'hard-cut', 'None': 'none', 'Fade': 'fade', 'Crossfade': 'crossfade', 'Slide Up': 'slide-up', 'Slide Down': 'slide-down', 'Slide Left': 'slide-left', 'Slide Right': 'slide-right', 'Zoom In': 'zoom-in', 'Zoom Out': 'zoom-out', 'Word Fade': 'word-fade', 'Word Rise': 'word-rise', 'Line Reveal': 'line-reveal', 'Type On': 'type-on', 'Character Cascade': 'char-cascade', 'Pulse': 'pulse', 'Shimmer': 'shimmer', 'Blur In': 'blur-in', 'Flip': 'flip', 'Bounce': 'bounce', 'Drop': 'drop', 'Sway': 'sway', 'Split': 'split', 'Wipe Up': 'wipe-up', 'Spin': 'spin', 'Neon': 'neon', 'Glitch': 'glitch', 'Distortion': 'distort', 'Zoom Blur': 'zoom-blur', 'Whip Pan': 'whip' };

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
    'crossfade': `crossfadeIn ${transitionSpeed} ease-in-out`,
    'glitch': `glitchIn ${transitionSpeed} steps(12)`,
    'distort': `distortIn ${transitionSpeed} ease-out`,
    'zoom-blur': `zoomBlurIn ${transitionSpeed} ease-out`,
    'whip': `whipIn ${transitionSpeed} cubic-bezier(.52,.02,.24,1)`,
  };
  return (trans && trans !== 'none' && trans !== 'hard-cut' && map[trans]) || '';
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
@keyframes crossfadeIn { from { opacity: 0; filter: blur(3px); } to { opacity: 1; filter: blur(0); } }
@keyframes glitchIn {
  0% { opacity: 0; transform: translateX(-14px) skewX(6deg); clip-path: inset(12% 0 58% 0); }
  12% { opacity: 1; transform: translateX(12px) skewX(-5deg); clip-path: inset(52% 0 8% 0); }
  24% { opacity: 0.35; transform: translateX(-7px) skewX(3deg); clip-path: inset(4% 0 76% 0); }
  38% { opacity: 1; transform: translateX(6px) skewX(-2deg); clip-path: inset(28% 0 34% 0); }
  52% { opacity: 0.65; transform: translateX(-3px); clip-path: inset(62% 0 2% 0); }
  70% { opacity: 1; transform: translateX(2px); clip-path: inset(0 0 0 0); }
  100% { opacity: 1; transform: translateX(0); clip-path: inset(0 0 0 0); }
}
@keyframes distortIn {
  0% { opacity: 0; transform: scale(1.22) skewX(-10deg); filter: blur(10px) contrast(1.6); }
  55% { opacity: 1; transform: scale(1.03) skewX(3deg); filter: blur(2px) contrast(1.15); }
  100% { opacity: 1; transform: scale(1) skewX(0); filter: blur(0) contrast(1); }
}
@keyframes zoomBlurIn {
  0% { opacity: 0; transform: scale(1.45); filter: blur(18px); }
  60% { opacity: 1; filter: blur(3px); }
  100% { opacity: 1; transform: scale(1); filter: blur(0); }
}
@keyframes whipIn {
  0% { opacity: 0; transform: translateX(16%) skewX(-9deg); filter: blur(8px); }
  100% { opacity: 1; transform: translateX(0) skewX(0); filter: blur(0); }
}
`;

// Common Windows fonts used when queryLocalFonts() is unavailable/denied.
// The list is alphabetical-ish by family and deliberately includes the
// non-Latin faces Windows ships (Mongolian Baiti, Mangal, Microsoft Uighur…):
// a face without Latin glyphs still has to be PICKABLE by name.
export const FALLBACK_SYSTEM_FONTS = [
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Calibri Light', 'Cambria', 'Candara',
  'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium',
  'Gabriola', 'Garamond', 'Georgia', 'Impact', 'Ink Free', 'Kartika', 'Kokila', 'Lucida Console',
  'Lucida Sans Unicode', 'Malgun Gothic', 'Mangal', 'Microsoft Himalaya', 'Microsoft JhengHei',
  'Microsoft YaHei', 'Microsoft Sans Serif', 'Microsoft Uighur', 'Mongolian Baiti', 'MS Gothic',
  'MV Boli', 'Nirmala UI', 'Palatino Linotype', 'Roboto', 'Segoe UI', 'Segoe UI Light',
  'Segoe UI Semibold', 'Segoe UI Symbol', 'Shruti', 'Sitka', 'Sylfaen', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Tunga', 'Verdana', 'Vrinda', 'Yu Gothic', 'Yu Gothic UI'
];

// Song/lyric font presets — every entry maps to an @font-face in src/index.css
// (the CMG Sans pack, plus the user-supplied Cinzel Decorative).
// Entry 0 is the DEFAULT song/lyric font — applied wherever a cue has no
// font stored (new songs, legacy songs): CMG Sans Wide (ExtraBoldWide).
// App chrome uses Inter instead (--font-sans in index.css); lyrics never
// inherit it.
export const FONT_OPTIONS = [
  { label: 'CMG Sans Wide (Default)', value: '"CMG Sans Wide", "CMG Sans", sans-serif' },
  { label: 'CMG Sans', value: '"CMG Sans", system-ui, sans-serif' },
  { label: 'CMG Sans Condensed', value: '"CMG Sans Condensed", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Thin', value: '"CMG Sans Thin", "CMG Sans", sans-serif' },
  { label: 'CMG Sans ExtraLight', value: '"CMG Sans ExtraLight", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Light', value: '"CMG Sans Light", "CMG Sans", sans-serif' },
  { label: 'CMG Sans ExtraBold', value: '"CMG Sans ExtraBold", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Black', value: '"CMG Sans Black", "CMG Sans", sans-serif' },
  { label: 'CMG Sans CAPS', value: '"CMG Sans CAPS", "CMG Sans", sans-serif' },
  { label: 'CMG Sans CAPS Condensed', value: '"CMG Sans CAPS Condensed", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Rounded', value: '"CMG Sans Rounded", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Slab', value: '"CMG Sans Slab", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Outline', value: '"CMG Sans Outline", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Wide Outline', value: '"CMG Sans Wide Outline", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Mono Digits', value: '"CMG Sans Mono Digits", "CMG Sans", sans-serif' },
  { label: 'CMG Sans Backslant', value: '"CMG Sans Backslant", "CMG Sans", sans-serif' },
  // User-supplied display face (assets/fonts/cinzel, OFL.txt ships with it).
  // Real 400/700/900 weights behind ONE family, so bold/italic toggles pick
  // a true face instead of a synthesized one.
  { label: 'Cinzel Decorative', value: '"Cinzel Decorative", Georgia, serif' },
  // Anton - condensed display face (assets/fonts/anton, OFL.txt ships with
  // it). Bundled so it is in the dropdown on every machine, not only where
  // the font happens to be installed.
  { label: 'Anton', value: '"Anton", Impact, sans-serif' },
  // Cormorant Garamond - serif display face (assets/fonts/cormorant, OFL.txt
  // ships with it). Real 400/700 faces AND real italics, so the typography
  // panel's Italic toggle draws the punch-cut italic rather than a
  // synthesised slant.
  { label: 'Cormorant Garamond', value: '"Cormorant Garamond", Cormorant, Georgia, serif' },
  // Reenie Beanie - handwriting face (assets/fonts/reenie, OFL.txt ships with
  // it). One weight: the bold/italic toggles use the browser's synthetic
  // versions, which is what a marker face wants anyway.
  { label: 'Reenie Beanie', value: '"Reenie Beanie", "Segoe Script", cursive' },
];
