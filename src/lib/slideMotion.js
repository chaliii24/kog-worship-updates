// A SLIDE-level entrance — the whole picture moves in as ONE thing: the title
// card's rules, every text box, the watermark and the scripture reference. The
// per-box animations in the Motion tab are typography; this is the slide.
//
// It is stored on the cue as slideAnim (a TRANSITION_KEYS key) + slideSpeed, so
// each slide carries its own and it rides to disk through style_json like every
// other look field. The wall and the console's live card read it back off the
// same style payload they already use for backgrounds.
import { TRANSITIONS, TRANSITION_KEYS, transitionAnimation } from './constants';

// 'hard-cut' and 'none' are not entrances — a slide that has one simply keeps
// the old per-box behaviour.
const NOT_AN_ENTRANCE = new Set(['none', 'hard-cut']);

// Only effects whose @keyframes the WALL document carries. ProjectorDisplay
// ships its own inline keyframe block (23 of them); crossfade / glitch /
// distort / zoom-blur / whip live only in the console's global stylesheet, so
// offering them here would animate the console's card while the actual wall sat
// still — the exact editor/output mismatch this feature exists to avoid.
const ON_THE_WALL = new Set([
  'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right',
  'zoom-in', 'zoom-out', 'word-fade', 'word-rise', 'line-reveal', 'type-on',
  'char-cascade', 'pulse', 'shimmer', 'blur-in', 'flip', 'bounce', 'drop',
  'sway', 'split', 'wipe-up', 'spin', 'neon',
]);

export const SLIDE_MOTIONS = TRANSITIONS
  .map((label) => ({ key: TRANSITION_KEYS[label], label }))
  .filter((m) => m.key && !NOT_AN_ENTRANCE.has(m.key) && ON_THE_WALL.has(m.key));

const VALID = new Set(SLIDE_MOTIONS.map((m) => m.key));

export const DEFAULT_SLIDE_SPEED = 0.5;

/** { anim, speed } for a cue OR for the style payload built from one. */
export const slideMotionOf = (src) => {
  const raw = String((src && src.slideAnim) || 'none');
  const n = Number(src && src.slideSpeed);
  return {
    anim: VALID.has(raw) ? raw : 'none',
    speed: Number.isFinite(n) && n > 0 ? n : DEFAULT_SLIDE_SPEED,
  };
};

/** True when this slide animates as a whole (so box entrances stand down). */
export const slideMotionOn = (src) => slideMotionOf(src).anim !== 'none';

/** The CSS animation string, or '' when the slide keeps per-box animation. */
export const slideMotionCss = (src) => {
  const { anim, speed } = slideMotionOf(src);
  return anim === 'none' ? '' : transitionAnimation(anim, speed);
};
