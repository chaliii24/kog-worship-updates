// Remote draw-mode strokes: shared by the desktop projector overlay and the
// phone Draw tab so both sides agree on coordinates and limits. PURE
// functions only (no JSX) — node-tested via test-remote-update.mjs. The
// <DrawOverlay> face lives in components/DrawOverlay.jsx.
//
// Coordinate space is always the 1280x720 design canvas (x: 0-1280,
// y: 0-720). The projector stretches it edge-to-edge on any wall
// (preserveAspectRatio="none"); the phone maps touch through its miniature.
// A stroke: { id, color, width, points: [[x,y], ...] }.

export const DRAW_W = 1280;
export const DRAW_H = 720;
export const DRAW_COLORS = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc', '#ffffff'];
export const DRAW_WIDTHS = [6, 12, 20];
export const MAX_STROKES = 20;
export const MAX_POINTS_PER_STROKE = 120;

// Clamp + round one raw stroke from ANY sender (phone included). Returns a
// clean stroke or null when there is nothing drawable.
export function sanitizeDrawStroke(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#f87171';
  const width = Math.min(40, Math.max(2, Math.round(Number(raw.width) || 12)));
  const pts = Array.isArray(raw.points) ? raw.points : [];
  const clean = [];
  for (const p of pts) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Math.min(DRAW_W, Math.max(0, Math.round(Number(p[0]))));
    const y = Math.min(DRAW_H, Math.max(0, Math.round(Number(p[1]))));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const last = clean[clean.length - 1];
    // Drop sub-pixel jitter duplicates: they bloat snapshots, not lines.
    if (last && Math.abs(last[0] - x) < 2 && Math.abs(last[1] - y) < 2) continue;
    clean.push([x, y]);
    if (clean.length >= MAX_POINTS_PER_STROKE) break;
  }
  if (clean.length < 2) return null;
  const id = String(raw.id || '').slice(0, 40) || `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return { id, color, width, points: clean };
}

// Append a stroke, oldest-first cap so snapshots stay small on the LAN.
export function pushDrawStroke(strokes, stroke) {
  const list = Array.isArray(strokes) ? strokes.filter(Boolean) : [];
  const next = [...list, stroke].slice(-MAX_STROKES);
  return next;
}

export function strokeToPath(points) {
  return (points || []).map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
}

// Map a screen point into design space through an element's laid-out box.
// Every surface — the wall, its preview, the phone's miniature — stretches
// 1280x720 edge to edge, so the ratio inside the box IS the design coordinate.
// That is what makes a stroke drawn on a small preview land correctly on a
// huge one. Null for a zero-sized box: a preview hidden by display:none would
// otherwise map every point to 0,0 and paint in the corner.
export function clientToDesign(rect, clientX, clientY) {
  if (!rect || !rect.width || !rect.height) return null;
  const x = Math.round(((clientX - rect.left) / rect.width) * DRAW_W);
  const y = Math.round(((clientY - rect.top) / rect.height) * DRAW_H);
  return [Math.min(DRAW_W, Math.max(0, x)), Math.min(DRAW_H, Math.max(0, y))];
}
