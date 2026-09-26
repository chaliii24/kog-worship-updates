import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

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
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: maxHeight });
  const rootRef = useRef(null);

  const key = (v) => (v === null || v === undefined ? '' : String(v));
  const selected = options.find(o => key(o.value) === key(value));

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
      // and the click that selects the value never fires.
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
          className="dd-panel"
          role="listbox"
          style={{ left: box.left, top: box.top, width: box.width, maxHeight: box.height }}
        >
          {options.length === 0 && <div className="dd-empty">{placeholder}</div>}
          {options.map(o => {
            const active = key(o.value) === key(value);
            return (
              <button
                key={key(o.value)}
                type="button"
                role="option"
                aria-selected={active}
                data-active={active ? '1' : '0'}
                className="dd-opt"
                onClick={() => { onChange && onChange(o.value); setOpen(false); }}
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
