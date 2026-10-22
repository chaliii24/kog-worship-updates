import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FONT_OPTIONS } from '../lib/constants';

// RECENTLY USED FONTS — the faces the operator actually picks, so the ones
// they reach for every week are one click away instead of a scroll (or a
// search) into the long system list. Kept in localStorage so the list
// survives a restart.
const RECENT_KEY = 'kog_recent_fonts';
const RECENT_MAX = 6;
let recentCache = null;

const readRecent = () => {
  if (recentCache) return recentCache;
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    recentCache = Array.isArray(raw) ? raw.filter(v => typeof v === 'string').slice(0, RECENT_MAX) : [];
  } catch (_) {
    recentCache = [];
  }
  return recentCache;
};

const writeRecent = (list) => {
  recentCache = list;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (_) { /* private mode */ }
};

const rememberFont = (value) => {
  if (!value) return;
  const list = [value, ...readRecent().filter(v => v !== value)].slice(0, RECENT_MAX);
  writeRecent(list);
};

// Custom font dropdown replacing the native <select>:
//  • every row renders its label and an "AaGg 123" sample IN that row's own
//    typeface, so the user sees each font's actual style in the list — no
//    more clicking one-by-one to find out what a font looks like;
//  • clicking a row applies the font immediately, so the editor canvas
//    (the textbox) previews it right away.
export default function FontPicker({ value, choices, onChange, C }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState(null);
  const [pos, setPos] = useState(null);
  const [recent, setRecent] = useState(() => readRecent());
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);

  const current = choices.find(o => o.value === value) || { label: value, value };

  const measure = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < 250 && r.top > spaceBelow;
    const height = Math.max(180, Math.min(340, above ? r.top - 16 : spaceBelow - 12));
    const next = {
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 300) - 8),
      top: above ? r.top - height - 6 : r.bottom + 6,
      width: Math.max(r.width, 300),
      height,
    };
    // Bail out when nothing moved (e.g. scrolling the font list itself),
    // otherwise every scroll frame re-renders every row.
    setPos(prev => (prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next));
  };

  useLayoutEffect(() => {
    if (!open) { setPos(null); setQuery(''); setHovered(null); return; }
    measure();
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const reposition = () => measure();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Scroll the active font into view when the list opens.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector('[data-selected="1"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const q = query.trim().toLowerCase();
  const keep = (o) => !q || o.label.toLowerCase().includes(q);
  // Recently used first (the faces the operator actually reaches for), then
  // the bundled presets, then the system list.
  const recentRows = choices.filter(o => recent.includes(o.value)).filter(keep);
  const presets = choices.filter(o => FONT_OPTIONS.some(p => p.value === o.value)).filter(keep);
  const system = choices.filter(o => !FONT_OPTIONS.some(p => p.value === o.value)).filter(keep);

  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, padding: '10px 10px 4px 10px', position: 'sticky', top: 0, background: C.panel === '#000' ? 'var(--ui-elev)' : (C.elevated || 'var(--ui-elev)'), zIndex: 1 }}>{children}</div>
  );

  const Row = ({ o }) => {
    const selected = o.value === value;
    const hot = hovered === o.value;
    return (
      <div
        data-selected={selected ? '1' : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setHovered(o.value)}
        onMouseLeave={() => setHovered((h) => (h === o.value ? null : h))}
        onClick={() => pick(o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer',
          background: selected ? 'rgba(255,184,0,0.18)' : (hot ? 'rgba(255,255,255,0.06)' : 'transparent'),
          borderLeft: `2px solid ${selected ? (C.accLine || '#FFB800') : 'transparent'}`,
        }}
      >
        {/* The NAME is always in the UI face, never in the font itself: a face
            without Latin glyphs (Mongolian Baiti, Mangal, ...) would render
            its own name as blank boxes, and the row would look like a gap in
            the list. The sample on the right is where the font shows itself. */}
        <span style={{ fontSize: 13.5, color: C.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
        <span style={{ fontFamily: o.value, fontSize: 12, color: C.faint, flexShrink: 0, letterSpacing: 0.2 }}>AaGg 123</span>
      </div>
    );
  };

  const empty = recentRows.length === 0 && presets.length === 0 && system.length === 0;

  const pick = (o) => {
    rememberFont(o.value);
    setRecent(readRecent());
    onChange(o.value);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: C.input, color: C.text, border: open ? `1px solid ${C.accLine || '#FFB800'}` : '1px solid var(--ui-border2)', borderRadius: 6, padding: '7px', fontSize: 12, outline: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        {/* The current font's NAME, in the UI face — a face without Latin
            glyphs would show its own name as blank boxes. The dropdown rows
            carry the in-font sample. */}
        <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{current.label}</span>
        <span style={{ color: C.faint, fontSize: 10, flexShrink: 0 }}>▾</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed', left: pos.left, top: pos.top, width: pos.width, height: pos.height,
            background: C.elevated || 'var(--ui-elev)', border: '1px solid var(--ui-border2)', borderRadius: 8,
            boxShadow: '0 14px 40px rgba(0,0,0,0.55)', zIndex: 10000,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fonts…"
            style={{ flexShrink: 0, margin: 8, padding: '7px 9px', background: C.input || 'var(--ui-input)', color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, fontSize: 12, outline: 'none' }}
          />
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 6 }} onMouseLeave={() => setHovered(null)}>
            {recentRows.length > 0 && <SectionLabel>Recently Used</SectionLabel>}
            {recentRows.map(o => <Row key={`recent-${o.value}`} o={o} />)}
            {presets.length > 0 && <SectionLabel>Presets</SectionLabel>}
            {presets.map(o => <Row key={o.value} o={o} />)}
            {system.length > 0 && <SectionLabel>System Fonts ({system.length})</SectionLabel>}
            {system.map(o => <Row key={o.value} o={o} />)}
            {empty && <div style={{ padding: '14px 10px', fontSize: 12, color: C.faint }}>No fonts match “{query}”.</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
