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
