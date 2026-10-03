import React, { useEffect, useRef, useState } from 'react';
import { renderLyricsLayout, DEFAULT_LYRIC_SIZE } from '../../lib/lyrics';
import { TimerFace } from '../../components/CountdownFace.jsx';
import { mediaUrl } from '../link.js';

// True miniature of the projected slide: same renderer, same lyric style and
// box, contain-fitted to the phone. Backgrounds the phone can't fetch
// (media:// lives inside the desktop app) fall back to near-black; http(s)
// images render for real.
const DEFAULT_BOX = { x: 80, y: 100, w: 1120, h: 480 };

export default function MiniSlide({ C, text, style, timer, presentation, badge, onCopy }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((es) => {
      const nw = es[0].contentRect.width;
      setW((p) => (Math.abs(p - nw) < 0.5 ? p : nw));
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const s = w > 0 ? w / 1280 : 0;

  const copy = () => {
    const t = timer ? '' : (text || '');
    if (!t) return;
    try { navigator.clipboard?.writeText(t)?.catch?.(() => {}); } catch {}
    if (onCopy) onCopy();
  };

  // Countdown media on phones: slideshow images + watermark resolve through
  // the paired LAN endpoint (same as lyric backgrounds); video stays
  // desktop-side per policy, so a video countdown degrades to the centered
  // timer face instead of a dead stream. Framing rides along untouched.
  const pt = timer && timer.bgType === 'media' && timer.bgMedia
    ? {
        ...timer,
        bgMedia: {
          ...timer.bgMedia,
          images: (timer.bgMedia.images || []).map((u) => mediaUrl(u)).filter(Boolean),
          video: mediaUrl(timer.bgMedia.video),
          watermark: timer.bgMedia.watermark?.url
            ? { ...timer.bgMedia.watermark, url: mediaUrl(timer.bgMedia.watermark.url) }
            : timer.bgMedia.watermark,
        },
      }
    : timer;

  const bgType = style?.backgroundType || 'color';
  const bgValue = style?.backgroundValue || '#000000';
  // Images: http(s) direct, media:// library via the paired LAN endpoint.
  // Video stays desktop-side (bandwidth + battery) — dark still + badge.
  const imgSrc = bgType === 'image'
    ? (/^https?:\/\//i.test(bgValue || '') ? bgValue : mediaUrl(bgValue))
    : null;
  const isVideoBg = bgType === 'video';

  const lst = style?.lyric || {
    font: style?.fontFamily || 'system-ui, sans-serif',
    size: DEFAULT_LYRIC_SIZE,
    lineHeight: 1.05,
    align: style?.textAlign || 'center',
    color: style?.fontColor || '#ffffff',
    caseMode: 'none',
  };
  const box = lst.box || DEFAULT_BOX;

  return (
    <div>
      <div ref={ref} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        {s > 0 && (
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, transform: `scale(${s})`, transformOrigin: 'top left' }}>
            {bgType === 'color' ? (
              <div style={{ position: 'absolute', inset: 0, background: bgValue }} />
            ) : imgSrc ? (
              <img src={imgSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: '#0a0a0a' }} />
            )}
            {isVideoBg && (
              <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 10, fontWeight: 900, letterSpacing: 1, color: '#d8b4fe', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(192,132,252,0.5)', borderRadius: 5, padding: '2px 6px' }}>VIDEO</span>
            )}
            {timer ? (
              <div style={{ position: 'absolute', inset: 0 }}>
                <TimerFace timer={pt} scale={1} />
              </div>
            ) : presentation ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 60 }}>
                <div style={{ fontSize: 54, fontWeight: 800, color: '#fff', textAlign: 'center' }}>{presentation.deckTitle || 'Presentation'}</div>
                <div style={{ fontSize: 30, color: '#a78bfa', fontWeight: 700 }}>
                  Slide {(presentation.index ?? 0) + 1}{presentation.total ? ` of ${presentation.total}` : ''}
                </div>
              </div>
            ) : text ? (
              <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h }}>
                {renderLyricsLayout(text, lst, box)}
              </div>
            ) : null}
          </div>
        )}
        <button
          onClick={copy}
          title="Copy text"
          style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 7, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12 }}
        >⧉</button>
      </div>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint, marginTop: 7, paddingLeft: 2 }}>{badge}</div>
    </div>
  );
}
