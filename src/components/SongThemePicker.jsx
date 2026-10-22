import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, Save, Trash2, Layers, Sparkles } from 'lucide-react';
import AnimatedBg from './AnimatedBg';
import { modalOverlay, modalPanel } from '../lib/anim';
import { songThemeBackgroundCss } from '../lib/songThemes';

// Shared preview used by every card and by the "selected" strip. It draws the
// theme on the same 1280×720 design canvas the projector uses, scaled with
// container query units — no ResizeObserver, no fixed thumbnail size.
function ThemePreview({ theme, C, big = false }) {
  const s = theme.style || {};
  const box = s.box || { x: 80, y: 100, w: 1120, h: 480 };
  const bg = songThemeBackgroundCss(s);
  const animated = s.bgType === 'animated' && s.bgValue;
  const image = s.bgType === 'image' && s.bgValue;
  const align = s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center';
  const just = s.align === 'justify' ? 'space-between' : align;
  const valign = s.valign === 'top' ? 'flex-start' : s.valign === 'bottom' ? 'flex-end' : 'center';
  const size = Math.max(5, Number(s.size) || 120);
  const shadow = s.shadow
    ? `${Number(s.shadowOffsetX) || 0}px ${Number(s.shadowOffsetY) || 4}px ${Number(s.shadowBlur) || 14}px ${s.shadowColor || '#000'}`
    : null;
  const glow = s.glow ? `0 0 ${Math.max(2, (Number(s.glowBlur) || 18) / 3)}px ${s.glowColor || '#22d3ee'}, 0 0 ${Number(s.glowBlur) || 18}px ${s.glowColor || '#22d3ee'}` : null;
  const textShadow = [shadow, glow].filter(Boolean).join(', ') || 'none';
  const gradient = s.gradient
    ? `linear-gradient(${s.gradientAngle ?? 180}deg, ${s.gradientColor1 || '#f5f5f4'}, ${s.gradientColor2 || '#93c5fd'})`
    : null;

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', containerType: 'inline-size', background: bg, borderRadius: big ? 10 : 7, border: '1px solid rgba(255,255,255,0.08)' }}>
      {image && <img src={s.bgValue} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {animated && <AnimatedBg value={s.bgValue} k={0.35} />}
      <div style={{ position: 'absolute', left: `${(box.x / 1280) * 100}%`, top: `${(box.y / 720) * 100}%`, width: `${(box.w / 1280) * 100}%`, height: `${(box.h / 720) * 100}%`, display: 'flex', alignItems: valign, justifyContent: just }}>
        <div style={{
          width: '100%',
          fontFamily: s.font,
          fontSize: `${size * 0.078125}cqw`,
          lineHeight: s.lineHeight || 1.05,
          letterSpacing: `${(Number(s.letterSpacing) || 0) * 0.078125}cqw`,
          textAlign: s.align === 'justify' ? 'justify' : (s.align || 'center'),
          fontWeight: s.bold === false ? 400 : 800,
          fontStyle: s.italic ? 'italic' : 'normal',
          textDecoration: [s.underline ? 'underline' : null, s.strike ? 'line-through' : null].filter(Boolean).join(' ') || 'none',
          textTransform: s.case === 'upper' ? 'uppercase' : s.case === 'title' ? 'capitalize' : 'none',
          color: gradient ? 'transparent' : (s.color || '#f5f5f4'),
          backgroundImage: gradient || 'none',
          WebkitBackgroundClip: gradient ? 'text' : 'border-box',
          backgroundClip: gradient ? 'text' : 'border-box',
          textShadow,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          filter: gradient && glow ? `drop-shadow(0 0 ${(Number(s.glowBlur) || 18) / 3}px ${s.glowColor || '#22d3ee'})` : 'none',
        }}>
          {s.case === 'upper' ? 'AMAZING GRACE' : 'Amazing grace\nhow sweet the sound'}
        </div>
      </div>
      {/* A hairline that makes the placement legible on dark backgrounds. */}
      <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.06)', borderRadius: big ? 10 : 7, pointerEvents: 'none' }} />
    </div>
  );
}

export default function SongThemePicker({
  C,
  ACCENT,
  themes,
  initialId,
  canSave,
  canSaveTitle,
  currentLabel,
  onApply,
  onSaveCurrent,
  onUpdateCurrent,
  onDeleteCustom,
  onClose,
}) {
  const [selectedId, setSelectedId] = useState(initialId || (themes[0] && themes[0].id) || 'house');
  const [includeBg, setIncludeBg] = useState(true);
  const [name, setName] = useState('');
  const [savedMsg, setSavedMsg] = useState(null);
  const selected = useMemo(() => themes.find((t) => t.id === selectedId) || themes[0] || null, [themes, selectedId]);
  const isCustom = !!(selected && selected.custom);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    if (!canSave) return;
    const item = onSaveCurrent?.(name.trim() || 'My Theme');
    if (item) {
      setSelectedId(item.id);
      setName('');
      setSavedMsg(`“${item.name}” saved to this computer`);
      setTimeout(() => setSavedMsg(null), 2600);
    }
  };

  const update = () => {
    if (!isCustom) return;
    onUpdateCurrent?.(selected);
    setSavedMsg(`“${selected.name}” updated from this slide`);
    setTimeout(() => setSavedMsg(null), 2600);
  };

  return (
    <motion.div {...modalOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(4,5,9,0.78)', backdropFilter: 'blur(7px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <motion.div {...modalPanel} role="dialog" aria-modal="true" aria-label="Song themes" style={{ width: 'min(780px, 96vw)', maxHeight: 'calc(100vh - 40px)', background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 16, boxShadow: '0 30px 90px rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px 12px', borderBottom: '1px solid var(--ui-border2)', flexShrink: 0 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,184,0,0.16)', border: '1px solid rgba(255,184,0,0.4)', color: '#FFC72C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Layers size={17} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Song Themes</div>
            <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, marginTop: 2 }}>
              A theme sets the type, size, placement, effects and background in one click. Your own themes live on this computer.
            </div>
          </div>
          <button onClick={onClose} title="Close" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.faint, borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={16} /></button>
        </div>

        {/* THEMES */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {themes.map((t) => {
              const active = selected && t.id === selected.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  title={`${t.name} — ${t.note || ''}`}
                  style={{
                    textAlign: 'left', padding: 8, borderRadius: 12, cursor: 'pointer', background: active ? 'rgba(255,184,0,0.14)' : C.elevated,
                    border: `1px solid ${active ? ACCENT : 'var(--ui-border2)'}`,
                    boxShadow: active ? `0 0 0 1px ${ACCENT}` : 'none', display: 'flex', flexDirection: 'column', gap: 7,
                  }}
                >
                  <ThemePreview theme={t} C={C} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: active ? C.text : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    {t.custom && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#FFC72C', background: 'rgba(255,184,0,0.18)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>Custom</span>}
                    {active && <span style={{ marginLeft: 'auto', color: ACCENT, display: 'flex', flexShrink: 0 }}><Check size={14} /></span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.4, marginTop: -3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.note}</div>
                </button>
              );
            })}
          </div>

          {/* SAVE CURRENT LOOK */}
          <div style={{ marginTop: 14, background: C.elevated, border: '1px dashed var(--ui-border2)', borderRadius: 12, padding: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <Sparkles size={13} color="#FFC72C" />
              <span style={{ fontSize: 11, fontWeight: 800, color: C.text2 }}>Save this slide as a theme</span>
              <span style={{ fontSize: 10, color: C.faint, marginLeft: 'auto' }}>{currentLabel || 'Current look'}</span>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                placeholder="Theme name (e.g. Sunday Night)"
                maxLength={40}
                disabled={!canSave}
                style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', opacity: canSave ? 1 : 0.5 }}
              />
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                title={canSave ? 'Save the current slide’s type, placement, effects and background' : 'Open a slide first'}
                style={{ background: canSave ? ACCENT : C.elevated2, border: 'none', color: canSave ? '#0D1014' : C.faint, borderRadius: 8, padding: '8px 13px', fontSize: 11.5, fontWeight: 800, cursor: canSave ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5 }}
              ><Save size={13} /> Save look</button>
            </div>
            {savedMsg && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#36C982', marginTop: 6 }}>{savedMsg}</div>}
            {canSaveTitle === false && <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>The title slide is open — switch to a lyric slide to save its look.</div>}
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ borderTop: '1px solid var(--ui-border2)', padding: '11px 18px 13px', flexShrink: 0, background: C.panel }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.text2, fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={includeBg} onChange={(e) => setIncludeBg(e.target.checked)} style={{ width: 14, height: 14, accentColor: ACCENT, cursor: 'pointer' }} />
              Also apply background
            </label>
            {isCustom && (
              <>
                <button type="button" onClick={update} disabled={!canSave} title="Copy this slide’s current look onto the selected custom theme" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: canSave ? C.text2 : C.faint, borderRadius: 7, padding: '5px 9px', fontSize: 10.5, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 4 }}><Save size={11} /> Update from slide</button>
                <button type="button" onClick={() => { onDeleteCustom?.(selected.id); setSelectedId('house'); }} title={`Delete “${selected.name}”`} style={{ background: 'transparent', border: '1px solid rgba(255,69,69,0.35)', color: '#FF4545', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
              </>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button
              type="button"
              onClick={() => onApply?.(selected, 'this', includeBg)}
              disabled={!selected}
              title="Apply this theme to the slide you are editing"
              style={{ background: C.elevated2, border: `1px solid ${ACCENT}`, color: C.text, borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
            >Apply to this slide</button>
            <button
              type="button"
              onClick={() => onApply?.(selected, 'all', includeBg)}
              disabled={!selected}
              title="Apply this theme to every slide in the song"
              style={{ background: ACCENT, border: `1px solid ${ACCENT}`, color: '#0D1014', borderRadius: 8, padding: '8px 15px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
            >Apply to all slides</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
