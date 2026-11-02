// =====================================================================
// OPERATOR UI SCALE — the console is fit to the window, not zoomed by hand.
//
// WHAT WAS WRONG
// The old code only boosted the UI inside a 1050..1300px display-height
// band (1.15 zoom on 1920x1080, raw 1.0 everywhere else), and a later fix
// pushed 1.15 onto small screens as well. Page zoom is the wrong lever on
// its own: it makes the chrome bigger AND shrinks the CSS viewport by the
// same factor, so on 1366x768 the console laid out in 1366/1.15 = 1188 CSS
// px — ~480px narrower and ~270px shorter than the design — and components
// fell off the bottom/edges of the window.
//
// THE RULE NOW
// The console is designed against 1920x1080 maximized at 1.15 zoom: that
// is ~1669 x 904 CSS px of layout, and that layout is the thing the operator
// says looks right. So instead of picking a zoom per resolution, derive the
// zoom from how much of that design the window can hold:
//
//     zoom = min(windowW / 1669, windowH / 904)
//
// Every screen then renders THE SAME design, scaled to fit its panel:
//   • 1920x1080  -> 1.00  (capped — see below)
//   • 1366x728   -> 0.80  -> 1708 x 910 CSS px: full design, nothing clipped
//   • 2560x1440  -> 1.00  (capped — the panel simply has more room to give)
// The min() across BOTH axes is what guarantees nothing is cut off: a
// resolution never gets to fill one axis at the expense of the other.
//
// WHY THE CEILING IS 1.00 AND NOT 1.15
// The fit used to scale UP on big panels (1920x1080 booted at 1.15), which
// read as "the app is zoomed in" on the operator's desktop while the 1366
// laptop — running at 0.80 — looked correct. Above 100% the fit only ever
// makes things bigger than they are designed to be, and it costs layout
// room instead of gaining it. So the rule now shrinks to fit and never
// enlarges: every screen boots at 100% or smaller, and a panel bigger than
// the design just gets surrounding room. Below 100% nothing changed — the
// 1366 laptop keeps its 0.80 fit, because 1.00 there is exactly the clipping
// this file was written to fix.
//
// WHY NO devicePixelRatio
// Electron window bounds are already DIP (physical / scaleFactor), and CSS
// px = DIP / zoom — the OS scale factor cancels out. Dividing by it again
// would double-count Windows display scaling and shrink the layout twice.
// =====================================================================

// The design, in CSS px: 1920x1080 maximized (minus taskbar) at 1.15 zoom.
// 1920/1.15 = 1669.6 and 1040/1.15 = 904.3, floored so the reference screen
// lands on exactly 1.15 instead of being nudged under it by rounding.
export const UI_DESIGN_WIDTH = 1669;
export const UI_DESIGN_HEIGHT = 904;
// Safety net for an absurdly small window. The app's own minimum window
// (1024x640) still fits the design above this, so the floor only ever bites
// for sizes the window itself refuses to go to.
export const UI_ZOOM_FLOOR = 0.55;
// 1.00, not 3: the operator console is designed at 100% — the fit may shrink
// it to fit a small panel, but it must never blow it up past the design.
// Verified for 1920x1080 and 1366x768 by test-responsive-scale.mjs.
export const UI_ZOOM_CEILING = 1;

/**
 * Zoom factor that fits the console's design into a window of this size.
 * @param {{width?: number, height?: number}} size window bounds, in DIP
 * @returns {number}
 */
export function operatorZoomFor(size) {
  const width = (size && size.width) || 1669;
  const height = (size && size.height) || 904;
  const zoom = Math.min(width / UI_DESIGN_WIDTH, height / UI_DESIGN_HEIGHT);
  // Floor, never round: rounding UP would push the fitted viewport a few px
  // under the design and clip the very edge this rule exists to protect.
  const stepped = Math.floor(zoom * 100) / 100;
  return Math.min(UI_ZOOM_CEILING, Math.max(UI_ZOOM_FLOOR, stepped));
}

/**
 * The CSS viewport (layout px) a window of this size ends up rendering in.
 * Used by test-responsive-scale.mjs to assert the design actually fits.
 */
export function cssViewportFor(size) {
  const zoom = operatorZoomFor(size);
  return {
    zoom,
    width: Math.round(((size && size.width) || 1669) / zoom),
    height: Math.round(((size && size.height) || 904) / zoom),
    fits: Math.round(((size && size.width) || 1669) / zoom) >= UI_DESIGN_WIDTH
      && Math.round(((size && size.height) || 904) / zoom) >= UI_DESIGN_HEIGHT,
  };
}
