// Responsive-scale regression check — run with: node test-responsive-scale.mjs
//
// Asserts the console's fit rule (electron/uiScale.js) actually delivers the
// design on every resolution the app is used on, including the small laptop
// panel the rule was written for. Two properties matter:
//   1. FIT  — the CSS viewport is never smaller than the design, so no
//      component is pushed off the edge of the window (that was the bug).
//   2. LOOK — proportions track the resolution: every screen shows the same
//      design, scaled to fill its own panel.
import { operatorZoomFor, cssViewportFor, UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT } from './electron/uiScale.js';

// [label, window width, window height] — maximized sizes assume a 48px taskbar.
const CASES = [
  ['1920x1080 (reference)', 1920, 1040],
  ['1366x728 (small laptop work area)', 1366, 728],
  ['1366x768 (no taskbar)', 1366, 768],
  ['1600x900 (default window)', 1600, 900],
  ['1536x864 (1080p @ 125% scaling)', 1536, 864],
  ['1440x900 (16:10)', 1440, 900],
  ['1280x720 (720p)', 1280, 720],
  ['2560x1440 (1440p)', 2560, 1440],
  ['3840x2160 (4K)', 3840, 2160],
  ['1024x640 (minimum window)', 1024, 640],
];

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`  FAIL  ${msg}`); };

console.log(`design: ${UI_DESIGN_WIDTH} x ${UI_DESIGN_HEIGHT} CSS px (1920x1080 maximized @ 1.15)\n`);
console.log('viewport                       window    zoom   css viewport    fits design');
console.log('-'.repeat(88));

for (const [label, width, height] of CASES) {
  const { zoom, width: cw, height: ch, fits } = cssViewportFor({ width, height });
  console.log(
    `${label.padEnd(31)} ${`${width}x${height}`.padEnd(9)} ${String(zoom).padEnd(6)} ` +
    `${`${cw}x${ch}`.padEnd(15)} ${fits ? 'yes' : 'NO'}`
  );
  if (!fits && width >= UI_DESIGN_WIDTH && height >= UI_DESIGN_HEIGHT) {
    fail(`${label}: window is larger than the design but the design still does not fit (${cw}x${ch})`);
  }
  if (zoom !== operatorZoomFor({ width, height })) fail(`${label}: operatorZoomFor/cssViewportFor disagree`);
}

// The reference look must not move: 1920x1080 maximized still boots at 1.15.
const ref = operatorZoomFor({ width: 1920, height: 1040 });
if (Math.abs(ref - 1.15) > 0.001) fail(`1920x1080 zoom drifted to ${ref}, expected 1.15`);

// The reported bug: 1366x728 must fit the design, not be zoomed up into it.
const small = cssViewportFor({ width: 1366, height: 728 });
if (!small.fits) fail(`1366x728 does not fit the design (${small.width}x${small.height} @ ${small.zoom})`);
if (small.zoom >= 1) fail(`1366x728 zoom is ${small.zoom} — zooming up is what clipped the components`);

console.log('');
console.log(failures ? `${failures} failure(s)` : 'all checks passed');
process.exit(failures ? 1 : 0);
