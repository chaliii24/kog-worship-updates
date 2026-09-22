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

// Font-size bounds shared by the renderer, the canvas editor and the Size
// field, so the number you type is the number that actually draws. 720 is the
// full canvas height — only a "really big" value ever hits the ceiling.
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 720;

// Box metrics shared by the renderer and by the editor's textarea, so the box
// you type into and the box that lands on the projector are sized identically.
export const lyricsLayoutMetrics = (st, box) => {
  const pad = st.fill ? 6 : Math.max(0, Number(st.pad ?? 10) || 0);
  const boxW = Math.max(200, (box.w || 1280) - pad * 2);
  const boxH = box.h || 640;
  const baseSize = Math.max(FONT_SIZE_MIN, Math.min(Number(st.size) || 110, FONT_SIZE_MAX));
  const maxH = Math.max(40, Math.min(boxH - pad * 2, 700));
  return { pad, boxW, boxH, baseSize, maxH };
};

// ONE font size for the whole block: top-anchored at box.x/box.y, shrunk only
// when it overflows the box (or, in fill mode, scaled to use the full height).
export const computeLyricsFontSize = (text, st, box) => {
  const lh = st.lineHeight || 1.05;
  const { boxW, baseSize, maxH } = lyricsLayoutMetrics(st, box);
  const lines = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n');
  const totalHeight = (base) => lines.reduce((h, l) => {
    if (!l.trim()) return h + base * lh * 0.7;
    const cpl = Math.max(6, boxW / (base * 0.55));
    const wrapped = Math.max(1, Math.ceil(l.length / cpl));
    return h + wrapped * base * lh;
  }, 0);
  let fs = baseSize;
  if (st.fill) {
    // Fill mode (scripture): scale UP or DOWN so the block uses the full box
    // height. fillMax/fillMin bound the range; a final shrink pass guarantees
    // we never overflow even when many lines exceed fillMin.
    const fillMax = Math.max(baseSize, Math.min(Number(st.fillMax) || 160, FONT_SIZE_MAX));
    const fillMin = Math.max(14, Math.min(Number(st.fillMin) || 18, fillMax));
    let lo = fillMin;
    let hi = fillMax;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (totalHeight(mid) <= maxH) lo = mid;
      else hi = mid;
    }
    fs = lo;
    for (let i = 0; i < 5; i++) {
      const actual = totalHeight(fs);
      if (!actual || actual <= maxH) break;
      fs = Math.max(12, fs * (maxH / actual) * 0.97);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const actual = totalHeight(fs);
      if (!actual || actual <= maxH) break;
      fs = Math.max(14, fs * (maxH / actual));
    }
  }
  return Math.round(fs);
};

// Shared renderer: editor canvas, projector, and live-output monitor all draw
// the same uniform-size layout so letter positions are identical everywhere.
export const renderLyricsLayout = (text, st, box) => {
  const lines = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n');
  const lh = st.lineHeight || 1.05;
  const { pad } = lyricsLayoutMetrics(st, box);
  const size = computeLyricsFontSize(text, st, box);
  const isJustify = st.align === 'justify';
  const bold = st.bold !== false;
  const deco = [st.underline ? 'underline' : null, st.strike ? 'line-through' : null].filter(Boolean).join(' ') || 'none';
  const strokeW = Number(st.strokeWidth) || 0;
  const shadowOn = !!st.shadow && ((Number(st.shadowBlur) || 0) > 0 || (Number(st.shadowOffsetX) || 0) !== 0 || (Number(st.shadowOffsetY) || 0) !== 0);
  const gradOn = !!st.gradient;
  const gradAngle = Number(st.gradientAngle);
  const gradSpanStyle = gradOn ? {
    background: `linear-gradient(${Number.isFinite(gradAngle) ? gradAngle : 180}deg, ${st.gradientColor1 || '#f5f5f4'}, ${st.gradientColor2 || '#93c5fd'})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  } : null;
  if (st.layoutMode === 'ticker') {
    const dur = Math.max(2, Number(st.tickerSpeed) || 18);
    const rtl = st.tickerDir === 'rtl';
    const parts = lines.filter(l => l.trim().length);
    const content = parts.length ? parts.join('  ·  ') : (text || ' ');
    const parseSegs = (ln) => {
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
      return segments;
    };
    const runStyle = {
      fontSize: size,
      fontWeight: bold ? 700 : 400,
      fontStyle: st.italic ? 'italic' : 'normal',
      textDecoration: deco,
      letterSpacing: st.letterSpacing ? `${st.letterSpacing}px` : undefined,
      lineHeight: lh,
      color: gradOn ? undefined : (st.color || '#f5f5f4'),
      fontFamily: st.font || FONT_OPTIONS[0].value,
      WebkitTextStroke: st.outline && strokeW > 0 ? `${strokeW}px ${st.strokeColor || '#000000'}` : 'none',
      textShadow: shadowOn ? `${Number(st.shadowOffsetX) || 0}px ${Number(st.shadowOffsetY) || 0}px ${Number(st.shadowBlur) || 0}px ${st.shadowColor || '#000000'}` : 'none',
      background: st.highlight ? `rgba(70,45,15,${(st.hlOpacity ?? 40) / 100})` : 'transparent',
      borderRadius: 8,
      padding: st.highlight ? '3px 12px' : 0,
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
      flexShrink: 0,
      marginRight: 72,
    };
    const segs = parseSegs(content);
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: st.valign === 'top' ? 'flex-start' : st.valign === 'bottom' ? 'flex-end' : 'center', alignItems: 'flex-start', padding: pad, boxSizing: 'border-box' }}>
        <style>{'@keyframes kogTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
        <div style={{ display: 'flex', width: 'max-content', flexShrink: 0, willChange: 'transform', animation: `kogTicker ${dur}s linear infinite`, animationDirection: rtl ? 'reverse' : 'normal' }}>
          {[0, 1].map(i => (
            <span key={i} style={runStyle}>
              <span style={gradSpanStyle || undefined}>
                {segs.map((s, si) => s.b ? <b key={si}>{s.t}</b> : s.t)}
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: st.valign === 'top' ? 'flex-start' : st.valign === 'bottom' ? 'flex-end' : 'center', alignItems: st.align === 'left' ? 'flex-start' : st.align === 'right' ? 'flex-end' : 'center', textAlign: st.align || 'center', padding: pad, boxSizing: 'border-box', overflow: 'hidden' }}>
      {lines.map((ln, li) => {
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
          <div key={li} style={{ display: 'inline-block', width: '100%', fontSize: size, fontWeight: bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal', textDecoration: deco, letterSpacing: st.letterSpacing ? `${st.letterSpacing}px` : undefined, textAlignLast: isJustify ? 'justify' : undefined, lineHeight: lh, color: gradOn ? undefined : (st.color || '#f5f5f4'), fontFamily: st.font || FONT_OPTIONS[0].value, WebkitTextStroke: st.outline && strokeW > 0 ? `${strokeW}px ${st.strokeColor || '#000000'}` : 'none', textShadow: shadowOn ? `${Number(st.shadowOffsetX) || 0}px ${Number(st.shadowOffsetY) || 0}px ${Number(st.shadowBlur) || 0}px ${st.shadowColor || '#000000'}` : 'none', background: st.highlight ? `rgba(70,45,15,${(st.hlOpacity ?? 40) / 100})` : 'transparent', borderRadius: 8, padding: st.highlight ? '3px 12px' : 0, boxSizing: 'border-box', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <span style={gradSpanStyle}>
              {segments.map((s, si) => s.b ? <b key={si}>{s.t}</b> : s.t) || '\u00A0'}
            </span>
          </div>
        );
      })}
    </div>
  );
};
