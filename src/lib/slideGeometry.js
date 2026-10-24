// CANONICAL SLIDE GEOMETRY
//
// One coordinate system for every consumer of a slide:
//   origin  = top-left of the logical canvas
//   units   = logical slide pixels (1280 x 720, the size KOGWorship has always
//             saved; existing song boxes use it, so it stays the canonical
//             document space rather than inventing a second 1920x1080 space)
//   x / y   = top-left of the unrotated box
//   w / h   = box dimensions before rotation
//   angle   = degrees clockwise around the box CENTRE
//
// Viewport zoom, CSS scale, devicePixelRatio and stage pan NEVER belong in a
// persisted box. They are applied on the way in (client -> logical) and on the
// way out (logical -> CSS transform). Keeping those conversions here means the
// editor, the thumbnails and the projector all speak the same units.

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;
export const SLIDE_ASPECT = SLIDE_WIDTH / SLIDE_HEIGHT;

export const MIN_BOX_W = 80;
export const MIN_BOX_H = 48;

// Bump only when a saved geometry field changes meaning. `geometryVersion` is
// stored inside cue.style_json (the database already persists unknown cue keys)
// and tells the loader that a box has already been migrated, so opening a song
// can never keep growing its boxes on every reload.
export const GEOMETRY_VERSION = 1;

export const DEFAULT_BOX = { x: 80, y: 100, w: 1120, h: 480, angle: 0 };

const EPSILON = 1e-9;

export const isNum = (v) => v !== null && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));

const num = (v, fallback = 0) => (isNum(v) ? Number(v) : fallback);

const positiveOr = (v, fbValue, fallbackValue) => {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  const f = Number(fbValue);
  if (Number.isFinite(f) && f > 0) return f;
  return fallbackValue;
};

// 3 decimal places is far below one screen pixel at every supported zoom and
// is enough to make save -> load -> save byte-stable. This is normalisation,
// not a "fix drift by rounding": every calculation below is done in logical
// units, and the same input always produces the same output.
export const roundLogical = (v) => Math.round(num(v) * 1000) / 1000;

export const normalizeAngle = (deg) => {
  let a = num(deg) % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  // -0 would serialise as 0 anyway; make the object stable for tests.
  return Object.is(a, -0) ? 0 : roundLogical(a);
};

/**
 * Normalise an incoming box into the canonical shape without moving it.
 * Invalid/missing dimensions fall back to `fallback` (or the default box) and
 * x/y are preserved exactly. Used on load, on save and before every commit.
 *
 * Deliberately does NOT enforce the editor's MIN_BOX_W/H: those are gesture
 * limits, and silently enlarging an old hand-placed caption on save would
 * change a saved slide. Only non-positive/invalid sizes are replaced.
 */
export const normalizeBox = (box, fallback = DEFAULT_BOX) => {
  const b = box && typeof box === 'object' ? box : {};
  const fb = fallback && typeof fallback === 'object' ? fallback : DEFAULT_BOX;
  // Accept both the canonical shape (w/h/angle) and Konva's Transformer rect
  // shape (width/height/rotation) so callers can never silently fall back to
  // the default box just because they used the other spelling.
  const w = isNum(b.w) ? b.w : (isNum(b.width) ? b.width : fb.w);
  const h = isNum(b.h) ? b.h : (isNum(b.height) ? b.height : fb.h);
  const angle = isNum(b.angle) ? b.angle : (isNum(b.rotation) ? b.rotation : 0);
  return {
    x: roundLogical(isNum(b.x) ? b.x : fb.x),
    y: roundLogical(isNum(b.y) ? b.y : fb.y),
    w: roundLogical(positiveOr(w, fb.w, DEFAULT_BOX.w)),
    h: roundLogical(positiveOr(h, fb.h, DEFAULT_BOX.h)),
    angle: normalizeAngle(angle),
  };
};

export const boxCenter = (box) => ({
  x: num(box && box.x) + num(box && box.w) / 2,
  y: num(box && box.y) + num(box && box.h) / 2,
});

/** Axis-aligned bounds of a rotated box (used only for clamping/hit tests). */
export const rotatedHalfExtents = (box) => {
  const w = Math.max(0, num(box && box.w));
  const h = Math.max(0, num(box && box.h));
  const rad = (num(box && box.angle) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    hw: (c * w + s * h) / 2,
    hh: (s * w + c * h) / 2,
  };
};

export const rotatedBounds = (box) => {
  const c = boxCenter(box);
  const { hw, hh } = rotatedHalfExtents(box);
  return { x: c.x - hw, y: c.y - hh, w: hw * 2, h: hh * 2 };
};

/**
 * Keep a box wholly inside the canvas whenever it physically fits, otherwise
 * keep its CENTRE inside. Rotation is included: a 45-degree box needs a larger
 * margin than its unrotated width suggests, which is why the old unrotated
 * clamp let corners slide off the wall.
 */
export const clampBoxCenter = (box, canvasW = SLIDE_WIDTH, canvasH = SLIDE_HEIGHT) => {
  const b = normalizeBox(box);
  const c = boxCenter(b);
  const { hw, hh } = rotatedHalfExtents(b);
  const minX = Math.min(hw, canvasW / 2);
  const maxX = Math.max(canvasW - hw, canvasW / 2);
  const minY = Math.min(hh, canvasH / 2);
  const maxY = Math.max(canvasH - hh, canvasH / 2);
  const cx = Math.min(maxX, Math.max(minX, c.x));
  const cy = Math.min(maxY, Math.max(minY, c.y));
  return { ...b, x: roundLogical(cx - b.w / 2), y: roundLogical(cy - b.h / 2) };
};

/** Clamp a raw Konva centre position for `dragBoundFunc`. */
export const clampCenterToCanvas = (startBox, pos, canvasW = SLIDE_WIDTH, canvasH = SLIDE_HEIGHT) => {
  const b = normalizeBox(startBox);
  const { hw, hh } = rotatedHalfExtents(b);
  const minX = Math.min(hw, canvasW / 2);
  const maxX = Math.max(canvasW - hw, canvasW / 2);
  const minY = Math.min(hh, canvasH / 2);
  const maxY = Math.max(canvasH - hh, canvasH / 2);
  return {
    x: Math.min(maxX, Math.max(minX, num(pos && pos.x))),
    y: Math.min(maxY, Math.max(minY, num(pos && pos.y))),
  };
};

/** Whole-box-on-canvas check shared by drag commits and Transformer bounds. */
export const boxFitsCanvas = (box, canvasW = SLIDE_WIDTH, canvasH = SLIDE_HEIGHT) => {
  const b = rotatedBounds(normalizeBox(box));
  return b.x >= -EPSILON && b.y >= -EPSILON
    && b.x + b.w <= canvasW + EPSILON
    && b.y + b.h <= canvasH + EPSILON;
};

/**
 * Transformer boundBoxFunc. Rejects a gesture that would make the box smaller
 * than the usable minimum or push its rotated footprint off the canvas. It
 * returns the OLD box (Konva's contract) rather than a half-applied one.
 */
export const boundBoxToCanvas = (oldBox, newBox, canvasW = SLIDE_WIDTH, canvasH = SLIDE_HEIGHT) => {
  if (!newBox) return oldBox;
  // Konva's Transformer hands us { x, y, width, height, rotation } with the
  // rotation in RADIANS (Konva.getAngle), while our own tests/helpers use
  // { x, y, w, h, angle } in degrees. Read the RAW values in either spelling
  // first: normalising would clamp an illegal 79px resize up to the 80px
  // minimum and let it through.
  const konvaShape = newBox.width !== undefined || newBox.height !== undefined || newBox.rotation !== undefined;
  const rawW = isNum(newBox.width) ? newBox.width : newBox.w;
  const rawH = isNum(newBox.height) ? newBox.height : newBox.h;
  if (!isNum(rawW) || !isNum(rawH) || Number(rawW) < MIN_BOX_W || Number(rawH) < MIN_BOX_H) return oldBox;
  const angleDeg = konvaShape && isNum(newBox.rotation)
    ? (Number(newBox.rotation) * 180) / Math.PI
    : (isNum(newBox.angle) ? Number(newBox.angle) : 0);
  const next = normalizeBox({ x: newBox.x, y: newBox.y, w: rawW, h: rawH, angle: angleDeg }, normalizeBox(oldBox));
  if (!boxFitsCanvas(next, canvasW, canvasH)) return oldBox;
  // Konva requires the returned value to be the same rect shape it passed in,
  // otherwise the Transformer reads undefined width/height and collapses the
  // node (and it would interpret a degree value as radians).
  if (!konvaShape) return next;
  return {
    ...newBox,
    x: next.x,
    y: next.y,
    width: next.w,
    height: next.h,
    rotation: (next.angle * Math.PI) / 180,
  };
};

/**
 * Reconstruct the logical box from a Konva node mid-gesture. The node must be
 * configured with offset = (start.w/2, start.h/2) and position = centre, which
 * is what the editor does. Works for drag (scale 1) and Transformer resize
 * (scale != 1) and never mutates the node.
 */
export const boxFromKonvaNode = (node, startBox) => {
  const s = normalizeBox(startBox);
  if (!node || typeof node.scaleX !== 'function') return { ...s };
  const sx = Math.abs(num(node.scaleX(), 1)) || 1;
  const sy = Math.abs(num(node.scaleY(), 1)) || 1;
  const w = Math.max(MIN_BOX_W, roundLogical(s.w * sx));
  const h = Math.max(MIN_BOX_H, roundLogical(s.h * sy));
  const cx = num(typeof node.x === 'function' ? node.x() : node.x, s.x + s.w / 2);
  const cy = num(typeof node.y === 'function' ? node.y() : node.y, s.y + s.h / 2);
  return {
    x: roundLogical(cx - w / 2),
    y: roundLogical(cy - h / 2),
    w,
    h,
    angle: normalizeAngle(typeof node.rotation === 'function' ? node.rotation() : 0),
  };
};

/**
 * Collapse a live scale back into the logical box on a Konva node. Called on
 * transform end AND after React re-renders a committed gesture, so the node
 * and the stored geometry can never describe different rectangles.
 */
export const applyBoxToKonvaNode = (node, box) => {
  if (!node) return;
  const b = normalizeBox(box);
  if (typeof node.scaleX === 'function') node.scaleX(1);
  if (typeof node.scaleY === 'function') node.scaleY(1);
  if (typeof node.offset === 'function') node.offset({ x: b.w / 2, y: b.h / 2 });
  if (typeof node.position === 'function') node.position({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  if (typeof node.rotation === 'function') node.rotation(b.angle);
};

/** CSS style for a logical box inside a 1280x720 layer. */
export const boxToCss = (box) => {
  const b = normalizeBox(box);
  return {
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
    transform: b.angle ? `rotate(${b.angle}deg)` : 'none',
    transformOrigin: 'center center',
  };
};

// ---- viewport conversion ---------------------------------------------------

/** Largest contain-fit scale for the logical canvas inside an available box. */
export const containScale = (availW, availH, canvasW = SLIDE_WIDTH, canvasH = SLIDE_HEIGHT) => {
  if (!(availW > 0) || !(availH > 0)) return 0;
  return Math.min(availW / canvasW, availH / canvasH);
};

/**
 * Client (CSS) pixels -> logical slide units, using the stage content's real
 * bounding rect. This is deliberately independent of React's `scale` state:
 * a ResizeObserver value can lag one frame, and using it here was a source of
 * clicks landing off the box after a window resize.
 */
export const clientToSlide = (clientX, clientY, containerRect, canvasW = SLIDE_WIDTH, canvasH = SLIDE_HEIGHT) => {
  if (!containerRect || !(containerRect.width > 0) || !(containerRect.height > 0)) return { x: 0, y: 0 };
  return {
    x: ((num(clientX) - num(containerRect.left)) / containerRect.width) * canvasW,
    y: ((num(clientY) - num(containerRect.top)) / containerRect.height) * canvasH,
  };
};

export const slideToClient = (x, y, containerRect, canvasW = SLIDE_WIDTH, canvasH = SLIDE_HEIGHT) => {
  if (!containerRect || !(containerRect.width > 0) || !(containerRect.height > 0)) return { x: 0, y: 0 };
  return {
    x: num(containerRect.left) + (num(x) / canvasW) * containerRect.width,
    y: num(containerRect.top) + (num(y) / canvasH) * containerRect.height,
  };
};

// ---- hit testing -----------------------------------------------------------

/** Is a logical point inside a rotated box? */
export const pointInBox = (box, x, y) => {
  const b = normalizeBox(box);
  const c = boxCenter(b);
  const rad = (b.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = num(x) - c.x;
  const dy = num(y) - c.y;
  // Rotate the point by -angle around the centre, then test axis-aligned.
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return Math.abs(lx) <= b.w / 2 + EPSILON && Math.abs(ly) <= b.h / 2 + EPSILON;
};

/**
 * Top-most box containing a logical point. `boxes` is in DRAW ORDER (index 0
 * drawn first). Returns the index or -1. Rotation-aware, so a click on a
 * rotated kicker hits the kicker, not the lyric rectangle behind it.
 */
export const topBoxAt = (boxes, x, y) => {
  if (!Array.isArray(boxes)) return -1;
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (b && pointInBox(b, x, y)) return i;
  }
  return -1;
};

// ---- persistence normalisation --------------------------------------------

/** Stamp a cue's box with the canonical geometry fields. Never moves it. */
export const normalizeCueGeometry = (cue) => {
  if (!cue || typeof cue !== 'object') return cue;
  return {
    ...cue,
    box: normalizeBox(cue.box, cue.box),
    geometryVersion: GEOMETRY_VERSION,
  };
};

/**
 * Normalise the small set of fields the editor owns, used immediately before
 * saving. Unknown/legacy cue properties are preserved (spread first), IDs and
 * references are untouched, and no box is repositioned.
 */
export const normalizeSongGeometry = (song) => {
  if (!song || typeof song !== 'object') return song;
  const out = {
    ...song,
    cues: Array.isArray(song.cues) ? song.cues.map(normalizeCueGeometry) : song.cues,
  };
  if (song.title_cue) out.title_cue = normalizeCueGeometry(song.title_cue);
  return out;
};

/**
 * True when a cue still needs the legacy load-time text-fit migration.
 * Versioned cues are left exactly as saved, which is what makes repeated
 * open/save cycles stable.
 */
export const needsLegacyGeometryMigration = (cue) => !!cue
  && typeof cue === 'object'
  && !cue.locked
  && cue.resizeMode !== 'fill'
  && !(Number(cue.geometryVersion) >= GEOMETRY_VERSION);
