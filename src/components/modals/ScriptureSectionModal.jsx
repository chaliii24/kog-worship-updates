import React, { useEffect, useRef, useState } from 'react';
import { ListMusic, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';

/**
 * "Where in the show?" picker for scripture added to the playlist.
 *
 * The service order is a list of sections (section headers with their items
 * between them), so a passage has to land somewhere specific — dumping it at
 * the very end is what made operators hunt for it afterwards. This dialog
 * asks for the destination up front: one row per section, the section the
 * operator was last working in preselected, and an explicit "End of show"
 * choice for when there is no section to hold it.
 */
export default function ScriptureSectionModal({
  C,
  ACCENT,
  reference,
  count,
  sections = [],
  initialTitle = null,
  onPick,
  onCancel,
}) {
  const [picked, setPicked] = useState(() => (
    initialTitle && sections.some(s => s.id === initialTitle) ? initialTitle : (sections[0] ? sections[0].id : '__end__')
  ));
  const okRef = useRef(null);

  useEffect(() => {
    okRef.current?.focus();
    const prev = document.activeElement;
    return () => {
      if (prev && prev !== document.body && typeof prev.focus === 'function') {
        try { prev.focus(); } catch (_) {}
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel?.();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        onPick?.(picked);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picked, onPick, onCancel]);

  const row = (id, title, subtitle, n, on) => (
    <button
      key={id}
      type="button"
      data-testid={`bible-queue-target-${id === '__end__' ? 'end' : id}`}
      onClick={() => setPicked(id)}
      onDoubleClick={() => onPick?.(id)}
      title={`Add to ${title}`}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
        padding: '9px 11px',
        borderRadius: 9,
        cursor: 'pointer',
        background: on ? 'rgba(255,184,0,0.16)' : C.elevated,
        border: on ? `1px solid ${ACCENT || '#FFB800'}` : '1px solid var(--ui-border2)',
        boxShadow: on ? '0 0 0 1px rgba(255,184,0,0.3)' : 'none',
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: on ? (ACCENT || '#FFB800') : 'transparent', border: on ? 'none' : '1px solid var(--ui-border3, var(--ui-border2))' }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: on ? (ACCENT || '#FFB800') : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 10, color: C.faint, marginTop: 1 }}>{subtitle}</span>
      </span>
      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: C.faint, background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 999, padding: '1px 7px', visibility: n == null ? 'hidden' : 'visible' }}>
        {n == null ? '' : `${n} item${n === 1 ? '' : 's'}`}
      </span>
    </button>
  );

  return (
    <motion.div
      {...modalOverlay}
      onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}
    >
      <motion.div
        {...modalPanel}
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, width: 470, maxWidth: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: 22, boxSizing: 'border-box' }}
      >
        <h2 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ListMusic size={16} color={ACCENT || '#FFB800'} />
          Add to Playlist
        </h2>
        <p style={{ margin: '0 0 14px 0', fontSize: 12, lineHeight: 1.5, color: C.muted || C.faint, flexShrink: 0 }}>
          <b style={{ color: C.text }}>{reference}</b>{count ? ` · ${count} verse${count === 1 ? '' : 's'}` : ''} — choose the section it belongs to in the service order.
        </p>

        <div style={{ display: 'grid', gap: 6, overflowY: 'auto', minHeight: 0, paddingRight: 2 }}>
          {sections.map((s) => row(s.id || s.title, s.title, s.subtitle || 'Section Flow', s.count, picked === (s.id || s.title)))}
          {row('__end__', 'End of show', 'After the last section', null, picked === '__end__')}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexShrink: 0 }}>
          <motion.button
            {...stubTap}
            onClick={onCancel}
            style={{ background: C.border || 'var(--ui-border)', border: 'none', color: C.text, padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            Cancel
          </motion.button>
          <motion.button
            {...stubTap}
            ref={okRef}
            data-testid="bible-queue-confirm"
            onClick={() => onPick?.(picked)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: ACCENT || '#FFB800', border: 'none', color: '#1C1C1E', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <Plus size={13} /> Add to Section
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
