import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  MIN_BOX_W,
  MIN_BOX_H,
  normalizeBox,
  normalizeAngle,
  normalizeSongGeometry,
  needsLegacyGeometryMigration,
  boxCenter,
  rotatedBounds,
  clampCenterToCanvas,
  clampBoxCenter,
  boundBoxToCanvas,
  boxFromKonvaNode,
  applyBoxToKonvaNode,
  containScale,
  designCanvasInFrame,
  designCanvasFilled,
  aspectFrameInViewport,
  clientToSlide,
  slideToClient,
  pointInBox,
  topBoxAt,
  boxToCss,
} from '../../src/lib/slideGeometry.js';

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// Minimal Konva-node stand-in: exactly the methods/accessors the geometry
// adapter is allowed to rely on.
function fakeNode({ x = 0, y = 0, scaleX = 1, scaleY = 1, rotation = 0 } = {}) {
  const node = {
    _x: x, _y: y, _sx: scaleX, _sy: scaleY, _rot: rotation,
    x() { return this._x; },
    y() { return this._y; },
    scaleX(v) { if (v === undefined) return this._sx; this._sx = v; return this; },
    scaleY(v) { if (v === undefined) return this._sy; this._sy = v; return this; },
    rotation(v) { if (v === undefined) return this._rot; this._rot = v; return this; },
    offset(v) { if (v === undefined) return this._offset; this._offset = v; return this; },
    position(v) { if (v === undefined) return { x: this._x, y: this._y }; this._x = v.x; this._y = v.y; return this; },
  };
  return node;
}

test('legacy box without angle/rotation is normalised without moving it', () => {
  const box = normalizeBox({ x: 12, y: 34, w: 500, h: 200 });
  assert.deepEqual(box, { x: 12, y: 34, w: 500, h: 200, angle: 0 });
  assert.deepEqual(normalizeBox({ x: 1, y: 2, w: 300, h: 100, rotation: 45 }).angle, 45);
  // Konva's Transformer rect spelling is accepted too.
  assert.deepEqual(normalizeBox({ x: 1, y: 2, width: 300, height: 100, rotation: 15 }),
    { x: 1, y: 2, w: 300, h: 100, angle: 15 });
  // A missing/null dimension falls back to the provided box, not to zero.
  assert.deepEqual(normalizeBox({ x: 5, y: 6, w: null, h: '' }, { x: 1, y: 2, w: 640, h: 360 }),
    { x: 5, y: 6, w: 640, h: 360, angle: 0 });
  // Save normalisation must not silently enlarge a small hand-placed box.
  assert.deepEqual(normalizeBox({ x: 10, y: 20, w: 40, h: 30 }),
    { x: 10, y: 20, w: 40, h: 30, angle: 0 });
  // ...but a non-positive size is invalid and takes the fallback.
  assert.deepEqual(normalizeBox({ x: 0, y: 0, w: 0, h: -5 }, { w: 300, h: 200 }),
    { x: 0, y: 0, w: 300, h: 200, angle: 0 });
});

test('angle normalisation wraps into (-180, 180]', () => {
  assert.equal(normalizeAngle(359), -1);
  assert.equal(normalizeAngle(180), 180);
  assert.equal(normalizeAngle(-180), 180);
  assert.equal(normalizeAngle(-181), 179);
  assert.equal(normalizeAngle(720), 0);
});

test('viewport conversion is the exact inverse at any zoom / device size', () => {
  const rects = [
    { left: 0, top: 0, width: 1280, height: 720 },
    { left: 120, top: 48, width: 640, height: 360 },
    { left: -40, top: 17, width: 1920, height: 1080 },
    { left: 5, top: 9, width: 357, height: 200.8125 },
  ];
  for (const rect of rects) {
    for (const point of [{ x: 0, y: 0 }, { x: 1280, y: 720 }, { x: 313.25, y: 599.5 }]) {
      const client = slideToClient(point.x, point.y, rect);
      const back = clientToSlide(client.x, client.y, rect);
      approx(back.x, point.x, 1e-9);
      approx(back.y, point.y, 1e-9);
    }
  }
});

test('contain-fit keeps 16:9 and respects both axes', () => {
  approx(containScale(1600, 900) * SLIDE_WIDTH, 1600);
  approx(containScale(1000, 200) * SLIDE_HEIGHT, 200);
  assert.equal(containScale(0, 100), 0);
});

// THE PROJECTOR/CANVAS CONTRACT. The song editor's canvas is the reference
// picture; the output frame may only SCALE it. These three properties are
// exactly the user-visible promise: changing the output aspect ratio or the
// screen resolution changes the SIZE of the picture and never its FORMAT or
// its internal layout.
test('the output picture is always 16:9, whatever the frame shape', () => {
  const frames = [
    [1920, 1080], // 16:9
    [2560, 1080], // 21:9 ultra-wide LED
    [3840, 1080], // a very wide strip
    [1024, 768],  // 4:3 projector
    [1080, 1920], // portrait
    [1280, 720],  // the native design size
  ];
  for (const [fw, fh] of frames) {
    const { s, cw, ch } = designCanvasInFrame(fw, fh);
    // FORMAT never changes: the canvas stays exactly 16:9 (1280x720).
    approx(cw / ch, SLIDE_WIDTH / SLIDE_HEIGHT, 1e-9);
    approx(cw, SLIDE_WIDTH * s, 1e-9);
    approx(ch, SLIDE_HEIGHT * s, 1e-9);
  }
});

test('resolution only scales the picture — doubling the frame doubles it exactly', () => {
  const base = designCanvasInFrame(1280, 720);
  const big = designCanvasInFrame(2560, 1440);
  // SIZE only: every linear dimension doubles, the proportions do not move.
  approx(big.s, base.s * 2, 1e-9);
  approx(big.cw, base.cw * 2, 1e-9);
  approx(big.ch, base.ch * 2, 1e-9);
  // An ultra-wide frame does NOT widen the picture — it only changes how much
  // of the frame the (still 16:9) picture occupies and where it sits.
  const wide = designCanvasInFrame(2560, 1080);
  const hd = designCanvasInFrame(1920, 1080);
  approx(wide.cw / wide.ch, hd.cw / hd.ch, 1e-9);
  approx(wide.s, hd.s, 1e-9); // height-limited: same size as plain 1080p
});

test('the canvas is centred and never cropped by the frame', () => {
  for (const [fw, fh] of [[2560, 1080], [1024, 768], [800, 1200]]) {
    const { cw, ch, cx, cy } = designCanvasInFrame(fw, fh, 0, 0);
    // Contain: the picture fits INSIDE the frame on both axes (no crop).
    assert.ok(cw <= fw + 1e-9, `${cw} > ${fw}`);
    assert.ok(ch <= fh + 1e-9, `${ch} > ${fh}`);
    // Centred: equal margins on opposing sides.
    approx(cx, (fw - cw) / 2, 1e-9);
    approx(cy, (fh - ch) / 2, 1e-9);
    approx(fw - cw - cx, cx, 1e-9); // left margin == right margin
    approx(fh - ch - cy, cy, 1e-9); // top margin == bottom margin
  }
  // A framed card sitting at an offset inside a bigger window keeps that
  // offset (the picture is centred in the FRAME, not in the window).
  const off = designCanvasInFrame(1280, 720, 100, 50);
  approx(off.cx, 100, 1e-9);
  approx(off.cy, 50, 1e-9);
});

test('an unmeasured frame yields a zero scale, never NaN dimensions', () => {
  // ResizeObserver has not fired yet on a framed card: 0x0 for one tick.
  const { s, cw, ch, cx, cy } = designCanvasInFrame(0, 0);
  assert.equal(s, 0);
  for (const v of [cw, ch, cx, cy]) assert.ok(Number.isFinite(v), `${v} is not finite`);
});

// THE WALL'S FILL — a screen wider than 16:9 is covered by widening the DESIGN
// SPACE (boxes spread, type size untouched), never by cropping the design and
// never by leaving bars at the sides.
test('a 16:9 frame fills exactly like the plain contain fit', () => {
  for (const [fw, fh] of [[1280, 720], [1920, 1080], [3840, 2160]]) {
    const filled = designCanvasFilled(fw, fh);
    const contain = designCanvasInFrame(fw, fh);
    approx(filled.stretch, 1, 1e-9);
    approx(filled.s, contain.s, 1e-9);
    approx(filled.cw, fw, 1e-9);
    approx(filled.ch, fh, 1e-9);
    approx(filled.cx, contain.cx, 1e-9);
    approx(filled.cy, contain.cy, 1e-9);
  }
});

test('a wider screen is filled edge to edge by widening the design space', () => {
  for (const [fw, fh] of [[2560, 1080], [3840, 1080], [3440, 1440]]) {
    const { s, cw, ch, cx, cy, stretch } = designCanvasFilled(fw, fh);
    // The band IS the frame: no bars, and nothing hangs off it.
    approx(cw, fw, 1e-9);
    approx(ch, fh, 1e-9);
    approx(cx, 0, 1e-9);
    approx(cy, 0, 1e-9);
    // Height always maps 1:1 to the design, so type never changes size…
    approx(s, fh / SLIDE_HEIGHT, 1e-9);
    // …and the extra width arrives as extra LAYOUT space, not bigger boxes.
    approx(stretch, (fw / fh) / (SLIDE_WIDTH / SLIDE_HEIGHT), 1e-9);
    assert.ok(stretch >= 1, `stretch ${stretch} < 1`);
  }
});

test('a narrower screen letterboxes instead of spreading or cropping', () => {
  for (const [fw, fh] of [[1024, 768], [1080, 1920], [800, 1200]]) {
    const { s, cw, ch, cx, cy, stretch } = designCanvasFilled(fw, fh);
    const contain = designCanvasInFrame(fw, fh);
    approx(stretch, 1, 1e-9);
    approx(s, contain.s, 1e-9);
    approx(cw, contain.cw, 1e-9);
    approx(ch, contain.ch, 1e-9);
    approx(cx, contain.cx, 1e-9);
    approx(cy, contain.cy, 1e-9);
    // Never either axis past the frame — a word is never cut off.
    assert.ok(cw <= fw + 1e-9 && ch <= fh + 1e-9, `${cw}x${ch} exceeds ${fw}x${fh}`);
  }
});

test('an unmeasured frame stays finite with no spread', () => {
  const { s, cw, ch, cx, cy, stretch } = designCanvasFilled(0, 0);
  assert.equal(s, 0);
  assert.equal(stretch, 1);
  for (const v of [cw, ch, cx, cy]) assert.ok(Number.isFinite(v), `${v} is not finite`);
});

// THE ASPECT-RATIO STATE — Fill / Auto / Native must take the whole screen
// (no bars, ever), a named ratio must become a centred bounding box of exactly
// that shape. Either way it only SIZES the stage; it never re-forms it.
test('Fill fills the viewport; a named ratio is a centred exact-ratio box', () => {
  const viewports = [[1920, 1080], [2560, 1080], [1024, 768], [768, 1024], [3440, 1440]];
  for (const [vw, vh] of viewports) {
    const f = aspectFrameInViewport(vw, vh, 16 / 9, true);
    approx(f.fw, vw, 1e-9);
    approx(f.fh, vh, 1e-9);
    approx(f.fx, 0, 1e-9);
    approx(f.fy, 0, 1e-9);
  }
  for (const [vw, vh, ar] of [
    [2560, 1080, 16 / 9],
    [1024, 768, 16 / 9],
    [1920, 1080, 4 / 3],
    [1080, 1920, 16 / 9],
    [3440, 1440, 21 / 9],
  ]) {
    const f = aspectFrameInViewport(vw, vh, ar, false);
    approx(f.fw / f.fh, ar, 1e-9); // exact ratio, whatever the screen is
    assert.ok(f.fw <= vw + 1e-9 && f.fh <= vh + 1e-9, `frame exceeds viewport ${vw}x${vh}`);
    approx(f.fx, (vw - f.fw) / 2, 1e-9); // centred in the viewport
    approx(f.fy, (vh - f.fh) / 2, 1e-9);
  }
  // A garbage ratio falls back to the design ratio instead of dividing by 0.
  approx(aspectFrameInViewport(1920, 1080, 0, false).fw / aspectFrameInViewport(1920, 1080, 0, false).fh, 16 / 9, 1e-9);
  approx(aspectFrameInViewport(1920, 1080, NaN, false).fh, 1080, 1e-9);
});

// THE NO-CLIP CHAIN — band ⊆ frame ⊆ viewport, for every screen shape and
// every aspect setting. This is the promise that the live output can fill the
// screen while the typography/layout inside it always fits entirely on screen:
// the design is scaled and centred, never cut by the frame or the screen.
test('the design band can never be clipped by the frame or the viewport', () => {
  const viewports = [[1920, 1080], [2560, 1080], [1024, 768], [1080, 1920], [800, 1200], [3440, 1440]];
  const ratios = [4 / 3, 16 / 9, 16 / 10, 21 / 9, 32 / 9];
  for (const [vw, vh] of viewports) {
    for (const fill of [true, false]) {
      for (const ar of (fill ? [16 / 9] : ratios)) {
        const fr = aspectFrameInViewport(vw, vh, ar, fill);
        // Frame inside the viewport — no setting sizes a stage off-screen.
        assert.ok(fr.fx >= -1e-9 && fr.fy >= -1e-9, `frame off-screen at ${vw}x${vh} ar=${ar} fill=${fill}`);
        assert.ok(fr.fx + fr.fw <= vw + 1e-9 && fr.fy + fr.fh <= vh + 1e-9, `frame cropped at ${vw}x${vh} ar=${ar} fill=${fill}`);
        // Band inside the frame — the contained design never overflows.
        const band = designCanvasInFrame(fr.fw, fr.fh, fr.fx, fr.fy);
        assert.ok(band.cw <= fr.fw + 1e-9 && band.ch <= fr.fh + 1e-9, `band exceeds frame at ${vw}x${vh} ar=${ar} fill=${fill}`);
        assert.ok(band.cx >= fr.fx - 1e-9 && band.cy >= fr.fy - 1e-9, `band off-frame at ${vw}x${vh}`);
        assert.ok(band.cx + band.cw <= fr.fx + fr.fw + 1e-9 && band.cy + band.ch <= fr.fy + fr.fh + 1e-9, `band clipped at ${vw}x${vh} ar=${ar} fill=${fill}`);
        // And the picture keeps its own proportions while doing so.
        approx(band.cw / band.ch, SLIDE_WIDTH / SLIDE_HEIGHT, 1e-9);
      }
    }
  }
});

test('a drag commits the same logical box at every viewport zoom', () => {
  const start = { x: 100, y: 120, w: 500, h: 200, angle: 0 };
  const node = fakeNode({ x: boxCenter(start).x, y: boxCenter(start).y });
  node.position({ x: node.x() + 37.5, y: node.y() - 12.25 });
  const committed = boxFromKonvaNode(node, start);
  // Zoom lives in the DOM transform, never in the node or the saved box.
  for (const scale of [0.2, 0.5, 1, 1.75, 3]) {
    const css = boxToCss(committed);
    assert.equal(css.width, `${committed.w}px`);
    const rect = { left: 0, top: 0, width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale };
    const client = slideToClient(committed.x + committed.w / 2, committed.y + committed.h / 2, rect);
    const logical = clientToSlide(client.x, client.y, rect);
    assert.deepEqual(normalizeBox({ ...committed, x: logical.x - committed.w / 2, y: logical.y - committed.h / 2 }), committed);
  }
});

test('repeated drag -> transform -> apply cycles do not drift', () => {
  let box = { x: 100, y: 120, w: 500, h: 200, angle: 0 };
  const target = { x: 777.125, y: 241.875, w: 500, h: 200, angle: 0 };
  for (let i = 0; i < 500; i++) {
    const node = fakeNode({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    node.position({ x: target.x + target.w / 2, y: target.y + target.h / 2 });
    const next = boxFromKonvaNode(node, box);
    applyBoxToKonvaNode(node, next);
    if (i === 0) box = next;
    assert.deepEqual(next, target);
  }
});

test('resize collapses Konva scale into width/height and never moves the centre', () => {
  const start = { x: 100, y: 120, w: 500, h: 200, angle: 0 };
  const centre = boxCenter(start);
  const node = fakeNode({ x: centre.x, y: centre.y, scaleX: 1.4, scaleY: 0.75 });
  const next = boxFromKonvaNode(node, start);
  assert.deepEqual(next, { x: 100 - 100, y: 120 + 25, w: 700, h: 150, angle: 0 });
  assert.equal(next.w / 2 + next.x, centre.x, 'horizontal centre preserved');
  assert.equal(next.h / 2 + next.y, centre.y, 'vertical centre preserved');
  applyBoxToKonvaNode(node, next);
  assert.equal(node.scaleX(), 1);
  assert.equal(node.scaleY(), 1);
  assert.deepEqual(node.offset(), { x: next.w / 2, y: next.h / 2 });
  assert.equal(node.x(), next.x + next.w / 2);
});

test('drag clamp uses the rotated footprint, not the unrotated width', () => {
  const box = { x: 0, y: 0, w: 400, h: 100, angle: 90 };
  const clamped = clampCenterToCanvas(box, { x: 0, y: 0 });
  // At 90 degrees the box's visual half-width is h/2 and half-height is w/2.
  approx(clamped.x, 50);
  approx(clamped.y, 200);
  // A small rotated box near the top-left must be pushed in by its rotated half
  // height, which is larger than h/2 at 45 degrees.
  const small = { x: 0, y: 0, w: 200, h: 200, angle: 45 };
  const c = clampCenterToCanvas(small, { x: 0, y: 0 });
  const half = rotatedBounds({ ...small, x: c.x - 100, y: c.y - 100 }).w / 2;
  approx(c.x, half);
  approx(c.y, half);
  assert.ok(clampBoxCenter({ ...small, x: -30, y: -20 }).x >= 0);
});

test('Transformer boundBox rejects off-canvas and too-small geometry', () => {
  // Konva 10's Transformer passes { x, y, width, height, rotation }.
  const old = { x: 100, y: 100, width: 400, height: 200, rotation: 0 };
  assert.equal(boundBoxToCanvas(old, { ...old, width: MIN_BOX_W - 1 }), old);
  assert.equal(boundBoxToCanvas(old, { ...old, height: MIN_BOX_H - 1 }), old);
  assert.equal(boundBoxToCanvas(old, { ...old, x: -50 }), old);
  const good = { x: 110, y: 110, width: 450, height: 220, rotation: 0 };
  const accepted = boundBoxToCanvas(old, good);
  // Must stay in Konva's rect shape, or the Transformer collapses the node.
  assert.deepEqual(accepted, good);
  assert.equal(accepted.width, 450);
  assert.equal(accepted.height, 220);
  // Canonical spelling still works for direct callers and tests.
  const canonical = { x: 110, y: 110, w: 450, h: 220, angle: 0 };
  assert.deepEqual(boundBoxToCanvas(canonical, canonical), canonical);
  // Konva passes rotation in RADIANS; it must come back in radians.
  const rotated = { x: 200, y: 150, width: 400, height: 200, rotation: Math.PI / 2 };
  const rotatedOut = boundBoxToCanvas(old, rotated);
  approx(rotatedOut.rotation, Math.PI / 2, 1e-12);
  // A 45-degree box whose unrotated rect fits but rotated footprint does not.
  const diagonal = { x: 0, y: 0, width: 400, height: 100, rotation: Math.PI / 4 };
  assert.equal(boundBoxToCanvas(old, diagonal), old);
  assert.ok(MIN_BOX_H > 0);
});

test('rotated hit testing selects the top-most visible box', () => {
  const boxes = [
    { x: 0, y: 0, w: 1280, h: 720, angle: 0 },
    { x: 100, y: 100, w: 200, h: 60, angle: 90 },
  ];
  // A point on the rotated kicker's vertical arm, outside its unrotated rect.
  assert.equal(topBoxAt(boxes, 200, 40), 1);
  assert.equal(topBoxAt(boxes, 130, 40), 0);
  assert.equal(topBoxAt(boxes, 130, 300), 0);
  assert.equal(pointInBox(boxes[1], 200, 130), true);
});

test('save/reload normalisation is idempotent and preserves unknown fields', () => {
  const song = {
    id: 7,
    title: 'Legacy',
    cues: [
      {
        id: 'cue-1',
        text: 'hello',
        label: 'Verse 1',
        box: { x: 80.25, y: 100.5, w: 1120, h: 480, angle: 361 },
        customPreset: { keep: true },
        font: 'CMG Sans',
      },
    ],
    title_cue: { text: 'Title', box: { x: 1, y: 2, w: 3, h: 4 } },
  };
  const once = normalizeSongGeometry(song);
  const twice = normalizeSongGeometry(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
  assert.equal(once.cues[0].customPreset.keep, true);
  assert.equal(once.cues[0].font, 'CMG Sans');
  assert.equal(once.cues[0].box.angle, 1);
  assert.equal(once.cues[0].geometryVersion, 1);
  assert.equal(needsLegacyGeometryMigration(once.cues[0]), false);
  assert.equal(needsLegacyGeometryMigration(song.cues[0]), true);
  assert.equal(needsLegacyGeometryMigration({ ...song.cues[0], locked: true }), false);
});
