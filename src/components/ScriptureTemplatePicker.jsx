import React from 'react';
import { motion } from 'motion/react';
import { SCRIPTURE_TEMPLATES } from '../lib/scriptureTemplates';

// Thumbnail geometry is expressed in PERCENT of the 16:9 card, never in px:
// the right panel can be anywhere from ~280 to 478 px wide, so a fixed 160px
// canvas overflowed its track and the grid re-flowed between 1 and 2 columns
// as the header note changed length.

// The reference marker inside a thumbnail — the same corner rule the wall
// uses, collapsed to a bar so the operator reads the layout at a glance.
const RefBar = ({ pos }) => {
  if (!pos || pos === 'hidden') return null;
  // 'inline' is the Default template: the reference is the first line of the
  // passage itself, so the bar sits at the block's top left.
  const style = { position: 'absolute', width: '16%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.32)' };
  if (pos === 'inline' || pos === 'top-left') return <div style={{ ...style, left: '5%', top: '7%' }} />;
  if (pos === 'top-center') return <div style={{ ...style, left: '42%', top: '7%' }} />;
  if (pos === 'top-right') return <div style={{ ...style, right: '5%', top: '7%' }} />;
  if (pos === 'bottom-left') return <div style={{ ...style, left: '5%', bottom: '7%' }} />;
  if (pos === 'bottom-center') return <div style={{ ...style, left: '42%', bottom: '7%' }} />;
  return <div style={{ ...style, right: '5%', bottom: '7%' }} />;
};

const TemplateThumb = ({ tpl }) => {
  const b = tpl.lyric.box;
  const align = tpl.lyric.align;
  const valign = tpl.lyric.valign;
  // Three text bars inside the template's own box: the box position/size and
  // the block's alignment/anchor are the template's real values, so the
  // thumbnail shows placement instead of a generic centred slab.
  const lineWidths = [0.96, 0.88, 0.7];
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', background: 'linear-gradient(150deg,#151021,#0a0a0f 60%)', flexShrink: 0 }}>
      <div style={{
        position: 'absolute',
        left: `${(b.x / 1280) * 100}%`,
        top: `${(b.y / 720) * 100}%`,
        width: `${(b.w / 1280) * 100}%`,
        height: `${(b.h / 720) * 100}%`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
        alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        gap: 5,
        padding: 2,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}>
        {lineWidths.map((f, i) => (
          <div key={i} style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.6)', width: `${f * 100}%` }} />
        ))}
      </div>
      <RefBar pos={tpl.ref && tpl.ref.pos} />
    </div>
  );
};

/**
 * Template picker (Template tab): a stable two-column grid of cards, each
 * showing the layout it applies (words block + reference corner on a mini
 * canvas). Changing one re-fires the passage on the wall through
 * setBibleFmtLive, so the operator sees the new placement immediately.
 */
const ScriptureTemplatePicker = ({ value, onChange, C, PINK }) => {
  const active = SCRIPTURE_TEMPLATES.find((t) => t.id === value) || SCRIPTURE_TEMPLATES[0];
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, flexShrink: 0 }}>Template</div>
        {/* minWidth: 0 — without it this nowrap note sets the panel's
            min-content width, so a shorter note narrowed the panel and the
            card grid collapsed from two columns to one. */}
        <div style={{ fontSize: 10, color: C.faint2, minWidth: 0, flex: '1 1 auto', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.note}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {SCRIPTURE_TEMPLATES.map((t) => {
          const on = t.id === active.id;
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.98 }}
              data-testid={`scripture-template-${t.id}`}
              onClick={() => onChange && onChange(t.id)}
              title={`${t.label} — ${t.note}`}
              style={{
                display: 'grid',
                gap: 6,
                minWidth: 0,
                justifyItems: 'start',
                textAlign: 'left',
                padding: 7,
                borderRadius: 10,
                cursor: 'pointer',
                background: on ? 'rgba(255,184,0,0.14)' : C.elevated,
                border: on ? `1px solid ${PINK || '#FFB800'}` : '1px solid var(--ui-border2)',
                boxShadow: on ? `0 0 0 1px rgba(255,184,0,0.35)` : 'none',
              }}
            >
              <TemplateThumb tpl={t} />
              <div style={{ fontSize: 10.5, fontWeight: 800, color: on ? (PINK || '#FFB800') : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{t.label}</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default ScriptureTemplatePicker;
