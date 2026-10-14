import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Megaphone, FolderOpen, X, Play, Trash2 } from 'lucide-react';
import { stubTap } from '../../lib/anim';

// Message Studio: the full overlay workspace. The right-rail composer stays
// slim on purpose (type → Show → Clear mid-service); everything setup-ish —
// visual style with a wall-position schematic, timeout, corner bug with a
// position grid, named templates — lives here where it has room to breathe.
// Draft object is shared with the rail (same shape, same localStorage key),
// so both sides always agree.
export const validOverlayMedia = (m) => (m && typeof m.url === 'string' && m.url ? { url: m.url.slice(0, 500), pos: ['tl', 'tr', 'bl', 'br'].includes(m.pos) ? m.pos : 'br' } : null);

const STYLES = [
  { id: 'lower', label: 'Lower third', tip: 'Bar across the bottom third — announcements over anything' },
  { id: 'center', label: 'Center card', tip: 'Big centered card — the room stops and reads' },
  { id: 'banner', label: 'Top banner', tip: 'Full-width strip at the top — urgent but out of the lyric zone' },
];

const SECS = [[5, '5s'], [10, '10s'], [30, '30s'], [0, 'Pinned']];

// Where-this-lands schematic: a 16:9 stage mock with the shape drawn in.
function StyleSchematic({ id, active, accent }) {
  const shape = { background: 'rgba(255,255,255,0.9)', borderRadius: 3 };
  return (
    <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#000', border: '1px solid ' + (active ? accent : 'var(--ui-border2)'), borderRadius: 9, overflow: 'hidden', position: 'relative', boxShadow: active ? `0 0 0 1px ${accent}` : 'none' }}>
      {id === 'lower' && <div style={{ ...shape, position: 'absolute', left: 8, right: 8, bottom: 7, height: 13 }} />}
      {id === 'center' && <div style={{ ...shape, position: 'absolute', left: '50%', top: '50%', width: 62, height: 26, borderRadius: 5, transform: 'translate(-50%, -50%)' }} />}
      {id === 'banner' && <div style={{ ...shape, position: 'absolute', left: 8, right: 8, top: 6, height: 9 }} />}
    </div>
  );
}

export default function MessageStudioModal({ C, ACCENT, ovDraft, setOvDraft, overlayLive, fireOverlay, clearOverlay, persistMediaFile, onClose }) {
  const [tplName, setTplName] = useState('');
  const [ovTemplates, setOvTemplates] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kog-overlay-templates') || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter((t) => t && typeof t.name === 'string' && t.name.trim()).map((t) => ({
        name: t.name.trim().slice(0, 40),
        text: typeof t.text === 'string' ? t.text.slice(0, 140) : '',
        style: t.style === 'center' || t.style === 'banner' ? t.style : 'lower',
        secs: [5, 10, 30, 0].includes(Number(t.secs)) ? Number(t.secs) : 10,
        media: validOverlayMedia(t.media),
      })).filter((t) => t.text.trim() || t.media);
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('kog-overlay-templates', JSON.stringify(ovTemplates)); } catch {}
  }, [ovTemplates]);

  // Escape closes — capture phase so workspace hotkeys never see it first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const ovReady = !!(ovDraft.text.trim() || (ovDraft.media && ovDraft.media.url));
  const show = () => {
    if (ovReady && fireOverlay) fireOverlay(ovDraft.text, { style: ovDraft.style, secs: ovDraft.secs, media: ovDraft.media || null });
  };

  const pickMedia = (e) => {
    const f = e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!f || !persistMediaFile) return;
    persistMediaFile(f).then((url) => {
      if (url) setOvDraft((d) => ({ ...d, media: { url, pos: (d.media && d.media.pos) || 'br' } }));
    }).catch(() => {});
  };

  const saveTpl = () => {
    if (!tplName.trim() && !ovDraft.text.trim() && !(ovDraft.media && ovDraft.media.url)) return;
    const name = tplName.trim() || String(ovDraft.text.trim().split(/\s+/).slice(0, 4).join(' ') || 'Message').slice(0, 40);
    setOvTemplates((prev) => [...prev.filter((t) => t.name !== name), { name, text: ovDraft.text || '', style: ovDraft.style, secs: ovDraft.secs, media: ovDraft.media || null }]);
    setTplName('');
  };
  const fireTpl = (t) => {
    if (fireOverlay) fireOverlay(t.text || '', { style: t.style, secs: t.secs, media: t.media || null });
  };

  const micro = { fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4 };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Message studio"
        style={{ width: 600, maxWidth: '94vw', maxHeight: '88vh', background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 18px 10px 18px', flexShrink: 0 }}>
          <Megaphone size={15} color={overlayLive ? '#4ade80' : ACCENT} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text, flex: 1 }}>Message Studio</h2>
          {overlayLive && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: 1, color: '#4ade80' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />LIVE
            </span>
          )}
          <button onClick={onClose} title="Close (Esc)" style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ ...micro, marginBottom: 6 }}>Message</div>
            <textarea
              autoFocus
              value={ovDraft.text}
              onChange={(e) => setOvDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder={'Welcome home!\nSecond line shows as-is.'}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div>
            <div style={{ ...micro, marginBottom: 6 }}>Style — where it lands on the wall</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {STYLES.map((s) => {
                const on = ovDraft.style === s.id;
                return (
                  <button key={s.id} onClick={() => setOvDraft((d) => ({ ...d, style: s.id }))} title={s.tip} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <StyleSchematic id={s.id} active={on} accent={ACCENT} />
                    <div style={{ fontSize: 11, fontWeight: 800, color: on ? '#C4B5FD' : C.muted, marginTop: 5 }}>{s.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ ...micro, marginBottom: 6 }}>Auto-clear</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[[5, '5s'], [10, '10s'], [30, '30s'], [0, 'Pinned']].map(([v, lbl]) => (
                <button key={lbl} onClick={() => setOvDraft((d) => ({ ...d, secs: v }))} title={v === 0 ? 'Stays until cleared' : `Auto-clears after ${v} seconds`} style={{ flex: 1, background: ovDraft.secs === v ? 'rgba(139,92,246,0.18)' : C.elevated2, border: '1px solid ' + (ovDraft.secs === v ? 'rgba(139,92,246,0.55)' : 'var(--ui-border2)'), color: ovDraft.secs === v ? '#C4B5FD' : C.muted, borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{lbl}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ ...micro, marginBottom: 6 }}>Corner bug — logo pinned to a wall corner</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {ovDraft.media && ovDraft.media.url ? (
                <>
                  <img src={ovDraft.media.url} alt="" style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--ui-border2)', background: '#000', flexShrink: 0 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, width: 88, flexShrink: 0 }}>
                    {[['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']].map(([v, tip]) => (
                      <button key={v} onClick={() => setOvDraft((d) => ({ ...d, media: d.media ? { ...d.media, pos: v } : d.media }))} title={tip} style={{ height: 30, borderRadius: 7, background: ovDraft.media.pos === v ? 'rgba(139,92,246,0.3)' : C.elevated2, border: '1px solid ' + (ovDraft.media.pos === v ? 'rgba(139,92,246,0.6)' : 'var(--ui-border2)'), cursor: 'pointer', display: 'flex', padding: 4, justifyContent: v.includes('l') ? 'flex-start' : 'flex-end', alignItems: v[0] === 't' ? 'flex-start' : 'flex-end' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: ovDraft.media.pos === v ? '#C4B5FD' : C.faint }} />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setOvDraft((d) => ({ ...d, media: null }))} title="Remove the corner bug (keeps the text)" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: '#f87171', borderRadius: 8, padding: '7px 12px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                </>
              ) : (
                <label title="PNG / JPG / GIF from the media library" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  <FolderOpen size={13} /> Choose image…
                  <input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" style={{ display: 'none' }} onChange={pickMedia} />
                </label>
              )}
            </div>
          </div>

          <div>
            <div style={{ ...micro, marginBottom: 6 }}>Templates {ovTemplates.length ? `· ${ovTemplates.length}` : ''}</div>
            {ovTemplates.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>None yet — name the current setup below and it lands here. Loading one fills the draft; firing stays manual.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 168, overflowY: 'auto' }}>
                {ovTemplates.map((t) => (
                  <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '7px 8px 7px 11px', minWidth: 0 }}>
                    <button onClick={() => setOvDraft({ text: t.text || '', style: t.style || 'lower', secs: t.secs != null ? t.secs : 10, media: t.media || null })} title="Load into the draft (does not fire)" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.style === 'center' ? 'Center' : t.style === 'banner' ? 'Banner' : 'Lower'} · {t.secs === 0 ? 'Pinned' : `${t.secs}s`}{t.media ? ' · bug' : ''}{t.text ? ` · ${t.text}` : ''}
                      </span>
                    </button>
                    <button onClick={() => fireTpl(t)} title={`Fire "${t.name}" straight to the wall`} style={{ background: ACCENT, border: 'none', color: '#fff', borderRadius: 7, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Play size={13} /></button>
                    <button onClick={() => setOvTemplates((prev) => prev.filter((x) => x.name !== t.name))} title={`Delete template "${t.name}"`} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', padding: 5, flexShrink: 0 }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              <input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTpl(); }}
                placeholder="Save current setup as… (Enter)"
                style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '8px 11px', fontSize: 12, outline: 'none' }}
              />
              <motion.button {...stubTap} onClick={saveTpl} title="Save the current message + style + timing + bug as a template" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>Save</motion.button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 18px 16px 18px', borderTop: '1px solid var(--ui-border2)', flexShrink: 0 }}>
          {overlayLive && (
            <motion.button {...stubTap} onClick={() => clearOverlay && clearOverlay()} title="Take the message down (the slide stays)" style={{ flex: 1, background: 'transparent', border: '1px solid rgba(239,68,68,0.45)', color: '#f87171', borderRadius: 9, padding: '11px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Clear</motion.button>
          )}
          <motion.button {...stubTap} onClick={show} title="Pin this message above the live slide" style={{ flex: 2, background: ovReady ? ACCENT : C.elevated2, border: '1px solid ' + (ovReady ? ACCENT : 'var(--ui-border2)'), color: '#fff', borderRadius: 9, padding: '11px 0', fontSize: 13.5, fontWeight: 900, cursor: ovReady ? 'pointer' : 'default', opacity: ovReady ? 1 : 0.55 }}>Show on wall</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
