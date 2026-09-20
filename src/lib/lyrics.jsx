import React from 'react';
import { FONT_OPTIONS } from './constants';

export const emphasisLine = (lines) => {
  const caps = lines.filter(l => l.trim().length > 1 && l.trim() === l.trim().toUpperCase());
  if (caps.length) return caps[0];
  return lines.slice().sort((a, b) => b.trim().length - a.trim().length)[0] || '';
};

export const applyCaseTransform = (t, mode) => {
  if (mode === 'upper') return t.toUpperCase();
  if (mode === 'title') return t.replace(/\b\w/g, c => c.toUpperCase());
  return t;
};

// Shared renderer: editor canvas, projector, and live-output monitor all draw
// the same per-line emphasis layout so letter positions are identical everywhere.
export const renderLyricsLayout = (text, st, box) => {
  const lines = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n');
  const kept = lines.filter(l => l.trim());
  const key = emphasisLine(kept);
  const lh = st.lineHeight || 1.05;
  const boxW = Math.max(200, (box.w || 1280) - 40);
  const boxH = box.h || 640;
  const baseSize = Math.max(18, Math.min(Number(st.size) || 92, 400));
  const scaleFor = (isEmph) => (isEmph ? 1.24 : 0.84);
  const totalHeight = (base) => lines.reduce((h, l) => {
    if (!l.trim()) return h + base * scaleFor(false) * lh * 0.7;
    const f = base * scaleFor(l.trim() === key);
    const cpl = Math.max(6, boxW / (f * 0.55));
    const wrapped = Math.max(1, Math.ceil(l.length / cpl));
    return h + wrapped * f * lh;
  }, 0);
  let fs = baseSize;
  for (let i = 0; i < 5; i++) {
    const actual = totalHeight(fs);
    if (!actual) break;
    fs = Math.max(14, Math.min(baseSize, fs * ((boxH * 0.92) / actual)));
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: st.align === 'left' ? 'flex-start' : st.align === 'right' ? 'flex-end' : 'center', textAlign: st.align || 'center', padding: '10px 18px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {lines.map((ln, li) => {
        const emph = ln.trim() === key;
        const segments = [];
        const re = /\*\*(.+?)\*\*/g;
        let m, last = 0;
        while ((m = re.exec(ln)) !== null) {
          if (m.index > last) segments.push({ t: ln.slice(last, m.index), b: false });
          segments.push({ t: m[1], b: true });
          last = m.index + m[0].length;
        }
        if (last < ln.length) segments.push({ t: ln.slice(last), b: false });
        if (!segments.length) segments.push({ t: ln, b: false });
        return (
          <div key={li} style={{ display: 'inline-block', width: '100%', fontSize: Math.round(fs * scaleFor(emph)), fontWeight: emph ? 900 : 600, lineHeight: lh, color: st.color || '#f5f5f4', fontFamily: st.font || FONT_OPTIONS[0].value, WebkitTextStroke: st.outline ? '1.5px rgba(0,0,0,0.75)' : 'none', textShadow: st.shadow ? '0 4px 14px rgba(0,0,0,0.85)' : 'none', background: st.highlight ? `rgba(70,45,15,${(st.hlOpacity ?? 40) / 100})` : 'transparent', borderRadius: 8, padding: st.highlight ? '3px 12px' : 0, boxSizing: 'border-box', letterSpacing: emph ? '0.01em' : '0.02em', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {segments.map((s, si) => s.b ? <b key={si}>{s.t}</b> : s.t) || '\u00A0'}
          </div>
        );
      })}
    </div>
  );
};
