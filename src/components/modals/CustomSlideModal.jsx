import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Bold, Italic, Underline, Strikethrough, Image as ImageIcon, Film, Sparkles } from 'lucide-react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';
import { renderLyricsLayout, FONT_SIZE_MIN, FONT_SIZE_MAX } from '../../lib/lyrics';
import { FONT_OPTIONS, TRANSITIONS, TRANSITION_KEYS, SPEED_OPTIONS, cssSpeed } from '../../lib/constants';
import { GRADIENT_PACK } from '../../lib/backgrounds';
import { ANIMATED_GRADIENTS, animatedPresetOf } from '../CountdownFace';
import AnimatedBg from '../AnimatedBg';
import FontPicker from '../FontPicker';
import ColorPicker from '../../untitledui/components/application/color-picker/color-picker';
import { normalizeCustomSlideStyle } from '../../lib/customSlides';

function MiniStage({ content, style, C }) {
  const ref = useRef(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const next = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : 0;
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = normalizeCustomSlideStyle(style);
  const lyric = s.lyric;
  const box = lyric.box;
  const animated = s.backgroundType === 'animated';
  const image = s.backgroundType === 'image';
  const video = s.backgroundType === 'video';
  const gradient = s.backgroundType === 'gradient';
  const bg = gradient || s.backgroundType === 'color' ? (s.backgroundValue || '#000000') : '#000000';
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', border: '1px solid var(--ui-border2)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 34px rgba(0,0,0,0.4)' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, transform: `scale(${w / 1280})`, transformOrigin: 'top left', background: bg }}>
        {image && !!s.backgroundValue && <img src={s.backgroundValue} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {video && !!s.backgroundValue && <video src={s.backgroundValue} muted loop autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {animated && <AnimatedBg value={s.backgroundValue} k={0.4} />}
        {content.trim() ? (
          <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h }}>
            {renderLyricsLayout(content, lyric, box)}
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-sans)', fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>Type the slide text below…</div>
        )}
      </div>
      {video && <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 8, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '1px 5px' }}>VIDEO</span>}
    </div>
  );
}

export default function CustomSlideModal({ C, ACCENT, newSlideData, setNewSlideData, onCancel, onAdd, editing = false, persistMedia = null }) {
  const style = normalizeCustomSlideStyle(newSlideData.style);
  const lyric = style.lyric;

  const setStyle = (patch) => setNewSlideData({
    ...newSlideData,
    style: { ...style, ...patch, lyric: { ...lyric, ...(patch.lyric || {}) } },
  });
  const setLyric = (patch) => setStyle({ lyric: patch });
  const setBg = (type, value) => setStyle({ backgroundType: type, backgroundValue: value });
  const setField = (k, v) => setNewSlideData({ ...newSlideData, [k]: v });

  const labelStyle = { fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.1, display: 'block', marginBottom: 5 };
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 10px', color: C.text, fontSize: 13, outline: 'none' };
  const segBtn = (on) => ({ flex: 1, background: on ? ACCENT : C.elevated2, border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'), color: on ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const toggle = (key, on, Icon, title) => (
    <button type="button" title={title} onClick={() => setLyric({ [key]: !on })} style={{ ...segBtn(on), gap: 4, padding: '7px 0', fontSize: 11, fontWeight: 700 }}>
      {Icon ? <Icon size={13} /> : null}
    </button>
  );

  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 14 }}>
      <motion.div {...modalPanel} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, width: 'min(820px, 96vw)', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px 12px', borderBottom: '1px solid var(--ui-border2)', flexShrink: 0 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,184,0,0.16)', border: '1px solid rgba(255,184,0,0.4)', color: '#FFC72C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{editing ? 'Edit Non-Song Slide' : 'Add Non-Song Slide'}</div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Title and subtitle name it in the service order — the content below is what the room sees.</div>
          </div>
          <button onClick={onCancel} title="Close" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.faint, borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            <MiniStage content={newSlideData.content || ''} style={style} C={C} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
            {/* TEXT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div>
                <label style={labelStyle}>Slide Title / Header</label>
                <input type="text" value={newSlideData.title || ''} onChange={(e) => setField('title', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Category / Subtitle</label>
                <input type="text" value={newSlideData.subtitle || ''} onChange={(e) => setField('subtitle', e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={labelStyle}>Slide Content / Text</label>
                <textarea rows={5} value={newSlideData.content || ''} onChange={(e) => setField('content', e.target.value)} placeholder="Type the announcement, welcome or scripture text…" style={{ ...inputStyle, flex: 1, minHeight: 96, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
            </div>

            {/* TYPE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div>
                <label style={labelStyle}>Font</label>
                <FontPicker value={lyric.font || FONT_OPTIONS[0].value} choices={FONT_OPTIONS} onChange={(v) => setLyric({ font: v })} C={C} />
              </div>
              <div>
                <label style={labelStyle}>Alignment</label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                  {[['left', AlignLeft, 'Left'], ['center', AlignCenter, 'Centre'], ['right', AlignRight, 'Right']].map(([a, Icon, t]) => (
                    <button key={a} type="button" title={`Align ${t}`} onClick={() => setLyric({ align: a })} style={segBtn((lyric.align || 'center') === a)}><Icon size={14} /></button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['top', AlignVerticalJustifyStart, 'Top'], ['middle', AlignVerticalJustifyCenter, 'Middle'], ['bottom', AlignVerticalJustifyEnd, 'Bottom']].map(([v, Icon, t]) => (
                    <button key={v} type="button" title={`Vertical: ${t}`} onClick={() => setLyric({ valign: v })} style={segBtn((lyric.valign || 'middle') === v)}><Icon size={14} /></button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0, flex: 1 }}>Size</label>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.text2 }}>{Math.round(lyric.size)}px</span>
                </div>
                <input type="range" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} step={1} value={lyric.size} onChange={(e) => setLyric({ size: Number(e.target.value) })} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ ...labelStyle, marginBottom: 0, flex: 1 }}>Line Ht</label>
                    <span style={{ fontSize: 10, color: C.muted }}>{(Number(lyric.lineHeight) || 1.12).toFixed(2)}</span>
                  </div>
                  <input type="range" min={0.8} max={2} step={0.02} value={lyric.lineHeight || 1.12} onChange={(e) => setLyric({ lineHeight: Number(e.target.value) })} style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ ...labelStyle, marginBottom: 0, flex: 1 }}>Tracking</label>
                    <span style={{ fontSize: 10, color: C.muted }}>{Number(lyric.letterSpacing) || 0}</span>
                  </div>
                  <input type="range" min={-1} max={14} step={0.5} value={Number(lyric.letterSpacing) || 0} onChange={(e) => setLyric({ letterSpacing: Number(e.target.value) })} style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Style</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {toggle('bold', lyric.bold !== false, Bold, 'Bold')}
                  {toggle('italic', !!lyric.italic, Italic, 'Italic')}
                  {toggle('underline', !!lyric.underline, Underline, 'Underline')}
                  {toggle('strike', !!lyric.strike, Strikethrough, 'Strikethrough')}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                  <button type="button" onClick={() => setLyric({ shadow: !lyric.shadow })} style={{ ...segBtn(!!lyric.shadow), gap: 4, padding: '6px 0', fontSize: 10.5, fontWeight: 700 }}>Shadow {lyric.shadow ? 'ON' : 'OFF'}</button>
                  <button type="button" onClick={() => setLyric({ outline: !lyric.outline })} style={{ ...segBtn(!!lyric.outline), gap: 4, padding: '6px 0', fontSize: 10.5, fontWeight: 700 }}>Outline {lyric.outline ? 'ON' : 'OFF'}</button>
                  <button type="button" onClick={() => setLyric({ glow: !lyric.glow })} style={{ ...segBtn(!!lyric.glow), gap: 4, padding: '6px 0', fontSize: 10.5, fontWeight: 700 }}>Glow {lyric.glow ? 'ON' : 'OFF'}</button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Colour</label>
                <ColorPicker
                  C={C}
                  ACCENT={ACCENT}
                  value={lyric.color || '#ffffff'}
                  gradient={!!lyric.gradient}
                  color1={lyric.gradientColor1 || '#f5f5f4'}
                  color2={lyric.gradientColor2 || '#93c5fd'}
                  angle={lyric.gradientAngle ?? 180}
                  onChange={(p) => setLyric(p)}
                  onLiveChange={(p) => setLyric(p)}
                />
              </div>
            </div>
          </div>

          {/* BACKGROUND */}
          <div style={{ marginTop: 14, borderTop: '1px solid var(--ui-border2)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Background</span>
              <input type="color" value={style.backgroundType === 'color' ? (style.backgroundValue || '#000000') : '#000000'} onChange={(e) => setBg('color', e.target.value)} title="Solid colour" style={{ width: 28, height: 24, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
              <label style={{ background: C.input, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ImageIcon size={10} /> Image<input type="file" accept="image/*" onChange={async (e) => {
                  const file = e.target.files && e.target.files[0];
                  if (file) setBg('image', (await persistMedia?.(file)) || URL.createObjectURL(file));
                  e.target.value = '';
                }} style={{ display: 'none' }} />
              </label>
              <label style={{ background: C.input, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Film size={10} /> Video<input type="file" accept="video/mp4,video/webm" onChange={async (e) => {
                  const file = e.target.files && e.target.files[0];
                  if (file) setBg('video', (await persistMedia?.(file)) || URL.createObjectURL(file));
                  e.target.value = '';
                }} style={{ display: 'none' }} />
              </label>
              <span style={{ fontSize: 10, color: C.faint }}>{style.backgroundType === 'animated' ? animatedPresetOf(style.backgroundValue).name : style.backgroundType}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 7 }}>
              {GRADIENT_PACK.map((g) => (
                <div key={g.id} onClick={() => setBg('gradient', g.css)} title={g.name} style={{ aspectRatio: '16 / 9', borderRadius: 6, cursor: 'pointer', background: g.css, border: style.backgroundType === 'gradient' && style.backgroundValue === g.css ? '2px solid #36C982' : '1px solid var(--ui-border2)' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {ANIMATED_GRADIENTS.map((g) => (
                <div key={g.id} onClick={() => setBg('animated', `anim:${g.id}`)} title={`${g.name} (animated loop)`} style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, cursor: 'pointer', background: g.base, overflow: 'hidden', border: style.backgroundType === 'animated' && style.backgroundValue === `anim:${g.id}` ? '2px solid #36C982' : '1px solid var(--ui-border2)' }}>
                  <span style={{ position: 'absolute', bottom: 1, left: 0, right: 0, textAlign: 'center', fontSize: 7, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{g.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TRANSITION */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Transition</span>
            <select value={style.transition || 'fade'} onChange={(e) => setStyle({ transition: e.target.value })} style={{ background: C.elevated2, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '6px 8px', fontSize: 11.5, outline: 'none' }}>
              {TRANSITIONS.map((t) => <option key={t} value={TRANSITION_KEYS[t]}>{t}</option>)}
            </select>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Speed</span>
            <select value={Number(String(style.speed || '400ms').replace('ms', '')) / 1000 || 0.5} onChange={(e) => setStyle({ speed: cssSpeed(Number(e.target.value)) })} style={{ background: C.elevated2, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '6px 8px', fontSize: 11.5, outline: 'none' }}>
              {SPEED_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '11px 18px', borderTop: '1px solid var(--ui-border2)', flexShrink: 0 }}>
          <motion.button {...stubTap} onClick={onCancel} style={{ background: C.border, border: 'none', color: C.text, padding: '9px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</motion.button>
          <motion.button {...stubTap} onClick={onAdd} style={{ background: ACCENT, border: 'none', color: '#1C1C1E', padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{editing ? 'Save Changes' : 'Add to Service Plan'}</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
