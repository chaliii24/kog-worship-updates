import React from 'react';
import { motion } from 'motion/react';
import { TITLE_CARD_TEMPLATES, titleCardOf } from '../lib/titleCardTemplates';

// =====================================================================
// TITLE CARD PICKER — one tile per card, each thumbnail drawn from the
// template's OWN numbers (box, rules, slot corners) on the 1280x720 canvas,
// so a tile can never promise a layout the wall does not draw.
//
// Percentage geometry, never px: the sidebar the picker lives in is
// resizable, and a fixed-width thumb overflowed its track the moment the
// panel narrowed (the same trap ScriptureTemplatePicker documents).
// =====================================================================

const pct = (n, of) => `${(n / of) * 100}%`;

const TitleCardThumb = ({ tpl }) => {
  const box = tpl.cue.box;
  const align = tpl.cue.align;
  const valign = tpl.cue.valign;
  const lines = tpl.chrome ? [0.92, 0.66] : [0.96, 0.74];
  const chrome = tpl.chrome;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'linear-gradient(150deg,#1b1a17,#0a0a0f 62%)',
        flexShrink: 0,
      }}
    >
      {/* the title block, placed by the template's real box */}
      <div
        style={{
          position: 'absolute',
          left: pct(box.x, 1280),
          top: pct(box.y, 720),
          width: pct(box.w, 1280),
          height: pct(box.h, 720),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
          alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          gap: 3,
          overflow: 'hidden',
        }}
      >
        {lines.map((f, i) => (
          <div
            key={i}
            style={{
              height: '11%',
              minHeight: 2,
              width: `${f * 100}%`,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.88)',
            }}
          />
        ))}
      </div>

      {chrome ? (
        <>
          {(chrome.rules || []).map((r, i) => (
            <div
              key={`r-${i}`}
              style={{
                position: 'absolute',
                left: pct(r.x, 1280),
                top: pct(r.y, 720),
                width: pct(r.w, 1280),
                height: 1,
                background: 'rgba(255,255,255,0.55)',
              }}
            />
          ))}
          {(chrome.slots || []).filter((s) => s.key !== 'event').map((s, i) => (
            <div
              key={`s-${i}`}
              style={{
                position: 'absolute',
                top: pct(s.y, 720),
                width: '15%',
                height: 2,
                borderRadius: 1,
                background: 'rgba(255,255,255,0.4)',
                ...(s.align === 'right'
                  ? { right: pct(s.x, 1280) }
                  : s.align === 'center'
                    ? { left: '42.5%' }
                    : { left: pct(s.x, 1280) }),
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
};

const TitleCardTemplatePicker = ({ value, onChange, C, ACCENT }) => {
  const active = titleCardOf(value);
  return (
    <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, flexShrink: 0 }}>Card</div>
        <div style={{ fontSize: 10, color: C.faint2, minWidth: 0, flex: '1 1 auto', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.note}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {TITLE_CARD_TEMPLATES.map((t) => {
          const on = t.id === active.id;
          return (
            <motion.button
              key={t.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              data-testid={`title-card-${t.id}`}
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
                border: on ? `1px solid ${ACCENT || '#FFB800'}` : '1px solid var(--ui-border2)',
                boxShadow: on ? '0 0 0 1px rgba(255,184,0,0.35)' : 'none',
              }}
            >
              <TitleCardThumb tpl={t} />
              <div style={{ fontSize: 10.5, fontWeight: 800, color: on ? (ACCENT || '#FFB800') : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{t.label}</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default TitleCardTemplatePicker;
