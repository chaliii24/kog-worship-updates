import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

/**
 * Dark replacement for the native <select>.
 *
 * Chromium draws the native option list in the OS palette, so on a dark app it
 * pops a white box that CSS cannot restyle — and with a long list (66 books)
 * that box happily runs off the window. This keeps the same value/onChange
 * contract, paints the list from the same --ui-* tokens as the rest of the UI,
 * and renders it through a portal with fixed coordinates so the scrolling
 * sidebar can never clip it. It flips upward when there is no room below.
 *
 * options: [{ value, label }] — value is compared as a string, so numbers
 * from the database behave the same as the '' used for "no selection".
 *
 * searchable: puts a filter input at the top of the panel (autofocused), so a
 * long list like the 66 Bible books can be narrowed by typing instead of
 * clicked-and-scrolled. Arrow keys move the cursor through the filtered rows,
 * Enter picks the highlighted one, Escape closes. Off by default — short lists
 * keep their exact old behavior. The dropdown and its scrolling are unchanged.
 */
export default function Dropdown({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  tone = 'accent',
  title,
  maxHeight = 260,
  style,
  id,
  searchable = false,
  searchPlaceholder = 'Type to filter…',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hl, setHl] = useState(0); // keyboard cursor within the filtered list
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: maxHeight });
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  const key = (v) => (v === null || v === undefined ? '' : String(v));
  const selected = options.find(o => key(o.value) === key(value));

  // Filtered view: only searchable dropdowns narrow down; plain ones show
  // every option exactly as before.
  const q = searchable ? query.trim().toLowerCase() : '';
  const list = q ? options.filter(o => String(o.label).toLowerCase().includes(q)) : options;
  const hlIdx = list.length ? Math.min(hl, list.length - 1) : -1;
  const pick = (o) => { onChange && onChange(o.value); setOpen(false); };

  // A reopened panel starts unfiltered with the cursor on the first row.
  useEffect(() => { if (!open) { setQuery(''); setHl(0); } }, [open]);

  // Arrow keys can move the cursor past the fold → keep it in view. The
  // panel is the scroller (overflow-y: auto), and block:'nearest' means a
  // cursor already visible causes no scroll at all.
  useLayoutEffect(() => {
    if (!open || !searchable || hlIdx < 0 || !panelRef.current) return;
    const el = panelRef.current.querySelector('[data-hl="1"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [open, searchable, hlIdx, query]);

  const place = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const flip = below < Math.min(maxHeight, 200) && above > below;
    const height = Math.max(96, Math.min(maxHeight, flip ? above : below));
    setBox({
      left: Math.max(6, Math.min(r.left, window.innerWidth - r.width - 6)),
      top: flip ? Math.max(6, r.top - height - 4) : r.bottom + 4,
      width: r.width,
      height,
    });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const t = e.target;
      // The list is portalled outside this root, so a click on an option must
      // not count as "click outside" — otherwise the panel unmounts on mousedown
      // and the click that selects the value never fires. The search input
      // lives in the same panel, so typing/clicking it keeps the panel open too.
      if (t && t.closest && t.closest('.dd-panel')) return;
      if (rootRef.current && !rootRef.current.contains(t)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={rootRef} className="dd-root" style={style} title={title} id={id}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={'dd-trigger' + (tone === 'quiet' ? ' is-quiet' : '') + (selected ? '' : ' is-placeholder')}
      >
        <span className="dd-label">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={12} className="dd-caret" data-open={open ? '1' : '0'} />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="dd-panel"
          role="listbox"
          style={{ left: box.left, top: box.top, width: box.width, maxHeight: box.height }}
        >
          {searchable && (
            <div style={{ position: 'sticky', top: -4, zIndex: 1, margin: -4, marginBottom: 4, padding: 4, background: 'var(--ui-elev2)', borderBottom: '1px solid var(--ui-border)' }}>
              <Search size={11} color="var(--ui-faint)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHl(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHl(h => Math.min(h + 1, Math.max(0, list.length - 1))); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(h => Math.max(h - 1, 0)); }
                  else if (e.key === 'Enter') { e.preventDefault(); if (hlIdx >= 0) pick(list[hlIdx]); }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--ui-border)', borderRadius: 6, padding: '6px 8px 6px 24px', color: 'var(--ui-text)', fontSize: 11.5, outline: 'none' }}
              />
            </div>
          )}
          {list.length === 0 && <div className="dd-empty">{options.length === 0 ? placeholder : `Nothing matches “${query.trim()}”`}</div>}
          {list.map((o, i) => {
            const active = key(o.value) === key(value);
            return (
              <button
                key={key(o.value)}
                type="button"
                role="option"
                aria-selected={active}
                data-active={active ? '1' : '0'}
                data-hl={searchable && i === hlIdx ? '1' : '0'}
                className="dd-opt"
                onClick={() => pick(o)}
              >
                {o.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
